// Voxel car models + real-car stat sheets (stats are arcade-tuned approximations of real specs)
import * as THREE from 'three';

export const CARS = [
  {
    id: 'rx7', name: "Mazda RX-7 Spirit R Type A", sub: "FD3S · 1999 · Rotary 265 hp · RWD",
    color: 0xd42a2a, accent: 0xf2f2f2, glass: 0x22303c,
    massKg: 1254, hp: 265, drive: 'rwd',
    stats: { topSpeed: 69, accel: 7.6, brake: 11.5, grip: 9.4, steerRate: 1.55, oversteer: 0.30 },
    model: { len: 4.35, wid: 1.76, hgt: 0.90, cab: 0.42, nose: 'wedge', wing: 'none', popups: true, lights4: false },
  },
  {
    id: 'gtr', name: "Nissan Skyline GT-R", sub: "BNR34 · 1999 · RB26 276 hp · AWD ATTESA",
    color: 0x2e5fb8, accent: 0xdfe8f0, glass: 0x1c2836,
    massKg: 1530, hp: 276, drive: 'awd',
    stats: { topSpeed: 69, accel: 7.9, brake: 11.2, grip: 9.9, steerRate: 1.45, oversteer: 0.12 },
    model: { len: 4.65, wid: 1.78, hgt: 0.96, cab: 0.46, nose: 'block', wing: 'big', popups: false, lights4: true },
  },
  {
    id: 'supra', name: "Toyota Supra RZ", sub: "A80 · 1997 · 2JZ-GTE 320 hp · RWD",
    color: 0xe07a1f, accent: 0x1a1a1a, glass: 0x20242a,
    massKg: 1570, hp: 320, drive: 'rwd',
    stats: { topSpeed: 74, accel: 8.4, brake: 10.8, grip: 9.0, steerRate: 1.50, oversteer: 0.34 },
    model: { len: 4.55, wid: 1.76, hgt: 0.95, cab: 0.44, nose: 'block', wing: 'big', popups: false, lights4: false },
  },
  {
    id: 'nsx', name: "Honda NSX Type R", sub: "NA1 · 2002 · C3000 VTEC 280 hp · RWD",
    color: 0xf0f0f0, accent: 0xb8c4d0, glass: 0x27333f,
    massKg: 1230, hp: 280, drive: 'rwd',
    stats: { topSpeed: 74, accel: 7.8, brake: 11.8, grip: 9.7, steerRate: 1.60, oversteer: 0.26 },
    model: { len: 4.40, wid: 1.74, hgt: 0.84, cab: 0.38, nose: 'wedge', wing: 'none', popups: true, lights4: false },
  },
  {
    id: 'p911', name: "Porsche 911 Carrera", sub: "996 · 2001 · 3.4 flat-6 300 hp · RWD",
    color: 0xbfc4c8, accent: 0x2c2f33, glass: 0x232c36,
    massKg: 1400, hp: 300, drive: 'rwd',
    stats: { topSpeed: 77, accel: 7.7, brake: 11.6, grip: 9.5, steerRate: 1.55, oversteer: 0.40 },
    model: { len: 4.25, wid: 1.77, hgt: 0.94, cab: 0.40, nose: 'round', wing: 'duck', popups: false, lights4: false },
  },
];

const M = (g, color) => new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));

