// Where everything is at film time T: the Japanese carriers and their screen, turning hard; our Dauntless,
// its wingmen, the bomb. Metres; Y up; sea level y = 0.
import { CARRIER, SBD } from './models.js';

export const G = 9.81;
// ---------- the timeline (film seconds) ----------
export const TL = {
  cruise: 2.0,        // cockpit, high over the clouds
  destroyer: 6.6,     // the lone destroyer's wake
  formation: 11.4,    // wide: the formation, and the carriers below
  brakes: 15.6,       // dive brakes open
  push: 17.3,         // wing-over
  dive: 19.4,         // in the dive
  scope1: 27.0,       // telescopic sight
  deck: 33.8,         // on Akagi's flight deck
  sky: 36.6,          // from the deck: three black dots out of the sun
  scope2: 39.2,       // sight again: fogging
  over: 46.4,         // pilot's head comes up over the fogged sight
  release: 49.5,
  gunner: 52.3,       // the rear gunner's view
  end: 60.6,          // black: the reckoning
  total: 77.0,
  kagaHit: 29.5, soryuHit: 44.5,
};

// ---------- ships: each steams around a turning circle (or straight) ----------
// { c:[x,z] centre, R radius, w angular speed (rad/s, + = counter-clockwise seen from above), a0 angle at T=0 }
const circ = (cx, cz, R, v, dir, a0) => ({ c: [cx, cz], R, w: dir * v / R, a0 });
export const SHIPS = [
  { name: 'Akagi', kind: 'carrier', island: -1, ...circ(0, 0, 820, 15.0, -1, 2.2) },
  { name: 'Kaga', kind: 'carrier2', island: 1, ...circ(-3300, -2600, 1000, 14.0, 1, 0.6) },
  { name: 'Soryu', kind: 'carrier', island: 1, ...circ(6800, -7400, 900, 16.0, -1, 3.8) },
  { name: 'Kirishima', kind: 'battleship', ...circ(3600, 2400, 1400, 13.0, -1, 1.2) },
  { name: 'Nowaki', kind: 'destroyer', ...circ(-1800, 2700, 700, 16.5, -1, 5.0) },
  { name: 'Tanikaze', kind: 'destroyer', ...circ(2200, -2600, 650, 17.0, 1, 2.4) },
  { name: 'Arashi', kind: 'destroyer', straight: true, p0: [-52000, 30000], dir: -0.35, v: 17.5 },
];
export function shipState(i, T) {
  const s = SHIPS[i];
  if (s.straight) {
    const f = [Math.sin(s.dir), -Math.cos(s.dir)];
    const pos = [s.p0[0] + f[0] * s.v * T, 0, s.p0[1] + f[1] * s.v * T];
    return { pos, fwd: [f[0], 0, f[1]], right: [-f[1], 0, f[0]], speed: s.v, heel: 0 };
  }
  const a = s.a0 + s.w * T;
  const pos = [s.c[0] + Math.cos(a) * s.R, 0, s.c[1] + Math.sin(a) * s.R];
  const d = Math.sign(s.w);
  const fwd = [-Math.sin(a) * d, 0, Math.cos(a) * d];
  // right-handed: right = fwd x up ... with X right, Z forward, Y up: right = (fwd.z, 0, -fwd.x)
  const right = [fwd[2], 0, -fwd[0]];
  return { pos, fwd, right, speed: Math.abs(s.w) * s.R, heel: 0.05 * d, circle: s };
}
export function shipMatrix(st, heel = 0) {
  const r = st.right, f = st.fwd, up = [0, 1, 0];
  const c = Math.cos(heel), s = Math.sin(heel);
  const R = [r[0] * c + up[0] * s, r[1] * c + up[1] * s, r[2] * c + up[2] * s];
  const U = [up[0] * c - r[0] * s, up[1] * c - r[1] * s, up[2] * c - r[2] * s];
  return new Float32Array([R[0], R[1], R[2], 0, U[0], U[1], U[2], 0, f[0], f[1], f[2], 0, st.pos[0], st.pos[1], st.pos[2], 1]);
}
export function toWorldM(M, p) { return [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]]; }

