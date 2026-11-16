// @ts-nocheck
import * as THREE from 'three';
import { parse as parseFont } from 'opentype.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Letter {
  char: string;
  geometry: THREE.BufferGeometry;
  center: THREE.Vector3; // final centre in title space
  size: THREE.Vector3;
}

const fontCache = new Map<string, Promise<any>>();
function loadFont(url: string) {
  if (!fontCache.has(url)) {
    fontCache.set(
      url,
      fetch(url).then(async (r) => {
        if (!r.ok) throw new Error(`Не удалось загрузить шрифт: ${r.status}`);
        return parseFont(await r.arrayBuffer());
      })
    );
  }
  return fontCache.get(url)!;
}

export interface TitleOpts { tracking: number; depth: number; bevel: number }

/** Строит 3D-буквы. `fontUrls` — подмножества одного шрифта (кириллица + латиница). */
export async function buildTitle(fontUrls: string[], text: string, targetWidth: number, opts: TitleOpts) {
  const fonts = await Promise.all(fontUrls.map(loadFont));
  const main = fonts[0];
  const { tracking, depth, bevel } = opts;
  const pick = (ch: string) => fonts.find((f) => f.charToGlyphIndex(ch) > 0) ?? main;

  const layout = (fs: number) => {
    let x = 0;
    const items: any[] = [];
    let prev: any = null, prevFont: any = null;
    for (const ch of text) {
      const font = pick(ch);
      const g = font.charToGlyph(ch);
      if (prev && prevFont === font) x += font.getKerningValue(prev, g) * (fs / font.unitsPerEm);
      const adv = ((g.advanceWidth || font.unitsPerEm * 0.3) * fs) / font.unitsPerEm;
      if (ch !== ' ' && ch !== '\n') items.push({ ch, g, x });
      prev = g; prevFont = font;
      x += adv + tracking * fs;
    }
    return { items, width: Math.max(0.0001, x - tracking * fs) };
  };
  const base = layout(1);
  const fs = targetWidth / base.width;
  const lay = layout(fs);

  const letters: Letter[] = [];
  for (const it of lay.items) {
    const path = it.g.getPath(it.x, 0, fs);
    const sp = new THREE.ShapePath();
    for (const c of path.commands) {
      if (c.type === 'M') sp.moveTo(c.x, -c.y);
      else if (c.type === 'L') sp.lineTo(c.x, -c.y);
      else if (c.type === 'Q') sp.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
      else if (c.type === 'C') sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
    }
    const shapes = sp.toShapes();
    if (!shapes.length) continue;
    const g0 = new THREE.ExtrudeGeometry(shapes, {
      depth,
      bevelEnabled: bevel > 0.001,
      bevelThickness: bevel,
      bevelSize: bevel * 0.8,
      bevelSegments: 5,
      curveSegments: 14,
    });
    g0.translate(-lay.width / 2, 0, -depth / 2);
    const g = toCreasedNormals(g0, 0.5);
    g0.dispose();
    g.computeBoundingBox();
    const bb = g.boundingBox;
    letters.push({
      char: it.ch,
      geometry: g,
      center: bb.getCenter(new THREE.Vector3()),
      size: bb.getSize(new THREE.Vector3()),
    });
  }
  const capH = ((main.tables.os2?.sCapHeight || 700) * fs) / main.unitsPerEm;
  return { letters, capH, width: lay.width, fontSize: fs };
}
