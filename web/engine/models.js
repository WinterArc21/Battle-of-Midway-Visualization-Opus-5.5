// The ships and aircraft, built procedurally in metres.
// Local axes everywhere: X = starboard / right wing, Y = up, Z = forward (bow / nose).
// Materials: 0 IJN hull grey · 1 flight deck (painted texture) · 2 dark metal · 3 SBD skin · 4 SBD upper dive flap
//            5 glass · 6 IJN aircraft green · 7 IJN aircraft grey · 8 black · 9 red · 10 bomb · 11 SBD lower dive flap
import { Geo } from './geo.js';

// ---------------- aircraft carrier (Akagi; Kaga is the same hull with the island to starboard) ----------------
export const CARRIER = { L: 260, deckY: 15.2, deckZ0: -124, deckZ1: 116, deckW: 30.5 };
const HULL_Z0 = -128, HULL_Z1 = 131;
export function carrierHalfWidth(z) {
  const s = (z - HULL_Z0) / (HULL_Z1 - HULL_Z0);
  if (s < 0 || s > 1) return 0;
  if (s < 0.12) return 15.5 * Math.sqrt(Math.max(0.02, 1 - ((0.12 - s) / 0.14) ** 2));
  if (s < 0.62) return 15.5;
  return Math.max(0.3, 15.5 * (1 - ((s - 0.62) / 0.38) ** 1.8));
}

