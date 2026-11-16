import { useEffect, useRef, useState, useCallback } from 'react';
import { Intro } from './intro/Intro';

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

  useEffect(() => {
    const host = hostRef.current!;
    const intro = new Intro(host);
    introRef.current = intro;
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
        introRef.current?.play();
      }
      if (e.key === 'f' || e.key === 'F') toggleFs();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(hideTimer.current); };
  }, [poke]);

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
    try {
      const blob = await intro.record(setProgress);
      const extension = blob.type === 'video/mp4' ? 'mp4' : 'webm';
      setVideo({ url: URL.createObjectURL(blob), name: `yantarny-tsirkul-intro.${extension}` });
    } catch (e) {
      console.error(e);
      setRecordError(e instanceof Error ? e.message : String(e));
    } finally {
      recordingRef.current = false;
      setRecording(false);
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
            <div className="absolute top-3 right-3 flex gap-2">
              <a href={video.url} download={video.name} className="px-4 py-2 text-xs rounded-full border border-amber-300/40 text-amber-100 bg-black/80">Скачать видео</a>
              <Btn onClick={() => setVideo(null)}>Закрыть видео</Btn>
            </div>
          </div>
        )}
        {ready && !error && !video && (
          <>
            <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-white/5">
              <div
                ref={barRef}
                className="h-full origin-left"
                style={{ background: 'linear-gradient(90deg, transparent, #d89a3a, #ffe3a0)', transform: 'scaleX(0)' }}
              />
            </div>
            {recordError && <div role="alert" className="absolute top-4 left-4 right-4 text-center text-amber-100 bg-black/80 p-3">{recordError}</div>}
            <div
              onFocus={() => { window.clearTimeout(hideTimer.current); setUiVisible(true); }}
              onBlur={poke}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-wrap justify-center w-full px-2 items-center gap-2 transition-opacity duration-700"
              style={{ opacity: uiVisible ? 1 : 0, pointerEvents: uiVisible ? 'auto' : 'none' }}
              inert={!uiVisible}
            >
              <Btn onClick={() => introRef.current?.play()} disabled={recording}>
                ↻ Повторить
              </Btn>
              <Btn onClick={record} disabled={recording}>
                {recording ? '● Экспорт…' : '● Создать видео'}
              </Btn>
              <Btn onClick={toggleFs}>⛶ На весь экран</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Btn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 text-[11px] tracking-[0.22em] uppercase rounded-full border border-amber-300/25 text-amber-100/80 bg-black/50 backdrop-blur-md hover:border-amber-300/60 hover:text-amber-100 hover:bg-black/70 transition disabled:opacity-50"
    >
      {children}
    </button>
  );
}
