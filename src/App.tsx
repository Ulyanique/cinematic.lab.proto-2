import { useEffect, useRef, useState, useCallback } from 'react';
import { Intro } from './intro/Intro';
import { ScorePlayer } from './intro/audio';

const CHAPTERS = [
  { t: 1.05, label: 'Свет' },
  { t: 4.5, label: 'Эмблема' },
  { t: 5.75, label: 'Название' },
  { t: 8.35, label: 'Дата' },
  { t: 10.9, label: 'Блик' },
];

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

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
  const scoreRef = useRef<ScorePlayer | null>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [sound, setSound] = useState(false);

  useEffect(() => {
    const host = hostRef.current!;
    const intro = new Intro(host);
    introRef.current = intro;
    const score = new ScorePlayer();
    scoreRef.current = score;
    (window as any).__score = score;
    let dead = false;
    intro.onContextLost = () => {
      if (!dead) setError('Видеокарта сбросила WebGL. Обновите страницу или закройте другие вкладки с 3D-графикой.');
    };
    intro
      .init()
      .then(() => {
        if (dead) return;
        intro.onFrame = (t) => {
          if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(1, t / intro.duration)})`;
          if (timeRef.current) timeRef.current.textContent = `${fmt(Math.min(t, intro.duration))} / ${fmt(intro.duration)}`;
        };
        const q = new URLSearchParams(location.search).get('t');
        (window as any).__intro = intro;
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
      score.dispose();
      scoreRef.current = null;
      intro.dispose();
      if (introRef.current === intro) introRef.current = null;
      if ((window as any).__intro === intro) delete (window as any).__intro;
    };
  }, []);

  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url); }, [video]);

  const poke = useCallback(() => {
    setUiVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setUiVisible(false), 2800);
  }, []);

  useEffect(() => {
    poke();
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|VIDEO)$/.test(e.target.tagName))) return;
      poke();
      if (!recordingRef.current && (e.code === 'Space' || e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        replay();
      }
      if (e.key === 'f' || e.key === 'F') toggleFs();
      if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') toggleSound();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(hideTimer.current); };
  }, [poke]);

  const replay = useCallback(() => {
    introRef.current?.play(0);
    scoreRef.current?.start(0);
  }, []);

  const seekTo = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const intro = introRef.current;
    if (!intro || recordingRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const time = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * intro.duration;
    intro.seek(time);
    scoreRef.current?.start(time);
  }, []);

  const toggleSound = useCallback(async () => {
    const score = scoreRef.current;
    if (!score) return;
    if (score.enabled) {
      score.disable();
      setSound(false);
    } else {
      try {
        await score.enable();
        setSound(true);
        score.start(introRef.current?.t ?? 0);
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else rootRef.current?.requestFullscreen?.();
  };

  const record = async () => {
    const intro = introRef.current;
    if (!intro || recording) return;
    recordingRef.current = true;
    setRecording(true);
    setRecordError(null);
    setProgress(0);
    const score = scoreRef.current;
    score?.stop();
    try {
      const audio = await (score ?? new ScorePlayer()).getBuffer();
      const blob = await intro.record(setProgress, audio);
      const extension = blob.type === 'video/mp4' ? 'mp4' : 'webm';
      if (!intro.lastExportHadAudio) setRecordError('Видео создано без звука: браузер не поддерживает аудиокодек для экспорта.');
      setVideo({ url: URL.createObjectURL(blob), name: `yantarny-tsirkul-intro.${extension}` });
    } catch (e) {
      console.error(e);
      setRecordError(e instanceof Error ? e.message : String(e));
    } finally {
      recordingRef.current = false;
      setRecording(false);
      score?.start(intro.t);
    }
  };

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none"
      onPointerMove={poke}
      style={{ cursor: uiVisible ? 'default' : 'none' }}
    >
      <div
        className="relative bg-black"
        style={{ width: 'min(100vw, 177.7778vh)', height: 'min(100vh, 56.25vw)' }}
      >
        <div ref={hostRef} className="absolute inset-0" />

        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="flex flex-col items-center gap-5">
              <div className="w-10 h-10 rounded-full border border-amber-500/20 border-t-amber-300/90 animate-spin" />
              <div className="text-[11px] tracking-[0.5em] text-amber-200/60 uppercase" style={{ fontFamily: 'Forum, serif' }}>
                Подготовка сцены
              </div>
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
            <div className="text-sm tracking-widest uppercase">Покадровый экспорт 1920 × 1080</div>
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
              aria-label="Позиция в интро"
              aria-valuemin={0}
              aria-valuemax={Math.round(introRef.current?.duration ?? 13.6)}
            >
              <div className="absolute left-0 right-0 bottom-0 h-[2px] group-hover:h-[4px] bg-white/10 transition-all">
                <div
                  ref={barRef}
                  className="h-full origin-left"
                  style={{ background: 'linear-gradient(90deg, transparent, #d89a3a, #ffe3a0)', transform: 'scaleX(0)' }}
                />
                {CHAPTERS.map((c) => (
                  <div key={c.label} className="absolute bottom-0 h-full w-px bg-amber-200/50" style={{ left: `${(c.t / 13.6) * 100}%` }}>
                    <span className="absolute bottom-3 -translate-x-1/2 whitespace-nowrap text-[9px] tracking-[0.25em] uppercase text-amber-100/0 group-hover:text-amber-100/70 transition-colors">
                      {c.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {!sound && (
              <button
                onClick={toggleSound}
                className="absolute top-4 right-4 flex items-center gap-2 px-4 py-2 text-[10px] tracking-[0.3em] uppercase rounded-full border border-amber-300/30 text-amber-100/80 bg-black/40 backdrop-blur-md animate-pulse hover:border-amber-300/70 transition"
              >
                <Icon d="M11 5 6 9H2v6h4l5 4V5Z" extra={<path d="M15.5 8.5a5 5 0 0 1 0 7" />} /> Включить звук
              </button>
            )}
            {recordError && <div role="alert" className="absolute top-4 left-4 right-4 text-center text-amber-100 bg-black/80 p-3">{recordError}</div>}
            <div
              onFocus={() => { window.clearTimeout(hideTimer.current); setUiVisible(true); }}
              onBlur={poke}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-wrap justify-center w-full px-2 items-center gap-2 transition-opacity duration-700"
              style={{ opacity: uiVisible ? 1 : 0, pointerEvents: uiVisible ? 'auto' : 'none' }}
              inert={!uiVisible}
            >
              <Btn onClick={replay} disabled={recording}>
                <Icon d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" /> Повторить
              </Btn>
              <Btn onClick={toggleSound} active={sound}>
                {sound ? (
                  <Icon d="M11 5 6 9H2v6h4l5 4V5Z" extra={<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />} />
                ) : (
                  <Icon d="M11 5 6 9H2v6h4l5 4V5Z" extra={<path d="m22 9-6 6m0-6 6 6" />} />
                )}
                Звук
              </Btn>
              <Btn onClick={record} disabled={recording}>
                <Icon d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0" extra={<circle cx="12" cy="12" r="9" />} />
                {recording ? 'Экспорт…' : 'Создать видео'}
              </Btn>
              <Btn onClick={toggleFs}>
                <Icon d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /> На весь экран
              </Btn>
              <span ref={timeRef} className="ml-2 tabular-nums text-[10px] tracking-[0.2em] text-amber-100/40" />
            </div>
          </>
        )}
      </div>
    </div>
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
