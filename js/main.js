import * as THREE from 'three';
import { CARS, buildVoxelCar } from './cars.js';
import { TRACKS, buildTrack } from './tracks.js';
import { Vehicle, AICar } from './physics.js';

window.__errors = [];
window.addEventListener('error', e => window.__errors.push(String(e.message)));

// ---------- renderer / scene ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb8dc);
scene.fog = new THREE.Fog(0x8fb8dc, 260, 1050);
const cam = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2500);

const hemi = new THREE.HemisphereLight(0xdfe8f5, 0x3e5a33, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 1.35);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
sun.shadow.camera.far = 400;
scene.add(sun); scene.add(sun.target);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
});

// ---------- state ----------
const S = {
  mode: 'menu',            // menu | count | race | done
  carIdx: 0, trackIdx: 0,
  track: null, trackGroup: null,
  player: null, playerView: null, playerWheels: [],
  ai: [],
  keys: {}, raceTime: 0, countT: 0,
  lapStart: 0, lapTimes: [], bestLap: null, lapsDone: 0, halfDone: false, lastSW: 0,
  smoke: [], smokeIdx: 0,
  started: false,
};
window.__game = S;

// ---------- input ----------
addEventListener('keydown', e => {
  S.keys[e.code] = true;
  if (e.code === 'KeyR' && (S.mode === 'race')) respawn();
  if (e.code === 'Escape' && S.mode !== 'menu') toMenu();
  if (e.code === 'KeyL' && S.mode === 'done') startRace();
  if (e.code === 'Enter' && S.mode === 'menu') startRace();
  if (e.code === 'Enter' && S.mode === 'done') toMenu();
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { S.keys[e.code] = false; });
const inp = () => ({
  up: S.keys.KeyW || S.keys.ArrowUp,
  down: S.keys.KeyS || S.keys.ArrowDown,
  left: S.keys.KeyA || S.keys.ArrowLeft,
  right: S.keys.KeyD || S.keys.ArrowRight,
  hand: S.keys.Space,
});

// ---------- menu ----------
let selCar = 0, selTrack = 0;
function buildMenu() {
  const cl = document.getElementById('carList');
  cl.innerHTML = '';
  CARS.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'card' + (i === selCar ? ' sel' : '');
    const bars = [
      ['PWR', Math.min(100, c.hp / 3.4)],
      ['GRIP', (c.stats.grip - 8.4) * 17],
      ['TOP', (c.stats.topSpeed - 65) * 10],
      ['BRK', (c.stats.brake - 10) * 18],
    ].map(([k, v]) => `<div class="stat"><span>${k}</span><i><b style="width:${Math.max(6, Math.min(100, v))}%"></b></i></div>`).join('');
    d.innerHTML = `<h3 style="border-color:#${c.color.toString(16).padStart(6, '0')}">${c.name}</h3><p>${c.sub}</p>${bars}`;
    d.onclick = () => { selCar = i; buildMenu(); };
    cl.appendChild(d);
  });
  const tl = document.getElementById('trackList');
  tl.innerHTML = '';
  TRACKS.forEach((t, i) => {
    const d = document.createElement('div');
    d.className = 'card track' + (i === selTrack ? ' sel' : '');
    const cv = document.createElement('canvas'); cv.width = 200; cv.height = 120;
    const xs = t.pts.map(p => p[0]), zs = t.pts.map(p => p[1]);
    const mnx = Math.min(...xs), mxx = Math.max(...xs), mnz = Math.min(...zs), mxz = Math.max(...zs);
    const sc = Math.min(184 / (mxx - mnx), 104 / (mxz - mnz));
    const g = cv.getContext('2d');
    g.strokeStyle = '#e66'; g.lineWidth = 3; g.lineJoin = 'round';
    g.beginPath();
    t.pts.forEach((p, k) => {
      const X = 10 + (p[0] - mnx) * sc + (184 - (mxx - mnx) * sc) / 2;
      const Y = 110 - (p[1] - mnz) * sc;
      k ? g.lineTo(X, Y) : g.moveTo(X, Y);
    });
    g.closePath(); g.stroke();
    d.appendChild(cv);
    const nm = document.createElement('div');
    nm.innerHTML = `<h3>${t.name}</h3><p>${t.loc} · ${t.laps} laps</p>`;
    d.appendChild(nm);
    d.onclick = () => { selTrack = i; buildMenu(); };
    tl.appendChild(d);
  });
  document.getElementById('startBtn').onclick = () => startRace();
}

