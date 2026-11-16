/**
 * Синтезированный саунд-дизайн интро. Партитура рендерится офлайн (OfflineAudioContext),
 * поэтому она детерминирована, точно привязана к таймлайну и может быть добавлена в экспорт видео.
 * Времена событий совпадают с таймлайном в Intro.ts.
 */

export const AUDIO_DURATION = 13.6;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hz = (semi: number, base = 440) => base * Math.pow(2, semi / 12);

export async function renderScore(sampleRate = 44100): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(AUDIO_DURATION * sampleRate), sampleRate);
  const r = rng(404);

  /* ---------- шины: сухой сигнал + длинная «соборная» реверберация ---------- */
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 3.2; comp.attack.value = 0.01; comp.release.value = 0.25;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.75, 0);
  master.gain.setValueAtTime(0.75, AUDIO_DURATION - 1.1);
  master.gain.linearRampToValueAtTime(0, AUDIO_DURATION - 0.02);
  const limiter = ctx.createDynamicsCompressor(); // мягкий лимитер: защита от клиппинга на ударе
  limiter.threshold.value = -4; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.12;
  comp.connect(master).connect(limiter).connect(ctx.destination);

  const dry = ctx.createGain(); dry.connect(comp);
  const verb = ctx.createConvolver();
  {
    const len = Math.floor(sampleRate * 3.6);
    const ir = ctx.createBuffer(2, len, sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        lp += ((r() * 2 - 1) - lp) * (0.55 - 0.45 * k); // тёмный хвост
        d[i] = lp * Math.pow(1 - k, 2.6) * (i < 400 ? i / 400 : 1);
      }
    }
    verb.buffer = ir;
  }
  const wet = ctx.createGain(); wet.gain.value = 0.55;
  verb.connect(wet).connect(comp);

  const send = (node: AudioNode, amount: number, dryAmount = 1) => {
    const d = ctx.createGain(); d.gain.value = dryAmount; node.connect(d).connect(dry);
    const s = ctx.createGain(); s.gain.value = amount; node.connect(s).connect(verb);
  };

  const noiseBuf = ctx.createBuffer(1, sampleRate * 4, sampleRate);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }
  const noise = (t0: number, dur: number) => {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    s.start(t0, r() * 2); s.stop(t0 + dur); return s;
  };

  const pan = (v: number) => { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, v)); return p; };

  /** колокольчик/стекло: сумма синусов с экспоненциальным затуханием */
  const bell = (t0: number, f: number, gain: number, decay: number, panV = 0, partials = [1, 2.01, 3.99, 5.4]) => {
    const out = ctx.createGain(); out.gain.value = 1;
    partials.forEach((p, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * p;
      const g = ctx.createGain();
      const gp = gain / (1 + i * 1.6);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(gp, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay / (1 + i * 0.55));
      o.connect(g).connect(out); o.start(t0); o.stop(t0 + decay + 0.1);
    });
    out.connect(pan(panV)).connect(comp); // сухой сигнал
    const sp = pan(panV); out.connect(sp); send(sp, 0.7, 0.0);
  };

  /* ---------- 1. Дрон: тёмный «дорогой» пэд, раскрывающийся к удару ---------- */
  {
    const padGain = ctx.createGain();
    padGain.gain.setValueAtTime(0.03, 0);
    padGain.gain.exponentialRampToValueAtTime(0.2, 4.4);
    padGain.gain.exponentialRampToValueAtTime(0.085, 6.5);
    padGain.gain.setValueAtTime(0.085, 10.4);
    padGain.gain.linearRampToValueAtTime(0.11, 11.6);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2.5;
    lp.frequency.setValueAtTime(140, 0);
    lp.frequency.exponentialRampToValueAtTime(2200, 4.5);
    lp.frequency.exponentialRampToValueAtTime(700, 7.5);
    [[-24, -7], [-12, 5], [-12, -5], [-5, 0], [0, 8], [7, -8]].forEach(([semi, det], i) => {
      const o = ctx.createOscillator(); o.type = i % 2 ? 'sawtooth' : 'triangle';
      o.frequency.value = hz(semi, 110); o.detune.value = det;
      const g = ctx.createGain(); g.gain.value = i < 2 ? 0.8 : 0.4;
      o.connect(g).connect(lp); o.start(0); o.stop(AUDIO_DURATION);
    });
    lp.connect(padGain);
    send(padGain, 0.35, 0.9);
  }

  /* ---------- 2. Зажигание линии света (0.2–1.6) ---------- */
  {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(900, 0.15);
    o.frequency.exponentialRampToValueAtTime(5200, 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0.15);
    g.gain.exponentialRampToValueAtTime(0.09, 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, 2.4);
    o.connect(g); o.start(0.15); o.stop(2.5);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const n = noise(0.2, 2.3); const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, 0.2); ng.gain.exponentialRampToValueAtTime(0.05, 1.3); ng.gain.exponentialRampToValueAtTime(0.0001, 2.5);
    n.connect(hp).connect(ng);
    const mix = ctx.createGain(); g.connect(mix); ng.connect(mix);
    send(mix, 0.8, 0.8);
    bell(0.2, hz(7, 880), 0.05, 2.8, 0);
  }

  /* ---------- 3. Нарастание к удару (1.6–4.5) ---------- */
  {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(260, 1.6);
    bp.frequency.exponentialRampToValueAtTime(7000, 4.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 1.6);
    g.gain.exponentialRampToValueAtTime(0.34, 4.46);
    g.gain.setValueAtTime(0.0001, 4.5);
    const n = noise(1.6, 3.0);
    n.connect(bp).connect(g);
    const sp = ctx.createStereoPanner();
    sp.pan.setValueAtTime(-0.7, 1.6); sp.pan.linearRampToValueAtTime(0.7, 4.5);
    g.connect(sp); send(sp, 0.5, 0.9);
    // мерцающие «звёздочки» роя
    for (let i = 0; i < 26; i++) {
      const t = 1.7 + Math.pow(r(), 0.7) * 2.7;
      const f = hz([0, 2, 4, 7, 9, 12, 14, 16][Math.floor(r() * 8)] + 12, 880);
      bell(t, f, 0.012 + 0.02 * ((t - 1.6) / 3), 0.9, r() * 1.6 - 0.8, [1, 2.76]);
    }
  }

  /* ---------- 4. УДАР (4.5): суб-бум, шум, металлический звон ---------- */
  {
    const T = 4.5;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, T); o.frequency.exponentialRampToValueAtTime(34, T + 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T - 0.003); g.gain.linearRampToValueAtTime(0.7, T + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, T + 2.4);
    o.connect(g); o.start(T - 0.003); o.stop(T + 2.5);
    send(g, 0.25, 1);

    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(9000, T); lp.frequency.exponentialRampToValueAtTime(400, T + 1.4);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, T - 0.002); ng.gain.linearRampToValueAtTime(0.45, T + 0.008);
    ng.gain.exponentialRampToValueAtTime(0.0001, T + 1.6);
    noise(T - 0.002, 1.7).connect(lp).connect(ng); send(ng, 0.9, 0.8);

    [0, 7, 12, 16, 19].forEach((s, i) => bell(T, hz(s, 330), 0.2 - i * 0.025, 4.2, (i - 2) * 0.25, [1, 2.4, 4.1, 6.3]));
    // «пост-удар»: тихий вдох реверберации
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, T); sg.gain.linearRampToValueAtTime(0.1, T + 0.05); sg.gain.exponentialRampToValueAtTime(0.0001, T + 2.2);
    noise(T, 2.3).connect(hp).connect(sg); send(sg, 1, 0.5);
  }

  /* ---------- 5. Буквы: восходящая пентатоника (по одной на букву) ---------- */
  {
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
    for (let i = 0; i < 16; i++) {
      const land = 5.75 + i * 0.085 + 0.95 * 0.78;
      // 7-й индекс — пробел между словами, пропускаем акцент
      bell(land, hz(scale[i] - 5, 523.25), 0.07, 1.7, (i / 15) * 1.4 - 0.7);
      const tick = ctx.createOscillator(); tick.type = 'triangle'; tick.frequency.value = hz(scale[i] - 17, 523.25);
      const tg = ctx.createGain(); tg.gain.setValueAtTime(0.0001, land); tg.gain.linearRampToValueAtTime(0.06, land + 0.005); tg.gain.exponentialRampToValueAtTime(0.0001, land + 0.28);
      tick.connect(tg); tick.start(land); tick.stop(land + 0.3); send(tg, 0.2, 0.8);
    }
    // «вздох» света под буквами
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(900, 5.7); bp.frequency.exponentialRampToValueAtTime(5200, 8.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 5.7); g.gain.linearRampToValueAtTime(0.055, 7.0); g.gain.exponentialRampToValueAtTime(0.0001, 8.9);
    const p = ctx.createStereoPanner(); p.pan.setValueAtTime(-0.9, 5.7); p.pan.linearRampToValueAtTime(0.9, 8.8);
    noise(5.7, 3.3).connect(bp).connect(g).connect(p); send(p, 0.6, 0.9);
  }

  /* ---------- 6. Разделитель, подзаголовок, дата ---------- */
  {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(1200, 8.0); bp.frequency.exponentialRampToValueAtTime(3800, 9.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 8.0); g.gain.linearRampToValueAtTime(0.06, 8.7); g.gain.exponentialRampToValueAtTime(0.0001, 9.6);
    noise(8.0, 1.7).connect(bp).connect(g); send(g, 0.5, 0.9);

    [0, 7, 12, 16].forEach((s, i) => bell(8.35 + i * 0.07, hz(s, 440), 0.075, 3.4, (i - 1.5) * 0.3, [1, 2.0, 3.01]));
    bell(9.55, hz(12, 880), 0.06, 3.0, 0.2);
    bell(9.62, hz(19, 880), 0.035, 2.6, -0.3);
  }

  /* ---------- 7. Финальный блик по заголовку (10.9–12.6) ---------- */
  {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6;
    bp.frequency.setValueAtTime(700, 10.9); bp.frequency.exponentialRampToValueAtTime(8000, 12.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 10.9); g.gain.linearRampToValueAtTime(0.1, 11.75); g.gain.exponentialRampToValueAtTime(0.0001, 12.9);
    const p = ctx.createStereoPanner(); p.pan.setValueAtTime(-1, 10.9); p.pan.linearRampToValueAtTime(1, 12.6);
    noise(10.9, 2.1).connect(bp).connect(g).connect(p); send(p, 0.6, 0.9);
    for (let i = 0; i < 34; i++) {
      const k = i / 33;
      const t = 10.95 + k * 1.6 + r() * 0.05;
      const f = hz([0, 4, 7, 9, 12, 16][Math.floor(r() * 6)] + 24, 880);
      bell(t, f, 0.02 + 0.012 * Math.sin(Math.PI * k), 0.7 + r() * 0.5, k * 1.7 - 0.85, [1, 2.76, 5.4]);
    }
    bell(11.3, hz(0, 440), 0.09, 3.0, 0, [1, 1.5, 2, 3.01]);
  }

  return ctx.startRendering();
}