// Build a chunky voxel car. Units in meters, car faces +z.
export function buildVoxelCar(car) {
  const m = car.model;
  const g = new THREE.Group();
  const u = 0.28; // voxel grid unit
  // snap to voxel grid, but genuinely thin parts (stripes, wing skins) keep their size
  const q = v => v < 0.2 ? Math.max(0.05, v) : Math.max(u, Math.round(v / u) * u);

  const body = car.color, acc = car.accent, glass = car.glass;

  // main body tub
  let b = M(new THREE.BoxGeometry(q(m.wid), q(m.hgt * 0.62), q(m.len)), body);
  b.position.y = q(m.hgt * 0.32); g.add(b);

  // cabin / greenhouse (offset rear for 911, mid for others)
  const cabZ = m.id === 'p911' || car.id === 'p911' ? m.len * 0.10 : (car.id === 'gtr' ? -m.len * 0.02 : -m.len * 0.04);
  let c = M(new THREE.BoxGeometry(q(m.wid * 0.86), q(m.cab), q(m.len * 0.42)), body);
  c.position.set(0, q(m.hgt * 0.62 + m.cab * 0.45), cabZ); g.add(c);
  let gl = M(new THREE.BoxGeometry(q(m.wid * 0.90), q(m.cab * 0.72), q(m.len * 0.36)), glass);
  gl.position.set(0, q(m.hgt * 0.62 + m.cab * 0.42), cabZ); g.add(gl);

  // nose treatment
  if (m.nose === 'wedge') {
    let n = M(new THREE.BoxGeometry(q(m.wid * 0.94), q(m.hgt * 0.34), q(m.len * 0.22)), body);
    n.position.set(0, q(m.hgt * 0.20), q(m.len * 0.40)); g.add(n);
  } else if (m.nose === 'round') {
    let n = M(new THREE.BoxGeometry(q(m.wid * 0.9), q(m.hgt * 0.5), q(m.len * 0.20)), body);
    n.position.set(0, q(m.hgt * 0.28), q(m.len * 0.40)); g.add(n);
  } else {
    let n = M(new THREE.BoxGeometry(q(m.wid * 0.98), q(m.hgt * 0.52), q(m.len * 0.18)), body);
    n.position.set(0, q(m.hgt * 0.27), q(m.len * 0.38)); g.add(n);
  }

  // rear haunches (911 gets wide hips)
  const hipW = car.id === 'p911' ? m.wid * 1.06 : m.wid * 0.98;
  let h = M(new THREE.BoxGeometry(q(hipW), q(m.hgt * 0.7), q(m.len * 0.24)), body);
  h.position.set(0, q(m.hgt * 0.35), -q(m.len * 0.37)); g.add(h);

  if (car.id === 'supra') { // targa roof strip
    let t = M(new THREE.BoxGeometry(q(m.wid * 0.5), q(m.cab * 0.3), q(m.len * 0.14)), acc);
    t.position.set(0, q(m.hgt * 0.62 + m.cab * 1.14), cabZ); g.add(t);
  }
  if (car.id === 'gtr') { // roof stripe
    let s = M(new THREE.BoxGeometry(q(m.wid * 0.22), q(m.cab * 0.12), q(m.len * 0.44)), acc);
    s.position.set(0, q(m.hgt * 0.62 + m.cab * 1.16), cabZ); g.add(s);
  }

  // pop-up headlights (FD / NSX)
  if (m.popups) {
    for (const sgn of [-1, 1]) {
      let p = M(new THREE.BoxGeometry(q(0.34), q(0.10), q(0.30)), 0x11141a);
      p.position.set(sgn * q(m.wid * 0.30), q(m.hgt * 0.62), q(m.len * 0.42));
      p.rotation.z = sgn * 0.15; g.add(p);
    }
  }
  // headlights / taillights
  const hlW = m.lights4 ? 0.26 : 0.42, hlN = m.lights4 ? 2 : 1;
  for (const sgn of [-1, 1]) {
    for (let k = 0; k < hlN; k++) {
      let hl = M(new THREE.BoxGeometry(q(hlW), q(0.16), q(0.10)), 0xf4e9c8);
      hl.position.set(sgn * q(m.wid * (m.lights4 ? (0.14 + k * 0.15) : 0.30)), q(m.hgt * 0.5), q(m.len * 0.485));
      g.add(hl);
      let tl = M(new THREE.BoxGeometry(q(m.lights4 ? 0.28 : 0.5), q(0.18), q(0.10)), 0xd03030);
      tl.position.set(sgn * q(m.wid * (m.lights4 ? (0.14 + k * 0.15) : 0.32)), q(m.hgt * 0.55), -q(m.len * 0.485));
      g.add(tl);
    }
  }

  // spoiler
  if (m.wing === 'big') {
    let w = M(new THREE.BoxGeometry(q(m.wid * 0.86), q(0.08), q(0.34)), 0x14161a);
    w.position.set(0, q(m.hgt + 0.30), -q(m.len * 0.44)); g.add(w);
    for (const sgn of [-1, 1]) {
      let pl = M(new THREE.BoxGeometry(q(0.08), q(0.34), q(0.30)), 0x14161a);
      pl.position.set(sgn * q(m.wid * 0.42), q(m.hgt + 0.15), -q(m.len * 0.44)); g.add(pl);
    }
  } else if (m.wing === 'duck') {
    let w = M(new THREE.BoxGeometry(q(m.wid * 0.8), q(0.10), q(0.26)), body);
    w.position.set(0, q(m.hgt * 0.86), -q(m.len * 0.42));
    w.rotation.x = -0.22; g.add(w);
  }

  // voxel wheels: tire box + hub, spin about x
  const wheels = [];
  const wr = 0.33, tw = 0.26;
  for (const sx of [-1, 1]) for (const sz of [1, -1]) {
    const wg = new THREE.Group();
    const tire = M(new THREE.BoxGeometry(q(tw), q(wr * 2), q(wr * 2)), 0x17181c);
    wg.add(tire);
    const hub = M(new THREE.BoxGeometry(q(tw + 0.06), q(wr * 1.0), q(wr * 1.0)), 0x9aa4ae);
    wg.add(hub);
    wg.position.set(sx * q(m.wid * 0.5 - tw * 0.1), q(wr), sz * q(m.len * 0.33));
    g.add(wg); wheels.push(wg);
  }

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return { group: g, wheels };
}