export function buildCarrier(islandSide = -1) {
  const g = new Geo();
  const zs = [];
  for (let z = HULL_Z0; z <= HULL_Z1; z += z > 80 || z < -110 ? 2 : 6) zs.push(z);
  if (zs[zs.length - 1] < HULL_Z1) zs.push(HULL_Z1);
  const ys = [-8, -6.5, -4, 0, 3, 6, 9];
  const prof = z => ys.map(y => {
    let k = 1;
    if (y < -5) k = Math.sqrt(Math.max(0.1, 1 - ((y + 5) / 3.4) ** 2));
    const flare = y > 0 ? 1 + 0.06 * (y / 9) * Math.max(0, (z - 60) / 70) : 1;
    return [carrierHalfWidth(z) * k * flare + (y > 0 && z > 60 ? 0.6 * (y / 9) : 0), y + (z > 100 ? (z - 100) * 0.02 * (y / 9) : 0)];
  });
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i], zb = zs[i + 1], A = prof(za), B = prof(zb);
    for (let j = 0; j < A.length - 1; j++) {
      const m = A[j][1] < -0.5 ? 9 : 0;
      g.quad([A[j][0], A[j][1], za], [B[j][0], B[j][1], zb], [B[j + 1][0], B[j + 1][1], zb], [A[j + 1][0], A[j + 1][1], za], m);
      g.quad([-A[j + 1][0], A[j + 1][1], za], [-B[j + 1][0], B[j + 1][1], zb], [-B[j][0], B[j][1], zb], [-A[j][0], A[j][1], za], m);
    }
    const ta = A[A.length - 1], tb = B[B.length - 1];
    g.quad([-ta[0], ta[1], za], [-tb[0], tb[1], zb], [tb[0], tb[1], zb], [ta[0], ta[1], za], 0);
  }
  { const A = prof(HULL_Z0 + 0.01); for (let j = 0; j < A.length - 1; j++) g.quad([-A[j][0], A[j][1], HULL_Z0], [-A[j + 1][0], A[j + 1][1], HULL_Z0], [A[j + 1][0], A[j + 1][1], HULL_Z0], [A[j][0], A[j][1], HULL_Z0], 0); }
  // hangar enclosure between the hull and the flight deck
  const { deckY, deckZ0, deckZ1, deckW } = CARRIER;
  g.box(-12.5, 12.5, 9, deckY - 0.5, -112, 104, 0);
  // hangar side openings / windows: dark bands
  g.box(-12.55, -12.5, 11.2, 12.6, -100, 95, 2, null, false); g.box(12.5, 12.55, 11.2, 12.6, -100, 95, 2, null, false);
  // flight deck: textured top, dark underside and edges
  const hw = deckW / 2;
  g.quad([-hw, deckY, deckZ0], [-hw, deckY, deckZ1], [hw, deckY, deckZ1], [hw, deckY, deckZ0], 1);
  g.box(-hw, hw, deckY - 0.6, deckY - 0.02, deckZ0, deckZ1, 2, null);
  // deck supports at bow and stern
  for (const z of [deckZ1 - 4, deckZ1 - 14, deckZ0 + 3, deckZ0 + 9]) for (const x of [-10, -3.5, 3.5, 10]) g.box(x - 0.3, x + 0.3, 8.5, deckY - 0.6, z - 0.3, z + 0.3, 2);
  // gun sponsons and AA mounts along both sides
  for (const s of [-1, 1]) {
    for (const z of [-95, -70, -40, 40, 70]) {
      if (s === islandSide && Math.abs(z - 20) < 18) continue;
      g.box(s > 0 ? 12.5 : -17.2, s > 0 ? 17.2 : -12.5, 9.8, 11.2, z - 5, z + 5, 0);
      g.box(s * 14.2 - 1.2, s * 14.2 + 1.2, 11.2, 12.6, z - 1.5, z + 1.5, 2);
      g.tube([s * 14.2, 12.3, z], [s * 15.6, 13.4, z + 3.8], 0.12, 0.1, 2, 5, false);
      g.tube([s * 14.2 - 0.5, 12.3, z], [s * 15.1, 13.4, z + 3.8], 0.12, 0.1, 2, 5, false);
    }
    // catwalks just below the deck edge
    g.box(s > 0 ? hw : -hw - 1.6, s > 0 ? hw + 1.6 : -hw, deckY - 1.4, deckY - 1.2, -100, 100, 2);
  }
  // island
  const ix = islandSide * 13.4, s = islandSide;
  g.box(Math.min(ix, ix + s * 4.6), Math.max(ix, ix + s * 4.6), deckY, deckY + 6.5, 14, 28, 0);
  g.box(Math.min(ix, ix + s * 4.0) + 0.3, Math.max(ix, ix + s * 4.0) - 0.3, deckY + 6.5, deckY + 9.5, 17, 27, 0);
  g.box(Math.min(ix, ix + s * 4.0) + 0.25, Math.max(ix, ix + s * 4.0) - 0.25, deckY + 8.2, deckY + 8.8, 17.05, 27.05, 2, null, false); // bridge windows
  g.tube([ix + s * 2.2, deckY + 9.5, 22], [ix + s * 2.2, deckY + 19, 21.5], 0.35, 0.25, 2, 6);
  g.tube([ix + s * 2.2, deckY + 17, 21.5], [ix + s * 2.2 - 3, deckY + 17, 21.5], 0.1, 0.1, 2, 4);
  g.tube([ix + s * 2.2, deckY + 17, 21.5], [ix + s * 2.2 + 3, deckY + 17, 21.5], 0.1, 0.1, 2, 4);
  g.box(ix + s * 2.2 - 0.9, ix + s * 2.2 + 0.9, deckY + 12, deckY + 13, 20.6, 22.4, 2);  // rangefinder platform
  // the downturned funnel on the opposite side
  const f = -islandSide;
  for (let k = 0; k < 6; k++) {
    const a0 = k / 6, a1 = (k + 1) / 6;
    const P = t => [f * (15.8 + 4.2 * Math.sin(t * Math.PI * 0.5)), 12 - 7 * t * t, 10];
    const p0 = P(a0), p1 = P(a1);
    g.tube(p0, p1, 3.0, 3.0, 0, 12, false);
  }
  g.disc([f * 20.0, 5.0, 10], 3.0, 'y', 8, 12);
  g.tube([f * 16.5, 10, 20], [f * 17.2, deckY + 3.5, 20], 1.3, 1.2, 0, 10); // small upright funnel
  g.disc([f * 17.2, deckY + 3.5, 20], 1.2, 'y', 8, 10);
  // aircraft spotted aft for the next strike
  const planes = [];
  for (let r = 0; r < 4; r++) for (let c = -1; c <= 1; c++) {
    const z = -62 - r * 13, x = c * 9.5 + (r % 2 ? 2 : 0);
    if (Math.abs(x) > 12) continue;
    planes.push([x, z, (r + c) % 3 === 0 ? 7 : 6]);
  }
  for (const [x, z, m] of planes) g.append(buildJapanesePlane(m), p => [p[0] + x, p[1] + deckY + 1.55, p[2] + z]);
  return g.arrays();
}