// ---------- race setup ----------
function clearRace() {
  if (S.trackGroup) scene.remove(S.trackGroup);
  [S.playerView, ...S.ai.map(a => a.view)].forEach(v => v && scene.remove(v));
  S.smoke.forEach(s => scene.remove(s.mesh));
  S.smoke = [];
  if (S.aiView) S.aiView.forEach(v => scene.remove(v));
  document.getElementById('result').classList.add('hidden');
  document.getElementById('hud').classList.add('hidden');
}

let miniMapPts = null;
function startRace() {
  clearRace();
  S.carIdx = selCar; S.trackIdx = selTrack;
  const def = TRACKS[S.trackIdx];
  S.track = buildTrack(def, scene);
  S.trackGroup = S.track.group;

  const car = CARS[S.carIdx];
  S.player = new Vehicle(car.stats);
  const pv = buildVoxelCar(car);
  S.playerView = pv.group; S.playerWheels = pv.wheels;
  scene.add(S.playerView);

  const rivals = CARS.filter((c, i) => i !== S.carIdx).slice(0, 3);
  const skills = [0.94, 0.89, 0.84];
  S.ai = rivals.map((c, i) => {
    const a = new AICar(c, S.track, skills[i]);
    const av = buildVoxelCar({ ...c, color: [0x2a2f36, 0x7a2a2a, 0x2a5a3a][i] });
    a.view = av.group; a.wheels = av.wheels;
    scene.add(a.view);
    return a;
  });

  // grid: staggered 2x2 just ahead of the line (on the straight)
  const L = S.track.length;
  const slots = [16, 16, 27, 27];
  const latOf = [-3.2, 3.2, -3.2, 3.2];
  const put = (obj, k) => {
    const p = S.track.pointAtS(slots[k]);
    const px = -p.tz, pz = p.tx, off = latOf[k];
    obj.x = p.x + px * off; obj.z = p.z + pz * off; obj.y = p.y;
    obj.a = Math.atan2(p.tx, p.tz);
    obj.vx = obj.vz = 0; obj.v = 0; obj.s = slots[k];
  };
  put(S.player, 0);
  S.ai.forEach((a, i) => put(a, i + 1));

  // smoke pool
  for (let i = 0; i < 36; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xcfd4d8, transparent: true, opacity: 0 }));
    scene.add(m); S.smoke.push({ mesh: m, life: 0 });
  }

  // minimap pts
  const xs = S.track.samples.map(s => s.x), zs = S.track.samples.map(s => s.z);
  const mnx = Math.min(...xs), mxx = Math.max(...xs), mnz = Math.min(...zs), mxz = Math.max(...zs);
  miniMapPts = S.track.samples.filter((_, i) => i % 4 === 0)
    .map(s => [(s.x - mnx), (s.z - mnz), mxx - mnx, mxz - mnz]);

  S.raceTime = 0; S.lapStart = 0; S.lapTimes = []; S.bestLap = null;
  S.lapsDone = 0; S.halfDone = false;
  S.lastSW = slots[0];
  S.mode = 'count'; S.countT = 0;
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('carTag').textContent = car.name;
  document.getElementById('trackTag').textContent = def.name;
  document.getElementById('lapsTag').textContent = `LAP 1/${def.laps}`;
  initAudio();
}

function toMenu() {
  S.mode = 'menu';
  clearRace();
  document.getElementById('menu').classList.remove('hidden');
}

function respawn() {
  const n = S.track.nearest(S.player.x, S.player.z);
  S.player.snapTo(n, 0.2);
}

// ---------- audio ----------
let AC = null, engOsc = null, engOsc2 = null, engGain = null, muted = false;
function initAudio() {
  if (AC) { AC.resume(); return; }
  try {
    AC = new AudioContext();
    engGain = AC.createGain(); engGain.gain.value = 0;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    engOsc = AC.createOscillator(); engOsc.type = 'sawtooth';
    engOsc2 = AC.createOscillator(); engOsc2.type = 'square'; engOsc2.detune.value = 8;
    engOsc.connect(lp); engOsc2.connect(lp); lp.connect(engGain); engGain.connect(AC.destination);
    engOsc.start(); engOsc2.start();
  } catch (e) { /* no audio is fine */ }
}
addEventListener('keydown', e => {
  if (e.code === 'KeyM' && AC) { muted = !muted; }
});

