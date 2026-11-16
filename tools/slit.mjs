// Развёртка «время × строка кадра» по вертикальному столбцу: плавное движение кольца
// даёт ровные диагонали, стробоскоп — рваные/пунктирные полосы.
// node tools/slit.mjs [from] [to] [x]     env: CFG OUT PX=1/60
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';

const FROM = +(process.argv[2] || 7.9), TO = +(process.argv[3] || 9.6);
const COLX = +(process.argv[4] || 0.5); // доля ширины
const W = 960, H = 540, STEP = +(process.env.PX || 1 / 60);

const srv = http.createServer((q, r) => {
  let p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
  const f = path.join('dist', p);
  if (fs.existsSync(f)) { r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(fs.readFileSync(f)); }
  else { r.writeHead(404); r.end(); }
}).listen(4185);

const browser = await puppeteer.launch({
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  executablePath: await chromium.executablePath(), headless: 'shell', protocolTimeout: 900000,
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.setDefaultTimeout(900000);
await page.goto('http://localhost:4185/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__intro', { timeout: 900000 });
await new Promise((r) => setTimeout(r, 2000));
await page.addStyleTag({ content: 'button,[class*=panel]{visibility:hidden!important}' }).catch(() => {});
if (process.env.CFG) { await page.evaluate(`window.__applyConfig(${process.env.CFG})`); await new Promise((r) => setTimeout(r, 3000)); }

const res = await page.evaluate(async ({ from, to, step, colx, W, H }) => {
  const I = window.__intro;
  const gl = I.renderer.domElement;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const n = Math.floor((to - from) / step) + 1;
  const x = Math.round(W * colx);
  const out = document.createElement('canvas'); out.width = n; out.height = H;
  const octx = out.getContext('2d');
  const img = octx.createImageData(n, H);
  for (let i = 0; i < n; i++) {
    const t = from + i * step;
    I.freeze = t; I.t = t; I.update(t); I.composer.render();
    ctx.drawImage(gl, 0, 0);
    const col = ctx.getImageData(x, 0, 1, H).data;
    for (let y = 0; y < H; y++) {
      const o = y * 4, d = (y * n + i) * 4;
      img.data[d] = col[o]; img.data[d + 1] = col[o + 1]; img.data[d + 2] = col[o + 2]; img.data[d + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return { n, x, png: out.toDataURL('image/png') };
}, { from: FROM, to: TO, step: STEP, colx: COLX, W, H });

fs.mkdirSync('shots', { recursive: true });
const out = process.env.OUT || 'shots/slit.png';
fs.writeFileSync(out, Buffer.from(res.png.split(',')[1], 'base64'));
console.log(`столбец x=${res.x}, кадров=${res.n} -> ${out}`);
await browser.close(); srv.close();
