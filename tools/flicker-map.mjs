// Мигание = высокочастотная составляющая яркости по времени (плавное появление слоя — не мигание).
// Для каждого пикселя берём временной ряд, сглаживаем, остаток = |реальное - сглаженное|.
// node tools/flicker-map.mjs [from] [to] [W] [H] [step]
// env: CFG='{...}'  OUT=shots/x.png  ONLY=1 (только число, без карты)
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';

const FROM = +(process.argv[2] || 7.6), TO = +(process.argv[3] || 9.6);
const W = +(process.argv[4] || 960), H = +(process.argv[5] || 540);
const STEP = +(process.argv[6] || 1 / 60);
const GW = 240, GH = 135; // разрешение анализа

const srv = http.createServer((q, r) => {
  let p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
  const f = path.join('dist', p);
  if (fs.existsSync(f)) { r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(fs.readFileSync(f)); }
  else { r.writeHead(404); r.end(); }
}).listen(4182);

const browser = await puppeteer.launch({
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  executablePath: await chromium.executablePath(), headless: 'shell',
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.setDefaultTimeout(900000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4182/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__intro', { timeout: 900000 });
await new Promise((r) => setTimeout(r, 2000));
await page.addStyleTag({ content: 'button,[class*=panel]{visibility:hidden!important}' }).catch(() => {});
if (process.env.CFG) { await page.evaluate(`window.__applyConfig(${process.env.CFG})`); await new Promise((r) => setTimeout(r, 3000)); }

const res = await page.evaluate(async ({ from, to, step, gw, gh }) => {
  const I = window.__intro;
  const gl = I.renderer.domElement;
  const c = document.createElement('canvas'); c.width = gw; c.height = gh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const frames = [];
  const times = [];
  for (let t = from; t <= to + 1e-9; t += step) {
    I.freeze = t; I.t = t; I.update(t); I.composer.render();
    ctx.drawImage(gl, 0, 0, gw, gh);
    const px = ctx.getImageData(0, 0, gw, gh).data;
    const lum = new Float32Array(gw * gh);
    for (let i = 0, k = 0; i < px.length; i += 4, k++) lum[k] = (px[i] + px[i + 1] + px[i + 2]) / 765;
    frames.push(lum);
    times.push(+t.toFixed(3));
  }
  const n = frames.length, np = gw * gh;
  // сглаживание по времени (окно 7 кадров ≈ 0.117 с при 60 Гц): всё, что быстрее — мигание
  const RAD = 3;
  const resid = new Float32Array(np);
  const worst = new Float32Array(n);
  for (let k = 0; k < np; k++) {
    for (let f = 0; f < n; f++) {
      let s = 0, wsum = 0;
      for (let d = -RAD; d <= RAD; d++) {
        const j = f + d; if (j < 0 || j >= n) continue;
        const w = Math.exp(-(d * d) / (2 * 2.0 * 2.0));
        s += frames[j][k] * w; wsum += w;
      }
      const r = Math.abs(frames[f][k] - s / wsum);
      resid[k] += r;
      if (r > worst[f]) worst[f] = r;
    }
    resid[k] /= n;
  }
  // карта
  const out = document.createElement('canvas'); out.width = gw; out.height = gh;
  const octx = out.getContext('2d');
  const img = octx.createImageData(gw, gh);
  let maxv = 0;
  for (let k = 0; k < np; k++) if (resid[k] > maxv) maxv = resid[k];
  for (let k = 0; k < np; k++) {
    const v = maxv ? resid[k] / maxv : 0;
    img.data[k * 4] = Math.min(255, 255 * Math.pow(v, 0.5));
    img.data[k * 4 + 1] = Math.min(255, 255 * Math.pow(v, 1.8) * 0.5);
    img.data[k * 4 + 2] = Math.min(255, 90 * Math.pow(v, 3));
    img.data[k * 4 + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  let mean = 0; for (let k = 0; k < np; k++) mean += resid[k];
  let wf = 0, wt = 0;
  for (let f = 0; f < n; f++) if (worst[f] > wf) { wf = worst[f]; wt = times[f]; }
  // доля «шумных» пикселей: остаток больше 1 % яркости
  let noisy = 0; for (let k = 0; k < np; k++) if (resid[k] > 0.01) noisy++;
  return { frames: n, mean: mean / np, maxv, noisy: noisy / np, worstFrame: wt, worst: wf, png: out.toDataURL('image/png') };
}, { from: FROM, to: TO, step: STEP, gw: GW, gh: GH });

console.log(`кадров=${res.frames}  средний остаток=${res.mean.toFixed(5)}  макс=${res.maxv.toFixed(4)}  шумных пикселей=${(res.noisy * 100).toFixed(1)}%  худший кадр t=${res.worstFrame} (${res.worst.toFixed(4)})`);
if (process.env.ONLY !== '1') {
  fs.mkdirSync('shots', { recursive: true });
  const out = process.env.OUT || 'shots/flicker-map.png';
  fs.writeFileSync(out, Buffer.from(res.png.split(',')[1], 'base64'));
  console.log('карта ->', out);
}
await browser.close(); srv.close();
