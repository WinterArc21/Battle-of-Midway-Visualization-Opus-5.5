// Dev helper: render stills at given times.  node tools/frames.mjs outdir t1 t2 ...
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { serve } from './serve.mjs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [out, ...times] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const { srv, url } = await serve(ROOT);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('console', m => console.log('[console]', m.text()));
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto(`${url}/web/index.html?render`);
await p.waitForFunction(() => window.READY === true, null, { timeout: 120000 });
console.log('total', await p.evaluate(() => window.film.total));
if (process.env.DEBUG_ENV) await p.evaluate(e => { window.DEBUG_ENV = JSON.parse(e); }, process.env.DEBUG_ENV);
for (const t of times) {
  const t0 = Date.now();
  const d = await p.evaluate(T => window.frameJPEG(T, 0.9), +t);
  fs.writeFileSync(path.join(out, `f_${String(t).padStart(6, '0')}.jpg`), Buffer.from(d.split(',')[1], 'base64'));
  console.log(t, Date.now() - t0, 'ms');
}
await b.close(); srv.close();
