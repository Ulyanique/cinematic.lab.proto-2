// @ts-nocheck
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** pixel (1280x720 reference) -> world units */
export const P = (x: number, y: number) => new THREE.Vector2((x - 640) / 80, (360 - y) / 80);

function poly(pts: number[][]) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => {
    const p = P(x, y);
    i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y);
  });
  s.closePath();
  return s;
}

function roundRect(x0: number, y0: number, x1: number, y1: number, r: number) {
  const a = P(x0, y0), b = P(x1, y1);
  const rr = r / 80;
  const x = a.x, y = b.y, w = b.x - a.x, h = a.y - b.y;
  const s = new THREE.Shape();
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.absarc(x + w - rr, y + rr, rr, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - rr);
  s.absarc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(x + rr, y + h);
  s.absarc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + rr);
  s.absarc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5, false);
  return s;
}

function leg(tx: number, ty: number, fx: number, fy: number, wt: number, wf: number, taper: number) {
  const dx = fx - tx, dy = fy - ty;
  const L = Math.hypot(dx, dy);
  const d = [dx / L, dy / L];
  const n = [-d[1], d[0]];
  const f2 = [fx - d[0] * taper, fy - d[1] * taper];
  return poly([
    [tx + (n[0] * wt) / 2, ty + (n[1] * wt) / 2],
    [f2[0] + (n[0] * wf) / 2, f2[1] + (n[1] * wf) / 2],
    [fx, fy],
    [f2[0] - (n[0] * wf) / 2, f2[1] - (n[1] * wf) / 2],
    [tx - (n[0] * wt) / 2, ty - (n[1] * wt) / 2],
  ]);
}

function extrude(shape: THREE.Shape, depth = 0.12, bevel = 0.03) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.9,
    bevelSegments: 5,
    curveSegments: 28,
  });
  g.translate(0, 0, -depth / 2);
  const out = toCreasedNormals(g, 0.55);
  g.dispose();
  return out;
}

export interface LogoPart {
  name: string;
  geometry: THREE.BufferGeometry;
  z: number;
  center: THREE.Vector3;
  size: THREE.Vector3;
  dir: THREE.Vector3;
  start: number; // reveal start time
  dur: number;
}

export function buildLogoParts(): LogoPart[] {
  const parts: LogoPart[] = [];
  const add = (name: string, shape: THREE.Shape, z: number, dir: number[], start: number, dur: number, depth = 0.12, bevel = 0.03) => {
    const geometry = extrude(shape, depth, bevel);
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    const center = bb.getCenter(new THREE.Vector3());
    const size = bb.getSize(new THREE.Vector3());
    parts.push({ name, geometry, z, center, size, dir: new THREE.Vector3(...dir), start, dur });
  };

  // needle / handle with slit
  const needle = poly([[631, 105], [640, 94], [649, 105], [650, 152], [630, 152]]);
  const slit = new THREE.Path();
  [[638.5, 111], [641.5, 111], [641.5, 136], [638.5, 136]].forEach(([x, y], i) => {
    const p = P(x, y);
    i ? slit.lineTo(p.x, p.y) : slit.moveTo(p.x, p.y);
  });
  slit.closePath();
  needle.holes.push(slit);
  add('needle', needle, 0, [0, -1, 0], 4.15, 0.9, 0.1, 0.025);

  // hinge ring
  const rc = P(640, 168);
  const ring = new THREE.Shape();
  ring.absarc(rc.x, rc.y, 38 / 80, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(rc.x, rc.y, 22 / 80, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  add('ring', ring, 0.02, [0, -1, 0], 4.2, 1.0, 0.16, 0.035);

  // lightning bolt inside the ring
  const bolt = poly([[646, 154], [630, 171], [638.5, 171], [633, 186], [651, 166], [642, 166], [650, 154]]);
  add('bolt', bolt, 0.0, [0, -1, 0], 4.5, 0.8, 0.06, 0.015);

  // legs
  add('legL', leg(633, 196, 558, 367, 44, 26, 90), 0.04, [0, -1, 0], 4.3, 1.25, 0.14, 0.035);
  add('legR', leg(647, 196, 722, 367, 44, 26, 90), 0.05, [0, -1, 0], 4.38, 1.25, 0.14, 0.035);

  // crossbar with collars and centre tab
  add('bar', roundRect(510, 274, 766, 306, 16), -0.02, [1, 0, 0], 4.9, 1.1, 0.12, 0.03);
  add('collarL', roundRect(541, 268, 553, 312, 5), 0.0, [0, -1, 0], 5.35, 0.6, 0.17, 0.025);
  add('collarR', roundRect(727, 268, 739, 312, 5), 0.0, [0, -1, 0], 5.4, 0.6, 0.17, 0.025);
  add('tab', roundRect(631, 266, 645, 318, 4), 0.1, [0, -1, 0], 5.45, 0.6, 0.12, 0.025);
  return parts;
}
