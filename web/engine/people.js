// Japanese flight-deck crew, drawn in 2D into an atlas of 4 x 4 cells (side view, facing right, 2.4 m tall cells).
export const CELLS = { stand: 0, point: 1, run: 2, look: 3, officer: 4, crouch: 5, pilot: 6, shout: 7, run2: 8, pointR: 9 };
export const CELL_M = 2.4;

const rgb = (c, k = 1) => `rgb(${c.map(v => Math.round(Math.min(1, v * k) * 255)).join(',')})`;
function seg(x, a, b, wa, wb, col) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-6, nx = -dy / L, ny = dx / L;
  x.fillStyle = col; x.beginPath();
  x.moveTo(a[0] + nx * wa / 2, a[1] + ny * wa / 2); x.lineTo(b[0] + nx * wb / 2, b[1] + ny * wb / 2);
  x.arc(b[0], b[1], wb / 2, Math.atan2(ny, nx), Math.atan2(ny, nx) - Math.PI, true);
  x.lineTo(a[0] - nx * wa / 2, a[1] - ny * wa / 2);
  x.arc(a[0], a[1], wa / 2, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) - Math.PI, true); x.fill();
}
function poly(x, pts, col) { x.fillStyle = col; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); x.fill(); }
function ell(x, c, rx, ry, col) { x.fillStyle = col; x.beginPath(); x.ellipse(c[0], c[1], rx, ry, 0, 0, 7); x.fill(); }

const WORK = [0.62, 0.6, 0.5], PILOT = [0.36, 0.26, 0.16], OFF = [0.12, 0.13, 0.17], SKIN = [0.74, 0.58, 0.44], BOOT = [0.05, 0.05, 0.05];

