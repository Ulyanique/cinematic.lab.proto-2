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
  start: number;
  dur: number;
}

/** Build the 3D emblem directly from the supplied vector artwork. */
export function buildLogoParts(): LogoPart[] {
  const svg = new SVGLoader().parse(logoSvg);
  const parts: LogoPart[] = [];
  // Preserve the source's aspect ratio and the position of the original emblem.
  const scale = 3.2 / 3937.77;
  svg.paths.forEach((path, index) => {
    const shapes = path.toShapes();
    if (!shapes.length) return;
    const raw = new THREE.ExtrudeGeometry(shapes, {
      depth: 140,
      bevelEnabled: true,
      bevelThickness: 22,
      bevelSize: 18,
      bevelSegments: 3,
      curveSegments: 16,
    });
    raw.translate(0, 0, -70);
    raw.scale(scale, scale, scale);
    // SVG coordinates point down. A half-turn keeps front-face winding intact.
    raw.rotateX(Math.PI);
    raw.translate(-3.2 / 2, P(0, 94).y, 0);
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
      start: 4.2 + index * 0.12,
      dur: 1.15,
    });
  });
  if (!parts.length) throw new Error('Не удалось прочитать контуры логотипа SVG');
  return parts;
}
