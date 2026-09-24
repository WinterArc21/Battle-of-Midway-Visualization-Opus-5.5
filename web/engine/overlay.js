// Typography, the altitude read-out, the telescopic sight's mask and reticle, cockpit gauges.
import { FW, FH } from './renderer.js';

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const fadeIO = (t, t0, t1, f = 0.5) => clamp((t - t0) / f) * clamp((t1 - t) / f);
export const BAR = 0.12 * FH;

export async function loadFonts() {
  for (const [fam, url, weight, style] of [
    ['Cormorant SC', '../assets/fonts/CormorantSC-Medium.ttf', '500'], ['Cormorant SC', '../assets/fonts/CormorantSC-Bold.ttf', '700'],
    ['EB Garamond', '../assets/fonts/EBGaramond-Regular.ttf', '400'], ['EB Garamond', '../assets/fonts/EBGaramond-Italic.ttf', '400', 'italic'],
    ['EB Garamond', '../assets/fonts/EBGaramond-SemiBold.ttf', '600'],
  ]) { const f = new FontFace(fam, `url(${url})`, { weight, style: style || 'normal' }); await f.load(); document.fonts.add(f); }
}
function spaced(ctx, text, x, y, sp, align = 'center') {
  const w = [...text].reduce((s, c) => s + ctx.measureText(c).width, 0) + sp * (text.length - 1);
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  for (const c of text) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + sp; }
}
export function caption(ctx, text, a, { y = FH - BAR - 64, size = 42, italic = true } = {}) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = italic ? `italic 400 ${size}px "EB Garamond"` : `500 ${size}px "Cormorant SC"`;
  ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 16; ctx.fillStyle = '#f1ece2';
  const lines = Array.isArray(text) ? text : [text];
  lines.forEach((l, i) => ctx.fillText(l, FW / 2, y + i * size * 1.25 - (lines.length - 1) * size * 1.25));
  ctx.restore();
}
export function spoken(ctx, text, who, a, { y = FH / 2 + 40, size = 84, color = '#f4efe6' } = {}) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 30; ctx.fillStyle = color;
  ctx.font = `700 ${size}px "Cormorant SC"`;
  spaced(ctx, text, FW / 2, y, size * 0.06);
  if (who) { ctx.font = `italic 400 ${size * 0.34}px "EB Garamond"`; ctx.fillStyle = 'rgba(236,230,218,0.88)'; ctx.textAlign = 'center'; ctx.fillText(who, FW / 2, y + size * 0.62); }
  ctx.restore();
}
export function stamp(ctx, text, a, { y = BAR + 64, size = 30, color = '#e2dacb' } = {}) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color; ctx.font = `500 ${size}px "Cormorant SC"`; ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 12;
  spaced(ctx, text, FW / 2, y, size * 0.24); ctx.restore();
}
export function title(ctx, big, sub, a, { y = FH / 2 + 10 } = {}) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 40; ctx.fillStyle = '#f2ece2';
  ctx.font = '500 160px "Cormorant SC"'; spaced(ctx, big, FW / 2, y, 44);
  ctx.font = '500 42px "Cormorant SC"'; ctx.fillStyle = '#d9cfbf'; spaced(ctx, sub, FW / 2, y + 92, 14);
  ctx.restore();
}

// the altitude, unwinding: the dive's clock
export function altitude(ctx, feet, a, { hot = 0, x = FW - 120, y = BAR + 118, size = 96 } = {}) {
  if (a <= 0) return;
  const f = Math.max(0, Math.round(feet / 10) * 10);
  const txt = f.toLocaleString('en-US');
  ctx.save(); ctx.globalAlpha *= a; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  const col = [241 + 14 * hot, 236 - 150 * hot, 226 - 180 * hot].map(Math.round);
  ctx.shadowColor = hot > 0.3 ? `rgba(160,0,0,${0.5 * hot})` : 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 24;
  ctx.font = `500 ${size}px "Cormorant SC"`; ctx.fillStyle = `rgb(${col.join(',')})`;
  const w = ctx.measureText(' FT').width * 0.5;
  ctx.fillText(txt, x - w * 1.25, y);
  ctx.font = `500 ${size * 0.36}px "Cormorant SC"`; ctx.fillText('FT', x, y);
  ctx.shadowBlur = 0; ctx.font = '500 20px "Cormorant SC"'; ctx.fillStyle = 'rgba(241,236,226,0.72)';
  spaced(ctx, 'ALTITUDE', x, y + 34, 6, 'right');
  ctx.restore();
}