// a generic warship for the screen: destroyers and a battleship
export function buildWarship(L = 118, B = 10.8, big = false) {
  const g = new Geo();
  const z0 = -L / 2, z1 = L / 2;
  const hw = z => { const s = (z - z0) / L; if (s < 0.1) return B / 2 * Math.sqrt(Math.max(0.05, 1 - ((0.1 - s) / 0.12) ** 2)); if (s < 0.55) return B / 2; return Math.max(0.2, B / 2 * (1 - ((s - 0.55) / 0.45) ** 1.7)); };
  const top = z => (big ? 8 : 5) + ((z - z0) / L > 0.72 ? (big ? 2.5 : 2) : 0);
  const zs = []; for (let z = z0; z <= z1 + 1e-6; z += L / 40) zs.push(z);
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i], zb = zs[i + 1];
    for (const [y0, y1, m] of [[-4, 0, 9], [0, 1, 0]]) {
      const ya1 = y1 === 1 ? top(za) : y1, yb1 = y1 === 1 ? top(zb) : y1;
      g.quad([hw(za), y0, za], [hw(zb), y0, zb], [hw(zb), yb1, zb], [hw(za), ya1, za], m);
      g.quad([-hw(za), ya1, za], [-hw(zb), yb1, zb], [-hw(zb), y0, zb], [-hw(za), y0, za], m);
    }
    g.quad([-hw(za), top(za), za], [-hw(zb), top(zb), zb], [hw(zb), top(zb), zb], [hw(za), top(za), za], 0);
  }
  const y = top(0);
  if (big) {
    g.box(-8, 8, y, y + 5, -40, 30, 0); g.box(-5, 5, y + 5, y + 22, 8, 22, 0); g.box(-3, 3, y + 22, y + 30, 12, 18, 0);
    g.tube([0, y + 5, -5], [0, y + 16, -7], 3.2, 3.0, 0, 10); g.tube([0, y + 5, -20], [0, y + 14, -22], 2.8, 2.6, 0, 10);
    for (const z of [L * 0.36, L * 0.25, -L * 0.3, -L * 0.4]) {
      const yy = top(z); g.box(-5, 5, yy, yy + 3, z - 5, z + 5, 0);
      const d = z > 0 ? 1 : -1; g.tube([-1.2, yy + 1.8, z + d * 4], [-1.2, yy + 2.3, z + d * 18], 0.45, 0.35, 2, 6); g.tube([1.2, yy + 1.8, z + d * 4], [1.2, yy + 2.3, z + d * 18], 0.45, 0.35, 2, 6);
    }
  } else {
    g.box(-3.5, 3.5, y, y + 3.5, 18, 32, 0); g.box(-2.5, 2.5, y + 3.5, y + 6.5, 22, 30, 0);
    g.tube([0, y + 6.5, 26], [0, y + 18, 25], 0.3, 0.2, 2, 5);
    g.tube([0, y, 8], [0, y + 7.5, 7], 1.6, 1.5, 0, 10); g.tube([0, y, -6], [0, y + 7, -7], 1.5, 1.4, 0, 10);
    for (const z of [42, -30, -44]) { const yy = top(z); g.box(-2.2, 2.2, yy, yy + 2.5, z - 2.5, z + 2.5, 0); const d = z > 0 ? 1 : -1; g.tube([0, yy + 1.4, z + d * 2], [0, yy + 1.6, z + d * 7], 0.2, 0.15, 2, 5); }
    g.box(-2, 2, y, y + 1.5, -18, -12, 2);
  }
  return g.arrays();
}

