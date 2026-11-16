// Много кадров за один запуск страницы + диагностика геометрии.
// node tools/frames.mjs 4.75,8,11 tag 1280 720      (после npm run build)
// env: CLIP=x,y,w,h  DSF=2  CFG='{...}'  GEO=1 (только проверка геометрии)  V=1 (все логи консоли)
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const times = (process.argv[2] || '0.5,4.6,8').split(',').filter(Boolean);
const tag = process.argv[3] || 'a';
const W = +(process.argv[4] || 1280), H = +(process.argv[5] || 720);
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/') p = '/index.html'; const f = path.join('dist', p); if (fs.existsSync(f)) { r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(fs.readFileSync(f)); } else { r.writeHead(404); r.end(); } }).listen(4173);
const browser = await puppeteer.launch({ args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], executablePath: await chromium.executablePath(), headless: 'shell', defaultViewport: { width: W, height: H, deviceScaleFactor: +(process.env.DSF || 1) } });
fs.mkdirSync('shots', { recursive: true });
const page = await browser.newPage();
page.setDefaultTimeout(300000);
page.on('console', (m) => { if (m.type() !== 'log' || process.env.V) console.log('[console]', m.type(), m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:4173/?t=${times[0] || 0}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__intro', { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
await page.addStyleTag({ content: 'button,[class*=panel]{visibility:hidden!important}' }).catch(() => {});
if (process.env.CFG) { await page.evaluate(`window.__applyConfig(${process.env.CFG})`); await new Promise((r) => setTimeout(r, 4000)); }

if (process.env.GEO) {
  const fonts = (process.env.FONTS || '').split(',').filter(Boolean);
  if (!fonts.length) fonts.push('');
  for (const f of fonts) {
    if (f) {
      await page.evaluate(`window.__applyConfig({layers:{title:{font:${JSON.stringify(f)},text:${JSON.stringify(process.env.TEXT || 'ЁЩЪЫЖФЯЙ Abgqs&@%')}}}})`);
      await new Promise((r) => setTimeout(r, 6000));
    }
    const rep = await page.evaluate(() => {
      const I = window.__intro;
      const meshes = [...I.logoMeshes.map((m, i) => ({ n: 'logo' + i, g: m.geometry })), ...I.letterMeshes.map((l, i) => ({ n: 'let' + i, g: l.mesh.geometry }))];
      const out = [];
      for (const { n, g } of meshes) {
        const pos = g.attributes.position, idx = g.index;
        const cnt = idx ? idx.count : pos.count;
        const key = (i) => { const q = 1e6; return Math.round(pos.getX(i) * q) + ',' + Math.round(pos.getY(i) * q) + ',' + Math.round(pos.getZ(i) * q); };
        const edges = new Map(); let degen = 0, tris = 0, tiny = 0;
        for (let i = 0; i < cnt; i += 3) {
          const ids = [0, 1, 2].map((k) => (idx ? idx.getX(i + k) : i + k));
          const ks = ids.map(key);
          tris++;
          const P = ids.map((j) => [pos.getX(j), pos.getY(j), pos.getZ(j)]);
          const u = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], v = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
          const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
          const a = Math.hypot(...cr) / 2;
          if (ks[0] === ks[1] || ks[1] === ks[2] || ks[0] === ks[2] ) { degen++; continue; } if (a < 1e-12) tiny++;
          for (let e = 0; e < 3; e++) { const a1 = ks[e], b1 = ks[(e + 1) % 3]; const k = a1 < b1 ? a1 + '|' + b1 : b1 + '|' + a1; const dir = a1 < b1 ? 1 : -1; const rec = edges.get(k) || { n: 0, s: 0 }; rec.n++; rec.s += dir; edges.set(k, rec); }
        }
        let open = 0, over = 0, flip = 0; const cls = { front: 0, back: 0, wall: 0 };
        g.computeBoundingBox(); const zmx = g.boundingBox.max.z, zmn = g.boundingBox.min.z;
        for (const [k, r] of edges.entries()) { if (r.n === 1) { open++; (window.__dbg = window.__dbg || []).length < 4 && window.__dbg.push(n + ' ' + k); const [a, b] = k.split('|').map((s) => +s.split(',')[2] / 1e4); if (Math.abs(a - zmx) < 2e-4 && Math.abs(b - zmx) < 2e-4) cls.front++; else if (Math.abs(a - zmn) < 2e-4 && Math.abs(b - zmn) < 2e-4) cls.back++; else cls.wall++; } else if (r.n > 2) over++; else if (r.s !== 0) flip++; }
        out.push({ n, tris, degen, tiny, open, over, flip, cls });
      }
      return out;
    });
  
    console.log(JSON.stringify(await page.evaluate('window.__dbg||[]')));
    const bad = rep.filter((r) => r.degen > 20 || r.open || r.over || r.flip);
    console.log('GEO', f || 'default', 'meshes:', rep.length, 'bad:', bad.length, 'degenTotal:', rep.reduce((s, r) => s + r.degen, 0));
    bad.slice(0, 10).forEach((r) => console.log(JSON.stringify(r)));
  }
  await browser.close(); srv.close(); process.exit(0);
}

for (const t of times) {
  await page.evaluate(`window.__intro.freeze=${t}`);
  await new Promise((r) => setTimeout(r, 1500));
  const clips = (process.env.CLIP || '').split(';').filter(Boolean);
  if (!clips.length) clips.push('');
  let ci = 0;
  for (const c of clips) {
    const opt = { path: `shots/${tag}_${t}${clips.length > 1 ? '_' + ci : ''}.png` };
    if (c) { const [x, y, w, h] = c.split(',').map(Number); opt.clip = { x, y, width: w, height: h }; }
    await page.screenshot(opt); ci++;
  }
  console.log('shot', t);
}
await browser.close(); srv.close();
