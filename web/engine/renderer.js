// Draws one view: ocean, ships and aircraft, sky and clouds, figures, particles, an optional painted layer
// (the telescopic sight), then bloom / grade / finish.
import { gl, initGL, program, texture, canvasTexture, target, bindTarget, lookAt, perspective, mul, invert } from './gl.js';
import * as S from './shaders.js';
import * as PP from './post.js';
import { buildCarrier, buildWarship, buildSBD, bombArrays, CARRIER, SBD } from './models.js';
import { buildDecks } from './deck.js';

export const FW = 1920, FH = 1080;
let R = null;

function vao(buffers) {
  const v = gl.createVertexArray(); gl.bindVertexArray(v);
  buffers.forEach(([data, loc, size]) => {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  });
  gl.bindVertexArray(null);
  return v;
}
function dyn(attrs) {
  const v = gl.createVertexArray(); gl.bindVertexArray(v);
  const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib);
  for (let a = 0; a < attrs; a++) { gl.enableVertexAttribArray(1 + a); gl.vertexAttribPointer(1 + a, 4, gl.FLOAT, false, attrs * 16, a * 16); gl.vertexAttribDivisor(1 + a, 1); }
  gl.bindVertexArray(null);
  return { vao: v, ib, cap: 0 };
}
function upload(d, data) {
  gl.bindBuffer(gl.ARRAY_BUFFER, d.ib);
  if (data.byteLength > d.cap) { d.cap = Math.max(1024, data.byteLength * 1.5); gl.bufferData(gl.ARRAY_BUFFER, d.cap, gl.DYNAMIC_DRAW); }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
}
const meshVAO = a => ({ vao: vao([[a.P, 0, 3], [a.N, 1, 3], [a.M, 2, 1]]), count: a.count });

function makePuffs() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const x = c.getContext('2d'); const img = x.createImageData(1024, 1024);
  let seed = 42; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const noise = (px, py, s) => {
    const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
    const h = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return h(ix, iy) * (1 - u) * (1 - v) + h(ix + 1, iy) * u * (1 - v) + h(ix, iy + 1) * (1 - u) * v + h(ix + 1, iy + 1) * u * v;
  };
  for (let cell = 0; cell < 16; cell++) {
    const cx = (cell % 4) * 256, cy = Math.floor(cell / 4) * 256;
    const lobes = []; for (let k = 0; k < 6; k++) lobes.push([0.5 + (r() - 0.5) * 0.36, 0.5 + (r() - 0.5) * 0.3, 0.16 + r() * 0.12]);
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
      let u = i / 255, v = j / 255;
      u += (noise(u * 3, v * 3, cell * 5 + 1) - 0.5) * 0.18; v += (noise(u * 3, v * 3, cell * 5 + 2) - 0.5) * 0.18;
      let d = 0; for (const [lx, ly, lr] of lobes) { const q = Math.hypot(u - lx, v - ly) / lr; d += Math.exp(-q * q * 1.6); }
      let n = 0, a = 0.5, f = 3; for (let o = 0; o < 5; o++) { n += a * noise(u * f, v * f, cell * 3 + o); f *= 2.2; a *= 0.5; }
      const edge = Math.min(1, Math.hypot(i / 255 - 0.5, j / 255 - 0.5) * 2);
      const val = Math.min(1, (1 - Math.exp(-d * 0.9 * Math.pow(0.15 + 1.4 * n, 2.2))) * Math.pow(1 - Math.min(1, Math.pow(edge, 3)), 1.5) * 1.1);
      const o = ((cy + j) * 1024 + cx + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = val * 255; img.data[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}
function makeWeave() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); const img = x.createImageData(128, 128);
  for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
    const w = 0.5 + 0.25 * Math.sin(i * Math.PI / 2) * Math.sin(j * Math.PI / 2 + (Math.floor(i / 2) % 2) * Math.PI) + (Math.sin(i * 12.9898 + j * 78.233) * 43758.5453 % 1) * 0.3;
    const o = (j * 128 + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.max(0, Math.min(255, w * 255)); img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0); return c;
}

