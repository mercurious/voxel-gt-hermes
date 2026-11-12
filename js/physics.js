// Arcade drift physics: velocity stays in world space, heading rotates,
// lateral slip is scrubbed off by grip (handbrake cuts it -> drifts).
export class Vehicle {
  constructor(stats) {
    this.st = stats;
    this.x = 0; this.z = 0; this.y = 0;
    this.a = 0;            // heading: forward = (sin a, cos a) in xz
    this.vx = 0; this.vz = 0;
    this.slip = 0;         // lateral slip speed (signed)
    this.onRoad = true;
    this.drift = 0;        // 0..1 drift amount for effects
  }
  speed() { return Math.hypot(this.vx, this.vz); }
  forward() { return { x: Math.sin(this.a), z: Math.cos(this.a) }; }

  update(dt, inp, near) {
    const st = this.st;
    this.onRoad = near.onRoad;
    const steer = (inp.left ? 1 : 0) + (inp.right ? -1 : 0);
    const sp = this.speed();
    const fwd0 = this.forward();

    // yaw
    const spdFac = Math.min(1, sp / 6);
    let yaw = steer * st.steerRate * spdFac * (inp.hand ? 1.2 : 1);
    yaw *= 1 - Math.min(0.6, sp / (st.topSpeed * 1.1));
    // self-aligning torque: slip growth damps further yaw (prevents full spins)
    yaw -= Math.sign(yaw) * Math.min(Math.abs(yaw) * 0.6, Math.abs(this.slip) * 0.10);
    if (st.drive === 'rwd') yaw += st.oversteer * steer * Math.min(1, sp / 12) * (inp.up ? 1.35 : 0.6) * 0.5;
    if (st.drive === 'fwd') yaw -= 0.18 * steer * (inp.up ? 1 : 0.5);
    if (sp > 0.5) this.a += yaw * dt;

    // decompose vel into new frame
    const f = this.forward();
    const lx = -f.z, lz = f.x; // left perp
    let vf = this.vx * f.x + this.vz * f.z;
    let vl = this.vx * lx + this.vz * lz;

    const gripMul = this.onRoad ? 1 : 0.38;
    const vmax = st.topSpeed * (this.onRoad ? 1 : 0.5);

    // engine
    if (inp.up && vf < vmax) {
      const traction = st.drive === 'awd' ? 1 : 0.82;
      vf += st.accel * traction * (1 - Math.max(0, vf) / vmax) * dt * (inp.hand ? 0.25 : 1);
    }
    if (inp.down) {
      if (vf > 0.5) vf -= st.brake * dt;
      else vf -= st.accel * 0.4 * dt; // reverse
    }
    if (inp.hand) vf -= vf * 0.55 * dt;
    if (!inp.up && !inp.down) {
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.2 * dt); // engine braking
    }
    vf -= vf * (this.onRoad ? 0.0016 : 0.05) * sp * dt; // drag
    if (vf < -13) vf = -13;

    // lateral scrub (grip)
    const grip = st.grip * gripMul * (inp.hand ? 0.30 : 1);
    vl = Math.sign(vl) * Math.max(0, Math.abs(vl) - grip * dt);
    // grass shoves the car around a bit (18 m/s^2 of kick, dt-scaled so the
    // behaviour is identical at 30 and 144 fps)
    if (!this.onRoad) vl += (Math.random() - 0.5) * 18 * dt;

    this.vx = f.x * vf + lx * vl;
    this.vz = f.z * vf + lz * vl;
    this.slip = vl;
    this.drift = Math.min(1, Math.abs(vl) / 9);

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.y = near.sm.y;
    return vf;
  }

  snapTo(near, speedFrac) {
    this.x = near.sm.x; this.z = near.sm.z; this.y = near.sm.y;
    this.a = Math.atan2(near.sm.tx, near.sm.tz);
    const sp = this.speed() * (speedFrac ?? 0.25);
    this.vx = near.sm.tx * sp; this.vz = near.sm.tz * sp;
  }
}

