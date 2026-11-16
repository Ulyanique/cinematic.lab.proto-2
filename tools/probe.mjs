// Проверка «чёрных кадров»: играет ролик в портативном Chromium и пишет среднюю яркость кадра.
// Используется как регрессионный тест после правок таймлайна и пост-обработки.
//
//   npm run build
//   node tools/probe.mjs                     # проигрывание, 20 с
//   node tools/probe.mjs 640 360 40          # ширина, высота, длительность
//   MODE=freeze TIMES=0.5,4.5,6 node tools/probe.mjs   # покадровые «стопы» в заданных точках
//
// env: CFG='{...}' — применить настройки перед прогоном; LOOP=0 — не включать зацикливание.
// Выход с кодом 1, если найден хоть один полностью чёрный кадр (для CI).
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';

const W = +(process.argv[2] || 640), H = +(process.argv[3] || 360), DUR = +(process.argv[4] || 20);

const srv = http.createServer((q, r) => {
  let p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
  const f = path.join('dist', p);
  if (fs.existsSync(f)) { r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(fs.readFileSync(f)); }
  else { r.writeHead(404); r.end(); }
}).listen(4179);

const browser = await puppeteer.launch({
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  executablePath: await chromium.executablePath(), headless: 'shell',
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.setDefaultTimeout(600000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4179/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__intro', { timeout: 600000 });
await new Promise((r) => setTimeout(r, 2000));
await page.addStyleTag({ content: 'button,[class*=panel]{visibility:hidden!important}' }).catch(() => {});
if (process.env.CFG) { await page.evaluate(`window.__applyConfig(${process.env.CFG})`); await new Promise((r) => setTimeout(r, 3000)); }

// Сэмплер живёт в странице: замер на каждом кадре, без round-trip'ов (иначе софтверный GL «проседает»).
await page.evaluate((loop) => {
  const I = window.__intro;
  const c = document.createElement('canvas'); c.width = 48; c.height = 27;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  window.__log = [];
  const lum = () => {
    ctx.drawImage(I.renderer.domElement, 0, 0, 48, 27);
    const d = ctx.getImageData(0, 0, 48, 27).data;
    let s = 0, mx = 0;
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 765; s += l; if (l > mx) mx = l; }
    return [s / (d.length / 4), mx];
  };
  const prev = I.onFrame;
  I.onFrame = (t) => {
    prev?.(t);
    if (window.__log.length > 5000) window.__log.shift();
    const [avg, mx] = lum();
    const F = I.fp.uniforms;
    window.__log.push({ t, avg, mx, fade: F.uFade.value, open: F.uOpen.value, w: I.renderer.domElement.width, h: I.renderer.domElement.height });
  };
  if (loop) window.__applyConfig({ general: { loop: true } });
}, process.env.LOOP !== '0');
await new Promise((r) => setTimeout(r, 1500));

const BLACK = 0.012;
let black = 0, total = 0;

if (process.env.MODE === 'freeze') {
  const times = (process.env.TIMES || '0.1,0.5,2,3,4,4.4,4.6,6,8,10,12,13').split(',').map(Number);
  console.log('    t     avg     max   fade   open  size');
  for (const t of times) {
    await page.evaluate((t) => { window.__log = []; const I = window.__intro; I.freeze = t; I.t = t; I.update(t); I.composer.render(); }, t);
    await new Promise((r) => setTimeout(r, 700));
    const r = await page.evaluate(() => window.__log[window.__log.length - 1] || null);
    if (!r) continue;
    if (r.avg < BLACK) black++;
    total++;
    console.log(`${r.t.toFixed(2).padStart(5)} ${r.avg.toFixed(4)} ${r.mx.toFixed(3)} ${r.fade.toFixed(2).padStart(6)} ${r.open.toFixed(3).padStart(6)} ${r.w}x${r.h}${r.avg < BLACK ? '  <-- ЧЁРНЫЙ' : ''}`);
  }
} else {
  console.log(`# проигрывание ${DUR} с @ ${W}×${H}`);
  await page.evaluate(() => { window.__log = []; window.__intro.play(0); });
  await new Promise((r) => setTimeout(r, DUR * 1000));
  const log = await page.evaluate(() => window.__log);
  let prevSize = '';
  for (const r of log) {
    total++;
    if (r.avg < BLACK) black++;
    const size = r.w + 'x' + r.h;
    // печатаем только тёмные кадры, переаллокации и каждый 10-й кадр — иначе шумно
    const interesting = r.avg < 0.05 || size !== prevSize;
    if (interesting) console.log(`t=${r.t.toFixed(2).padStart(6)} avg=${r.avg.toFixed(4)} max=${r.mx.toFixed(3)} fade=${r.fade.toFixed(2)} open=${r.open.toFixed(3)} ${size}${size !== prevSize ? ' (resize)' : ''}${r.avg < BLACK ? '  <-- ЧЁРНЫЙ' : ''}`);
    prevSize = size;
  }
  const darks = log.filter((r) => r.avg < BLACK).map((r) => r.t.toFixed(2));
  console.log(`# кадров=${total} чёрных=${black}${darks.length ? ' -> ' + darks.join(' ') : ''}`);
}

console.log(black ? `FAIL: чёрных кадров ${black}/${total}` : `OK: чёрных кадров нет (${total} замеров)`);
await browser.close(); srv.close();
process.exit(black ? 1 : 0);
