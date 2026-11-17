import { useEffect, useRef, useState, useCallback } from 'react';
import { Intro, type ClipMode } from './intro/Intro';
import { DEFAULT_CONFIG, DESIGN_IMPACT, cloneConfig, sanitizeConfig, setPath, totalDuration, type Config } from './intro/config';
import { CompositionPanel, GearIcon, LayersIcon, SettingsPanel, type Tab } from './ui/Panels';

const STORE_KEY = 'cinematic.lab.proto-2.config.v1';

function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return sanitizeConfig(JSON.parse(raw));
  } catch { /* повреждённые данные — используем значения по умолчанию */ }
  return cloneConfig(DEFAULT_CONFIG);
}

const fmt = (t: number) => `${t.toFixed(1)}`;
const CLIP_OPTIONS: [ClipMode, string][] = [
  ['intro', 'Интро'],
  ['outro', 'Аутро · обратная анимация'],
  ['background', 'Фон · зацикленный финал интро'],
];

const Icon = ({ d, extra }: { d: string; extra?: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
    {extra}
  </svg>
);

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<Intro | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [video, setVideo] = useState<{ url: string; name: string } | null>(null);
  const recordingRef = useRef(false);
  const [uiVisible, setUiVisible] = useState(true);
  const hideTimer = useRef<number>(0);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [clipMode, setClipMode] = useState<ClipMode>('intro');

  const [cfg, setCfgState] = useState<Config>(loadConfig);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const [openSettings, setOpenSettings] = useState(false);
  const [openComp, setOpenComp] = useState(false);
  const [tab, setTab] = useState<Tab>('layer');
  const [selected, setSelected] = useState<string>('logo');
  const [warn, setWarn] = useState<string | null>(null);
  const panelOpen = openSettings || openComp;

  const setCfg = useCallback((fn: (c: Config) => Config) => setCfgState((c) => fn(c)), []);
  const setValue = useCallback((path: string, value: any) => setCfgState((c) => setPath(c, path, value)), []);

  /* ------------------------------------------------------------ движок */
  useEffect(() => {
    const host = hostRef.current!;
    const intro = new Intro(host, cfgRef.current);
    introRef.current = intro;
    let dead = false;
    intro.onContextLost = () => {
      if (!dead) setError('Видеокарта сбросила WebGL. Обновите страницу или закройте другие вкладки с 3D-графикой.');
    };
    intro.onWarn = (m) => { if (!dead) setWarn(m); };
    intro
      .init()
      .then(() => {
        if (dead) return;
        intro.onFrame = (t) => {
          if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(1, t / intro.duration)})`;
          if (timeRef.current) timeRef.current.textContent = `${fmt(Math.min(t, intro.duration))} / ${fmt(intro.duration)} c`;
        };
        const q = new URLSearchParams(location.search).get('t');
        (window as any).__intro = intro;
        // для отладки и автотестов: window.__applyConfig({...}) применяет JSON-настройки
        (window as any).__applyConfig = (raw: any) => setCfgState(sanitizeConfig(raw));
        const time = q === null || q.trim() === '' ? NaN : Number(q);
        if (Number.isFinite(time)) intro.freeze = Math.max(0, Math.min(intro.duration, time));
        else intro.play();
        setReady(true);
      })
      .catch((e) => {
        console.error(e);
        intro.dispose();
        if (!dead) setError(String(e?.message || e));
      });
    return () => {
      dead = true;
      intro.dispose();
      if (introRef.current === intro) introRef.current = null;
      if ((window as any).__intro === intro) delete (window as any).__intro;
    };
  }, []);

  // конфигурация → движок; сохранение в localStorage
  useEffect(() => {
    const intro = introRef.current;
    if (intro && ready) intro.setConfig(cfg);
    const id = window.setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch { /* квота */ } }, 300);
    return () => window.clearTimeout(id);
  }, [cfg, ready]);

  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url); }, [video]);

  const poke = useCallback(() => {
    setUiVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setUiVisible(false), 2800);
  }, []);

  const replay = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
    introRef.current?.play(0);
  }, []);

  const changeClipMode = useCallback((mode: ClipMode) => {
    setClipMode(mode);
    pausedRef.current = false;
    setPaused(false);
    introRef.current?.setClipMode(mode);
  }, []);

  const togglePause = useCallback(() => {
    const intro = introRef.current;
    if (!intro || recordingRef.current) return;
    if (pausedRef.current) {
      pausedRef.current = false;
      setPaused(false);
      intro.play(Math.min(intro.t, intro.duration));
    } else {
      pausedRef.current = true;
      setPaused(true);
      intro.freeze = intro.t;
    }
  }, []);

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else rootRef.current?.requestFullscreen?.();
  };

  useEffect(() => {
    poke();
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|VIDEO)$/.test(e.target.tagName))) return;
      poke();
      // физические клавиши (e.code): работают в любой раскладке, в том числе в русской
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!recordingRef.current && (e.code === 'Space' || e.code === 'KeyR')) {
        e.preventDefault();
        replay();
      }
      if (e.code === 'KeyP') togglePause();
      if (e.code === 'KeyF') toggleFs();
      if (e.key === 'Escape') { setOpenSettings(false); setOpenComp(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(hideTimer.current); };
  }, [poke, replay, togglePause]);

  const seekTo = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const intro = introRef.current;
    if (!intro || recordingRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const time = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * intro.duration;
    if (pausedRef.current) { intro.freeze = time; intro.t = time; return; }
    intro.seek(time);
  }, []);

  const record = async () => {
    const intro = introRef.current;
    if (!intro || recording) return;
    recordingRef.current = true;
    setRecording(true);
    setRecordError(null);
    setProgress(0);
    try {
      const g = cfgRef.current.general;
      const blob = await intro.record(setProgress);
      const extension = blob.type === 'video/mp4' ? 'mp4' : 'webm';
      const configuredStem = g.fileName.trim();
      const stem = (configuredStem || clipMode).replace(/[^\w.\-а-яА-ЯёЁ ]+/g, '_');
      const suffix = clipMode === 'intro' || !configuredStem ? '' : `-${clipMode}`;
      setVideo({ url: URL.createObjectURL(blob), name: `${stem}${suffix}.${extension}` });
    } catch (e) {
      console.error(e);
      setRecordError(e instanceof Error ? e.message : String(e));
    } finally {
      recordingRef.current = false;
      setRecording(false);
    }
  };

  /* ------------------------------------------------------------ главы таймлайна (реальное время) */
  const g = cfg.general;
  const duration = totalDuration(cfg);
  const real = (tau: number) => (tau < DESIGN_IMPACT ? (tau * g.impact) / DESIGN_IMPACT : g.impact + (tau - DESIGN_IMPACT) / g.speed);
  const L = cfg.layers;
  const storyChapters = [
    { t: real(1.05), label: 'Свет' },
    { t: g.impact, label: 'Эмблема' },
    { t: real(L.title.start + L.title.delay), label: 'Название' },
    { t: real(L.subtitle.start + L.subtitle.delay), label: 'Подзаголовок' },
    { t: real(L.date.start + L.date.delay), label: 'Дата' },
    { t: real(10.9), label: 'Блик' },
  ].filter((c) => c.t >= 0 && c.t <= duration);
  const chapters = clipMode === 'background' ? [] : storyChapters.map((c) => ({
    ...c,
    t: clipMode === 'outro' ? duration - c.t : c.t,
  }));
  const EW = Math.round(g.width / 2) * 2, EH = Math.round((EW * 9) / 16 / 2) * 2;

  const openLayerSettings = (id: string) => { setSelected(id); setTab('layer'); setOpenSettings(true); };

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none"
      onPointerMove={poke}
      style={{ cursor: uiVisible || panelOpen ? 'default' : 'none' }}
    >
      <div className="relative bg-black" style={{ width: 'min(100vw, 177.7778vh)', height: 'min(100vh, 56.25vw)' }}>
        <div ref={hostRef} className="absolute inset-0" />

        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="flex flex-col items-center gap-5">
              <div className="w-10 h-10 rounded-full border border-amber-500/20 border-t-amber-300/90 animate-spin" />
              <div className="text-[11px] tracking-[0.5em] text-amber-200/60 uppercase" style={{ fontFamily: 'Forum, serif' }}>Подготовка сцены</div>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-amber-200/80 p-8 text-center text-sm">
            Не удалось подготовить сцену: {error}
          </div>
        )}

        {recording && !error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/90 text-amber-100" role="status" aria-live="polite">
            <div className="text-sm tracking-widest uppercase">Покадровый экспорт {EW} × {EH} · {g.fps} к/с</div>
            <div className="w-64 max-w-[80%] h-1 bg-white/15"><div className="h-full bg-amber-300" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <div className="text-xs text-amber-100/70">{progress < 1 ? `${Math.round(progress * 100)}%` : 'Сохранение видео…'}</div>
            <div className="text-xs text-amber-100/50 text-center px-4">Это может занять несколько минут. Не закрывайте вкладку.</div>
          </div>
        )}
        {video && !recording && !error && (
          <div className="absolute inset-0 z-10 bg-black flex flex-col items-center justify-center">
            <video src={video.url} controls autoPlay loop playsInline className="w-full h-full object-contain" />
            {recordError && <div role="alert" className="absolute bottom-16 left-4 right-4 text-center text-xs text-amber-100/80 bg-black/70 p-2">{recordError}</div>}
            <div className="absolute top-3 right-3 flex gap-2">
              <a href={video.url} download={video.name} className="px-4 py-2 text-xs rounded-full border border-amber-300/40 text-amber-100 bg-black/80">Скачать видео</a>
              <Btn onClick={() => setVideo(null)}>Закрыть видео</Btn>
            </div>
          </div>
        )}

        {ready && !error && !video && (
          <>
            {/* таймлайн: клик/перетаскивание = перемотка */}
            <div
              className="group absolute left-0 right-0 bottom-0 h-5 cursor-pointer touch-none"
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seekTo(e); }}
              onPointerMove={(e) => { if (e.buttons) seekTo(e); }}
              role="slider"
              aria-label={`Позиция: ${CLIP_OPTIONS.find(([mode]) => mode === clipMode)?.[1] || 'ролик'}`}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
            >
              <div className="absolute left-0 right-0 bottom-0 h-[2px] group-hover:h-[4px] bg-white/10 transition-all">
                <div ref={barRef} className="h-full origin-left" style={{ background: 'linear-gradient(90deg, transparent, #d89a3a, #ffe3a0)', transform: 'scaleX(0)' }} />
                {chapters.map((c) => (
                  <div key={c.label} className="absolute bottom-0 h-full w-px bg-amber-200/50" style={{ left: `${(c.t / duration) * 100}%` }}>
                    <span className="absolute bottom-3 -translate-x-1/2 whitespace-nowrap text-[9px] tracking-[0.25em] uppercase text-amber-100/0 group-hover:text-amber-100/70 transition-colors">{c.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="absolute left-4 right-24 top-4 z-30 flex justify-center transition-opacity duration-500"
              style={{ opacity: uiVisible || panelOpen ? 1 : 0, pointerEvents: uiVisible || panelOpen ? 'auto' : 'none' }}
            >
              <label htmlFor="clip-mode" className="sr-only">Выбор ролика</label>
              <div className="relative w-full max-w-xs min-w-0">
                <select
                  id="clip-mode"
                  aria-label="Тип ролика"
                  value={clipMode}
                  disabled={recording}
                  onChange={(e) => changeClipMode(e.target.value as ClipMode)}
                  className="w-full max-w-full appearance-none truncate rounded-full border border-amber-300/35 bg-black/70 py-2 pl-4 pr-9 text-[10px] tracking-[0.2em] uppercase text-amber-100/90 shadow-lg backdrop-blur-md outline-none transition hover:border-amber-300/70 focus:border-amber-300/70 disabled:opacity-50"
                  style={{ colorScheme: 'dark', maxWidth: '100%' }}
                >
                  {CLIP_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-100/60" aria-hidden>⌄</span>
              </div>
            </div>

            {/* минималистичные кнопки: композиция и настройки */}
            <div
              className="absolute right-4 top-4 z-30 flex items-center gap-2 transition-opacity duration-500"
              style={{ opacity: uiVisible || panelOpen ? 1 : 0, pointerEvents: uiVisible || panelOpen ? 'auto' : 'none' }}
            >
              <RoundBtn label="Композиция: слои" active={openComp} onClick={() => setOpenComp((v) => !v)}><LayersIcon /></RoundBtn>
              <RoundBtn label="Настройки" active={openSettings} onClick={() => setOpenSettings((v) => !v)}><GearIcon /></RoundBtn>
            </div>

            {recordError && <div role="alert" className="absolute top-16 left-4 right-4 text-center text-amber-100 bg-black/80 p-3 text-sm">{recordError}</div>}
            <div
              onFocus={() => { window.clearTimeout(hideTimer.current); setUiVisible(true); }}
              onBlur={poke}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-wrap justify-center w-full px-2 items-center gap-2 transition-opacity duration-700"
              style={{ opacity: uiVisible ? 1 : 0, pointerEvents: uiVisible ? 'auto' : 'none' }}
              inert={!uiVisible}
            >
              <Btn onClick={replay} disabled={recording}><Icon d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" /> Повторить</Btn>
              <Btn onClick={togglePause} disabled={recording} active={paused}>
                {paused ? <Icon d="M7 4v16l13-8z" /> : <Icon d="M8 5v14M16 5v14" />} {paused ? 'Продолжить' : 'Пауза'}
              </Btn>
              <Btn onClick={record} disabled={recording}>
                <Icon d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0" extra={<circle cx="12" cy="12" r="9" />} />
                {recording ? 'Экспорт…' : 'Создать видео'}
              </Btn>
              <Btn onClick={toggleFs}><Icon d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /> На весь экран</Btn>
              <span ref={timeRef} className="ml-2 tabular-nums text-[10px] tracking-[0.2em] text-amber-100/40" />
            </div>
          </>
        )}
      </div>

      {ready && !error && !video && openComp && (
        <CompositionPanel cfg={cfg} setCfg={setCfg} selected={selected} onSelect={openLayerSettings} onClose={() => setOpenComp(false)} />
      )}
      {ready && !error && !video && openSettings && (
        <SettingsPanel cfg={cfg} setCfg={setCfg} setValue={setValue} selected={selected} onSelect={setSelected} onClose={() => setOpenSettings(false)} tab={tab} setTab={setTab} warn={warn} />
      )}
    </div>
  );
}

function RoundBtn({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`grid h-9 w-9 place-items-center rounded-full border backdrop-blur-md transition hover:border-amber-300/70 hover:text-amber-100 ${active ? 'border-amber-300/70 bg-amber-200/15 text-amber-100' : 'border-amber-300/25 bg-black/40 text-amber-100/70'}`}
    >
      {children}
    </button>
  );
}

function Btn({ children, onClick, disabled, active }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-4 py-2 text-[11px] tracking-[0.22em] uppercase rounded-full border bg-black/50 backdrop-blur-md hover:border-amber-300/60 hover:text-amber-100 hover:bg-black/70 transition disabled:opacity-50 ${
        active ? 'border-amber-300/60 text-amber-100' : 'border-amber-300/25 text-amber-100/80'
      }`}
    >
      {children}
    </button>
  );
}

