// @ts-nocheck
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import '@fontsource/forum/cyrillic-400.css';
import '@fontsource/forum/latin-400.css';
import prataUrl from '@fontsource/prata/files/prata-cyrillic-400-normal.woff?url';

import {
  bgVert, bgFrag, dustVert, dustFrag, swarmVert, swarmFrag, sparkVert, sparkFrag,
  arcVert, arcFrag, lineVert, lineFrag, textVert, textFrag, waveFrag, finalPass,
} from './shaders';
import { makeGold, makeEnvironment, sharedGold } from './gold';
import { buildLogoParts, P } from './logo';
import { buildTitle } from './title';

/* ------------------------------------------------------------ helpers */
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack = (x: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
/** envelope: rises over `att`, decays exponentially after */
const burst = (t: number, t0: number, att: number, dec: number) =>
  t < t0 ? 0 : t < t0 + att ? (t - t0) / att : Math.exp(-(t - t0 - att) / dec);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  return (r() + r() + r() + r() - 2) * 1.2;
}

const TL = {
  letters0: 5.75,
  letterStep: 0.085,
  letterDur: 0.95,
  lineStart: 8.05,
  subStart: 8.35,
  line2Start: 9.4,
  dateStart: 9.55,
  sweep2: 10.9,
};

export class Intro {
  host: HTMLElement;
  duration = 13.6;
  onFrame: ((t: number) => void) | null = null;
  freeze: number | null = null;
  playing = false;
  t = 0;
  private startAt = 0;
  private mouse = new THREE.Vector2();
  private mouseS = new THREE.Vector2();
  private pxW = 1920;
  private pxH = 1080;
  private forced = false;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  /* ------------------------------------------------------------ init */
  async init() {
    await document.fonts.load('100px Forum', 'ВЕЧЕР РЕТРОСПЕКТИВА 20 НОЯБРЯ 2026 ГОДА');

    const renderer = (this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
    }));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.setClearColor(0x000000, 1);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
    this.host.appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 200);
    this.camera.position.set(0, 0, 21);

    this.U = {
      uTime: { value: 0 },
      uScale: { value: 2000 },
    };

    this.scene.environment = makeEnvironment(renderer);
    this.scene.environmentIntensity = 1.0;

    this.setupLights();
    this.setupBackground();
    this.setupDust();
    this.setupArcs();
    this.setupLogo();
    await this.setupTitle();
    this.setupSubtitle();
    this.setupDividers();
    this.setupFX();
    this.setupPost();

    this.applySize();
    this.ro = new ResizeObserver(() => !this.forced && this.applySize());
    this.ro.observe(this.host);
    this.onPointer = (e: PointerEvent) => {
      const r = this.host.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width - 0.5) * 2, -((e.clientY - r.top) / r.height - 0.5) * 2);
    };
    window.addEventListener('pointermove', this.onPointer);

    renderer.setAnimationLoop(() => this.frame());
  }

  /* ------------------------------------------------------------ setup parts */
  setupLights() {
    const key = new THREE.DirectionalLight(0xfff0dc, 1.4);
    key.position.set(-4, 7, 9);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff9a40, 1.2);
    rim.position.set(6, -2, 5);
    this.scene.add(rim);
    this.sweepLight = new THREE.PointLight(0xffe2b4, 0, 0, 2);
    this.sweepLight.position.set(-20, 0.4, 3.2);
    this.scene.add(this.sweepLight);
  }

  setupBackground() {
    this.bgMat = new THREE.ShaderMaterial({
      vertexShader: bgVert,
      fragmentShader: bgFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: this.U.uTime,
        uAspect: { value: 16 / 9 },
        uBeam: { value: 0 },
        uRib: { value: 0 },
        uGlow: { value: 0 },
        uFlash: { value: 0 },
        uFinal: { value: 0 },
        uCam: { value: new THREE.Vector2() },
      },
    });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    bg.frustumCulled = false;
    bg.renderOrder = -100;
    this.scene.add(bg);
  }

  additive(vert, frag, uniforms, extra = {}) {
    return new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      ...extra,
    });
  }

  setupDust() {
    const r = rng(7);
    const pos: number[] = [], dir: number[] = [], prm: number[] = [];
    const push = (x, y, z, dx, dy, dz, size, glint) => {
      pos.push(x, y, z);
      dir.push(dx, dy, dz);
      prm.push(size, r(), 0.4 + r() * 1.1, glint);
    };
    // ambient dust
    for (let i = 0; i < 450; i++) {
      push((r() - 0.5) * 24, (r() - 0.5) * 14, -6 + r() * 11, (r() - 0.5) * 1.2, 0.4 + r() * 1.0, (r() - 0.5) * 0.6, 0.018 + Math.pow(r(), 3) * 0.06, r() > 0.75 ? 1 : 0);
    }
    // glitter streams hugging the corner ribbons
    const stream = (cx, cy, R0, R1, a0, a1, n, spread) => {
      for (let i = 0; i < n; i++) {
        const a = a0 + (a1 - a0) * Math.pow(r(), 0.8);
        const R = R0 + (R1 - R0) * r() + gauss(r) * spread;
        const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        const tx = -Math.sin(a), ty = Math.cos(a);
        const L = 0.8 + r() * 1.8;
        push(x, y, -1.5 + r() * 3, tx * L, ty * L, (r() - 0.5) * 0.3, 0.014 + Math.pow(r(), 3) * 0.06, r() > 0.6 ? 1 : 0);
      }
    };
    const d2r = Math.PI / 180;
    stream(10, -7, 5.2, 6.9, 98 * d2r, 182 * d2r, 450, 0.18);
    stream(-10, -8, 5.4, 7.2, -4 * d2r, 76 * d2r, 400, 0.2);
    stream(-9, 5.5, 3.2, 4.4, -95 * d2r, 5 * d2r, 350, 0.15);
    // beam dust (top-left cone)
    for (let i = 0; i < 220; i++) {
      const s = r();
      push(-4 + (-6.5 + 4) * s + gauss(r) * (0.3 + s * 1.2), 5.5 - 5.5 * s + gauss(r) * (0.3 + s * 0.8), -2 + r() * 4, 0.3, -0.5, 0, 0.014 + Math.pow(r(), 3) * 0.05, r() > 0.6 ? 1 : 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 3));
    g.setAttribute('aP', new THREE.Float32BufferAttribute(prm, 4));
    this.dustU = { uIn: { value: 0 }, uBokeh: { value: 0 } };
    const dust = new THREE.Points(g, this.additive(dustVert, dustFrag, { ...this.U, ...this.dustU }));
    dust.frustumCulled = false;
    dust.renderOrder = 5;
    this.scene.add(dust);

    // bokeh
    const bp: number[] = [], bd: number[] = [], bq: number[] = [];
    const bk = (x, y, z, size) => {
      bp.push(x, y, z);
      bd.push((r() - 0.5) * 0.6, 0.2 + r() * 0.5, 0);
      bq.push(size, r(), 0.15 + r() * 0.3, 0);
    };
    for (let i = 0; i < 26; i++) {
      const a = (98 + r() * 84) * d2r, R = 4.2 + r() * 3;
      bk(10 + Math.cos(a) * R, -7 + Math.sin(a) * R, -2 + r() * 6, 0.12 + Math.pow(r(), 2.2) * 0.9);
    }
    for (let i = 0; i < 22; i++) {
      const a = (-4 + r() * 80) * d2r, R = 4.4 + r() * 3;
      bk(-10 + Math.cos(a) * R, -8 + Math.sin(a) * R, -2 + r() * 6, 0.1 + Math.pow(r(), 2.2) * 0.8);
    }
    for (let i = 0; i < 18; i++) bk(-9 + r() * 5, 1 + r() * 4.5, -3 + r() * 4, 0.08 + Math.pow(r(), 2) * 0.5);
    for (let i = 0; i < 10; i++) bk((r() - 0.5) * 20, (r() - 0.5) * 11, -4 + r() * 3, 0.1 + r() * 0.35);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bg.setAttribute('aDir', new THREE.Float32BufferAttribute(bd, 3));
    bg.setAttribute('aP', new THREE.Float32BufferAttribute(bq, 4));
    this.bokehU = { uIn: { value: 0 }, uBokeh: { value: 1 } };
    const bokeh = new THREE.Points(bg, this.additive(dustVert, dustFrag, { ...this.U, ...this.bokehU }));
    bokeh.frustumCulled = false;
    bokeh.renderOrder = 4;
    this.scene.add(bokeh);
  }

  setupArcs() {
    this.arcs = [];
    this.dots = [];
    const glow = this.glowTex();
    const mk = (cpx, cpy, R, startDeg, lenDeg, opts) => {
      const c = P(cpx, cpy);
      const geo = new THREE.RingGeometry(R - 0.5, R + 0.5, 320, 1);
      const mat = this.additive(arcVert, arcFrag, {
        uProg: { value: 0 },
        uR: { value: R },
        uStart: { value: (startDeg * Math.PI) / 180 },
        uLen: { value: (lenDeg * Math.PI) / 180 },
        uDash: { value: opts.dash || 0 },
        uAlpha: { value: opts.alpha ?? 1 },
        uW: { value: opts.w ?? 0.012 },
        uTime: this.U.uTime,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(c.x, c.y, -0.6);
      m.renderOrder = 3;
      this.scene.add(m);
      this.arcs.push({ mesh: m, t0: opts.t0, t1: opts.t1 });
      return { c, R, startDeg, lenDeg };
    };
    const node = (arc, tt, size, t0) => {
      const a = ((arc.startDeg + arc.lenDeg * tt) * Math.PI) / 180;
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(2.4, 1.6, 0.7), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
      );
      s.position.set(arc.c.x + Math.cos(a) * arc.R, arc.c.y + Math.sin(a) * arc.R, -0.5);
      s.renderOrder = 6;
      this.scene.add(s);
      this.dots.push({ s, size, t0 });
    };
    // top-left
    const a1 = mk(-30, -35, 3.95, -93, 97, { t0: 0.9, t1: 3.7, w: 0.013 });
    mk(-30, -35, 4.4, -90, 88, { t0: 1.3, t1: 4.0, dash: 70, w: 0.008, alpha: 0.75 });
    const a3 = mk(-30, -35, 3.42, -92, 62, { t0: 1.6, t1: 4.1, w: 0.008, alpha: 0.85 });
    node(a3, 0.56, 0.4, 3.1);
    node(a1, 0.74, 0.22, 2.9);
    // bottom-right
    const b1 = mk(1330, 760, 4.1, 92, 88, { t0: 1.3, t1: 4.1, w: 0.014 });
    mk(1330, 760, 4.55, 98, 84, { t0: 1.7, t1: 4.4, dash: 80, w: 0.008, alpha: 0.75 });
    mk(1330, 760, 3.6, 100, 76, { t0: 2.0, t1: 4.6, w: 0.007, alpha: 0.7 });
    node(b1, 0.54, 0.46, 3.4);
    node(b1, 0.2, 0.2, 3.7);
  }

  setupLogo() {
    this.logoRoot = new THREE.Group();
    const inner = (this.logoInner = new THREE.Group());
    this.logoRoot.add(inner);
    this.logoParts = buildLogoParts();

    const bb = new THREE.Box3();
    this.logoParts.forEach((p) => {
      p.geometry.computeBoundingBox();
      bb.union(p.geometry.boundingBox);
    });
    const C = bb.getCenter(new THREE.Vector3());
    this.logoCenter = C;
    this.logoRoot.position.set(C.x, C.y, 0);
    inner.position.set(-C.x, -C.y, 0);

    this.logoMeshes = this.logoParts.map((p) => {
      const mat = makeGold({ gradBot: -0.1, gradTop: 3.15, env: 1.6 });
      const u = mat.userData.u;
      u.uCenter.value.copy(p.center);
      u.uDir.value.copy(p.dir);
      u.uExtent.value = Math.abs(p.dir.x) > 0.5 ? p.size.x : p.size.y;
      const m = new THREE.Mesh(p.geometry, mat);
      m.position.z = p.z;
      m.visible = false;
      inner.add(m);
      return m;
    });

    // swarm sampled from the geometry surface
    const N = 18000;
    const r = rng(21);
    const areas = this.logoParts.map((p) => p.size.x * p.size.y + 0.05);
    const sum = areas.reduce((a, b) => a + b, 0);
    const tgt: number[] = [], st: number[] = [], rr: number[] = [];
    const tmp = new THREE.Vector3(), nrm = new THREE.Vector3();
    this.logoParts.forEach((p, i) => {
      const n = Math.round((N * areas[i]) / sum);
      const s = new MeshSurfaceSampler(new THREE.Mesh(p.geometry)).build();
      for (let k = 0; k < n; k++) {
        s.sample(tmp, nrm);
        tgt.push(tmp.x, tmp.y, tmp.z + p.z);
        const a = r() * Math.PI * 2;
        const R = 4 + Math.pow(r(), 0.7) * 9;
        st.push(C.x + Math.cos(a) * R * 1.25, C.y + Math.sin(a) * R * 0.8, (r() - 0.5) * 9);
        rr.push(r(), (r() - 0.5) * 2, 0.025 + Math.pow(r(), 2.5) * 0.05, r());
      }
    });
    this.swarmTargets = tgt;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tgt, 3));
    g.setAttribute('aTarget', new THREE.Float32BufferAttribute(tgt, 3));
    g.setAttribute('aStart', new THREE.Float32BufferAttribute(st, 3));
    g.setAttribute('aR', new THREE.Float32BufferAttribute(rr, 4));
    this.swarmU = {
      uAssemble: { value: 0 },
      uFade: { value: 1 },
      uCenter: { value: new THREE.Vector2(C.x, C.y) },
    };
    const sw = new THREE.Points(g, this.additive(swarmVert, swarmFrag, { ...this.U, ...this.swarmU }));
    sw.frustumCulled = false;
    sw.renderOrder = 7;
    inner.add(sw);

    // burst sparks from the logo at the flash moment
    const sp = this.makeSparks();
    const rs = rng(55);
    for (let k = 0; k < 1100; k++) {
      const i = Math.floor(rs() * (tgt.length / 3));
      const x = tgt[i * 3], y = tgt[i * 3 + 1], z = tgt[i * 3 + 2];
      const dx = x - C.x, dy = y - C.y;
      const L = Math.hypot(dx, dy) + 0.2;
      const sp1 = 0.8 + rs() * 3.2;
      sp.add(x, y, z + 0.1, (dx / L) * sp1 + (rs() - 0.5) * 0.8, (dy / L) * sp1 + (rs() - 0.5) * 0.8, (rs() - 0.2) * 1.8, 4.5 + rs() * 0.5, 0.9 + rs() * 1.8, 0.03 + rs() * rs() * 0.09);
    }
    sp.build(inner);

    this.scene.add(this.logoRoot);
  }

  makeSparks() {
    const pos: number[] = [], vel: number[] = [], life: number[] = [], size: number[] = [];
    const self = this;
    return {
      add(x, y, z, vx, vy, vz, birth, lf, sz) {
        pos.push(x, y, z); vel.push(vx, vy, vz); life.push(birth, lf); size.push(sz);
      },
      build(parent) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('aVel', new THREE.Float32BufferAttribute(vel, 3));
        g.setAttribute('aLife', new THREE.Float32BufferAttribute(life, 2));
        g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
        const pts = new THREE.Points(g, self.additive(sparkVert, sparkFrag, { ...self.U }));
        pts.frustumCulled = false;
        pts.renderOrder = 8;
        parent.add(pts);
        return pts;
      },
    };
  }

  async setupTitle() {
    const text = 'ЯНТАРНЫЙ ЦИРКУЛЬ';
    const { letters, capH } = await buildTitle(prataUrl, text, 11.55, 0.045);
    this.titleGroup = new THREE.Group();
    const baseY = -0.66 - capH / 2;
    this.titleGroup.position.set(0, baseY, 0);
    this.scene.add(this.titleGroup);
    this.titleBaseY = baseY;
    const sp = this.makeSparks();
    const r = rng(99);
    this.letterMeshes = letters.map((L, i) => {
      L.geometry.translate(-L.center.x, -L.center.y, -L.center.z);
      const mat = makeGold({ gradBot: -1.15, gradTop: -0.1, env: 1.55, roughness: 0.25 });
      const u = mat.userData.u;
      u.uCenter.value.set(0, 0, 0);
      u.uDir.value.set(0, -1, 0);
      u.uExtent.value = L.size.y * 1.05;
      const m = new THREE.Mesh(L.geometry, mat);
      m.position.copy(L.center);
      m.visible = false;
      this.titleGroup.add(m);
      const start = TL.letters0 + i * TL.letterStep;
      const land = start + TL.letterDur * 0.78;
      // landing sparks
      for (let k = 0; k < 70; k++) {
        sp.add(L.center.x + (r() - 0.5) * L.size.x, L.center.y + baseY + (r() - 0.5) * L.size.y, 0.15, (r() - 0.5) * 1.8, 0.2 + r() * 1.8, (r() - 0.3) * 1.2, land, 0.7 + r() * 1.3, 0.02 + r() * r() * 0.07);
      }
      return { mesh: m, start, land, L, i, seed: i % 2 ? 1 : -1 };
    });
    // final-sweep sparks along the title
    const half = 5.8;
    for (let k = 0; k < 420; k++) {
      const x = (r() - 0.5) * 2 * half;
      const t0 = TL.sweep2 + ((x + 9) / 18) * 1.7 * 0.9;
      sp.add(x, -0.2 + (r() - 0.5) * 1.1, 0.2, (r() - 0.5) * 0.8, 0.3 + r() * 1.3, (r() - 0.3) * 0.8, t0, 0.8 + r() * 1.4, 0.02 + r() * r() * 0.06);
    }
    sp.build(this.scene);
  }

  makeTextTexture(text, px, trackEm) {
    const cvs = document.createElement('canvas');
    const ctx = cvs.getContext('2d');
    const font = `${px}px Forum`;
    ctx.font = font;
    const ws = [...text].map((c) => ctx.measureText(c).width);
    const track = px * trackEm;
    const total = ws.reduce((a, b) => a + b, 0) + track * (ws.length - 1);
    const pad = px * 0.7;
    cvs.width = Math.ceil(total + pad * 2);
    cvs.height = Math.ceil(px * 1.7);
    const c2 = cvs.getContext('2d');
    c2.font = font;
    c2.fillStyle = '#fff';
    c2.textBaseline = 'alphabetic';
    let x = pad;
    [...text].forEach((ch, i) => {
      c2.fillText(ch, x, px * 1.18);
      x += ws[i] + track;
    });
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return { tex, w: cvs.width, h: cvs.height, total, pad };
  }

  textPlane(text, px, trackEm, worldTextWidth, yWorld, colA, colB, bright) {
    const { tex, w, h, total } = this.makeTextTexture(text, px, trackEm);
    const k = worldTextWidth / total;
    const mat = new THREE.ShaderMaterial({
      vertexShader: textVert,
      fragmentShader: textFrag,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uMap: { value: tex },
        uReveal: { value: 0 },
        uTime: this.U.uTime,
        uShine: { value: 0.5 },
        uBright: { value: bright },
        uColA: { value: new THREE.Color(...colA) },
        uColB: { value: new THREE.Color(...colB) },
      },
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * k, h * k), mat);
    // baseline sits at 1.18 / 1.7 of canvas height; shift so caps are centred on yWorld
    const capCenter = (1.18 - 0.35) / 1.7; // approx cap-centre from the top
    m.position.set(0, yWorld + (capCenter - 0.5) * h * k, 0.1);
    m.renderOrder = 9;
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  setupSubtitle() {
    this.sub = this.textPlane('ВЕЧЕР РЕТРОСПЕКТИВА', 120, 0.42, 7.25, P(0, 537).y, [0.8, 0.5, 0.18], [1.0, 0.86, 0.55], 1.45);
    this.date = this.textPlane('20 НОЯБРЯ 2026 ГОДА', 100, 0.3, 4.45, P(0, 597).y, [0.8, 0.52, 0.2], [1.0, 0.88, 0.6], 1.35);
  }

  setupDividers() {
    const line = (cx, y, w, dir, h = 0.16) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: lineVert,
        fragmentShader: lineFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uProg: { value: 0 }, uDir: { value: dir }, uTime: this.U.uTime, uAlpha: { value: 1 } },
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(cx, y, 0.05);
      m.renderOrder = 9;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    const diamond = (x, y, s) => {
      const sh = new THREE.Shape();
      sh.moveTo(0, s); sh.lineTo(s, 0); sh.lineTo(0, -s); sh.lineTo(-s, 0); sh.closePath();
      const hole = new THREE.Path();
      const k = s * 0.62;
      hole.moveTo(0, k); hole.lineTo(-k, 0); hole.lineTo(0, -k); hole.lineTo(k, 0); hole.closePath();
      sh.holes.push(hole);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.7, 0.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), mat);
      m.position.set(x, y, 0.08);
      m.renderOrder = 10;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    const y1 = P(0, 488).y, y2 = P(0, 630).y;
    const x = (px) => P(px, 0).x;
    this.div1 = {
      L: line((x(253) + x(610)) / 2, y1, x(610) - x(253), 1),
      R: line((x(665) + x(1025)) / 2, y1, x(1025) - x(665), -1),
      d: diamond(x(638), y1, 0.1),
    };
    this.div2 = {
      L: line((x(515) + x(620)) / 2, y2, x(620) - x(515), 1, 0.14),
      R: line((x(656) + x(765)) / 2, y2, x(765) - x(656), -1, 0.14),
      d: diamond(x(638), y2, 0.075),
    };
  }

  glowTex() {
    if (this._glow) return this._glow;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.12, 'rgba(255,236,190,0.75)');
    gr.addColorStop(0.4, 'rgba(255,170,70,0.16)');
    gr.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    this._glow = new THREE.CanvasTexture(c);
    this._glow.colorSpace = THREE.SRGBColorSpace;
    return this._glow;
  }

  flareTex() {
    const W = 512, H = 64;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const u = (x / (W - 1) - 0.5) * 2, v = (y / (H - 1) - 0.5) * 2;
        let a = Math.pow(1 - Math.abs(u), 2.4) * Math.exp(-v * v * 55) + 0.35 * Math.exp(-(u * u * 25 + v * v * 6));
        a = Math.min(1, a);
        const i = (y * W + x) * 4;
        img.data[i] = 255; img.data[i + 1] = 226; img.data[i + 2] = 170; img.data[i + 3] = a * 255;
      }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  setupFX() {
    const flareT = this.flareTex();
    const mkFlare = (x, y, sx, sy) => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: flareT, color: new THREE.Color(2.2, 1.5, 0.7), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })
      );
      s.position.set(x, y, 0.4);
      s.scale.set(sx, sy, 1);
      s.renderOrder = 11;
      this.scene.add(s);
      return { s, sx, sy };
    };
    const lc = this.logoCenter;
    this.flareLogo = mkFlare(0, lc.y - 0.2, 15, 1.4);
    this.flareTitle = mkFlare(0, -0.66, 18, 1.0);
    this.flareSub = mkFlare(0, P(0, 537).y, 10, 0.5);

    const glow = this.glowTex();
    this.coreGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(2.5, 1.6, 0.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })
    );
    this.coreGlow.position.set(0, lc.y, -0.3);
    this.coreGlow.renderOrder = 2;
    this.scene.add(this.coreGlow);

    const wave = (w, h) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        this.additive(lineVert, waveFrag, { uR: { value: 0 }, uA: { value: 0 }, uW: { value: 0.05 } })
      );
      m.renderOrder = 12;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    this.waveLogo = wave(14, 14);
    this.waveLogo.position.set(0, lc.y, 0.3);
    this.waveTitle = wave(26, 9);
    this.waveTitle.position.set(0, -0.66, 0.3);
  }

  setupPost() {
    const rt = new THREE.WebGLRenderTarget(1920, 1080, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1920, 1080), 0.6, 0.7, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.fp = new ShaderPass({ ...finalPass, uniforms: THREE.UniformsUtils.clone(finalPass.uniforms) });
    this.composer.addPass(this.fp);
  }

  /* ------------------------------------------------------------ sizing */
  applySize(w?: number, h?: number) {
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    let W = w ?? Math.round(this.host.clientWidth * pr);
    let H = h ?? Math.round(this.host.clientHeight * pr);
    if (W > 2560) { H = Math.round((H * 2560) / W); W = 2560; }
    W = Math.max(W, 320); H = Math.max(H, 180);
    this.pxW = W; this.pxH = H;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.composer.setPixelRatio(1);
    this.composer.setSize(W, H);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    this.U.uScale.value = H / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.bgMat.uniforms.uAspect.value = W / H;
    this.fp.uniforms.uAspect.value = W / H;
    this.fp.uniforms.uRes.value = [W, H];
    this.bloom.resolution.set(W, H);
  }

  /* ------------------------------------------------------------ playback */
  play() {
    this.startAt = performance.now();
    this.playing = true;
    this.freeze = null;
  }

  async record(onDone?: () => void): Promise<Blob> {
    this.forced = true;
    this.applySize(1920, 1080);
    const stream = this.renderer.domElement.captureStream(60);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 28_000_000 });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<Blob>((res) => (rec.onstop = () => res(new Blob(chunks, { type: 'video/webm' }))));
    this.play();
    rec.start(200);
    await new Promise<void>((res) => {
      const iv = setInterval(() => {
        if (this.t > this.duration) { clearInterval(iv); res(); }
      }, 100);
    });
    rec.stop();
    const blob = await done;
    this.forced = false;
    this.applySize();
    onDone?.();
    return blob;
  }

  frame() {
    if (this.freeze !== null) this.t = this.freeze;
    else if (this.playing) this.t = (performance.now() - this.startAt) / 1000;
    this.mouseS.lerp(this.mouse, 0.04);
    this.update(this.t);
    this.composer.render();
    this.onFrame?.(this.t);
  }

  /* ------------------------------------------------------------ the timeline */
  update(t: number) {
    this.U.uTime.value = t;
    sharedGold.uTime.value = t;

    // camera: a slow cinematic push with parallax
    const ck = easeInOutSine(seg(t, 0, 12.5));
    const sway = 1;
    this.camera.position.set(
      (1 - ck) * -1.6 + Math.sin(t * 0.33) * 0.1 * sway + this.mouseS.x * 0.35,
      (1 - ck) * 0.8 + Math.cos(t * 0.27) * 0.06 * sway + this.mouseS.y * 0.2,
      16.8 + (1 - ck) * 4.6
    );
    this.camera.lookAt(this.mouseS.x * 0.15, 0, 0);
    this.camera.rotation.z += (1 - ck) * 0.025;
    this.bgMat.uniforms.uCam.value.set(this.camera.position.x * -0.25, this.camera.position.y * -0.25);

    // global fade-in
    const fadeIn = easeOutCubic(seg(t, 0.05, 1.6));
    this.fp.uniforms.uFade.value = fadeIn;
    this.fp.uniforms.uTime.value = t;

    // environment drifts so reflections glide over the metal
    const envRot = Math.sin(t * 0.32) * 0.35 + t * 0.06;
    this.scene.environmentRotation.y = envRot;
    this.scene.environmentIntensity = 0.4 + 0.4 * easeOutCubic(seg(t, 3.8, 6.0));

    // background light
    const bu = this.bgMat.uniforms;
    bu.uBeam.value = easeOutCubic(seg(t, 0.4, 3.4)) * (0.92 + 0.08 * Math.sin(t * 0.7)) * (1 + 0.15 * burst(t, 4.5, 0.1, 0.8));
    bu.uRib.value = easeOutCubic(seg(t, 1.0, 4.0)) * (0.9 + 0.1 * Math.sin(t * 0.9 + 1));
    bu.uGlow.value = easeOutCubic(seg(t, 3.5, 6.5));
    bu.uFlash.value = burst(t, 4.5, 0.06, 0.5) * 0.28 + burst(t, TL.sweep2, 0.3, 0.7) * 0.15;
    bu.uFinal.value = easeOutCubic(seg(t, 7.5, 10.5));

    // particles
    this.dustU.uIn.value = easeOutCubic(seg(t, 0.2, 2.5));
    this.bokehU.uIn.value = easeOutCubic(seg(t, 0.6, 3.5));

    // arcs
    this.arcs.forEach(({ mesh, t0, t1 }) => {
      mesh.material.uniforms.uProg.value = easeInOutSine(seg(t, t0, t1));
    });
    this.dots.forEach(({ s, size, t0 }) => {
      const k = easeOutBack(seg(t, t0, t0 + 0.7));
      const pulse = 1 + 0.25 * Math.sin(t * 2.4 + t0 * 5);
      const sc = Math.max(0, k) * size * pulse * (1 + burst(t, 4.55, 0.1, 0.6) * 0.8);
      s.scale.set(sc, sc, 1);
      s.visible = sc > 0.001;
    });

    // logo swarm assembly
    this.swarmU.uAssemble.value = easeInOutSine(seg(t, 1.6, 4.55));
    this.swarmU.uFade.value = easeOutCubic(seg(t, 1.5, 2.4)) * (1 - easeInOutSine(seg(t, 4.5, 5.8)));
    const rot = 0.62 * (1 - easeInOutCubic(seg(t, 1.4, 8.0)));
    this.logoRoot.rotation.y = rot + Math.sin(t * 0.5) * 0.015;
    this.logoRoot.rotation.x = Math.sin(t * 0.4) * 0.012;
    this.logoRoot.position.y = this.logoCenter.y + Math.sin(t * 0.7) * 0.025;
    this.logoRoot.scale.setScalar(1 + 0.04 * (1 - easeOutCubic(seg(t, 4.2, 8))));

    this.logoParts.forEach((p, i) => {
      const m = this.logoMeshes[i];
      const k = seg(t, p.start, p.start + p.dur);
      const u = m.material.userData.u;
      u.uReveal.value = easeInOutSine(k) * 1.0;
      m.visible = k > 0.0001;
      u.uFlash.value = burst(t, 4.52, 0.05, 0.5) * 0.5 + burst(t, p.start + p.dur * 0.9, 0.05, 0.4) * 0.3;
    });

    // title letters
    this.letterMeshes.forEach(({ mesh, start, land, L, seed }) => {
      const p = seg(t, start, start + TL.letterDur);
      const e = easeOutCubic(p);
      const e2 = 1 - Math.pow(1 - p, 5);
      mesh.visible = p > 0;
      mesh.position.set(L.center.x, L.center.y - (1 - e2) * 0.5, -(1 - e2) * 6.5);
      mesh.rotation.set((1 - e) * 1.0 * seed, (1 - e) * 0.7 * -seed, (1 - e) * 0.15 * seed);
      mesh.scale.setScalar(1 + (1 - e) * 0.08);
      const u = mesh.material.userData.u;
      u.uReveal.value = easeInOutSine(seg(p, 0.02, 0.85));
      u.uFlash.value = burst(t, land, 0.04, 0.38) * 1.1;
    });

    // sweeping light (title + final shimmer)
    const sw = this.sweepState(t);
    this.sweepLight.position.x = sw.x;
    this.sweepLight.intensity = sw.amt * 75;
    sharedGold.uSweepX.value = sw.x;
    sharedGold.uSweepAmt.value = sw.amt;

    // dividers
    const l1 = easeInOutCubic(seg(t, TL.lineStart, TL.lineStart + 1.35));
    this.div1.L.visible = this.div1.R.visible = l1 > 0;
    this.div1.L.material.uniforms.uProg.value = l1;
    this.div1.R.material.uniforms.uProg.value = l1;
    const d1 = seg(t, TL.lineStart - 0.1, TL.lineStart + 0.6);
    this.popDiamond(this.div1.d, d1, t, 0);
    const l2 = easeInOutCubic(seg(t, TL.line2Start, TL.line2Start + 1.1));
    this.div2.L.visible = this.div2.R.visible = l2 > 0;
    this.div2.L.material.uniforms.uProg.value = l2;
    this.div2.R.material.uniforms.uProg.value = l2;
    this.popDiamond(this.div2.d, seg(t, TL.line2Start - 0.1, TL.line2Start + 0.55), t, 1.7);

    // subtitle + date
    const sr = easeInOutCubic(seg(t, TL.subStart, TL.subStart + 1.9));
    this.sub.visible = sr > 0.001;
    this.sub.material.uniforms.uReveal.value = sr;
    this.sub.scale.x = 1.07 - 0.07 * easeOutCubic(seg(t, TL.subStart, TL.subStart + 2.4));
    this.sub.material.uniforms.uShine.value = 0.55 + 0.25 * Math.sin(t * 1.3);
    const dr = easeInOutCubic(seg(t, TL.dateStart, TL.dateStart + 1.6));
    this.date.visible = dr > 0.001;
    this.date.material.uniforms.uReveal.value = dr;
    this.date.scale.x = 1.07 - 0.07 * easeOutCubic(seg(t, TL.dateStart, TL.dateStart + 2.2));
    this.date.material.uniforms.uShine.value = 0.5 + 0.2 * Math.sin(t * 1.1 + 1);

    // FX
    const setFlare = (f, v) => {
      f.s.material.opacity = Math.min(1, v);
      f.s.visible = v > 0.003;
      f.s.scale.set(f.sx * (0.7 + 0.5 * Math.min(1, v)), f.sy * (0.6 + 0.6 * Math.min(1, v)), 1);
    };
    setFlare(this.flareLogo, burst(t, 4.5, 0.07, 0.5) * 0.6 + 0.1 * easeOutCubic(seg(t, 5.5, 8)) * (0.8 + 0.2 * Math.sin(t * 0.8)));
    setFlare(this.flareTitle, burst(t, 7.7, 0.25, 0.7) * 0.5 + 0.14 * easeOutCubic(seg(t, 7.5, 10)) + burst(t, TL.sweep2 + 0.4, 0.3, 0.7) * 0.35);
    setFlare(this.flareSub, burst(t, 9.6, 0.3, 0.6) * 0.45);
    const cg = this.coreGlow;
    cg.material.opacity = easeOutCubic(seg(t, 3.0, 4.6)) * 0.28 * (1 - 0.6 * seg(t, 5, 7)) + burst(t, 4.5, 0.06, 0.5) * 0.16;
    const cgs = 6 + burst(t, 4.5, 0.06, 0.8) * 3;
    cg.scale.set(cgs, cgs, 1);
    cg.visible = cg.material.opacity > 0.003;

    const w1 = seg(t, 4.5, 6.1);
    this.waveLogo.visible = w1 > 0 && w1 < 1;
    this.waveLogo.material.uniforms.uR.value = easeOutCubic(w1) * 1.05;
    this.waveLogo.material.uniforms.uA.value = Math.pow(1 - w1, 1.6) * 0.42;
    this.waveLogo.material.uniforms.uW.value = 0.02 + w1 * 0.1;
    const w2 = seg(t, 7.75, 9.2);
    this.waveTitle.visible = w2 > 0 && w2 < 1;
    this.waveTitle.material.uniforms.uR.value = easeOutCubic(w2) * 1.0;
    this.waveTitle.material.uniforms.uA.value = Math.pow(1 - w2, 1.8) * 0.35;
    this.waveTitle.material.uniforms.uW.value = 0.02 + w2 * 0.08;

    // bloom breathes with the story
    this.bloom.strength = 0.5 + 0.2 * burst(t, 4.5, 0.08, 0.7) + 0.1 * burst(t, TL.sweep2, 0.4, 0.9);
  }

  popDiamond(m, k, t, phase) {
    m.visible = k > 0;
    const e = Math.max(0, easeOutBack(k));
    m.scale.setScalar(e * (1 + 0.06 * Math.sin(t * 2 + phase)));
    m.rotation.z = (1 - easeOutCubic(k)) * Math.PI * 0.5;
    m.material.opacity = clamp01(k * 2);
  }

  sweepState(t: number) {
    const sw = [[5.75, 8.8], [TL.sweep2, TL.sweep2 + 1.7]];
    for (const [a, b] of sw) {
      if (t >= a && t <= b) {
        const p = (t - a) / (b - a);
        return { x: -9 + 18 * easeInOutSine(p), amt: Math.sin(Math.PI * p) };
      }
    }
    if (t > TL.sweep2 + 1.7) {
      const ph = (t - TL.sweep2) % 8;
      if (ph < 1.7) {
        const p = ph / 1.7;
        return { x: -9 + 18 * easeInOutSine(p), amt: Math.sin(Math.PI * p) * 0.8 };
      }
    }
    return { x: -20, amt: 0 };
  }

  dispose() {
    this.renderer?.setAnimationLoop(null);
    this.ro?.disconnect();
    window.removeEventListener('pointermove', this.onPointer);
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