// ---------- our Dauntless ----------
const D2R = Math.PI / 180;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ss = (a, b, t) => { const x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); };
export const DIVE_ANGLE = 70;
function attitude(t) {
  // pitch (deg, + nose up), roll (deg, + right wing down), speed m/s
  let pitch = 0, roll = 0, v = 70;
  const push = TL.push;
  pitch = -DIVE_ANGLE * ss(push + 0.25, push + 2.4, t);
  roll = 165 * Math.sin(Math.PI * ss(push, push + 2.9, t)) * (1 - ss(push + 2.2, push + 3.2, t) * 0.0);
  v = 70 + 58 * ss(push + 0.8, push + 9, t);
  // small aiming corrections in the dive
  if (t > push + 3) { pitch += Math.sin(t * 0.9) * 0.6 + Math.sin(t * 2.3) * 0.25; roll += Math.sin(t * 0.7 + 1) * 3; }
  // pull-out at about 6 g, then nose down to get low and away
  const r = TL.release;
  const pull = ss(r + 0.25, r + 3.1, t);
  pitch = pitch * (1 - pull) - 12 * pull;
  pitch += 12 * ss(r + 5.5, r + 8.0, t);
  v -= 18 * ss(r, r + 4, t);
  // after the pull-out: a hard bank to the left, away over the screen, then jinking
  if (t > r + 1.5) roll = -48 * ss(r + 1.8, r + 3.2, t) * (1 - ss(r + 6.5, r + 8.5, t)) + 18 * Math.sin((t - r - 6) * 0.9) * ss(r + 7, r + 9, t);
  return { pitch, roll, v };
}
function basis(yaw, pitchDeg, rollDeg) {
  const p = pitchDeg * D2R, r = rollDeg * D2R;
  const fwd = [Math.sin(yaw) * Math.cos(p), Math.sin(p), -Math.cos(yaw) * Math.cos(p)];
  // level right vector, then roll about fwd
  const rl = [Math.cos(yaw), 0, Math.sin(yaw)];
  const upL = [rl[1] * fwd[2] - rl[2] * fwd[1], rl[2] * fwd[0] - rl[0] * fwd[2], rl[0] * fwd[1] - rl[1] * fwd[0]];
  const c = Math.cos(r), s = Math.sin(r);
  const right = rl.map((v, i) => v * c - upL[i] * s);
  const up = upL.map((v, i) => v * c + rl[i] * s);
  return { fwd, right, up };
}

