// Plays or renders the film frame by frame.
import { initRenderer, renderView, renderPlate, finish, FW, FH } from './engine/renderer.js';
import { buildPeople } from './engine/people.js';
import { loadFonts } from './engine/overlay.js';
import { frame, TOTAL } from './film.js';

let glCanvas, ovCtx, ovCanvas, out, black;
export async function init(gl, ov) {
  glCanvas = gl; ovCanvas = ov; ovCtx = ov.getContext('2d');
  await loadFonts();
  initRenderer(glCanvas, buildPeople());
  out = document.createElement('canvas'); out.width = FW; out.height = FH;
  black = document.createElement('canvas'); black.width = 16; black.height = 16;
  const b = black.getContext('2d'); b.fillStyle = '#000'; b.fillRect(0, 0, 16, 16);
  return { total: TOTAL };
}
export function renderFrame(T) {
  const f = frame(T);
  if (f.black) renderPlate(black, { exposure: 1 }, 0);
  else renderView(f.view, 0);
  finish({ time: T, fade: f.fade ?? 1, paint: 0.14, radius: 2.5, grain: 0.032, vignette: 0.42, bars: 0.12, fog: f.fog || 0, grey: f.grey || 0 });
  ovCtx.clearRect(0, 0, FW, FH);
  f.overlay(ovCtx);
}
export function frameJPEG(T, q = 0.92) {
  renderFrame(T);
  const x = out.getContext('2d'); x.drawImage(glCanvas, 0, 0); x.drawImage(ovCanvas, 0, 0);
  return out.toDataURL('image/jpeg', q);
}