export function initRenderer(canvas, atlasCanvas) {
  initGL(canvas);
  const progs = {
    sky: program('sky', S.QUAD_VS, S.SKY_FS), water: program('water', S.WATER_VS, S.WATER_FS), mesh: program('mesh', S.MESH_VS, S.MESH_FS),
    fig: program('fig', S.FIG_VS, S.FIG_FS), part: program('part', S.PART_VS, S.PART_FS), layer: program('layer', S.QUAD_VS, S.LAYER_FS),
    down: program('down', S.QUAD_VS, PP.DOWN_FS), blur: program('blur', S.QUAD_VS, PP.BLUR_FS), grade: program('grade', S.QUAD_VS, PP.GRADE_FS),
    kuwa: program('kuwa', S.QUAD_VS, PP.KUWA_FS), paint: program('paint', S.QUAD_VS, PP.PAINT_FS),
  };
  const decks = buildDecks();
  R = {
    progs,
    quad: vao([[new Float32Array([-1, -1, 3, -1, -1, 3]), 0, 2]]),
    water: vao([[new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), 0, 2]]),
    mesh: {
      carrierP: meshVAO(buildCarrier(-1)), carrierS: meshVAO(buildCarrier(1)),
      battleship: meshVAO(buildWarship(222, 31, true)), destroyer: meshVAO(buildWarship(118, 10.8)),
      sbd: meshVAO(buildSBD({ withBomb: true })), sbdClean: meshVAO(buildSBD({ withBomb: false })), cockpit: meshVAO(buildSBD({ withBomb: false, cockpit: true })),
      bomb: meshVAO(bombArrays()),
    },
    decks: decks.map(c => canvasTexture(c, { mips: true })),
    figDyn: dyn(2), partDyn: dyn(3),
    atlas: canvasTexture(atlasCanvas, { mips: true }), puffs: canvasTexture(makePuffs(), { mips: true }), weave: canvasTexture(makeWeave(), { mips: false, wrap: gl.REPEAT }),
    hdr: target(FW, FH, { depth: true }),
    half: target(FW / 2, FH / 2), q1: target(FW / 4, FH / 4), q2: target(FW / 4, FH / 4), e1: target(FW / 8, FH / 8), e2: target(FW / 8, FH / 8),
    ldr: [target(FW, FH, { internal: gl.RGBA8 }), target(FW, FH, { internal: gl.RGBA8 })], kuwaT: target(FW / 2, FH / 2, { internal: gl.RGBA8 }),
    layerTex: texture({ w: 4, h: 4 }), plateTex: texture({ w: 4, h: 4 }),
  };
  R.hdrNoDepth = { fb: gl.createFramebuffer(), w: FW, h: FH };
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.hdrNoDepth.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, R.hdr.color, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return R;
}

function drawQuad() { gl.bindVertexArray(R.quad); gl.drawArrays(gl.TRIANGLES, 0, 3); }

export function project(VP, p) {
  const x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12];
  const y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13];
  const w = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
  if (w <= 0) return null;
  return [(x / w * 0.5 + 0.5) * FW, (1 - (y / w * 0.5 + 0.5)) * FH, w];
}

// v: { cam:{eye,at,up,fov,near}, env, time, lights:[[x,y,z,r,cr,cg,cb]], ships:[{wake}], splashes:[[x,z,r,s]],
//      meshes:[{mesh, model, deck, damage, damage2, cockpit, prop, flap}], figures, particles, layer:{canvas,gain}, post }
export function renderView(v, slot = 0) {
  const pr = R.progs;
  const near = v.cam.near || 0.5, far = 400000;
  const view = lookAt(v.cam.eye, v.cam.at, v.cam.up || [0, 1, 0]);
  const proj = perspective(v.cam.fov * Math.PI / 180, FW / FH, near, far);
  const VP = mul(proj, view.m);
  const e = v.env;
  const LP = new Float32Array(48), LC = new Float32Array(36);
  (v.lights || []).slice(0, 12).forEach((l, i) => { LP.set([l[0], l[1], l[2], l[3]], i * 4); LC.set([l[4], l[5], l[6]], i * 3); });
  const holes = new Float32Array(8); (e.holes || []).slice(0, 2).forEach((h, i) => holes.set(h, i * 4));
  const E = { uCam: v.cam.eye, uTime: v.time, uSun: e.sun, uSunCol: e.sunCol, uZenith: e.zenith, uHorizon: e.horizon, uHaze: e.haze,
    uCloud: e.cloud, uHole: holes, uLP: LP, uLC: LC, uNL: Math.min(12, (v.lights || []).length) };

  bindTarget(R.hdr);
  gl.depthMask(true); gl.clearColor(0, 0, 0, 1); gl.clearDepth(0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.GREATER); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
  // ocean
  const ships = (v.ships || []).slice(0, 8);
  const SA = new Float32Array(32), SB = new Float32Array(32), SC = new Float32Array(32);
  ships.forEach((s, i) => { SA.set(s.a, i * 4); SB.set(s.b, i * 4); SC.set(s.c, i * 4); });
  const spl = (v.splashes || []).slice(0, 6), SP = new Float32Array(24); spl.forEach((s, i) => SP.set(s, i * 4));
  pr.water.use().set({ ...E, uVP: VP, uShipA: SA, uShipB: SB, uShipC: SC, uNS: ships.length, uSplash: SP, uNSp: spl.length });
  gl.bindVertexArray(R.water); gl.drawArrays(gl.TRIANGLES, 0, 6);
  // ships and aircraft
  pr.mesh.use().set({ ...E, uVP: VP, uHinge: [SBD.hingeZ, SBD.hingeY0, SBD.dihedral], uDeckRect: [-CARRIER.deckW / 2, CARRIER.deckZ0, CARRIER.deckW, CARRIER.deckZ1 - CARRIER.deckZ0] });
  for (const m of v.meshes || []) {
    pr.mesh.set({ uModel: m.model, uDeck: R.decks[m.deck || 0], uDamage: m.damage || [0, 0, 1, 0], uDamage2: m.damage2 || [0, 0, 1, 0],
      uCockpit: m.cockpit ? 1 : 0, uProp: m.prop ?? 0, uFlap: m.flap || 0 });
    const g = R.mesh[m.mesh];
    gl.bindVertexArray(g.vao); gl.drawArrays(gl.TRIANGLES, 0, g.count);
  }
  // sky where nothing was drawn
  gl.depthFunc(gl.GEQUAL); gl.depthMask(false);
  pr.sky.use().set({ ...E, uInvVP: invert(VP) });
  drawQuad();
  gl.depthFunc(gl.GREATER); gl.depthMask(true);
  // figures
  const figs = v.figures || new Float32Array(0), nf = figs.length / 8;
  if (nf) {
    upload(R.figDyn, figs);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    pr.fig.use().set({ ...E, uVP: VP, uRight: view.right, uCells: [4, 0.25], uAtlas: R.atlas });
    gl.bindVertexArray(R.figDyn.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, nf);
    gl.disable(gl.BLEND);
  }
  // particles (soft against the depth buffer)
  const parts = v.particles || new Float32Array(0), np = parts.length / 12;
  bindTarget(R.hdrNoDepth);
  if (np) {
    const P22 = (far + near) / (far - near), P32 = 2 * far * near / (far - near);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    upload(R.partDyn, parts);
    pr.part.use().set({ ...E, uVP: VP, uRight: view.right, uUp: view.up, uPuffs: R.puffs, uDepth: R.hdr.depth, uNearFar: [P32, P22], uRes: [FW, FH] });
    gl.bindVertexArray(R.partDyn.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, np);
    gl.disable(gl.BLEND); gl.depthMask(true);
  }
  gl.disable(gl.DEPTH_TEST);
  if (v.layer) {
    canvasTexture(v.layer.canvas, { mips: false, tex: R.layerTex, premul: true });
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    pr.layer.use().set({ uTex: R.layerTex, uGain: v.layer.gain ?? 1 });
    drawQuad();
    gl.disable(gl.BLEND);
  }
  post(v.post || {}, R.ldr[slot], 0);
  return { VP, view };
}

