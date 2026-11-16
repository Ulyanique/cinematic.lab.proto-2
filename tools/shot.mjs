import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const times = (process.argv[2]||'0.5,4.6,8').split(',');
const tag = process.argv[3]||'a';
const W = +(process.argv[4]||1280), H = +(process.argv[5]||720);
const srv = http.createServer((q,r)=>{ let p=q.url.split('?')[0]; if(p==='/')p='/index.html'; const f=path.join('dist',p); if(fs.existsSync(f)){r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html':'application/octet-stream'});r.end(fs.readFileSync(f));}else{r.writeHead(404);r.end();}}).listen(4173);
const browser = await puppeteer.launch({ args:[...chromium.args,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'], executablePath: await chromium.executablePath(), headless: 'shell', defaultViewport:{width:W,height:H,deviceScaleFactor:+(process.env.DSF||1)}});
fs.mkdirSync('shots',{recursive:true});
for (const t of times){
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  page.on('console', m=>{ if(m.type()!=='log'||process.env.V) console.log('[console]',m.type(),m.text().slice(0,300)); });
  page.on('pageerror', e=>console.log('[pageerror]',e.message));
  await page.goto(`http://localhost:4173/?t=${t}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction('window.__intro',{timeout:120000});
  await new Promise(r=>setTimeout(r,2500));
  await page.addStyleTag({content:'button,[class*=panel]{visibility:hidden!important}'}).catch(()=>{});
  await new Promise(r=>setTimeout(r,800));
  if(process.env.CFG){ await page.evaluate(`window.__applyConfig(${process.env.CFG})`); await new Promise(r=>setTimeout(r,3500)); }
  const opt={path:`shots/${tag}_${t}.png`}; if(process.env.CLIP){const [x,y,w,h]=process.env.CLIP.split(',').map(Number); opt.clip={x,y,width:w,height:h};}
  await page.screenshot(opt);
  console.log('shot',t);
  await page.close();
}
await browser.close(); srv.close();