/** Воспроизведение готовой партитуры, синхронное с таймлайном интро. */
export class ScorePlayer {
  private ctx: AudioContext | null = null;
  private src: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private loading: Promise<AudioBuffer> | null = null;
  enabled = false;

  /** Включить звук (вызывать из обработчика жеста пользователя). */
  async enable(): Promise<void> {
    if (!this.ctx) this.ctx = new AudioContext();
    await this.ctx.resume();
    this.enabled = true;
    if (!this.buffer) {
      this.loading ??= renderScore(this.ctx.sampleRate);
      this.buffer = await this.loading;
    }
  }

  getBuffer(): Promise<AudioBuffer> {
    if (this.buffer) return Promise.resolve(this.buffer);
    this.loading ??= renderScore(44100);
    return this.loading.then((b) => (this.buffer = b));
  }

  /** Запустить с позиции `offset` секунд. */
  start(offset = 0) {
    this.stop();
    if (!this.enabled || !this.ctx || !this.buffer || offset >= this.buffer.duration) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffer;
    s.connect(this.ctx.destination);
    s.start(0, Math.max(0, offset));
    this.src = s;
  }

  stop() {
    try { this.src?.stop(); } catch { /* уже остановлен */ }
    this.src?.disconnect();
    this.src = null;
  }

  disable() {
    this.enabled = false;
    this.stop();
  }

  dispose() {
    this.stop();
    this.ctx?.close();
    this.ctx = null;
  }
}
