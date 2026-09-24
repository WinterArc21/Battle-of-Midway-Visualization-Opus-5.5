// MIDWAY · 10:22 — 4 June 1942. An SBD Dauntless from USS Enterprise dives on the carrier Akagi.
// Every shot is a function of film time T (seconds).
import { TL, SHIPS, shipState, shipMatrix, toWorldM, planeAt, planeMatrix, bombAt, T_HIT, HIT_LOCAL, HIT_WORLD, WINGMEN, YAW, altFeet } from './engine/world.js';
import { SBD, CARRIER } from './engine/models.js';
import { CELLS, CELL_M } from './engine/people.js';
import { lookAt, perspective, mul } from './engine/gl.js';
import { FW, FH, project } from './engine/renderer.js';
import { caption, spoken, stamp, title, altitude, scopeMask, gauge, fadeIO, clamp, BAR } from './engine/overlay.js';

export const TOTAL = TL.total;
const ss = (a, b, t) => { const x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const add = (a, b) => a.map((v, i) => v + b[i]), sub = (a, b) => a.map((v, i) => v - b[i]), scl = (a, s) => a.map(v => v * s);
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

// ---------- light and air ----------
const SUN_EL = 63 * Math.PI / 180;
const SUN = norm([-Math.sin(YAW) * Math.cos(SUN_EL), Math.sin(SUN_EL), Math.cos(YAW) * Math.cos(SUN_EL)]);
const AKAGI = 0, KAGA = 1, SORYU = 2;
const baseEnv = () => ({
  sun: SUN, sunCol: [3.3, 3.1, 2.85], zenith: [0.13, 0.26, 0.56], horizon: [0.5, 0.62, 0.76], haze: 0.000032,
  cloud: [1050, 0.52, 1500, 1], holes: [[140, 780, 950, 1], [shipState(KAGA, 30).pos[0], shipState(KAGA, 30).pos[2], 1500, 0.95]],
});
const POST = { exposure: 0.55, bloom: 0.3, threshold: 1.2, contrast: 1.04, sat: 0.95, gamma: 2.2, gain: [1.0, 0.99, 0.97], lift: [0.0, 0.0, 0.004] };

// ---------- the fleet ----------
const HALF = { carrier: [130, 15.5], carrier2: [130, 15.5], battleship: [111, 15.5], destroyer: [59, 5.4] };
const MESH = { carrier: 'carrierS', carrier2: 'carrierS', battleship: 'battleship', destroyer: 'destroyer' };
function fleet(T, only = null) {
  const meshes = [], wakes = [];
  SHIPS.forEach((s, i) => {
    if (only && !only.includes(i)) return;
    const st = shipState(i, T);
    const M = shipMatrix(st, st.heel || 0);
    const m = { mesh: i === AKAGI ? 'carrierP' : MESH[s.kind], model: M, deck: i === AKAGI ? 0 : i === KAGA ? 1 : 2 };
    if (i === AKAGI && T > TL.hit) m.damage = [HIT_LOCAL[0], HIT_LOCAL[2], 7 + 10 * ss(TL.hit, TL.hit + 6, T), 1];
    if (i === AKAGI && T > TL.hangar) m.damage2 = [0, 8, 6 + 12 * ss(TL.hangar, TL.hangar + 8, T), 1];
    if (i === KAGA && T > TL.kagaHit) { m.damage = [2, 30, 22, 1]; m.damage2 = [-3, -45, 26, ss(TL.kagaHit + 1, TL.kagaHit + 3, T)]; }
    if (i === SORYU && T > TL.soryuHit) { m.damage = [0, 10, 26, 1]; }
    meshes.push(m);
    const [hl, hb] = HALF[s.kind];
    wakes.push({ a: [st.pos[0], st.pos[2], st.fwd[0], st.fwd[2]], b: s.straight ? [0, 0, 0, 0] : [s.c[0], s.c[1], s.R, Math.sign(s.w)], c: [hl, hb, 1, 0] });
  });
  return { meshes, wakes, M: i => shipMatrix(shipState(i, T), shipState(i, T).heel || 0) };
}
const shipPoint = (i, T, lp) => toWorldM(shipMatrix(shipState(i, T), shipState(i, T).heel || 0), lp);

// ---------- our aircraft, and the others ----------
const eyeOf = (p, lp) => add(add(add(p.pos, scl(p.right, lp[0])), scl(p.up, lp[1])), scl(p.fwd, lp[2]));
const flapAt = T => 1.05 * ss(15.95, 16.7, T) * (1 - ss(TL.release + 0.6, TL.release + 2.4, T));
function aircraft(T, { own = 'exterior' } = {}) {
  const meshes = [], parts = [];
  const me = planeAt(T);
  if (own) meshes.push({ mesh: own === 'cockpit' ? 'cockpit' : T < TL.release ? 'sbd' : 'sbdClean', model: planeMatrix(me), cockpit: own === 'cockpit', prop: 1, flap: flapAt(T) });
  propDisc(parts, me, T, own === 'cockpit' ? 0.55 : 1);
  WINGMEN.forEach((w, k) => {
    const p = planeAt(T, w.delay, w.off);
    const rel = TL.release + w.delay;
    meshes.push({ mesh: T < rel ? 'sbd' : 'sbdClean', model: planeMatrix(p), prop: 1, flap: flapAt(T - w.delay) });
    propDisc(parts, p, T, 1);
  });
  // the rest of the group, ahead: they will take Kaga
  for (let k = 0; k < 5; k++) {
    const p = otherGroup(T, k);
    if (!p) continue;
    meshes.push({ mesh: 'sbd', model: planeMatrix(p), prop: 1, flap: 0 });
  }
  const b = bombAt(T);
  if (b && !b.hit) {
    const f = b.fwd, up0 = Math.abs(f[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const r = norm([f[1] * up0[2] - f[2] * up0[1], f[2] * up0[0] - f[0] * up0[2], f[0] * up0[1] - f[1] * up0[0]]);
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    meshes.push({ mesh: 'bomb', model: new Float32Array([r[0], r[1], r[2], 0, u[0], u[1], u[2], 0, f[0], f[1], f[2], 0, b.pos[0], b.pos[1], b.pos[2], 1]) });
  }
  return { meshes, parts, me };
}
function propDisc(out, p, T, a) {
  const c = eyeOf(p, [0, 0, 4.14]);
  out.push(c[0], c[1], c[2], 3.3, 0, a, 3, 0, 0, 0, 0, 0);
}
// the other Enterprise planes, peeling off toward Kaga well before us
function otherGroup(T, k) {
  const t0 = 12.2 + k * 0.9;
  const me = planeAt(Math.min(T, TL.push - 0.2));
  const lvlR = [Math.cos(YAW), 0, Math.sin(YAW)], lvlF = [Math.sin(YAW), 0, -Math.cos(YAW)];
  const base = add(add(me.pos, scl(lvlF, 160 + k * 35)), scl(lvlR, -60 - k * 22));
  base[1] += -20 + k * 4;
  if (T < t0) {
    const pos = add(base, scl(lvlF, 0));
    return { pos: add(pos, scl(lvlF, (T - Math.min(T, TL.push - 0.2)) * 70)), fwd: lvlF, right: lvlR, up: [0, 1, 0] };
  }
  const u = T - t0;
  if (u > 22) return null;
  const kaga = shipState(KAGA, t0 + 30).pos;
  const start = add(base, scl(lvlF, (Math.min(t0, TL.push - 0.2) - Math.min(T, TL.push - 0.2)) * 0));
  const dir = norm(sub(kaga, start));
  const ang = ss(0, 2.2, u);
  const fwd = norm(add(scl(lvlF, 1 - ang), scl(dir, ang)));
  const dist = u * 70 + Math.max(0, u - 1.5) ** 2 * 3;
  const pos = add(start, scl(norm(add(scl(lvlF, 0.6), scl(dir, 1.0))), dist));
  const right = norm([-fwd[2], 0, fwd[0]]);
  const up = norm([right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]]);
  return { pos, fwd, right: scl(right, 1), up };
}

// ---------- fire, smoke, flak, tracers ----------
const WIND = [2.6, 0, 1.2];
function burning(out, T, i, lp, t0, { rate = 0.14, life = 28, size = 14, rise = 7, seed = 0, heavy = 1 } = {}) {
  if (T < t0) return;
  for (let a = 0; a < life; a += rate) {
    const tb = Math.floor((T - a - t0) / rate) * rate + t0;
    const age = T - tb; if (age < 0 || age > life || tb < t0) continue;
    const k = tb * 17.3 + seed;
    const src = shipPoint(i, tb, [lp[0] + (hash(k) - 0.5) * 10, lp[1], lp[2] + (hash(k + 1) - 0.5) * 16]);
    const p = add(src, [WIND[0] * age + (hash(k + 2) - 0.5) * age * 2, rise * age * (1 - age / (life * 2.2)), WIND[2] * age]);
    const s = size * (0.5 + age * 0.55) * (0.8 + hash(k + 3) * 0.4);
    const al = Math.min(1, age * 3) * Math.pow(1 - age / life, 1.2) * 0.75 * heavy;
    const hot = Math.max(0, 1 - age * 0.9);
    out.push(p[0], p[1], p[2], s, hash(k + 4) * 6, al, 0, Math.floor(hash(k + 5) * 16), 0.05 + hot * 0.2, 0.045 + hot * 0.1, 0.04, hot * 2.2);
  }
  // flames at the base
  const flick = n => 0.7 + 0.3 * Math.sin(T * 13 + n * 5) * Math.sin(T * 7.3 + n);
  for (let n = 0; n < 6; n++) {
    const p = shipPoint(i, T, [lp[0] + (hash(n + seed) - 0.5) * 12, lp[1] + 2 + hash(n + 3) * 3, lp[2] + (hash(n + seed + 9) - 0.5) * 18]);
    out.push(p[0], p[1], p[2], 10 + hash(n) * 8, 0, flick(n) * heavy, 1, 0, 3.2, 1.3, 0.35, 0);
  }
}
function explosion(out, T, pos, t0, S = 1, seed = 0) {
  const age = T - t0;
  if (age < 0 || age > 9) return;
  // flash
  if (age < 0.5) out.push(pos[0], pos[1] + 5 * S, pos[2], 70 * S * (0.5 + age * 2), 0, (1 - age / 0.5), 1, 0, 14, 8, 4, 0);
  // fireball: billowing puffs that go from white-hot to black
  for (let i = 0; i < 40; i++) {
    const k = seed + i * 7.7;
    const dir = norm([hash(k) - 0.5, 0.35 + hash(k + 1) * 0.9, hash(k + 2) - 0.5]);
    const v = (18 + hash(k + 3) * 34) * S;
    const tt = Math.min(age, 1.8);
    const p = add(pos, [dir[0] * v * (1 - Math.exp(-tt * 2.2)) / 2.2 + WIND[0] * age, dir[1] * v * (1 - Math.exp(-tt * 2.2)) / 2.2 + age * 6 * S, dir[2] * v * (1 - Math.exp(-tt * 2.2)) / 2.2 + WIND[2] * age]);
    const heat = Math.exp(-age * 1.5);
    const s = (8 + age * 9 + hash(k + 4) * 6) * S;
    const al = Math.min(1, age * 8) * Math.max(0, 1 - age / 9) * 0.9;
    out.push(p[0], p[1], p[2], s, hash(k + 5) * 6, al, 0, i % 16, lerp(0.05, 0.9, heat), lerp(0.045, 0.5, heat), lerp(0.04, 0.2, heat), heat * 4);
  }
  // debris: planks, plating, pieces of aircraft
  for (let i = 0; i < 50; i++) {
    const k = seed + i * 3.3 + 100;
    const dir = norm([hash(k) - 0.5, 0.5 + hash(k + 1), hash(k + 2) - 0.5]);
    const v = (12 + hash(k + 3) * 30) * S;
    const tt = age;
    const p = add(pos, [dir[0] * v * tt, dir[1] * v * tt - 4.9 * tt * tt, dir[2] * v * tt]);
    if (p[1] < 0) continue;
    const glow = Math.max(0, 1 - age * 0.8);
    out.push(p[0], p[1], p[2], 0.6 + hash(k + 4) * 1.2, 0, 1, 2, 0, 0.08, 0.07, 0.06, glow * 1.5);
  }
}
// flak: black bursts along and around the dive
const FLAK = (() => {
  const L = [];
  for (let i = 0; i < 46; i++) {
    const tb = 30.5 + hash(i * 1.7) * 18.5;
    const ahead = 1.2 + hash(i * 2.1) * 3.5; // burst where we will be in a few seconds, offset
    const p = planeAt(Math.min(tb + ahead, TL.release - 0.2));
    const lat = (hash(i * 3.9) - 0.5) * 2, vert = (hash(i * 5.3) - 0.5) * 2;
    const miss = 35 + hash(i * 7.1) * 140;
    const pos = add(add(p.pos, scl(p.right, lat * miss)), scl(p.up, vert * miss));
    L.push({ tb, pos, s: 0.9 + hash(i) * 0.5 });
  }
  return L;
})();
function flak(out, T) {
  for (const f of FLAK) {
    const age = T - f.tb; if (age < 0 || age > 9) continue;
    if (age < 0.12) out.push(f.pos[0], f.pos[1], f.pos[2], 14 * f.s, 0, 1 - age / 0.12, 1, 0, 9, 5, 2, 0);
    const r = 11 * f.s * (1 - Math.exp(-age * 6)) + age * 1.5;
    const al = Math.min(1, age * 10) * (1 - age / 9) * 0.85;
    for (let j = 0; j < 3; j++) {
      const o = [(hash(f.tb + j) - 0.5) * r * 0.6, (hash(f.tb + j + 3) - 0.5) * r * 0.5, (hash(f.tb + j + 6) - 0.5) * r * 0.6];
      out.push(f.pos[0] + o[0] + WIND[0] * age, f.pos[1] + o[1] + age * 0.5, f.pos[2] + o[2] + WIND[2] * age, r * 1.4, hash(f.tb + j) * 6, al, 0, (j * 5 + Math.floor(f.tb)) % 16, 0.03, 0.03, 0.03, age < 0.25 ? 1.5 * (1 - age / 0.25) : 0);
    }
  }
}
// tracers: 25 mm and machine-gun fire climbing from the carrier and the screen
const GUNS = [[AKAGI, [14.2, 12.5, 40]], [AKAGI, [-14.2, 12.5, -40]], [AKAGI, [14.2, 12.5, -70]], [AKAGI, [-14.2, 12.5, 70]], [5, [0, 8, 40]], [4, [0, 8, 30]]];
function tracers(out, T, VP, right, up) {
  if (T < 38 || T > TL.hit + 5) return;
  GUNS.forEach(([i, lp], g) => {
    for (let n = 0; n < 16; n++) {
      const tf = Math.floor(T / 0.09) * 0.09 - n * 0.09 + g * 0.013;
      const age = T - tf; if (age < 0 || age > 2.2) continue;
      const src = shipPoint(i, tf, lp);
      const tgt = planeAt(Math.min(tf + 1.6, TL.release + 3));
      const aim = add(tgt.pos, [(hash(tf * 3 + g) - 0.5) * 90, (hash(tf * 5 + g) - 0.5) * 60 - 40, (hash(tf * 7 + g) - 0.5) * 90]);
      const d = norm(sub(aim, src));
      const p = add(src, scl(d, age * 820));
      const pa = project(VP, p), pb = project(VP, add(p, scl(d, 20)));
      const rot = pa && pb ? Math.atan2(-(pb[1] - pa[1]), pb[0] - pa[0]) : 0;
      out.push(p[0], p[1], p[2], 1.6, rot, 0.9 * (1 - age / 2.2), 1, 16 * 8, 3.0, 1.1, 0.35, 0);
    }
  });
}
// cloud wisps where we fall through the gap
function wisps(out, T, me) {
  const H = 1050;
  for (let i = 0; i < 70; i++) {
    const tc = 45.4 + (hash(i) - 0.5) * 1.4;
    const p0 = planeAt(tc).pos;
    const ang = hash(i * 2.3) * Math.PI * 2, rad = 25 + hash(i * 3.1) * 190;
    const pos = [p0[0] + Math.cos(ang) * rad, H + (hash(i * 4.7) - 0.4) * 110, p0[2] + Math.sin(ang) * rad];
    if (Math.abs(pos[1] - me.pos[1]) > 900) continue;
    out.push(pos[0], pos[1], pos[2], 45 + hash(i * 5.5) * 70, hash(i) * 6, 0.55, 0, i % 16, 1.25, 1.25, 1.28, 0);
  }
}
// near misses from the wingmen: tall white columns of water beside the carrier
const MISSES = [{ t: TL.hit + 2.5, lp: [-38, 0, -30] }, { t: TL.hit + 4.7, lp: [30, 0, 60] }];
function splashes(out, T, wet) {
  for (const m of MISSES) {
    const age = T - m.t; if (age < 0 || age > 12) continue;
    const c = shipPoint(AKAGI, m.t, m.lp);
    for (let i = 0; i < 26; i++) {
      const k = m.t + i * 1.9;
      const h = Math.min(age, 2.2) * (30 + hash(k) * 22) - Math.max(0, age - 2.2) * 9;
      const r = 6 + age * 4 + hash(k + 1) * 8;
      const p = [c[0] + (hash(k + 2) - 0.5) * r, Math.max(2, h * hash(k + 3)), c[2] + (hash(k + 4) - 0.5) * r];
      out.push(p[0], p[1], p[2], 12 + age * 4, hash(k) * 6, Math.min(1, age * 5) * Math.max(0, 1 - age / 8) * 0.8, 0, i % 16, 1.3, 1.32, 1.35, 0);
    }
    wet.push([c[0], c[2], 26 + age * 6, Math.max(0, 1 - age / 12)]);
  }
}

// ---------- the deck crew ----------
function crew(T, camRight) {
  const out = [];
  const fl = (lx, lz) => { const M = shipMatrix(shipState(AKAGI, T)); const aft = [-M[8], -M[10]]; return aft[0] * camRight[0] + aft[1] * camRight[2] >= 0 ? 1 : -1; };
  const f = fl();
  const y = CARRIER.deckY;
  const alarm = T > TL.deck + 1.1;
  const list = [
    [alarm ? CELLS.point : CELLS.look, [-4.6, y, -46.5], 1.0, f],
    [alarm ? CELLS.shout : CELLS.stand, [-4.8, y, -58], 0.9, -f],
    [CELLS.crouch, [3.5, y, -63], 0.8, f],
    [alarm ? CELLS.run : CELLS.stand, [1.5 + (alarm ? (T - TL.deck - 1.1) * 2.5 : 0), y, -70], 0.85, f],
    [CELLS.pilot, [-1.2, y, -76], 0.8, f], [CELLS.pilot, [6.3, y, -79], 0.8, -f],
    [alarm ? CELLS.run2 : CELLS.crouch, [9, y, -66 + (alarm ? (T - TL.deck - 1.1) * 3 : 0)], 0.85, -f],
    [CELLS.look, [-10.5, y, -84], 0.75, f], [CELLS.officer, [-12.2, y, -45], 0.9, f], [CELLS.stand, [11.5, y, -90], 0.7, f],
    [CELLS.stand, [-6, y, -95], 0.7, f], [CELLS.crouch, [0, y, -99], 0.7, -f],
  ];
  for (const [cell, lp, br, flip] of list) { const p = shipPoint(AKAGI, T, lp); out.push(p[0], p[1], p[2], CELL_M, cell, flip, br, 1); }
  return new Float32Array(out);
}

// ---------- shots ----------
const shake = (T, amp, f = 1) => [Math.sin(T * 31 * f) * amp + Math.sin(T * 17.3 * f) * amp * 0.6, Math.sin(T * 27.1 * f) * amp * 0.8 + Math.sin(T * 11.3 * f) * amp * 0.4, Math.cos(T * 23.3 * f) * amp];
const buffet = T => 0.025 * ss(19.5, 25, T) + 0.045 * ss(38, 49, T) + (T > TL.release ? 0.05 * Math.exp(-(T - TL.release) * 0.8) : 0);
function cockpitCam(p, T, look = [0, 0, 1], fov = 66, amp = 0) {
  const eye = eyeOf(p, SBD.eye);
  const dir = norm(add(add(scl(p.right, look[0]), scl(p.up, look[1])), scl(p.fwd, look[2])));
  const sh = shake(T, amp);
  const at = add(add(eye, scl(dir, 10)), add(scl(p.right, sh[0] * 6), scl(p.up, sh[1] * 6)));
  return { eye: add(eye, scl(p.up, sh[2] * 0.02)), at, up: p.up, fov, near: 0.05 };
}
// the telescopic sight: the pilot holds the carrier in the reticle, easing in the lead as the range closes
function scopeCam(p, T, fov, amp) {
  const eye = eyeOf(p, SBD.eye);
  const now = shipPoint(AKAGI, T, [0, CARRIER.deckY, 0]);
  const aim = HIT_WORLD;
  const u = ss(TL.scope1, TL.release, T);
  const tgt = add(scl(now, 1 - u * 0.8), scl(aim, u * 0.8));
  const sh = shake(T, buffet(T) * amp);
  const dir = norm(sub(tgt, eye));
  const at = add(add(eye, scl(dir, 100)), add(scl(p.right, sh[0] * 60), scl(p.up, sh[1] * 60)));
  return { eye, at, up: p.up, fov, near: 0.5 };
}
// a lone plane over the open sea, far from the fleet (the search, and the destroyer's wake)
function searchPlane(T, origin, yaw, alt, bankDeg = 0) {
  const f = [Math.sin(yaw), 0, -Math.cos(yaw)], r = [Math.cos(yaw), 0, Math.sin(yaw)];
  const bank = (4 * Math.sin(T * 0.3) + bankDeg) * Math.PI / 180;
  const up = norm(add([0, 1, 0], scl(r, Math.sin(bank))));
  const right = norm([r[0], -Math.sin(bank), r[2]]);
  const pos = add([origin[0], alt, origin[1]], scl(f, (T - TL.cruise) * 70));
  return { pos, fwd: f, right, up, v: 70, pitch: 0, roll: 0 };
}
const ARASHI = 6;
const arashiYaw = Math.atan2(Math.sin(SHIPS[ARASHI].dir), Math.cos(SHIPS[ARASHI].dir));

const SHOTS = [
  { t: 0, name: 'black', fn: () => ({ black: true }) },
  { t: TL.cruise, name: 'cruise', fn: T => {
    const st = shipState(ARASHI, T);
    const p = searchPlane(T, [st.pos[0] - 9000, st.pos[2] + 2600], arashiYaw + 0.5, 4100);
    return { plane: p, cam: cockpitCam(p, T, [-0.05, -0.12, 1], 64, 0.004), own: 'cockpit', fade: ss(TL.cruise, TL.cruise + 1.2, T),
      holes: [[st.pos[0], st.pos[2], 1, 0], [0, 0, 1, 0]], only: [ARASHI], escorts: [[p, [-40, -12, 110]], [p, [55, -22, 190]], [p, [-110, -18, 260]]] };
  } },
  { t: TL.destroyer, name: 'destroyer', fn: T => {
    // from just outboard of the cockpit, over the left wing: far below, a single wake, a white line pointing the way
    const st = shipState(ARASHI, T);
    const back = [-Math.sin(arashiYaw), 0, Math.cos(arashiYaw)], side = [Math.cos(arashiYaw), 0, Math.sin(arashiYaw)];
    const p = searchPlane(T, [st.pos[0] + back[0] * 2600 + side[0] * 2300, st.pos[2] + back[2] * 2600 + side[2] * 2300], arashiYaw - 0.35, 4000, -28 * ss(TL.destroyer - 0.5, TL.destroyer + 1.5, T));
    const eye = eyeOf(p, [-1.05, 0.55, 1.2]);
    const tgt = add(st.pos, scl([-back[0], 0, -back[2]], 500));
    const dir = norm(sub(tgt, eye));
    const sh = shake(T, 0.003);
    return { plane: p, cam: { eye, at: add(add(eye, scl(dir, 50)), scl(p.up, sh[1] * 20)), up: p.up, fov: lerp(44, 36, ss(TL.destroyer, TL.formation, T)), near: 0.05 }, own: 'exterior',
      holes: [[st.pos[0] - back[0] * 800, st.pos[2] - back[2] * 800, 2600, 1], [0, 0, 1, 0]], only: [ARASHI] };
  } },
  { t: TL.formation, name: 'formation', fn: T => {
    // above and behind our Dauntless, looking straight down past it: far below, through a gap in the cloud,
    // the carriers are turning
    const me = planeAt(T);
    const k = ss(TL.formation, TL.brakes, T);
    const lvlR = [Math.cos(YAW), 0, Math.sin(YAW)], lvlF = [Math.sin(YAW), 0, -Math.cos(YAW)];
    const eye = add(add(add(me.pos, scl(lvlR, lerp(-9, -6, k))), [0, lerp(19, 15, k), 0]), scl(lvlF, lerp(-16, -12, k)));
    const ak = shipState(AKAGI, T).pos;
    const at = add(me.pos, scl(norm(sub(ak, me.pos)), 26));
    return { cam: { eye, at, up: lvlF, fov: 50, near: 0.3 }, own: 'exterior' };
  } },
  { t: TL.brakes, name: 'brakes', fn: T => {
    const me = planeAt(T);
    return { plane: me, cam: cockpitCam(me, T, [-1.0, -0.5, -0.25], 62, 0.004 + 0.01 * ss(15.95, 16.7, T)), own: 'cockpit' };
  } },
  { t: TL.push, name: 'push', fn: T => {
    const me = planeAt(T);
    const c = cockpitCam(me, T, [0, -0.05, 1], lerp(66, 46, ss(TL.dive - 0.5, TL.dive + 3, T)), 0.01);
    const k = ss(TL.dive - 0.5, TL.dive + 2.5, T);
    if (k > 0) {
      const tgt = shipPoint(AKAGI, T, [0, CARRIER.deckY, 0]);
      const dir = norm(add(scl(norm(sub(c.at, c.eye)), 1 - k), scl(norm(sub(tgt, c.eye)), k)));
      const sh = shake(T, buffet(T));
      c.at = add(add(c.eye, scl(dir, 100)), add(scl(me.right, sh[0] * 60), scl(me.up, sh[1] * 60)));
    }
    return { plane: me, cam: c, own: 'cockpit' };
  } },
  { t: TL.scope1, name: 'scope1', scope: true, fn: T => {
    const me = planeAt(T);
    return { plane: me, cam: scopeCam(me, T, 11, 0.2), own: null, scope: true };
  } },
  { t: TL.deck, name: 'deck', fn: T => {
    // on Akagi's flight deck, among the aircraft being readied; a man looks up, and points
    const eye = shipPoint(AKAGI, T, [-2.2, CARRIER.deckY + 1.0, -41]);
    const me = planeAt(T);
    const lookDeck = shipPoint(AKAGI, T, [-4, CARRIER.deckY + 2.2, -80]);
    const d0 = norm(sub(lookDeck, eye)), d1 = norm(sub(me.pos, eye));
    const k = ss(TL.deck + 1.2, TL.sky - 0.2, T) * 0.3;
    const at = add(eye, scl(norm(add(scl(d0, 1 - k), scl(d1, k))), 50));
    return { cam: { eye, at, fov: lerp(50, 44, ss(TL.deck, TL.sky, T)), near: 0.2 }, own: 'exterior', crew: true };
  } },
  { t: TL.sky, name: 'sky', fn: T => {
    // telephoto from the deck: three black dots coming down out of the sun
    const eye = shipPoint(AKAGI, T, [-3.5, CARRIER.deckY + 1.55, -42]);
    const me = planeAt(T), w1 = planeAt(T, WINGMEN[0].delay, WINGMEN[0].off);
    const c = scl(add(scl(me.pos, 2), w1.pos), 1 / 3);
    const at = add(scl(norm(sub(c, eye)), 0.9), scl(SUN, 0.1));
    return { cam: { eye, at: add(eye, at), fov: lerp(6, 4.5, ss(TL.sky, TL.scope2, T)), near: 0.5 }, own: 'exterior' };
  } },
  { t: TL.scope2, name: 'scope2', scope: true, fn: T => {
    const me = planeAt(T);
    return { plane: me, cam: scopeCam(me, T, lerp(11, 14, ss(TL.scope2, TL.over, T)), 0.25), own: null, scope: true };
  } },
  { t: TL.over, name: 'over', fn: T => {
    // the lens has fogged: head up, over the sight, eyeballs only
    const me = planeAt(T);
    const c = scopeCam(me, T, 36, 1);
    const eye = eyeOf(me, [SBD.eye[0], SBD.eye[1] + 0.06, SBD.eye[2] + 0.05]);
    const sh = shake(T, buffet(T));
    return { plane: me, cam: { ...c, eye, at: add(add(c.at, scl(sub(eye, c.eye), 1)), add(scl(me.right, sh[0] * 60), scl(me.up, sh[1] * 60))), near: 0.05 }, own: 'cockpit' };
  } },
  { t: TL.release, name: 'pullout', fn: T => {
    const me = planeAt(T);
    return { plane: me, cam: cockpitCam(me, T, [0, 0.02, 1], 70, 0.06 * Math.exp(-(T - TL.release) * 0.9) + 0.012), own: 'cockpit' };
  } },
  { t: TL.gunner, name: 'gunner', fn: T => {
    // the rear seat, looking back: the flight deck, the bomb, what follows
    const me = planeAt(T);
    const eye = eyeOf(me, [-0.62, 1.4, -2.1]);
    const tgt = shipPoint(AKAGI, T, [0, 20, 5]);
    const blast = T > TL.hit ? 0.35 * Math.exp(-(T - TL.hit) * 1.4) + (T > TL.hangar ? 0.45 * Math.exp(-(T - TL.hangar) * 1.2) : 0) : 0;
    const sh = shake(T, 0.012 + blast);
    const toT = sub(tgt, eye);
    const dir = norm(add(add(toT, [0, 30, 0]), scl(me.right, 0.16 * Math.hypot(...toT))));
    const at = add(add(eye, scl(dir, 30)), [sh[0] * 8, sh[1] * 8, sh[2] * 8]);
    return { plane: me, cam: { eye, at, up: [0, 1, 0], fov: lerp(52, 46, ss(TL.gunner, TL.end, T)), near: 0.05 }, own: 'exterior', fade: 1 - ss(TL.end - 0.8, TL.end + 0.4, T) };
  } },
  { t: TL.end, name: 'end', fn: () => ({ black: true }) },
];
export function shotAt(T) { let k = 0; while (k < SHOTS.length - 1 && T >= SHOTS[k + 1].t) k++; return SHOTS[k]; }

// ---------- the frame ----------
export function frame(T) {
  const sh = shotAt(T);
  const d = sh.fn(T);
  const DBG = globalThis.DEBUG_ENV;
  if (DBG && DBG.cam) { const me = planeAt(T); d.black = false; d.cam = { eye: eyeOf(me, DBG.cam.eye), at: eyeOf(me, DBG.cam.at), up: DBG.cam.up || [0, 1, 0], fov: DBG.cam.fov || 50, near: 0.1 }; d.own = DBG.own || 'exterior'; d.scope = false; }
  if (d.black) return { black: true, overlay: ctx => overlay(ctx, T, sh, d, null) };
  const env = baseEnv();
  if (d.holes) env.holes = d.holes;
  const fl = fleet(T, d.only || null);
  const ac = d.only ? { meshes: [], parts: [], me: null } : aircraft(T, { own: d.own });
  const meshes = [...fl.meshes, ...ac.meshes];
  const parts = [...ac.parts];
  if (sh.name === 'cruise') {
    meshes.push({ mesh: 'cockpit', model: planeMatrix(d.plane), cockpit: true, prop: 1, flap: 0 });
    propDisc(parts, d.plane, T, 0.55);
    for (const [p, o] of d.escorts) {
      const q = { ...p, pos: add(add(add(p.pos, scl(p.right, o[0])), scl(p.up, o[1])), scl(p.fwd, o[2])) };
      meshes.push({ mesh: 'sbd', model: planeMatrix(q), prop: 1 }); propDisc(parts, q, T, 1);
    }
  }
  if (sh.name === 'destroyer') { meshes.push({ mesh: 'sbd', model: planeMatrix(d.plane), prop: 1, flap: 0 }); propDisc(parts, d.plane, T, 1); }
  const view = lookAt(d.cam.eye, d.cam.at, d.cam.up || [0, 1, 0]);
  const VP = mul(perspective(d.cam.fov * Math.PI / 180, FW / FH, d.cam.near || 0.5, 400000), view.m);
  const lights = [];
  const wet = [];
  if (!d.only && sh.name !== 'cruise') {
    burning(parts, T, KAGA, [2, CARRIER.deckY, 30], TL.kagaHit + 0.5, { seed: 1, size: 18 });
    burning(parts, T, KAGA, [-3, CARRIER.deckY, -45], TL.kagaHit + 2.5, { seed: 2, size: 18 });
    burning(parts, T, SORYU, [0, CARRIER.deckY, 10], TL.soryuHit + 0.5, { seed: 3, size: 20 });
    explosion(parts, T, shipPoint(KAGA, TL.kagaHit, [2, CARRIER.deckY, 30]), TL.kagaHit, 1.4, 11);
    explosion(parts, T, shipPoint(KAGA, TL.kagaHit + 2, [-3, CARRIER.deckY, -45]), TL.kagaHit + 2, 1.6, 12);
    explosion(parts, T, shipPoint(SORYU, TL.soryuHit, [0, CARRIER.deckY, 10]), TL.soryuHit, 1.6, 13);
    const hitW = shipPoint(AKAGI, TL.hit, [HIT_LOCAL[0], CARRIER.deckY, HIT_LOCAL[2]]);
    explosion(parts, T, hitW, TL.hit, 1.3, 21);
    explosion(parts, T, shipPoint(AKAGI, TL.hangar, [0, CARRIER.deckY - 2, 8]), TL.hangar, 3.0, 22);
    burning(parts, T, AKAGI, [0, CARRIER.deckY, 8], TL.hangar + 0.3, { seed: 4, size: 24, rise: 10, rate: 0.08 });
    burning(parts, T, AKAGI, [2, CARRIER.deckY, -30], TL.hangar + 2.0, { seed: 5, size: 20, rise: 8, rate: 0.1 });
    burning(parts, T, AKAGI, [HIT_LOCAL[0], CARRIER.deckY, HIT_LOCAL[2]], TL.hit + 0.2, { seed: 6, size: 12, rise: 7, rate: 0.12, life: 18 });
    if (T > TL.hit) { const a = T - TL.hit; lights.push([...hitW.map((v, i) => v + (i === 1 ? 10 : 0)), 90, 60 * Math.exp(-a * 3), 30 * Math.exp(-a * 3), 10 * Math.exp(-a * 3)]); }
    if (T > TL.hangar) { const a = T - TL.hangar; const hp = shipPoint(AKAGI, T, [0, CARRIER.deckY + 6, 8]); lights.push([...hp, 160, 90 * Math.exp(-a * 2) + 6, 40 * Math.exp(-a * 2) + 2.4, 12 * Math.exp(-a * 2) + 0.6]); }
    flak(parts, T);
    if (sh.name !== 'deck' && sh.name !== 'sky') tracers(parts, T, VP, view.right, view.up);
    if (ac.me && T > 44 && T < 47.5) wisps(parts, T, ac.me);
    splashes(parts, T, wet);
  }
  const figures = d.crew ? crew(T, view.right) : null;
  const post = { ...POST };
  let fog = 0, grey = 0;
  if (sh.name === 'scope2') fog = 0.08 + 0.95 * ss(TL.scope2 + 1.0, TL.over - 0.3, T);
  if (sh.name === 'scope1') fog = 0.04 * ss(TL.scope1 + 3, TL.deck, T);
  if (sh.name === 'pullout') grey = 0.8 * ss(TL.release + 0.3, TL.release + 1.5, T) * (1 - 0.7 * ss(TL.release + 2.0, TL.gunner, T));
  return {
    view: { cam: d.cam, env, time: T, lights, ships: fl.wakes, splashes: wet, meshes, figures, particles: new Float32Array(parts), post },
    fade: d.fade ?? 1, fog, grey, scope: !!d.scope, VP, plane: d.plane || null,
    overlay: ctx => overlay(ctx, T, sh, d, VP),
  };
}

// ---------- words on the screen ----------
function overlay(ctx, T, sh, d, VP) {
  const jitter = shake(T, 5 * buffet(T) * 10);
  if (d.scope) scopeMask(ctx, 1, { jitter: [jitter[0], jitter[1]] });
  // instrument panel: altimeter and airspeed, where the panel is
  if (d.plane && VP && (sh.name === 'push' || sh.name === 'over' || sh.name === 'pullout' || sh.name === 'cruise')) {
    const P = lp => project(VP, eyeOf(d.plane, lp));
    const c1 = P([-0.24, 0.7, 0.79]), c2 = P([0.04, 0.7, 0.79]), edge = P([-0.24 + 0.07, 0.7, 0.79]);
    if (c1 && edge) {
      const rad = Math.hypot(edge[0] - c1[0], edge[1] - c1[1]);
      const ft = altFeet(T);
      gauge(ctx, c1, rad, (ft % 1000) / 1000, { label: 'ALT', needle2: (ft / 10000) % 1, light: 0.8 });
      gauge(ctx, c2, rad, Math.min(0.95, d.plane.v / 0.5144 / 400), { label: 'KNOTS', light: 0.8 });
    }
  }
  stamp(ctx, '4 JUNE 1942  ·  NORTH OF MIDWAY ATOLL', fadeIO(T, 0.5, 3.4, 0.6));
  caption(ctx, 'The Japanese carriers were not where they were supposed to be.', fadeIO(T, 2.6, 6.2, 0.5));
  caption(ctx, 'The dive bombers from USS Enterprise were running out of fuel.', fadeIO(T, 6.5, 9.0, 0.4));
  caption(ctx, 'Then — one Japanese destroyer, racing north.', fadeIO(T, 9.1, 11.3, 0.4));
  stamp(ctx, '10:22 A.M.', fadeIO(T, 11.6, 14.8, 0.4), { size: 40 });
  spoken(ctx, 'CARRIERS. DEAD AHEAD.', null, fadeIO(T, 12.3, 13.9, 0.15), { size: 70, y: FH / 2 + 250 });
  caption(ctx, 'Not a single Japanese fighter was above them.', fadeIO(T, 14.0, 17.0, 0.4));
  caption(ctx, 'AKAGI · FLAGSHIP OF THE CARRIER STRIKING FORCE', fadeIO(T, TL.deck + 0.2, TL.sky - 0.1, 0.3), { italic: false, size: 30, y: BAR + 64 });
  caption(ctx, 'Her hangars are full of fuelled and armed aircraft.', fadeIO(T, TL.deck + 0.3, TL.sky, 0.3));
  // the dive clock
  if (T > TL.push + 0.4 && T < TL.release + 0.8) {
    const ft = altFeet(Math.min(T, TL.release));
    altitude(ctx, ft, fadeIO(T, TL.push + 0.4, TL.release + 0.8, 0.3), { hot: clamp((4500 - ft) / 2700) });
  }
  spoken(ctx, 'RELEASE', null, fadeIO(T, TL.release, TL.release + 1.1, 0.08), { size: 64, y: FH - BAR - 90, color: '#ffe4c8' });
  caption(ctx, 'Akagi was hit by one bomb.', fadeIO(T, TL.hangar + 1.5, TL.hangar + 4.0, 0.4));
  caption(ctx, 'It went through the flight deck into the hangar, among the aircraft.', fadeIO(T, TL.hangar + 4.1, TL.end - 0.2, 0.4));
  caption(ctx, 'In six minutes, three of Japan’s four carriers in the battle were burning.', fadeIO(T, TL.end + 0.4, TL.end + 3.9, 0.5), { y: FH / 2 + 10 });
  caption(ctx, ['No fighters had stopped the dive bombers.', 'They were down at sea level, shooting down the torpedo planes that had attacked first.'], fadeIO(T, TL.end + 4.3, TL.end + 8.7, 0.5), { y: FH / 2 + 10 });
  caption(ctx, 'Of 41 American torpedo bombers, 35 did not come back.', fadeIO(T, TL.end + 9.1, TL.end + 11.9, 0.5), { y: FH / 2 + 10 });
  title(ctx, 'MIDWAY', '4 JUNE 1942  ·  10:22 A.M.', fadeIO(T, TL.end + 12.3, TOTAL + 1, 0.9));
}

export const CUES = { ...TL, total: TOTAL, shots: SHOTS.map(s => [s.t, s.name]), flak: FLAK.map(f => [f.tb, Math.hypot(...sub(f.pos, planeAt(f.tb).pos))]), misses: MISSES.map(m => m.t) };