// integrate the flight path once; then shift it so the bomb lands on Akagi's flight deck
const DT = 1 / 240, T0 = 0, T1 = TL.total + 1;
const path = [];
{
  let x = 0, y = 0, z = 0;
  for (let t = T0; t <= T1 + 1e-9; t += DT) {
    const a = attitude(t);
    path.push([x, y, z, a.pitch, a.roll, a.v]);
    const p = a.pitch * D2R;
    // yaw is fixed later; integrate in a frame where the heading is -Z
    x += 0; y += Math.sin(p) * a.v * DT; z += -Math.cos(p) * a.v * DT;
  }
}
const at = t => { const f = clamp((t - T0) / DT, 0, path.length - 1.001); const i = Math.floor(f), u = f - i; return path[i].map((v, k) => v + (path[i + 1][k] - v) * u); };
// release conditions (in the path frame)
const REL = at(TL.release);
const relV = [0, Math.sin(REL[3] * D2R) * REL[5], -Math.cos(REL[3] * D2R) * REL[5]];
export const RELEASE_ALT = 550; // ~1,800 ft
const deckY = CARRIER.deckY;
// fall time: RELEASE_ALT + vy t - g t^2 / 2 = deckY   (vy < 0)
const tf = (relV[1] + Math.sqrt(relV[1] * relV[1] + 2 * G * (RELEASE_ALT - deckY))) / G;
export const T_HIT = TL.release + tf;
TL.hit = T_HIT; TL.hangar = T_HIT + 1.1;
// where the bomb hits: Akagi, just aft of the midships elevator, centreline
export const HIT_LOCAL = [0.8, deckY, 6];
const akagiHit = shipState(0, T_HIT);
const hitW = [akagiHit.pos[0] + akagiHit.right[0] * HIT_LOCAL[0] + akagiHit.fwd[0] * HIT_LOCAL[2], deckY, akagiHit.pos[2] + akagiHit.right[2] * HIT_LOCAL[0] + akagiHit.fwd[2] * HIT_LOCAL[2]];
// dive heading: along the carrier's track at the moment of impact, a few degrees off, attacking from astern
export const YAW = Math.atan2(akagiHit.fwd[0], -akagiHit.fwd[2]) + 8 * D2R;
const cy = Math.cos(YAW), sy = Math.sin(YAW);
// path frame (-Z forward) -> world with heading YAW: world = (x*cos - z*sin ... ) ; forward (0,0,-1) -> (sin, 0, -cos)
const rot = (x, z) => [x * cy - z * sy, x * sy + z * cy];
const horiz = relV[2] * tf; // along-track distance the bomb travels
const relW = (() => { const d = rot(0, horiz); return [hitW[0] - d[0], RELEASE_ALT, hitW[2] - d[1]]; })();
const OFF = (() => { const r = rot(REL[0], REL[2]); return [relW[0] - r[0], RELEASE_ALT - REL[1], relW[2] - r[1]]; })();
export const CRUISE_ALT = OFF[1];

export function planeAt(t, delay = 0, offset = [0, 0, 0]) {
  const p = at(t - delay);
  const b = basis(YAW, p[3], p[4]);
  const r = rot(p[0], p[2]);
  let pos = [r[0] + OFF[0], p[1] + OFF[1], r[1] + OFF[2]];
  if (offset[0] || offset[1] || offset[2]) {
    const lvlR = [Math.cos(YAW), 0, Math.sin(YAW)], lvlF = [Math.sin(YAW), 0, -Math.cos(YAW)];
    pos = pos.map((v, i) => v + lvlR[i] * offset[0] + (i === 1 ? offset[1] : 0) + lvlF[i] * offset[2]);
  }
  return { pos, ...b, v: p[5], pitch: p[3], roll: p[4] };
}
export function planeMatrix(s) {
  // columns: right, up, forward(+Z local = nose)
  return new Float32Array([s.right[0], s.right[1], s.right[2], 0, s.up[0], s.up[1], s.up[2], 0, s.fwd[0], s.fwd[1], s.fwd[2], 0, s.pos[0], s.pos[1], s.pos[2], 1]);
}
export function bombAt(t) {
  if (t < TL.release) return null;
  const tt = Math.min(t, T_HIT) - TL.release;
  const d = rot(0, relV[2] * tt);
  const pos = [relW[0] + d[0], RELEASE_ALT + relV[1] * tt - 0.5 * G * tt * tt, relW[2] + d[1]];
  const vy = relV[1] - G * tt, vh = relV[2];
  const f = rot(0, vh); const L = Math.hypot(f[0], vy, f[1]);
  return { pos, fwd: [f[0] / L, vy / L, f[1] / L], hit: t >= T_HIT };
}
export const HIT_WORLD = hitW;
export const altFeet = t => planeAt(t).pos[1] / 0.3048;
// wingmen: the same dive, a few seconds behind, offset to the side
export const WINGMEN = [{ delay: 2.4, off: [-26, 6, 0] }, { delay: 4.6, off: [22, 12, 0] }];
export function describe() { return { T_HIT, CRUISE_ALT: CRUISE_ALT.toFixed(0) + ' m (' + (CRUISE_ALT / 0.3048).toFixed(0) + ' ft)', tf, YAW }; }