export class AICar {
  constructor(car, track, skill) {
    this.car = car;
    this.track = track;
    this.skill = skill;
    this.s = 0; this.v = 0; this.laps = 0;
    this.x = 0; this.z = 0; this.y = 0; this.a = 0;
    // personal racing-line bias: a spread wider than the car (1.8 m) so rivals
    // never end up occupying the same lane and driving through each other
    this.line = (Math.random() - 0.5) * 4.4;   // spread wider than the 1.8 m car width
    this.lat = this.line;
    this.dodgeSide = 0;   // latched overtake commitment: -1/0/+1
  }
  place(s) {
    this.s = s;
    const p = this.track.pointAtS(s);
    const [px, pz] = [-p.tz, p.tx];
    this.x = p.x + px * this.line; this.z = p.z + pz * this.line;
    this.y = p.y; this.a = Math.atan2(p.tx, p.tz);
  }
  // `others` is the rest of the field: rivals have no collision model of their
  // own, so without this they happily drive through each other when two of them
  // end up in the same lane.
  update(dt, playerTotal, others = []) {
    const p = this.track.pointAtS(this.s);
    const r = 1 / Math.max(0.0012, p.curv);
    const vLat = Math.sqrt(this.car.stats.grip * this.skill * r);
    let vT = Math.min(this.car.stats.topSpeed * this.skill, vLat);
    // rubber band
    const myTotal = this.laps * this.track.length + this.s;
    vT *= Math.max(0.93, Math.min(1.07, 1 + (playerTotal - myTotal) / 900));
    this.v += Math.max(-6, Math.min(5.5, vT - this.v)) * dt;
    // queue up behind anyone close ahead in our lane (rival or the player, both
    // arrive through `others` with x/z) instead of overlapping it. Gates use the
    // REAL world lateral offset — gating on this.lat (the lane command) makes a
    // dodging car oscillate: the command clears the band a frame before the
    // smoothed car body has actually moved sideways, so it re-queues forever.
    const half = this.track.length / 2;
    const px0 = -p.tz, pz0 = p.tx;
    const myLat = (this.x - p.x) * px0 + (this.z - p.z) * pz0;
    const latOf = o => (o.x - p.x) * px0 + (o.z - p.z) * pz0;
    for (const o of others) {
      if (o === this) continue;
      let d = o.s - this.s;
      if (d > half) d -= this.track.length; else if (d < -half) d += this.track.length;
      if (d <= 0.5 || d > 10) continue;
      if (Math.abs(latOf(o) - myLat) < 2.2) this.v = Math.min(this.v, o.v * 0.985);
    }
    const prev = this.s;
    this.s += this.v * dt;
    if (this.s > this.track.length) { this.s -= this.track.length; this.laps++; }
    const q = this.track.pointAtS(this.s);
    // lateral: apex inside of corner
    const target = -Math.sign(q.signed) * Math.min(this.track.halfWidth - 2.6, q.curv * 900) + this.line * 0.6;
    // dodge: a slower car ahead (or beside) triggers a LATCHED overtake
    // commitment. Two lessons: (1) a proportional dodge cancels itself at the
    // band edge, so the car dithers forever; (2) the latch must persist while
    // ANY slow car sits in the ahead-window — releasing it the moment the body
    // momentarily clears the band makes the side oscillate faster than the
    // smoothed car body can ever commit. Once latched, hold a full 3.4 m
    // offset (over the 2.2 m queue-release threshold) until the pass completes
    // and the blocker falls behind.
    const px = -q.tz, pz = q.tx;
    const myLat2 = (this.x - q.x) * px + (this.z - q.z) * pz;
    let relevant = false, pick = 0;
    const lats = [];
    for (const o of others) {
      if (o === this) continue;
      let d = o.s - this.s;
      if (d > half) d -= this.track.length; else if (d < -half) d += this.track.length;
      if (d < -10 || d > 10) continue;
      const oLat = (o.x - q.x) * px + (o.z - q.z) * pz;
      lats.push(oLat);
      if (d < -0.5 || o.v >= vT - 0.5) continue;      // blocking: ahead & slower
                                                      // (current v is already queue-
                                                      // clamped, so compare to vT)
      relevant = true;
      if (!pick && Math.abs(myLat2 - oLat) < 2.3)
        pick = (myLat2 !== oLat ? Math.sign(myLat2 - oLat) : (this.line >= 0 ? 1 : -1));
    }
    if (!relevant) this.dodgeSide = 0;
    else if (!this.dodgeSide) {
      // commit to a side — but if another car already occupies the destination
      // lane, take the other one (two rivals picking into each other's path is
      // how they end up crossing and driving through one another)
      let side = pick || (this.line >= 0 ? 1 : -1);
      const dest = myLat2 + side * 3.4;
      for (const oLat of lats) if (Math.abs(oLat - dest) < 2.4) { side = -side; break; }
      this.dodgeSide = side;
    }
    const lim = this.track.halfWidth - 1.8;
    const off = this.dodgeSide ? this.dodgeSide * 3.4 : 0;
    this.lat = Math.max(-lim, Math.min(lim, target + off));
    const cx = q.x + px * this.lat, cz = q.z + pz * this.lat;
    this.x += (cx - this.x) * Math.min(1, 8 * dt);
    this.z += (cz - this.z) * Math.min(1, 8 * dt);
    this.y = q.y;
    this.a = Math.atan2(q.tx, q.tz);
    return this.v;
  }
}
