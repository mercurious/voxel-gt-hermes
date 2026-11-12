// Three real circuits, centerlines hand-digitized as stylized approximations of the
// real layouts (corner-by-corner character, scaled to true lap lengths).
// Each point: [x, z] meters; optional elevations per key point.
import * as THREE from 'three';

export const TRACKS = [
  {
    id: 'tsukuba', name: 'Tsukuba Circuit', loc: 'Ibaraki, Japan · 2.045 km · clockwise',
    halfWidth: 7, laps: 3, scale: 1.06, elev: false,
    // front straight -> 30A/30B high-speed kinks -> left hairpin -> S-curves -> chicane
    pts: [
      [0,185],[0,290],[0,470],[25,525],[75,560],[150,575],[225,565],
      [295,575],[340,545],[330,500],[280,485],[215,495],[160,470],
      [110,430],[90,380],[60,345],[85,305],[55,265],[30,225],
    ],
  },
  {
    id: 'suzuka', name: 'Suzuka Circuit', loc: 'Mie, Japan · 5.807 km · figure-8 crossover',
    halfWidth: 8.5, laps: 2, scale: 2.25, elev: true,
    // S/F straight -> 1st/2nd corner -> S curves -> Degner -> hairpin -> bridge crossover
    // (elevated) -> 130R -> chicane -> final corners. bridge indices carry +elev.
    pts: [
      [60,150],[60,430],[100,510],[180,555],[270,560],[340,590],[380,640],
      [400,700],[430,745],[490,770],[545,750],[590,780],[620,745],[590,700],[530,690],
      [470,680],[420,660],[360,640],[300,630],[230,615],[170,570],[120,500],
      [90,410],[100,310],[160,240],[250,230],[310,250],[300,180],[230,120],[140,110],
    ],
    // elevation in meters applied to samples s in [sA,sB] — the deck must straddle
    // the real self-crossing of the layout (plan distance between the two branches
    // is only ~3.5 m there), otherwise the ribbons intersect at ground level
    bridge: { sAFrac: 0.56, sBFrac: 0.74, h: 6.2 },
  },
  {
    id: 'laguna', name: "WeatherTech Raceway Laguna Seca", loc: 'Monterey, USA · 3.602 km · The Corkscrew',
    halfWidth: 7.5, laps: 2, scale: 2.25, elev: true,
    // downhill straight -> T1 -> Andretti uphill -> Corkscrew (left-right off a 12% hill)
    // -> T9/T10 -> back down to the straight
    pts: [
      [20,520],[10,430],[0,330],[0,220],[0,120],[30,40],[100,0],[160,30],
      [210,100],[235,190],[230,280],[235,350],[255,410],[295,450],[335,465],
      [355,495],[350,540],[315,585],[255,610],[190,600],[140,575],[80,545],
    ],
    elevs: [12,11.5,10,8,5.5,2.5,1,1,2,4,6,8,10,12,7,1.5,4,9,11.5,12,11,10.5],
  },
];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildTrack(def, scene) {
  const group = new THREE.Group();
  const hw = def.halfWidth;

  // key points (scaled, elevated)
  const key = def.pts.map(p => [p[0] * def.scale, p[1] * def.scale]);
  const curve = new THREE.CatmullRomCurve3(
    key.map(p => new THREE.Vector3(p[0], def.elevs ? def.elevs[key.indexOf(p)] : 0, p[1])),
    true, 'catmullrom', 0.5
  );
  // rough length
  let rough = 0;
  for (let i = 0; i < key.length; i++) {
    const a = key[i], b = key[(i + 1) % key.length];
    rough += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const ds = 2.4;
  const n = Math.max(120, Math.round(rough / ds));
  const pts = curve.getSpacedPoints(n); // n+1 pts, last == first (closed)
  // re-derive smooth elevation
  const samples = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const t = curve.getTangentAt(i / (pts.length - 1));
    samples.push({ x: p.x, z: p.z, y: p.y, tx: t.x, tz: t.z, s: 0, curv: 0, signed: 0 });
  }
  // arc-length s, curvature
  let s = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i], b = samples[(i + 1) % samples.length];
    a.s = s;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const hA = Math.atan2(a.tz, a.tx), hB = Math.atan2(b.tz, b.tx);
    let dh = hB - hA; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    a.curv = Math.abs(dh) / Math.max(0.1, d);
    a.signed = dh / Math.max(0.1, d);
    s += d;
  }
  const length = s;

  // elevation profile: flat except declared bridge band / explicit elevs
  const eAt = (sm) => {
    if (def.elevs) { // interpolate along s from key-point elev fractions
      const f = sm.s / length;
      const m = def.elevs.length;
      const g = f * m; const i0 = Math.floor(g) % m, i1 = (i0 + 1) % m;
      const w = g - Math.floor(g);
      return def.elevs[i0] * (1 - w) + def.elevs[i1] * w;
    }
    if (def.bridge) {
      const f = sm.s / length;
      if (f > def.bridge.sAFrac && f < def.bridge.sBFrac) {
        const a = def.bridge.sAFrac, b = def.bridge.sBFrac, c = (a + b) / 2;
        const r = Math.min((f - a) / (c - a), (b - f) / (b - c));
        return def.bridge.h * Math.min(1, r * 2.4);
      }
    }
    return 0;
  };
  samples.forEach(sm => { sm.y = eAt(sm); });

  // A bridge deck is only where the track declares one: height alone is not
  // enough, because elevation-driven tracks (Laguna Seca) run 1-12 m above the
  // plain along hillsides and would grow pier columns out of every embankment.
  const isBridge = sm => !!def.bridge && sm.y > 1.2;

  // Distance from each elevated sample to the nearest part of the track that is
  // not the same stretch. Used to keep piers off the road below and to cut the
  // embankment away where the deck flies over it.
  const distOther = new Float64Array(samples.length).fill(Infinity);
  if (def.bridge) {
    for (let i = 0; i < samples.length; i++) {
      const a = samples[i];
      if (!isBridge(a)) continue;
      let dmin = Infinity;
      for (let j = 0; j < samples.length; j += 2) {
        const b = samples[j];
        let ds = Math.abs(a.s - b.s); ds = Math.min(ds, length - ds);
        if (ds < 60) continue;               // same stretch of ribbon
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.sqrt(dx * dx + dz * dz);
        if (d < dmin) { dmin = d; if (d < 1) break; }
      }
      distOther[i] = dmin;
    }
  }

  // ---- road ribbon (top surface) ----
  const pos = [], uv = [], idx = [];
  const perp = sm => [-sm.tz, sm.tx]; // left-hand perp in xz
  for (let i = 0; i <= samples.length; i++) {
    const sm = samples[i % samples.length];
    const [px, pz] = perp(sm);
    pos.push(sm.x + px * hw, sm.y + 0.02, sm.z + pz * hw);
    pos.push(sm.x - px * hw, sm.y + 0.02, sm.z - pz * hw);
    uv.push(0, sm.s / 12, 1, sm.s / 12);
  }
  for (let i = 0; i < samples.length; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  roadGeo.setIndex(idx); roadGeo.computeVertexNormals();
  const road = new THREE.Mesh(roadGeo, new THREE.MeshLambertMaterial({ color: 0x33363d }));
  road.receiveShadow = true; group.add(road);

  // center dashes + edge lines + start line
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xcfd3d8 });
  for (let i = 0; i < samples.length; i += 6) {
    const sm = samples[i];
    if (isBridge(sm) && i % 12) continue;   // dashed centre line only on the ground, not on a deck
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 2.2), dashMat);
    d.position.set(sm.x, sm.y + 0.05, sm.z);
    d.rotation.y = Math.atan2(sm.tx, sm.tz);
    group.add(d);
  }
  for (const sgn of [-1, 1]) {
    const g2 = new THREE.BufferGeometry();
    const pos2 = [], idx2 = [];
    for (let i = 0; i <= samples.length; i++) {
      const sm = samples[i % samples.length];
      const [px, pz] = perp(sm);
      pos2.push(sm.x + px * hw * sgn, sm.y + 0.03, sm.z + pz * hw * sgn);
      pos2.push(sm.x + px * hw * sgn * 0.93, sm.y + 0.03, sm.z + pz * hw * sgn * 0.93);
    }
    for (let i = 0; i < samples.length; i++) {
      const a = i * 2;
      idx2.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    g2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3));
    g2.setIndex(idx2); g2.computeVertexNormals();
    group.add(new THREE.Mesh(g2, dashMat));
  }
  // start/finish checkers
  {
    const sm = samples[0];
    const [px, pz] = perp(sm);
    const cols = 10, rows = 2, cw = (hw * 2) / cols, cl = 1.4;
    const m1 = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
    const m2 = new THREE.MeshBasicMaterial({ color: 0x101010 });
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const q = new THREE.Mesh(new THREE.BoxGeometry(cw - 0.04, 0.06, cl - 0.04), (r + c) % 2 ? m2 : m1);
      const off = -hw + cw * (c + 0.5), along = cl * (r - 0.5) - 2;
      q.position.set(sm.x + px * off + sm.tx * along, sm.y + 0.05, sm.z + pz * off + sm.tz * along);
      q.rotation.y = Math.atan2(sm.tx, sm.tz);
      group.add(q);
    }
  }

  // barriers (red/white) + curbs
  const bars = [];
  for (let i = 0; i < samples.length; i += 2) {
    const sm = samples[i];
    const [px, pz] = perp(sm);
    for (const sgn of [-1, 1]) {
      bars.push({ x: sm.x + px * hw * sgn * 1.06, y: sm.y + 0.55, z: sm.z + pz * hw * sgn * 1.06,
        ry: Math.atan2(sm.tx, sm.tz), alt: (i / 2) % 2 ? 1 : 0 });
    }
  }
  const barGeo = new THREE.BoxGeometry(0.35, 1.1, 5.4);
  const barIM = new THREE.InstancedMesh(barGeo, new THREE.MeshLambertMaterial({}), bars.length);
  const dummy = new THREE.Object3D(); const col = new THREE.Color();
  bars.forEach((b, k) => {
    dummy.position.set(b.x, b.y, b.z); dummy.rotation.set(0, b.ry, 0); dummy.updateMatrix();
    barIM.setMatrixAt(k, dummy.matrix);
    barIM.setColorAt(k, col.setHex(b.alt ? 0xd42a2a : 0xe8e8e8));
  });
  barIM.castShadow = true; group.add(barIM);

  // curbs at corners
  const curbItems = [];
  for (let i = 0; i < samples.length; i += 3) {
    const sm = samples[i];
    if (sm.curv < 0.016) continue;
    const [px, pz] = perp(sm);
    const sgn = sm.signed > 0 ? -1 : 1; // inner edge
    curbItems.push({ x: sm.x + px * hw * sgn * 0.88, y: sm.y + 0.05, z: sm.z + pz * hw * sgn * 0.88,
      ry: Math.atan2(sm.tx, sm.tz), alt: (i / 3) % 2 ? 1 : 0 });
  }
  if (curbItems.length) {
    const curIM = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.12, 2.6), new THREE.MeshLambertMaterial({}), curbItems.length);
    curbItems.forEach((b, k) => {
      dummy.position.set(b.x, b.y, b.z); dummy.rotation.set(0, b.ry, 0); dummy.updateMatrix();
      curIM.setMatrixAt(k, dummy.matrix);
      curIM.setColorAt(k, col.setHex(b.alt ? 0xd42a2a : 0xf0f0f0));
    });
    group.add(curIM);
  }

  // bridge piers (skip the span over the road below: a column there would stand
  // in the middle of the live racing surface)
  for (let i = 0; i < samples.length; i += 8) {
    const sm = samples[i];
    if (!isBridge(sm) || distOther[i] < hw + 6) continue;
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.3, sm.y, 1.0), new THREE.MeshLambertMaterial({ color: 0x8a8f96 }));
    p.position.set(sm.x, sm.y / 2, sm.z);
    group.add(p);
  }

  // graded terraces hugging the road: blends elevated/graded sections into the plain
  const bands = [
    { d0: hw,      y0: s => s.y,            d1: hw + 8,  y1: s => s.y - 3 },
    { d0: hw + 8,  y0: s => s.y - 3,        d1: hw + 20, y1: s => Math.max(-0.1, s.y - 6.5) },
    { d0: hw + 20, y0: s => Math.max(-0.1, s.y - 6.5), d1: hw + 36, y1: () => -0.12 },
  ];
  for (const b of bands) {
    const pos = [], idx = [];
    for (let i = 0; i <= samples.length; i++) {
      // wrap (not clamp) so the embankment closes over the start/finish line
      const sm = samples[i % samples.length];
      const [nx, nz] = perp(sm);
      const yA = Math.max(-0.15, b.y0(sm)), yB = Math.max(-0.18, b.y1(sm));
      for (const sgn of [-1, 1]) {
        pos.push(sm.x + nx * sgn * b.d0, yA, sm.z + nz * sgn * b.d0);
        pos.push(sm.x + nx * sgn * b.d1, yB, sm.z + nz * sgn * b.d1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    // don't fill the embankment in where it would bury a road the deck crosses over
    const cut = b.d1 + hw;
    for (let i = 0; i < samples.length; i++) {
      if (distOther[i] < cut || distOther[(i + 1) % samples.length] < cut) continue;
      const a = i * 4, b2 = a + 4;
      for (let k = 0; k < 2; k++) {
        idx.push(a + k * 2, b2 + k * 2, a + k * 2 + 1, a + k * 2 + 1, b2 + k * 2, b2 + k * 2 + 1);
      }
    }
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x49774a, side: THREE.DoubleSide }));
    group.add(m);
  }

  // ground
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: 0x4e7d3f }));
  gr.rotation.x = -Math.PI / 2; gr.position.y = -0.05; gr.receiveShadow = true; group.add(gr);

  // scenery: trees, grandstands, pit building
  const rnd = mulberry32(1337);
  const xs = samples.map(sm => sm.x), zs = samples.map(sm => sm.z);
  let cx = 0, cz = 0; xs.forEach(v => cx += v); zs.forEach(v => cz += v);
  cx /= samples.length; cz /= samples.length;
  const nearTrack = (x, z, m) => {
    for (let i = 0; i < samples.length; i += 3) {
      const dx = samples[i].x - x, dz = samples[i].z - z;
      if (dx * dx + dz * dz < m * m) return true;
    }
    return false;
  };
  const treeTr = [], treeCd = [];
  let tries = 0;
  while (treeTr.length < 130 && tries < 900) {
    tries++;
    const ang = rnd() * Math.PI * 2, rad = 40 + rnd() * 420;
    const x = cx + Math.cos(ang) * rad, z = cz + Math.sin(ang) * rad;
    if (nearTrack(x, z, hw + 42)) continue;
    const h = 3 + rnd() * 4;
    treeTr.push([x, h / 2, z, 0.8 + rnd() * 0.5, h]);
    treeCd.push([x, h + 1.1, z, 2 + rnd() * 2.2]);
  }
  const trIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x5d4426 }), treeTr.length);
  const cdIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x2f5d2f }), treeCd.length);
  treeTr.forEach((t, k) => { dummy.position.set(t[0], t[1], t[2]); dummy.scale.set(t[3], t[4], t[3]); dummy.rotation.set(0,0,0); dummy.updateMatrix(); trIM.setMatrixAt(k, dummy.matrix); });
  treeCd.forEach((t, k) => { dummy.position.set(t[0], t[1], t[2]); dummy.scale.set(t[3] * 2, t[3] * 2, t[3] * 2); dummy.updateMatrix(); cdIM.setMatrixAt(k, dummy.matrix); });
  dummy.scale.set(1, 1, 1);
  cdIM.castShadow = true; group.add(trIM); group.add(cdIM);

  // grandstands + pit building near start. The circuit can fold back right
  // beside the start straight, so these boxes must clear EVERY stretch of
  // road, not just the straight they hang off (Tsukuba's return section used
  // to run straight through the grandstand row). Search outward along the
  // start perp until the footprints clear the whole corridor.
  const sm0 = samples[0]; const [p0x, p0z] = perp(sm0);
  const sry = Math.atan2(sm0.tx, sm0.tz);
  const boxClear = (x, z, w, d, ry) => {
    const cu = Math.cos(ry), su = Math.sin(ry);
    for (let i = 0; i < samples.length; i += 2) {
      const dx = samples[i].x - x, dz = samples[i].z - z;
      const lu = dx * cu + dz * su, lv = -dx * su + dz * cu;   // into box frame
      const du = Math.max(0, Math.abs(lu) - w / 2), dv = Math.max(0, Math.abs(lv) - d / 2);
      if (du * du + dv * dv < (hw + 0.8) * (hw + 0.8)) return false;
    }
    return true;
  };
  const standMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc2 });
  const standMat2 = new THREE.MeshLambertMaterial({ color: 0x8b939c });
  const standAt = (k, off) => [sm0.x - p0x * (hw + off) + sm0.tx * (k * 28 - 28),
                                sm0.z - p0z * (hw + off) + sm0.tz * (k * 28 - 28)];
  const rowOff = [40, 52, 64, 78, 95].find(off =>
    [0, 1, 2].every(k => { const [sx, sz] = standAt(k, off); return boxClear(sx, sz, 26, 12, sry); }));
  for (let k = 0; k < 3; k++) {
    const off = rowOff !== undefined ? rowOff
      : [40, 52, 64, 78, 95].find(o => { const [sx, sz] = standAt(k, o); return boxClear(sx, sz, 26, 12, sry); });
    if (off === undefined) continue;              // nowhere clear — drop this stand
    const [sx, sz] = standAt(k, off);
    const st = new THREE.Mesh(new THREE.BoxGeometry(26, 8, 12), k % 2 ? standMat : standMat2);
    st.position.set(sx, 4, sz);
    st.rotation.y = sry;
    group.add(st);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(27, 0.8, 13), new THREE.MeshLambertMaterial({ color: 0x39404a }));
    roof.position.set(sx, 8.6, sz); roof.rotation.y = sry;
    group.add(roof);
  }
  const pitOff = [36, 50, 64, 80, 96].find(off =>
    boxClear(sm0.x + p0x * (hw + off), sm0.z + p0z * (hw + off), 52.4, 15.4, sry));
  if (pitOff !== undefined) {
    const pxp = sm0.x + p0x * (hw + pitOff), pzp = sm0.z + p0z * (hw + pitOff);
    const pit = new THREE.Mesh(new THREE.BoxGeometry(52, 7, 15), new THREE.MeshLambertMaterial({ color: 0x9aa3ad }));
    pit.position.set(pxp, 3.5, pzp);
    pit.rotation.y = sry;
    group.add(pit);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(52.4, 1.4, 15.4), new THREE.MeshLambertMaterial({ color: 0xc4302b }));
    stripe.position.set(pxp, 6.2, pzp); stripe.rotation.y = sry;
    group.add(stripe);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(44, 5, 13), new THREE.MeshLambertMaterial({ color: 0x5c6672 }));
    upper.position.set(pxp, 9.5, pzp); upper.rotation.y = sry;
    group.add(upper);
  }

  scene.add(group);

  // ---- runtime API ----
  // Height is part of the search: at a self-crossing (Suzuka) the deck passes
  // 6 m above the other branch only ~3.5 m away in plan, so plan distance alone
  // would snap a car on the lower road onto the deck (and vice versa at the deck
  // edge) — which also throws off the lap counter. A car always rides its own
  // surface, so a vertical mismatch means "different road" and is weighted hard.
  const YW = 6;
  function nearest(x, z, y = null) {
    const dy = i => (y == null ? 0 : (samples[i].y - y) * YW);
    let best = 0, bd = 1e18;
    for (let i = 0; i < samples.length; i += 2) {
      const dx = samples[i].x - x, dz = samples[i].z - z, dyy = dy(i);
      const d = dx * dx + dz * dz + dyy * dyy;
      if (d < bd) { bd = d; best = i; }
    }
    let bbi = best; let bbd = bd;
    for (let i = best - 4; i <= best + 4; i++) {
      const j = ((i % samples.length) + samples.length) % samples.length;
      const sm = samples[j];
      const dx = sm.x - x, dz = sm.z - z, dyy = y == null ? 0 : (sm.y - y) * YW;
      const d = dx * dx + dz * dz + dyy * dyy;
      if (d < bbd) { bbd = d; bbi = i; }
    }
    const sm = samples[((bbi % samples.length) + samples.length) % samples.length];
    const along = (x - sm.x) * sm.tx + (z - sm.z) * sm.tz;
    const lat = -(x - sm.x) * sm.tz + (z - sm.z) * sm.tx; // + = perp side
    return { sm, i: ((bbi % samples.length) + samples.length) % samples.length, along, lat,
      onRoad: Math.abs(lat) < hw + 0.6, s: sm.s + along };
  }
  function pointAtS(sv) {
    const t = ((sv % length) + length) % length;
    let lo = 0, hi = samples.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (samples[mid].s < t) lo = mid + 1; else hi = mid; }
    const sm = samples[lo], nx = samples[(lo + 1) % samples.length];
    const seg = Math.max(0.1, nx.s > sm.s ? nx.s - sm.s : length - sm.s + nx.s);
    const w = Math.min(1, Math.max(0, (t - sm.s) / seg));
    const x = sm.x + (nx.x - sm.x) * w, z = sm.z + (nx.z - sm.z) * w, y = sm.y + (nx.y - sm.y) * w;
    const tx = sm.tx + (nx.tx - sm.tx) * w, tz = sm.tz + (nx.tz - sm.tz) * w;
    const tl = Math.hypot(tx, tz);
    return { x, z, y, tx: tx / tl, tz: tz / tl, curv: sm.curv, signed: sm.signed };
  }
  return { def, group, samples, halfWidth: hw, length, nearest, pointAtS };
}