// ---------------- a Japanese carrier aircraft, parked (roughly a Nakajima B5N / Mitsubishi A6M) ----------------
export function buildJapanesePlane(m = 6) {
  const g = new Geo();
  const sec = (z, r, yc) => { const out = []; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; out.push([Math.cos(a) * r, yc + Math.sin(a) * r * 1.1, z]); } return out; };
  g.loft([sec(-5.5, 0.12, 0.6), sec(-3, 0.5, 0.35), sec(0, 0.62, 0.1), sec(2.8, 0.62, 0), sec(3.4, 0.55, 0)], m);
  g.disc([0, 0, 3.42], 0.55, 'z', 8, 10);
  // wings (span 14 m, folded tips on the Kate are ignored), tailplane, fin
  const wing = (x0, x1, c0, c1, zc, y0, y1) => { g.quad([x0, y0, zc + c0 / 2], [x1, y1, zc + c1 / 2], [x1, y1, zc - c1 / 2], [x0, y0, zc - c0 / 2], m); g.quad([x0, y0 - 0.12, zc - c0 / 2], [x1, y1 - 0.08, zc - c1 / 2], [x1, y1 - 0.08, zc + c1 / 2], [x0, y0 - 0.12, zc + c0 / 2], m); };
  wing(0, 7, 2.8, 1.4, 0.6, -0.35, 0.3); wing(0, -7, 2.8, 1.4, 0.6, -0.35, 0.3);
  wing(0, 2.4, 1.3, 0.7, -5.0, 0.55, 0.6); wing(0, -2.4, 1.3, 0.7, -5.0, 0.55, 0.6);
  g.quad([0, 0.6, -4.4], [0, 2.2, -5.4], [0, 2.2, -6.0], [0, 0.6, -5.8], m);
  g.quad([0, 0.6, -5.8], [0, 2.2, -6.0], [0, 2.2, -5.4], [0, 0.6, -4.4], m);
  g.box(-0.45, 0.45, 0.65, 1.1, -2.0, 1.0, 5);                      // canopy
  g.disc([4.8, 0.08 + 0.01, 0.6], 0.55, 'y', 9, 12); g.disc([-4.8, 0.08 + 0.01, 0.6], 0.55, 'y', 9, 12); // hinomaru
  g.tube([1.5, -0.3, 1.0], [1.7, -1.55, 1.0], 0.07, 0.07, 2, 4, false); g.tube([-1.5, -0.3, 1.0], [-1.7, -1.55, 1.0], 0.07, 0.07, 2, 4, false);
  g.tube([1.7, -1.55, 0.85], [1.7, -1.55, 1.15], 0.3, 0.3, 8, 8); g.tube([-1.7, -1.55, 0.85], [-1.7, -1.55, 1.15], 0.3, 0.3, 8, 8);
  // propeller (stopped)
  g.quad([-0.05 - 1.3 * 0.5, -1.3 * 0.87, 3.46], [0.05 - 1.3 * 0.5, -1.3 * 0.87, 3.46], [0.05 + 1.3 * 0.5, 1.3 * 0.87, 3.46], [-0.05 + 1.3 * 0.5, 1.3 * 0.87, 3.46], 8);
  return g;
}