// the view through the Mk III telescopic sight: black tube, a lit field, the reticle
export function scopeMask(ctx, a, { r = FH * 0.36, cx = FW / 2, cy = FH / 2, jitter = [0, 0] } = {}) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  const X = cx + jitter[0], Y = cy + jitter[1];
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.rect(0, 0, FW, FH); ctx.arc(X, Y, r, 0, Math.PI * 2, true); ctx.fill('evenodd');
  const g = ctx.createRadialGradient(X, Y, r * 0.78, X, Y, r * 1.005);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.8, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, r * 1.01, 0, Math.PI * 2); ctx.fill();
  // reticle: crosshair with a gap, a ring, range ticks
  ctx.strokeStyle = 'rgba(8,8,8,0.9)'; ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(X - r, Y); ctx.lineTo(X - r * 0.08, Y); ctx.moveTo(X + r * 0.08, Y); ctx.lineTo(X + r, Y);
  ctx.moveTo(X, Y - r); ctx.lineTo(X, Y - r * 0.08); ctx.moveTo(X, Y + r * 0.08); ctx.lineTo(X, Y + r);
  ctx.stroke();
  ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(X, Y, r * 0.42, 0, Math.PI * 2); ctx.stroke();
  for (let i = 1; i <= 6; i++) { const d = r * 0.12 * i; ctx.beginPath(); ctx.moveTo(X - 7, Y + d); ctx.lineTo(X + 7, Y + d); ctx.moveTo(X + d, Y - 7); ctx.lineTo(X + d, Y + 7); ctx.moveTo(X - d, Y - 7); ctx.lineTo(X - d, Y + 7); ctx.stroke(); }
  ctx.fillStyle = 'rgba(8,8,8,0.9)'; ctx.beginPath(); ctx.arc(X, Y, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// a round gauge on the instrument panel, placed where the panel projects on screen
export function gauge(ctx, c, rad, value, { label = '', ticks = 10, a = 1, needle2 = null, light = 1 } = {}) {
  if (!c || a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  const [x, y] = c;
  ctx.fillStyle = '#0b0b0c'; ctx.beginPath(); ctx.arc(x, y, rad * 1.12, 0, 7); ctx.fill();
  const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.4, 1, x, y, rad);
  g.addColorStop(0, `rgba(${40 * light},${40 * light},${42 * light},1)`); g.addColorStop(1, '#070707');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
  ctx.strokeStyle = `rgba(${220 * light},${215 * light},${190 * light},0.85)`; ctx.lineWidth = Math.max(1, rad * 0.035);
  for (let i = 0; i < ticks; i++) { const an = i / ticks * Math.PI * 2 - Math.PI / 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * rad * 0.78, y + Math.sin(an) * rad * 0.78); ctx.lineTo(x + Math.cos(an) * rad * 0.93, y + Math.sin(an) * rad * 0.93); ctx.stroke(); }
  ctx.fillStyle = `rgba(${220 * light},${215 * light},${190 * light},0.9)`; ctx.font = `600 ${Math.max(7, rad * 0.22)}px "EB Garamond"`; ctx.textAlign = 'center';
  for (let i = 0; i < ticks; i++) { const an = i / ticks * Math.PI * 2 - Math.PI / 2; ctx.fillText(String(i), x + Math.cos(an) * rad * 0.6, y + Math.sin(an) * rad * 0.6 + rad * 0.08); }
  if (label) { ctx.font = `600 ${Math.max(6, rad * 0.15)}px "EB Garamond"`; ctx.fillText(label, x, y + rad * 0.38); }
  const hand = (v, len, w) => { const an = v * Math.PI * 2 - Math.PI / 2; ctx.strokeStyle = `rgba(${235 * light},${230 * light},${205 * light},1)`; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(an) * rad * len, y + Math.sin(an) * rad * len); ctx.stroke(); };
  hand(value, 0.82, Math.max(1.5, rad * 0.05));
  if (needle2 !== null) hand(needle2, 0.52, Math.max(2, rad * 0.08));
  ctx.restore();
}
