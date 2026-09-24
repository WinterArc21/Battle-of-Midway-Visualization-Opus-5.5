// Painted flight decks (256 x 2048 px, stern at the top row): wooden planking, white edge lines, elevators,
// arresting wires, a hinomaru forward and the carrier's identification kana aft (Akagi ア, Kaga カ, Soryu サ).
import { CARRIER } from './models.js';

export function buildDecks() {
  return [['ア', 0], ['カ', 1], ['サ', 2]].map(([kana, seed]) => deck(kana, seed));
}
function deck(kana, seed) {
  const W = 256, H = 2048;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const len = CARRIER.deckZ1 - CARRIER.deckZ0, wid = CARRIER.deckW;
  const Z = z => (z - CARRIER.deckZ0) / len * H, X = xx => (xx + wid / 2) / wid * W;
  let s = 1234 + seed * 99; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  // planks run fore and aft, ~0.3 m wide, with butt joints staggered
  const img = x.createImageData(W, H);
  const plankW = 0.3 / wid * W;
  const tones = []; for (let i = 0; i < 400; i++) tones.push(0.86 + rnd() * 0.22);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const pk = Math.floor(i / plankW);
    const seg = Math.floor((j + pk * 97) / 80);
    const t = tones[(pk * 13 + seg * 7) % 400];
    const edge = (i % plankW) < 0.6 ? 0.8 : 1;
    const grime = 0.93 + 0.07 * Math.sin(j * 0.013 + i * 0.05) * Math.sin(j * 0.0041);
    // tyre wear down the middle
    const wear = 1 - 0.08 * Math.exp(-(((i - W / 2) / (W * 0.18)) ** 2));
    const k = t * edge * grime * wear;
    const o = (j * W + i) * 4;
    img.data[o] = 150 * k; img.data[o + 1] = 124 * k; img.data[o + 2] = 88 * k; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  // white edge lines and a dashed centre line
  x.fillStyle = 'rgba(235,232,222,0.9)';
  x.fillRect(X(-wid / 2 + 0.6), 0, 0.35 / wid * W, H); x.fillRect(X(wid / 2 - 0.95), 0, 0.35 / wid * W, H);
  for (let z = CARRIER.deckZ0 + 8; z < CARRIER.deckZ1 - 10; z += 9) x.fillRect(X(-0.2), Z(z), 0.4 / wid * W, 4 / len * H);
  // elevators
  x.strokeStyle = 'rgba(30,24,18,0.8)'; x.lineWidth = 1.4;
  for (const [z, w, l] of [[72, 11.8, 13], [8, 12, 13], [-78, 11.8, 13]]) x.strokeRect(X(-w / 2), Z(z - l / 2), w / wid * W, l / len * H);
  // arresting wires
  x.strokeStyle = 'rgba(40,40,40,0.8)'; x.lineWidth = 1;
  for (let z = -100; z <= -30; z += 6) { x.beginPath(); x.moveTo(X(-12), Z(z)); x.lineTo(X(12), Z(z)); x.stroke(); }
  // hinomaru forward, white-bordered
  const hz = Z(92);
  x.fillStyle = '#ece8dc'; x.beginPath(); x.ellipse(X(0), hz, 4.9 / wid * W, 4.9 / len * H, 0, 0, 7); x.fill();
  x.fillStyle = '#b3241c'; x.beginPath(); x.ellipse(X(0), hz, 4.2 / wid * W, 4.2 / len * H, 0, 0, 7); x.fill();
  // the kana aft, reading from astern (bow toward the top of the reader's page)
  x.save(); x.translate(X(0), Z(-110)); x.scale(1, -1);
  x.fillStyle = 'rgba(240,238,230,0.92)'; x.font = `700 ${Math.round(8 / len * H * 1.1)}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(kana, 0, 0); x.restore();
  // oil stains and scuffs
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(30,24,18,${0.04 + rnd() * 0.08})`; x.beginPath(); x.ellipse(rnd() * W, rnd() * H, 2 + rnd() * 8, 2 + rnd() * 16, rnd() * 3, 0, 7); x.fill(); }
  return c;
}