// ---------------- Douglas SBD-3 Dauntless ----------------
// span 12.66 m, length 10.1 m. Nose at z ≈ +3.9, tail at z ≈ -6.2. Pilot's eye ≈ (-0.12, 1.02, 0.15).
export const SBD = {
  eye: [-0.16, 1.15, 0.1], gunner: [0.0, 1.22, -1.95],
  hingeZ: -0.88, hingeY0: -0.34, dihedral: Math.tan(6.5 * Math.PI / 180),
  bomb: [0, -0.78, 0.55],
};
function fuselageSec(z) {
  // half-width, half-height, centre y
  const k = [
    [-6.2, 0.06, 0.1, 0.45], [-5.2, 0.22, 0.3, 0.32], [-3.5, 0.38, 0.52, 0.18], [-1.8, 0.52, 0.72, 0.06], [0.0, 0.62, 0.8, 0.0],
    [1.6, 0.66, 0.78, 0.0], [2.3, 0.7, 0.74, 0.0], [3.3, 0.72, 0.72, 0.0], [3.75, 0.6, 0.6, 0.0], [3.95, 0.18, 0.18, 0.0],
  ];
  for (let i = 0; i < k.length - 1; i++) if (z <= k[i + 1][0]) { const u = (z - k[i][0]) / (k[i + 1][0] - k[i][0]); return [0, 1, 2].map(j => k[i][j + 1] + (k[i + 1][j + 1] - k[i][j + 1]) * u); }
  return k[k.length - 1].slice(1);
}
export function buildSBD({ withBomb = true, cockpit = false } = {}) {
  const g = new Geo();
  const zs = [-6.2, -5.6, -5.0, -4.2, -3.5, -2.6, -1.8, -0.9, 0, 0.8, 1.6, 2.3, 2.8, 3.3, 3.6, 3.75, 3.95];
  const N = 16;
  const rings = zs.map(z => {
    const [w, h, yc] = fuselageSec(z);
    const out = [];
    for (let k = 0; k < N; k++) {
      const a = k / N * Math.PI * 2;
      let y = Math.sin(a), x = Math.cos(a);
      // flat-ish sides, rounded top
      const sx = Math.sign(x) * Math.pow(Math.abs(x), 0.8);
      out.push([sx * w, yc + y * h, z]);
    }
    return out;
  });
  // cowling is black at the front lip
  for (let i = 0; i < rings.length - 1; i++) {
    const m = zs[i] >= 3.3 ? 8 : 3;
    const A = rings[i], B = rings[i + 1];
    for (let k = 0; k < N; k++) g.quad(A[k], A[(k + 1) % N], B[(k + 1) % N], B[k], m);
  }
  g.disc([0, 0, 3.95], 0.18, 'z', 8, 10);
  g.tube([0, 0, 3.9], [0, 0, 4.35], 0.22, 0.02, 8, 10); // spinner
  // propeller: three blades, feathered into a blur disc by the shader when turning
  for (let b = 0; b < 3; b++) {
    const a = b / 3 * Math.PI * 2 + 0.3;
    const c = Math.cos(a), s = Math.sin(a);
    g.quad([c * 0.2 - s * 0.1, s * 0.2 + c * 0.1, 4.1], [c * 1.62 - s * 0.08, s * 1.62 + c * 0.08, 4.12], [c * 1.62 + s * 0.08, s * 1.62 - c * 0.08, 4.12], [c * 0.2 + s * 0.1, s * 0.2 - c * 0.1, 4.1], 8);
  }
  // canopy: a long glazed hood with frames
  const can = [];
  for (const [z, ht] of [[-2.6, 0.22], [-1.9, 0.7], [-0.8, 0.76], [0.3, 0.76], [0.9, 0.72], [1.45, 0.5]]) {
    const [w, h, yc] = fuselageSec(z);
    const out = [];
    for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI; out.push([Math.cos(a) * w * 0.82, yc + h * 0.62 + Math.sin(a) * ht, z]); }
    can.push(out);
  }
  for (let i = 0; i < can.length - 1; i++) for (let k = 0; k < 8; k++) g.quad(can[i][k], can[i + 1][k], can[i + 1][k + 1], can[i][k + 1], 5);
  can.forEach((r, i) => { if (cockpit && i > 0 && i < 4) return; for (let k = 0; k < 8; k++) g.tube(r[k], r[k + 1], 0.018, 0.018, 2, 4, false); });
  for (let i = 0; i < can.length - 1; i++) for (const k of [0, 8]) g.tube(can[i][k], can[i + 1][k], 0.02, 0.02, 2, 4, false);
  // telescopic sight through the windscreen
  g.tube([0.13, 0.99, 0.6], [0.13, 0.93, 2.2], 0.028, 0.026, 8, 8);
  // wings: low wing with dihedral, tapered; flaps split into perforated dive brakes
  const span = 6.33, rootC = 3.25, tipC = 1.25, dih = SBD.dihedral;
  const le = x => 1.75 - (x / span) * 0.9, te = x => le(x) - (rootC + (tipC - rootC) * (x / span));
  const yw = x => SBD.hingeY0 + x * dih;
  const th = x => 0.34 * (1 - x / span * 0.6);
  const flap0 = 0.9, flap1 = 4.7, flapC = 0.62;
  for (const sd of [-1, 1]) {
    const X = x => sd * x;
    const stations = [0.55, 0.9, 1.8, 2.8, 3.8, 4.7, 5.4, 6.0, 6.33];
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i], b = stations[i + 1];
      const chord = x => le(x) - te(x);
      const inFlap = a >= flap0 && b <= flap1;
      // airfoil: le -> max thickness at 30% -> trailing edge (or flap hinge)
      const pts = x => {
        const L = le(x), T = inFlap ? te(x) + flapC : te(x), y = yw(x), t = th(x) * (x > 6.2 ? 0.4 : 1);
        const c = chord(x);
        return {
          le: [X(x), y, L], upA: [X(x), y + t * 0.62, L - c * 0.12], upB: [X(x), y + t * 0.5, L - c * 0.4], upC: [X(x), y + t * 0.18, T],
          loA: [X(x), y - t * 0.38, L - c * 0.12], loB: [X(x), y - t * 0.3, L - c * 0.4], loC: [X(x), y - t * 0.1, T],
        };
      };
      const A = pts(a), B = pts(b);
      const q = (p, r, s, t, m) => (sd > 0 ? g.quad(p, r, s, t, m) : g.quad(t, s, r, p, m));
      q(A.le, B.le, B.upA, A.upA, 3); q(A.upA, B.upA, B.upB, A.upB, 3); q(A.upB, B.upB, B.upC, A.upC, 3);
      q(A.loA, B.loA, B.le, A.le, 3); q(A.loB, B.loB, B.loA, A.loA, 3); q(A.loC, B.loC, B.loB, A.loB, 3);
      if (i === stations.length - 2) { g.tri(B.le, B.upA, B.loA, 3); }
      if (inFlap) {
        // upper and lower brake plates, hinged at the rear spar (material 4 rotates up, 11 rotates down)
        const ya = yw(a), yb = yw(b);
        const ta = te(a), tb = te(b);
        q([X(a), ya + th(a) * 0.18, ta + flapC], [X(b), yb + th(b) * 0.18, tb + flapC], [X(b), yb + 0.02, tb], [X(a), ya + 0.02, ta], 4);
        q([X(a), ya - 0.02, ta], [X(b), yb - 0.02, tb], [X(b), yb - th(b) * 0.1, tb + flapC], [X(a), ya - th(a) * 0.1, ta + flapC], 11);
      }
    }
  }
  // wing centre section through the fuselage bottom
  g.box(-0.56, 0.56, SBD.hingeY0 - 0.12, SBD.hingeY0 + 0.2, te(0.3), le(0.3), 3);
  // tailplane and fin
  // tailplane and fin as thin airfoil slabs: leading edge, thickest at 30%, tapering to the hinge and trailing edge
  const slab = (le0, te0, le1, te1, axis, t0, t1) => {
    // le/te points at root (0) and tip (1); thickness offsets along `axis`
    const mid = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
    const off = (p, t) => p.map((v, i) => v + axis[i] * t);
    const secs = [0, 0.3, 0.72, 1.0], th = [0, 1, 0.55, 0.08];
    const R = secs.map((u, k) => [off(mid(le0, te0, u), t0 * th[k]), off(mid(le0, te0, u), -t0 * th[k])]);
    const T = secs.map((u, k) => [off(mid(le1, te1, u), t1 * th[k]), off(mid(le1, te1, u), -t1 * th[k])]);
    for (let k = 0; k < 3; k++) {
      g.quad(R[k][0], T[k][0], T[k + 1][0], R[k + 1][0], 3); g.quad(R[k + 1][0], T[k + 1][0], T[k][0], R[k][0], 3);
      g.quad(R[k][1], R[k + 1][1], T[k + 1][1], T[k][1], 3); g.quad(T[k][1], T[k + 1][1], R[k + 1][1], R[k][1], 3);
    }
    g.quad(T[0][0], T[1][0], T[1][1], T[0][1], 3); g.quad(T[1][0], T[2][0], T[2][1], T[1][1], 3); g.quad(T[2][0], T[3][0], T[3][1], T[2][1], 3);
  };
  for (const sd of [-1, 1]) slab([0, 0.45, -4.6], [0, 0.45, -6.2], [sd * 3.0, 0.5, -5.2], [sd * 3.0, 0.5, -6.0], [0, 1, 0], 0.07, 0.025);
  slab([0, 0.5, -4.4], [0, 0.4, -6.35], [0, 2.2, -5.5], [0, 2.25, -6.1], [1, 0, 0], 0.07, 0.025);
  // landing gear (retracted into wells — only the wheels show) and tail wheel
  g.tube([1.3, -0.72, 0.9], [1.3, -0.52, 0.9], 0.34, 0.34, 8, 10); g.tube([-1.3, -0.72, 0.9], [-1.3, -0.52, 0.9], 0.34, 0.34, 8, 10);
  // rear gunner's twin .30s
  {
    // two M1919s on a flexible mount, pointing aft and a little up: receiver, perforated cooling jacket,
    // barrel, flash hider, spade grips, ammunition cans and a ring sight
    const o = [0, 1.14, -2.2], f = (() => { const v = [0, 0.085, -1]; const l = Math.hypot(...v); return v.map(x => x / l); })();
    const at = (x, y, d) => [o[0] + x, o[1] + y + f[1] * d, o[2] + f[2] * d];
    for (const gx of [-0.095, 0.095]) {
      // receiver (a long box along the gun axis)
      const R0 = at(gx, 0, 0.05), R1 = at(gx, 0, 0.42);
      g.tube(R0, R1, 0.05, 0.05, 12, 6);
      g.tube(at(gx, 0.035, 0.06), at(gx, 0.035, 0.4), 0.022, 0.022, 12, 6);
      // spade grips and trigger
      g.tube(at(gx, -0.02, 0.05), at(gx, -0.11, -0.04), 0.012, 0.012, 12, 6);
      // cooling jacket with its rows of holes (rings), then the bare barrel and flash hider
      g.tube(at(gx, 0, 0.42), at(gx, 0, 1.02), 0.029, 0.029, 13, 14, false);
      for (let d = 0.46; d < 1.0; d += 0.06) g.tube(at(gx, 0, d), at(gx, 0, d + 0.012), 0.031, 0.031, 12, 12, false);
      g.tube(at(gx, 0, 1.02), at(gx, 0, 1.3), 0.012, 0.011, 12, 8);
      g.tube(at(gx, 0, 1.3), at(gx, 0, 1.38), 0.016, 0.024, 12, 10);
      // ammunition can on the outboard side
      const s = Math.sign(gx);
      g.box(gx + s * 0.05, gx + s * 0.15, o[1] - 0.12, o[1] + 0.04, o[2] - 0.32, o[2] - 0.12, 10);
    }
    // cradle and pintle
    g.tube(at(-0.1, -0.03, 0.2), at(0.1, -0.03, 0.2), 0.02, 0.02, 12, 8);
    g.tube(at(0, -0.03, 0.2), [0, 0.95, -2.45], 0.03, 0.035, 12, 10);
    // ring-and-bead sight
    const sc = at(0, 0.13, 0.62);
    for (let k = 0; k < 16; k++) {
      const a0 = k / 16 * Math.PI * 2, a1 = (k + 1) / 16 * Math.PI * 2, rr = 0.075;
      g.tube([sc[0] + Math.cos(a0) * rr, sc[1] + Math.sin(a0) * rr, sc[2]], [sc[0] + Math.cos(a1) * rr, sc[1] + Math.sin(a1) * rr, sc[2]], 0.004, 0.004, 12, 4, false);
    }
    g.tube(at(0, 0.03, 0.62), [sc[0], sc[1] - 0.075, sc[2]], 0.005, 0.005, 12, 4);
    g.tube(at(0, 0.03, 1.0), at(0, 0.1, 1.0), 0.004, 0.004, 12, 4);
  }
  if (cockpit) {
    // the inside of the cockpit, seen by the pilot: coaming, instrument panel, sides
    g.box(-0.5, 0.5, 0.5, 0.82, 0.8, 0.86, 8);                  // panel
    g.box(-0.46, 0.46, 0.82, 0.86, 0.8, 1.45, 8);               // coaming
    g.tube([-0.46, 0.86, 0.8], [0.46, 0.86, 0.8], 0.022, 0.022, 14, 10); // padded lip
  }
  if (withBomb) g.append(buildBomb(), p => [p[0] + SBD.bomb[0], p[1] + SBD.bomb[1], p[2] + SBD.bomb[2]]);
  return g.arrays();
}

// a 1,000 lb bomb, nose forward, centred at the origin
export function buildBomb() {
  const g = new Geo();
  const rs = [[-0.95, 0.12], [-0.6, 0.2], [0.0, 0.21], [0.55, 0.2], [0.85, 0.12], [0.95, 0.02]];
  const N = 10;
  const rings = rs.map(([z, r]) => { const o = []; for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2; o.push([Math.cos(a) * r, Math.sin(a) * r, z]); } return o; });
  g.loft(rings, 10);
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) g.quad([Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.9], [Math.cos(a) * 0.3, Math.sin(a) * 0.3, -1.0], [Math.cos(a) * 0.3, Math.sin(a) * 0.3, -1.35], [Math.cos(a) * 0.1, Math.sin(a) * 0.1, -1.3], 10);
  return g;
}
export const bombArrays = () => buildBomb().arrays();