function figure(x, o) {
  const cloth = o.pilot ? PILOT : o.officer ? OFF : WORK;
  const lean = o.lean || 0;
  const hip = o.crouch ? [0, 0.55] : [0, 0.95];
  const R = p => [hip[0] + (p[0] - hip[0]) * Math.cos(lean) - (p[1] - hip[1]) * Math.sin(lean), hip[1] + (p[0] - hip[0]) * Math.sin(lean) + (p[1] - hip[1]) * Math.cos(lean)];
  const sh = R([0.02, hip[1] + 0.5]), head = R([0.05 + (o.lookUp ? -0.03 : 0), hip[1] + 0.69]);
  if (o.crouch) { seg(x, hip, [0.3, 0.35], 0.17, 0.14, rgb(cloth, 0.7)); seg(x, [0.3, 0.35], [0.22, 0.04], 0.14, 0.12, rgb(cloth, 0.7)); seg(x, hip, [-0.2, 0.3], 0.17, 0.14, rgb(cloth)); seg(x, [-0.2, 0.3], [-0.05, 0.04], 0.14, 0.12, rgb(cloth)); }
  else {
    const f1 = o.stride ? [-0.32, 0.06] : o.stance ? [-0.14, 0.05] : [-0.05, 0.05], f2 = o.stride ? [0.36, 0.1] : o.stance ? [0.18, 0.05] : [0.07, 0.05];
    seg(x, hip, f1, 0.17, 0.12, rgb(cloth, 0.72)); seg(x, hip, f2, 0.17, 0.12, rgb(cloth));
    seg(x, [f1[0] - 0.06, 0.04], [f1[0] + 0.12, 0.04], 0.08, 0.08, rgb(BOOT)); seg(x, [f2[0] - 0.06, 0.04], [f2[0] + 0.14, 0.04], 0.08, 0.08, rgb(BOOT));
  }
  if (o.farArm) seg(x, sh, o.farArm, 0.11, 0.09, rgb(cloth, 0.7));
  const top = hip[1] + 0.53;
  poly(x, [R([-0.16, hip[1] - 0.12]), R([0.16, hip[1] - 0.12]), R([0.15, hip[1] + 0.25]), R([0.12, top]), R([-0.1, top + 0.02]), R([-0.15, hip[1] + 0.25])], rgb(cloth));
  ell(x, head, 0.095, 0.11, rgb(SKIN));
  if (o.pilot) {
    ell(x, [head[0] - 0.02, head[1] + 0.02], 0.11, 0.12, rgb([0.3, 0.2, 0.12]));
    poly(x, [[head[0] + 0.02, head[1] + 0.07], [head[0] + 0.12, head[1] + 0.08], [head[0] + 0.12, head[1] + 0.03], [head[0] + 0.02, head[1] + 0.02]], rgb([0.5, 0.55, 0.5]));
  } else if (o.officer) {
    poly(x, [[head[0] - 0.11, head[1] + 0.06], [head[0] + 0.1, head[1] + 0.06], [head[0] + 0.12, head[1] + 0.14], [head[0] - 0.12, head[1] + 0.14]], rgb([0.1, 0.1, 0.12]));
    poly(x, [[head[0] + 0.05, head[1] + 0.06], [head[0] + 0.19, head[1] + 0.04], [head[0] + 0.1, head[1] + 0.09]], rgb([0.02, 0.02, 0.02]));
  } else {
    // soft field cap with a short peak, or a white hachimaki
    if (o.band) { ell(x, [head[0] - 0.03, head[1] + 0.03], 0.08, 0.08, rgb([0.08, 0.06, 0.05])); seg(x, [head[0] - 0.1, head[1] + 0.03], [head[0] + 0.09, head[1] + 0.05], 0.035, 0.035, rgb([0.95, 0.95, 0.92])); }
    else { poly(x, [[head[0] - 0.11, head[1] + 0.05], [head[0] + 0.1, head[1] + 0.05], [head[0] + 0.08, head[1] + 0.13], [head[0] - 0.1, head[1] + 0.13]], rgb([0.55, 0.52, 0.42])); poly(x, [[head[0] + 0.06, head[1] + 0.05], [head[0] + 0.19, head[1] + 0.04], [head[0] + 0.08, head[1] + 0.08]], rgb([0.2, 0.18, 0.12])); }
  }
  seg(x, sh, o.arm || R([0.08, hip[1]]), 0.12, 0.09, rgb(cloth));
  ell(x, o.arm || R([0.08, hip[1]]), 0.045, 0.045, rgb(SKIN));
}

export function buildPeople() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
  const x = c.getContext('2d');
  const k = 256 / CELL_M;
  const draw = (i, o) => {
    x.save(); x.beginPath(); x.rect((i % 4) * 256, Math.floor(i / 4) * 256, 256, 256); x.clip();
    x.translate((i % 4) * 256 + 128, Math.floor(i / 4) * 256 + 250); x.scale(k, -k);
    figure(x, o); x.restore();
  };
  draw(0, { arm: [0.1, 1.0], farArm: [0.05, 0.95] });
  draw(1, { arm: [0.45, 2.05], stance: true, farArm: [0.2, 1.2], lookUp: true, lean: -0.1 });
  draw(2, { stride: true, lean: 0.25, arm: [0.4, 1.35], farArm: [-0.35, 1.0] });
  draw(3, { lean: -0.2, arm: [0.1, 1.05], farArm: [0.2, 1.4], lookUp: true, stance: true });
  draw(4, { officer: true, arm: [0.1, 1.0] });
  draw(5, { crouch: true, arm: [0.45, 0.55], farArm: [0.4, 0.6] });
  draw(6, { pilot: true, arm: [0.08, 1.0], farArm: [0.1, 1.05] });
  draw(7, { stance: true, arm: [0.5, 1.75], farArm: [-0.25, 1.45], lean: -0.05, band: true });
  draw(8, { stride: true, lean: 0.3, arm: [-0.35, 1.2], farArm: [0.45, 1.3], band: true });
  draw(9, { officer: true, stance: true, arm: [0.55, 1.95], lean: -0.12, lookUp: true });
  return c;
}