function post(p, out, plate) {
  const pr = R.progs;
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  bindTarget(R.half); pr.down.use().set({ uSrc: R.hdr.color, uTexel: [1 / FW, 1 / FH], uThresh: p.threshold ?? 0.6 }); drawQuad();
  bindTarget(R.q1); pr.down.use().set({ uSrc: R.half.color, uTexel: [2 / FW, 2 / FH], uThresh: 0 }); drawQuad();
  bindTarget(R.q2); pr.blur.use().set({ uSrc: R.q1.color, uDir: [4 / FW, 0] }); drawQuad();
  bindTarget(R.q1); pr.blur.use().set({ uSrc: R.q2.color, uDir: [0, 4 / FH] }); drawQuad();
  bindTarget(R.e1); pr.down.use().set({ uSrc: R.q1.color, uTexel: [4 / FW, 4 / FH], uThresh: 0 }); drawQuad();
  bindTarget(R.e2); pr.blur.use().set({ uSrc: R.e1.color, uDir: [8 / FW, 0] }); drawQuad();
  bindTarget(R.e1); pr.blur.use().set({ uSrc: R.e2.color, uDir: [0, 8 / FH] }); drawQuad();
  bindTarget(out);
  pr.grade.use().set({ uSrc: R.hdr.color, uBloom1: R.q1.color, uBloom2: R.e1.color, uExposure: p.exposure ?? 1, uBloom: p.bloom ?? 0.5,
    uLift: p.lift || [0, 0, 0], uGain: p.gain || [1, 1, 1], uGamma: p.gamma ?? 1, uSat: p.sat ?? 1, uContrast: p.contrast ?? 1,
    uPlate: R.plateTex, uPlateMix: plate, uShaftTex: R.q2.color, uShafts: 0 });
  drawQuad();
}

export function renderPlate(canvas, p, slot = 0) {
  canvasTexture(canvas, { mips: false, tex: R.plateTex, premul: false });
  bindTarget(R.hdr); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  post(p || {}, R.ldr[slot], 1);
}

export function finish(f) {
  const pr = R.progs;
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  const paint = f.paint ?? 0.2;
  if (paint > 0) {
    bindTarget(R.kuwaT);
    pr.kuwa.use().set({ uSrc: R.ldr[0].color, uPrev: R.ldr[1].color, uMix: 0, uTexel: [1 / FW, 1 / FH], uRadius: f.radius ?? 3 });
    drawQuad();
  }
  bindTarget(null);
  pr.paint.use().set({ uSrc: R.ldr[0].color, uPrev: R.ldr[1].color, uMix: 0, uKuwa: R.kuwaT.color, uPaint: paint,
    uTime: f.time, uGrain: f.grain ?? 0.03, uVignette: f.vignette ?? 0.4, uBars: f.bars ?? 0.12, uFade: f.fade ?? 1, uCanvasTex: R.weave,
    uFog: f.fog || 0, uGrey: f.grey || 0 });
  drawQuad();
}
export const __R = () => R;
