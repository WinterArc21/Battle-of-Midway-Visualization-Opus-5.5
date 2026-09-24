// Render the film: headless Chromium (SwiftShader WebGL2) draws each frame; ffmpeg encodes chunks,
// which are then joined and muxed with the soundtrack and subtitles. Resumable: finished chunks are kept.
//   node tools/render.mjs [--fps 24] [--workers 2] [--from s] [--to s] [--chunk 10] [--crf 18]
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BUILD = path.join(ROOT, 'build');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const FPS = +(args.fps || 24), WORKERS = +(args.workers || 2), CHUNK = +(args.chunk || 10), CRF = +(args.crf || 18);
const FFMPEG = process.env.FFMPEG || execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
const SEG = path.join(BUILD, 'segments');
fs.mkdirSync(SEG, { recursive: true });
const { srv, url } = await serve(ROOT);
const GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function openPage() {
  const browser = await chromium.launch({ args: GL });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`${url}/web/index.html?render`);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 300000 });
  return { browser, page };
}

const probe = await openPage();
const total = await probe.page.evaluate(() => window.film.total);
await probe.browser.close();
const nFrames = Math.ceil(total * FPS);
const f0 = Math.round(+(args.from || 0) * FPS), f1 = Math.min(nFrames, Math.round(+(args.to || total) * FPS));
const per = CHUNK * FPS;
const chunks = [];
for (let a = Math.floor(f0 / per) * per; a < f1; a += per) chunks.push([Math.max(a, f0), Math.min(a + per, f1)]);
console.log(`film ${total.toFixed(2)}s · frames ${f0}-${f1} · ${chunks.length} chunks · ${WORKERS} workers · ${FPS} fps`);
const segName = ([a, b]) => path.join(SEG, `seg_${String(a).padStart(6, '0')}_${String(b).padStart(6, '0')}.mp4`);
let next = 0, done = 0;
const started = Date.now();

async function worker(id) {
  let ctx = null;
  while (next < chunks.length) {
    const c = chunks[next++];
    const out = segName(c);
    if (fs.existsSync(out) && !args.force) { done++; continue; }
    if (!ctx) ctx = await openPage();
    const tmp = out + '.part.mp4';
    const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF), '-pix_fmt', 'yuv420p', '-g', String(FPS * 4), '-r', String(FPS), tmp]);
    ff.stderr.on('data', d => process.stderr.write(`[ff${id}] ${d}`));
    for (let f = c[0]; f < c[1]; f++) {
      const data = await ctx.page.evaluate(T => window.frameJPEG(T, 0.95), f / FPS);
      const buf = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await new Promise((res, rej) => ff.on('close', code => (code === 0 ? res() : rej(new Error('ffmpeg ' + code)))));
    fs.renameSync(tmp, out);
    done++;
    const el = (Date.now() - started) / 1000;
    console.log(`[w${id}] frames ${c[0]}-${c[1]} · ${done}/${chunks.length} · ${el.toFixed(0)}s elapsed`);
  }
  if (ctx) await ctx.browser.close();
}
await Promise.all(Array.from({ length: Math.min(WORKERS, chunks.length) }, (_, i) => worker(i)));
srv.close();

const list = path.join(SEG, 'list.txt');
fs.writeFileSync(list, chunks.map(c => `file '${segName(c)}'`).join('\n'));
const vid = path.join(BUILD, 'video.mp4');
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', vid]);
const mix = path.join(BUILD, 'mix.m4a'), srt = path.join(BUILD, 'subtitles.srt');
const out = path.resolve(ROOT, args.out || 'video/midway-1022.mp4');
fs.mkdirSync(path.dirname(out), { recursive: true });
if (fs.existsSync(mix)) {
  const t0 = f0 / FPS;
  const a = ['-y', '-loglevel', 'error', '-i', vid, '-ss', String(t0), '-i', mix];
  const withSrt = fs.existsSync(srt) && t0 === 0;
  if (withSrt) a.push('-i', srt);
  a.push('-map', '0:v', '-map', '1:a');
  if (withSrt) a.push('-map', '2:s', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng');
  a.push('-c:v', 'copy', '-c:a', 'copy', '-t', String((f1 - f0) / FPS), '-movflags', '+faststart', out);
  execFileSync(FFMPEG, a);
  console.log('film ->', out);
}
