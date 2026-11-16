import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import logoSvg from '../assets/logo.svg?raw';

/** Pixel coordinates from the original 1280×720 composition to world units. */
export const P = (x: number, y: number) => new THREE.Vector2((x - 640) / 80, (360 - y) / 80);

export interface LogoPart {
  name: string;
  geometry: THREE.BufferGeometry;
  z: number;
  center: THREE.Vector3;
  size: THREE.Vector3;
  dir: THREE.Vector3;
}

export interface LogoOpts { svg?: string; size: number; depth: number; bevel: number }

/** Build the 3D emblem directly from vector artwork (built-in or user-supplied SVG). */
export function buildLogoParts(opts: LogoOpts): LogoPart[] {
  const src = opts.svg && opts.svg.trim().startsWith('<') ? opts.svg : logoSvg;
  let svg;
  try {
    svg = new SVGLoader().parse(src);
  } catch {
    svg = new SVGLoader().parse(logoSvg);
  }
  const vb = /viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)/.exec(src);
  const raws: { g: THREE.BufferGeometry }[] = [];
  const depth = opts.depth;
  svg.paths.forEach((path) => {
    const shapes = path.toShapes();
    if (!shapes.length) return;
    const g = new THREE.ExtrudeGeometry(shapes, {
      depth,
      bevelEnabled: opts.bevel > 0.5,
      bevelThickness: opts.bevel,
      bevelSize: opts.bevel * 0.82,
      bevelSegments: 3,
      curveSegments: 16,
    });
    g.translate(0, 0, -depth / 2);
    raws.push({ g });
  });
  if (!raws.length) throw new Error('Не удалось прочитать контуры логотипа SVG');

  // origin/width: viewBox, иначе габариты контуров
  const all = new THREE.Box3();
  raws.forEach(({ g }) => { g.computeBoundingBox(); all.union(g.boundingBox!); });
  const ox = vb ? parseFloat(vb[1]) : all.min.x;
  const oy = vb ? parseFloat(vb[2]) : all.min.y;
  const w = vb ? parseFloat(vb[3]) : all.max.x - all.min.x;
  const scale = opts.size / (w || 1);

  const parts: LogoPart[] = [];
  raws.forEach(({ g: raw }, index) => {
    raw.translate(-ox, -oy, 0);
    raw.scale(scale, scale, scale);
    // SVG coordinates point down. A half-turn keeps front-face winding intact.
    raw.rotateX(Math.PI);
    raw.translate(-opts.size / 2, P(0, 94).y, 0);
    const geometry = toCreasedNormals(raw, 0.55);
    raw.dispose();
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    parts.push({
      name: `svg-${index}`,
      geometry,
      z: 0,
      center: bb.getCenter(new THREE.Vector3()),
      size: bb.getSize(new THREE.Vector3()),
      dir: new THREE.Vector3(0, -1, 0),
    });
  });
  return parts;
}
