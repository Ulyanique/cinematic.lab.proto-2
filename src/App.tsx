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
  const [uiVisible, setUiVisible] = useState(true);
  const hideTimer = useRef<number>(0);

  useEffect(() => {
    const host = hostRef.current!;
    const intro = new Intro(host);
    introRef.current = intro;
    let dead = false;
    intro
      .init()
      .then(() => {
        if (dead) return;
        intro.onFrame = (t) => {
          if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(1, t / intro.duration)})`;
        };
        const q = new URLSearchParams(location.search).get('t');
        (window as any).__intro = intro;
        if (q !== null) intro.freeze = parseFloat(q);
        else intro.play();
        setReady(true);
      })
      .catch((e) => {
        console.error(e);
        setError(String(e?.message || e));
      });
    return () => {
      dead = true;
      intro.dispose();
    };
  }, []);

  const poke = useCallback(() => {
    setUiVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setUiVisible(false), 2800);
  }, []);

  useEffect(() => {
    poke();
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        introRef.current?.play();
      }
      if (e.key === 'f' || e.key === 'F') toggleFs();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [poke]);

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else rootRef.current?.requestFullscreen?.();
  };

  const record = async () => {
    const intro = introRef.current;
    if (!intro || recording) return;
    setRecording(true);
    try {
      const blob = await intro.record();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'yantarny-tsirkul-intro.webm';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (e) {
      console.error(e);
    }
    setRecording(false);
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
            Не удалось запустить WebGL: {error}
          </div>
        )}

        {ready && (
          <>
            <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-white/5">
              <div
                ref={barRef}
                className="h-full origin-left"
                style={{ background: 'linear-gradient(90deg, transparent, #d89a3a, #ffe3a0)', transform: 'scaleX(0)' }}
              />
            </div>
            <div
              className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 transition-opacity duration-700"
              style={{ opacity: uiVisible ? 1 : 0, pointerEvents: uiVisible ? 'auto' : 'none' }}
            >
              <Btn onClick={() => introRef.current?.play()} disabled={recording}>
                ↻ Повторить
              </Btn>
              <Btn onClick={record} disabled={recording}>
                {recording ? '● Идёт запись…' : '● Записать видео'}
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
