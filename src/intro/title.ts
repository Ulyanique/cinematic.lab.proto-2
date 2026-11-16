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

export async function buildTitle(fontUrl: string, text: string, targetWidth: number, tracking = 0.06) {
  const buf = await (await fetch(fontUrl)).arrayBuffer();
  const font = parseFont(buf);

  const layout = (fs: number) => {
    let x = 0;
    const items: any[] = [];
    let prev: any = null;
    for (const ch of text) {
      const g = font.charToGlyph(ch);
      if (prev) x += font.getKerningValue(prev, g) * (fs / font.unitsPerEm);
      const adv = (g.advanceWidth * fs) / font.unitsPerEm;
      if (ch !== ' ') items.push({ ch, g, x });
      prev = g;
      x += adv + tracking * fs;
    }
    return { items, width: x - tracking * fs };
  };
  const base = layout(1);
  const fs = targetWidth / base.width;
  const lay = layout(fs);
  const bevel = 0.04;
  const depth = 0.15;

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
      bevelEnabled: true,
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
  // cap height for vertical centring
  const capH = ((font.tables.os2?.sCapHeight || 700) * fs) / font.unitsPerEm;
  return { letters, capH, width: lay.width, fontSize: fs };
}
