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
    // queue up behind a rival that is close ahead in our lane instead of overlapping it
    for (const o of others) {
      if (o === this) continue;
      const half = this.track.length / 2;
      let d = o.s - this.s;
      if (d > half) d -= this.track.length; else if (d < -half) d += this.track.length;
      if (d <= 0.5 || d > 10) continue;
      if (Math.abs(o.lat - this.lat) < 2.2) this.v = Math.min(this.v, o.v * 0.985);
    }
    const prev = this.s;
    this.s += this.v * dt;
    if (this.s > this.track.length) { this.s -= this.track.length; this.laps++; }
    const q = this.track.pointAtS(this.s);
    // lateral: apex inside of corner
    const target = -Math.sign(q.signed) * Math.min(this.track.halfWidth - 2.6, q.curv * 900) + this.line * 0.6;
    this.lat = target;
    const px = -q.tz, pz = q.tx;
    const cx = q.x + px * target, cz = q.z + pz * target;
    this.x += (cx - this.x) * Math.min(1, 8 * dt);
    this.z += (cz - this.z) * Math.min(1, 8 * dt);
    this.y = q.y;
    this.a = Math.atan2(q.tx, q.tz);
    return this.v;
  }
}