// ---------- countdown lights ----------
const lights = () => document.querySelectorAll('#lights i');
function setLights(redN, green) {
  lights().forEach((el, i) => {
    el.className = green ? 'green' : (i < redN ? 'red' : '');
  });
}

// ---------- main loop ----------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(1 / 30, clock.getDelta());

  if (S.mode === 'count') {
    S.countT += dt;
    const t = S.countT;
    if (t < 4.0) setLights(Math.min(5, 1 + Math.floor(t / 0.75)), false);
    else if (t < 4.9) setLights(0, false);
    else { setLights(0, true); S.mode = 'race'; S.raceTime = 0; S.lapStart = 0; }
  }

  if (S.mode === 'race' || S.mode === 'count') {
    const L = S.track.length;
    if (S.mode === 'race') S.raceTime += dt;
    if (S.mode === 'race' && S.raceTime > 1.2 && !S.lightsOff) { S.lightsOff = true; setLights(0, false); document.getElementById('lights').style.opacity = '0'; }
    if (S.mode === 'count') { S.lightsOff = false; document.getElementById('lights').style.opacity = '1'; }
    const canDrive = S.mode === 'race';
    const near = S.track.nearest(S.player.x, S.player.z);
    const vf = S.player.update(dt, canDrive ? inp() : {}, near);
    S.vf = vf;
    if (S.mode === 'count') {
      // hold on grid
      S.player.vx *= 0.2; S.player.vz *= 0.2;
      S.player.x += S.player.vx * dt; S.player.z += S.player.vz * dt;
    }
    if (S.keys.KeyR && S.mode === 'count') S.player.snapTo(near, 0);

    // model pose
    const P = S.player;
    S.playerView.position.set(P.x, P.y, P.z);
    S.playerView.rotation.set(0, P.a, 0);
    const slope = (near.sm.y - S.track.samples[(near.i + 4) % S.track.samples.length].y) / 10;
    const f = P.forward();
    S.playerView.rotation.x = -Math.atan2(slope * (f.x * near.sm.tx + f.z * near.sm.tz), 1);
    S.playerWheels.forEach(w => { w.rotation.x += vf / 0.33 * dt; });

    // drift smoke
    if (P.drift > 0.55 && Math.abs(vf) > 8) {
      const s0 = S.smoke[S.smokeIdx = (S.smokeIdx + 1) % S.smoke.length];
      s0.mesh.position.set(P.x - f.x * 1.6, P.y + 0.35, P.z - f.z * 1.6);
      s0.mesh.material.opacity = 0.38; s0.life = 0.6;
    }
    S.smoke.forEach(s => {
      if (s.life > 0) {
        s.life -= dt;
        s.mesh.material.opacity = Math.max(0, s.life * 0.8);
        const k = 1.4 - s.life; s.mesh.scale.setScalar(0.6 + k * 1.6);
      }
    });

    // lap detection
    const rawS = near.s;
    const w = ((rawS % L) + L) % L;
    if (w > L * 0.45 && w < L * 0.6) S.halfDone = true;
    if (S.halfDone && S.lastSW > L * 0.9 && w < L * 0.1 && S.mode === 'race') {
      S.halfDone = false;
      const lapT = S.raceTime - S.lapStart; S.lapStart = S.raceTime;
      S.lapTimes.push(lapT);
      if (S.bestLap == null || lapT < S.bestLap) S.bestLap = lapT;
      S.lapsDone++;
      if (S.lapsDone >= S.track.def.laps) finishRace();
      else document.getElementById('lapsTag').textContent = `LAP ${S.lapsDone + 1}/${S.track.def.laps}`;
    }
    S.lastSW = w;

    // AI
    const playerTotal = S.lapsDone * L + w;
    S.ai.forEach(a => {
      if (canDrive) a.update(dt, playerTotal);
      a.view.position.set(a.x, a.y, a.z);
      a.view.rotation.set(0, a.a, 0);
      if (a.wheels) a.wheels.forEach(wh => { wh.rotation.x += a.v / 0.33 * dt; });
    });

    // standings
    const tot = [{ t: playerTotal, p: true }, ...S.ai.map(a => ({ t: a.laps * L + a.s, p: false }))];
    tot.sort((x, y) => y.t - x.t);
    S.rank = tot.findIndex(e => e.p) + 1;

    // camera
    const spd = P.speed();
    const camF = { x: Math.sin(P.a), z: Math.cos(P.a) };
    const tgt = new THREE.Vector3(P.x - camF.x * 12.5 + 0, P.y + 5.6, P.z - camF.z * 12.5);
    cam.position.lerp(tgt, Math.min(1, 4.5 * dt));
    const look = new THREE.Vector3(P.x + camF.x * 8 + P.vx * 0.35, P.y + 1.2, P.z + camF.z * 8 + P.vz * 0.35);
    cam.lookAt(look);
    sun.position.set(P.x + 120, 170, P.z + 60);
    sun.target.position.set(P.x, 0, P.z);
    sun.target.updateMatrixWorld();

    // HUD
    const kmh = Math.round(spd * 3.6);
    document.getElementById('spd').textContent = kmh;
    const thr = [0, 11, 22, 33, 46, 58];
    let gi = 0; while (gi < 5 && spd > thr[gi + 1]) gi++;
    if (spd < 0.4) gi = 0;
    const gear = spd < 0.4 ? 'N' : String(gi + 1);
    document.getElementById('gear').textContent = gear;
    document.getElementById('rpm').style.width = `${((spd - thr[gi]) / (thr[Math.min(5, gi + 1)] - thr[gi] || 1)) * 92 + 6}%`;
    document.getElementById('pos').textContent = `${S.rank}/4`;
    const tm = S.mode === 'race' ? S.raceTime : 0;
    document.getElementById('time').textContent = fmt(tm);
    document.getElementById('best').textContent = S.bestLap ? fmt(S.bestLap) : '--:--.---';
    if (AC && !muted && S.mode === 'race') {
      const rpm = 1200 + ((spd - thr[gi]) / (thr[Math.min(5, gi + 1)] - thr[gi] || 1)) * 6800;
      const fr = 42 + rpm / 55 * (1 + Math.min(0.35, spd / 200));
      engOsc.frequency.value = fr; engOsc2.frequency.value = fr * 1.994;
      engGain.gain.value = Math.min(0.10, 0.035 + spd / 900);
    } else if (AC) engGain.gain.value = 0;

    drawMini(P, w);
  }

  renderer.render(scene, cam);
}
const fmt = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(3).padStart(6, '0')}`;

function finishRace() {
  S.mode = 'done';
  const rows = S.lapTimes.map((t, i) => `<tr><td>Lap ${i + 1}</td><td>${fmt(t)}</td>${t === S.bestLap ? '<td class="best">BEST</td>' : '<td></td>'}</tr>`).join('');
  document.getElementById('resBody').innerHTML =
    `<tr class="tot"><td>Total</td><td>${fmt(S.raceTime)}</td><td>P${S.rank}</td></tr>` + rows;
  document.getElementById('result').classList.remove('hidden');
}

const miniCv = document.getElementById('mini'), miniG = miniCv.getContext('2d');
function drawMini(P, w) {
  if (!miniMapPts) return;
  const W = miniCv.width, H = miniCv.height;
  miniG.clearRect(0, 0, W, H);
  const sc = Math.min((W - 14) / miniMapPts[0][2], (H - 14) / miniMapPts[0][3]);
  const ox = (W - miniMapPts[0][2] * sc) / 2, oy = (H - miniMapPts[0][3] * sc) / 2;
  miniG.strokeStyle = '#9fb4c8'; miniG.lineWidth = 3; miniG.beginPath();
  miniMapPts.forEach(([x, z], i) => { const X = ox + x * sc, Y = H - (oy + z * sc); i ? miniG.lineTo(X, Y) : miniG.moveTo(X, Y); });
  miniG.closePath(); miniG.stroke();
  // player dot: normalize against baked bounds
  const mk = (x, z) => [ox + (x - MINI.mn[0]) * sc, H - (oy + (z - MINI.mn[1]) * sc)];
  const [pxx, pzz] = mk(P.x, P.z);
  miniG.fillStyle = '#fff';
  miniG.beginPath(); miniG.arc(pxx, pzz, 4, 0, 7); miniG.fill();
  S.ai.forEach(a => {
    const [ax, az] = mk(a.x, a.z);
    miniG.fillStyle = '#e5533a';
    miniG.beginPath(); miniG.arc(ax, az, 3.4, 0, 7); miniG.fill();
  });
}
let MINI = { mn: [0, 0] };
// capture mins when building minimap
const _startRace = startRace;
startRace = function () {
  _startRace();
  const xs = S.track.samples.map(s => s.x), zs = S.track.samples.map(s => s.z);
  MINI = { mn: [Math.min(...xs), Math.min(...zs)] };
};

buildMenu();
frame();

window.__dbg = { get cam() { return cam; }, get scene() { return scene; } };
