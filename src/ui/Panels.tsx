import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_CONFIG, DEFAULT_ORDER, LAYER_META, LOOKS, LOGO_PRESET_DEFAULTS, SCHEMA, FIELD_INDEX,
  cloneConfig, getPath, sanitizeConfig, setPath, type Config, type Field, type LayerId,
} from '../intro/config';

/* ------------------------------------------------------------------ иконки */
export const Ico = ({ d, size = 15, children }: { d?: string; size?: number; children?: ReactNode }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d && <path d={d} />}
    {children}
  </svg>
);
export const GearIcon = () => (
  <Ico><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Ico>
);
export const LayersIcon = () => (
  <Ico><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /><path d="m3 17.5 9 5 9-5" opacity=".5" /></Ico>
);

/* ------------------------------------------------------------------ плавающая панель */
export function FloatPanel({ title, icon, x, y, width = 340, onClose, children, right }: {
  title: string; icon?: ReactNode; x: number; y: number; width?: number; onClose: () => void; children: ReactNode; right?: ReactNode;
}) {
  const [pos, setPos] = useState({ x, y });
  const [hover, setHover] = useState(false);
  const [drag, setDrag] = useState(false);
  const [min, setMin] = useState(false);
  const off = useRef({ x: 0, y: 0 });
  const focus = useRef(false);

  useEffect(() => {
    const clamp = () => setPos((p) => ({ x: Math.max(8, Math.min(p.x, window.innerWidth - 80)), y: Math.max(8, Math.min(p.y, window.innerHeight - 48)) }));
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, []);

  const active = hover || drag || focus.current;
  return (
    <div
      data-panel
      className="fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-amber-100/10 bg-[#0a0805]/80 text-[12px] text-amber-50/90 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-opacity duration-300"
      style={{ left: pos.x, top: pos.y, width, maxWidth: 'calc(100vw - 16px)', opacity: active ? 1 : 0.5 }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocusCapture={() => { focus.current = true; setHover((h) => h); }}
      onBlurCapture={() => { focus.current = false; }}
    >
      <div
        className="flex cursor-grab select-none items-center gap-2 border-b border-white/5 px-3 py-2 active:cursor-grabbing"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          off.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
          setDrag(true);
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          setPos({ x: Math.max(8 - width + 80, Math.min(e.clientX - off.current.x, window.innerWidth - 80)), y: Math.max(8, Math.min(e.clientY - off.current.y, window.innerHeight - 40)) });
        }}
        onPointerUp={() => setDrag(false)}
        onPointerCancel={() => setDrag(false)}
        onDoubleClick={() => setMin((m) => !m)}
      >
        <span className="text-amber-200/70">{icon}</span>
        <span className="flex-1 text-[10px] uppercase tracking-[0.28em] text-amber-100/80">{title}</span>
        {right}
        <button aria-label={min ? 'Развернуть' : 'Свернуть'} onClick={() => setMin((m) => !m)} className="grid h-5 w-5 place-items-center rounded text-amber-100/50 hover:bg-white/10 hover:text-amber-100">
          <Ico size={12}><path d={min ? 'm6 9 6 6 6-6' : 'm6 15 6-6 6 6'} /></Ico>
        </button>
        <button aria-label="Закрыть" onClick={onClose} className="grid h-5 w-5 place-items-center rounded text-amber-100/50 hover:bg-white/10 hover:text-amber-100">
          <Ico size={12}><path d="M6 6l12 12M18 6 6 18" /></Ico>
        </button>
      </div>
      {!min && <div className="panel-scroll max-h-[min(72vh,640px)] overflow-y-auto overflow-x-hidden">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ элементы управления */
const inputCls = 'rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-amber-50 outline-none focus:border-amber-300/50';

function Row({ field, path, value, def, onChange }: { field: Field; path: string; value: any; def: any; onChange: (v: any) => void }) {
  const changed = JSON.stringify(value) !== JSON.stringify(def);
  const reset = () => onChange(def);
  const label = (
    <button onDoubleClick={reset} title={changed ? 'Двойной клик — сбросить к значению по умолчанию' : field.hint} className="flex min-w-0 items-center gap-1.5 text-left text-amber-100/70">
      <span className={`h-1 w-1 shrink-0 rounded-full ${changed ? 'bg-amber-300' : 'bg-transparent'}`} />
      <span className="truncate">{field.label}</span>
    </button>
  );
  if (field.t === 'num') {
    const p = ((Number(value) - field.min) / (field.max - field.min)) * 100;
    return (
      <div className="px-3 py-1.5" data-path={path}>
        <div className="mb-0.5 flex items-center justify-between gap-2">
          {label}
          <span className="flex items-center gap-1">
            <input
              type="number" min={field.min} max={field.max} step={field.step} value={Number.isFinite(value) ? Number(Number(value).toFixed(4)) : 0}
              onChange={(e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) onChange(Math.min(field.max, Math.max(field.min, n))); }}
              className={`${inputCls} w-[64px] text-right tabular-nums`} aria-label={field.label}
            />
            {field.unit && <span className="w-5 text-[10px] text-amber-100/35">{field.unit}</span>}
          </span>
        </div>
        <input type="range" className="rng" min={field.min} max={field.max} step={field.step} value={value} style={{ ['--p' as any]: `${Math.max(0, Math.min(100, p))}%` }} onChange={(e) => onChange(parseFloat(e.target.value))} aria-label={field.label} />
      </div>
    );
  }
  if (field.t === 'bool') {
    return (
      <div className="flex items-center justify-between px-3 py-1.5" data-path={path}>
        {label}
        <button role="switch" aria-checked={!!value} onClick={() => onChange(!value)} className={`relative h-4 w-7 rounded-full border transition ${value ? 'border-amber-300/60 bg-amber-300/30' : 'border-white/15 bg-white/5'}`}>
          <span className={`absolute top-[1px] h-3 w-3 rounded-full transition-all ${value ? 'left-[13px] bg-amber-200' : 'left-[1px] bg-white/40'}`} />
        </button>
      </div>
    );
  }
  if (field.t === 'color') {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-1.5" data-path={path}>
        {label}
        <span className="flex items-center gap-1.5">
          <input type="text" value={value} onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value); }} className={`${inputCls} w-[74px] font-mono uppercase`} aria-label={`${field.label} (hex)`} />
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={field.label} />
        </span>
      </div>
    );
  }
  if (field.t === 'sel') {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-1.5" data-path={path}>
        {label}
        <select
          value={String(value)}
          onChange={(e) => onChange(typeof def === 'number' ? Number(e.target.value) : e.target.value)}
          className={`${inputCls} max-w-[170px] cursor-pointer bg-[#15110a]`} aria-label={field.label}
        >
          {field.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    );
  }
  if (field.t === 'area') {
    return (
      <div className="px-3 py-1.5" data-path={path}>
        <div className="mb-1">{label}</div>
        <textarea value={value} spellCheck={false} rows={4} placeholder="<svg viewBox=…>" onChange={(e) => onChange(e.target.value)} className={`${inputCls} h-20 w-full resize-y font-mono text-[10px]`} aria-label={field.label} />
        <div className="mt-1 flex gap-1.5">
          <label className="cursor-pointer rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-amber-100/70 hover:border-amber-300/40">
            Загрузить файл…
            <input type="file" accept=".svg,image/svg+xml" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) onChange(await f.text()); e.target.value = ''; }} />
          </label>
          {value && <button onClick={() => onChange('')} className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-amber-100/70 hover:border-amber-300/40">Вернуть встроенную</button>}
        </div>
        {field.hint && <div className="mt-1 text-[10px] leading-snug text-amber-100/35">{field.hint}</div>}
      </div>
    );
  }
  return (
    <div className="px-3 py-1.5" data-path={path}>
      <div className="mb-1">{label}</div>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} w-full`} aria-label={field.label} />
    </div>
  );
}

function Group({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-white/5 pb-1">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-amber-200/60 hover:text-amber-100">
        {title}
        <Ico size={11}><path d={open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></Ico>
      </button>
      {open && children}
    </section>
  );
}

type Setter = (path: string, value: any) => void;

function Fields({ scope, cfg, set, defaultOpen }: { scope: string; cfg: Config; set: Setter; defaultOpen?: boolean }) {
  const prefix = ['general', 'camera', 'post'].includes(scope) ? scope : `layers.${scope}`;
  return (
    <>
      {(SCHEMA[scope] ?? []).map((sec, i) => (
        <Group key={sec.title} title={sec.title} defaultOpen={defaultOpen ?? i === 0 ? true : i < 2}>
          {sec.fields.map((f) => {
            const path = `${prefix}.${f.k}`;
            return (
              <Row
                key={path} field={f} path={path} value={getPath(cfg, path)} def={getPath(DEFAULT_CONFIG, path)}
                onChange={(v) => {
                  set(path, v);
                  // при смене пресета эмблемы подставляем рекомендованные тайминги
                  if (path === 'layers.logo.preset' && LOGO_PRESET_DEFAULTS[v]) {
                    for (const [k, val] of Object.entries(LOGO_PRESET_DEFAULTS[v])) set(`layers.logo.${k}`, val);
                  }
                }}
              />
            );
          })}
        </Group>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ панель «Композиция» */
export function CompositionPanel({ cfg, setCfg, selected, onSelect, onClose }: {
  cfg: Config; setCfg: (fn: (c: Config) => Config) => void; selected: string; onSelect: (id: string) => void; onClose: () => void;
}) {
  const [dragId, setDragId] = useState<LayerId | null>(null);
  const [overId, setOverId] = useState<LayerId | null>(null);
  const [step, setStep] = useState(0.35);
  const move = (id: LayerId, to: number) =>
    setCfg((c) => {
      const order = c.order.filter((x) => x !== id);
      order.splice(Math.max(0, Math.min(order.length, to)), 0, id);
      return { ...c, order };
    });
  const toggle = (id: string) => setCfg((c) => setPath(c, `layers.${id}.enabled`, !(c.layers as any)[id].enabled));
  const cascade = () =>
    setCfg((c) => {
      let out = c;
      const items = c.order.filter((id) => id !== 'fx');
      items.forEach((id, i) => { out = setPath(out, `layers.${id}.delay`, Math.round((items.length - 1 - i) * step * 100) / 100); });
      return out;
    });
  const clearDelays = () => setCfg((c) => { let out = c; for (const id of ['background', ...c.order]) if (id !== 'fx') out = setPath(out, `layers.${id}.delay`, 0); return out; });

  const Row2 = ({ id, idx, pinned }: { id: string; idx: number; pinned?: boolean }) => {
    const L = (cfg.layers as any)[id];
    const meta = LAYER_META[id];
    const sel = selected === id;
    const over = overId === id && dragId && dragId !== id;
    return (
      <li
        draggable={!pinned}
        onDragStart={(e) => { setDragId(id as LayerId); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); }}
        onDragOver={(e) => { if (dragId && !pinned) { e.preventDefault(); setOverId(id as LayerId); } }}
        onDrop={(e) => { e.preventDefault(); if (dragId && !pinned && dragId !== id) move(dragId, idx); setDragId(null); setOverId(null); }}
        onDragEnd={() => { setDragId(null); setOverId(null); }}
        onClick={() => onSelect(id)}
        className={`group flex cursor-pointer items-center gap-1.5 border-l-2 px-2 py-1.5 transition ${sel ? 'border-amber-300 bg-amber-200/10' : 'border-transparent hover:bg-white/5'} ${over ? 'shadow-[inset_0_2px_0_0_rgba(255,214,140,0.9)]' : ''} ${dragId === id ? 'opacity-40' : ''}`}
        data-layer={id}
      >
        <span className={`w-3 text-center text-amber-100/30 ${pinned ? '' : 'cursor-grab'}`} title={pinned ? 'Фон всегда внизу' : 'Перетащите, чтобы изменить порядок'}>{pinned ? '⌃' : '⋮⋮'}</span>
        <button aria-label={L.enabled ? 'Скрыть слой' : 'Показать слой'} aria-pressed={L.enabled} onClick={(e) => { e.stopPropagation(); toggle(id); }} className={`grid h-6 w-6 place-items-center rounded transition hover:bg-white/10 ${L.enabled ? 'text-amber-200' : 'text-amber-100/25'}`}>
          <Ico size={14}>{L.enabled ? <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></> : <><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.5 0-10-7-10-7a17.6 17.6 0 0 1 4.1-4.9M9.9 5.2A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-2.2 3.2M2 2l20 20" /></>}</Ico>
        </button>
        <div className="min-w-0 flex-1">
          <div className={`truncate text-[12px] ${L.enabled ? 'text-amber-50' : 'text-amber-100/35 line-through decoration-white/20'}`}>{meta.label}</div>
          <div className="truncate text-[10px] text-amber-100/35">{meta.hint}{L.delay ? ` · сдвиг ${L.delay > 0 ? '+' : ''}${L.delay} с` : ''}</div>
        </div>
        {!pinned && (
          <span className="flex opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            <button aria-label="Выше" disabled={idx === 0} onClick={(e) => { e.stopPropagation(); move(id as LayerId, idx - 1); }} className="grid h-5 w-5 place-items-center rounded text-amber-100/60 hover:bg-white/10 disabled:opacity-20"><Ico size={11}><path d="m6 15 6-6 6 6" /></Ico></button>
            <button aria-label="Ниже" disabled={idx === cfg.order.length - 1} onClick={(e) => { e.stopPropagation(); move(id as LayerId, idx + 1); }} className="grid h-5 w-5 place-items-center rounded text-amber-100/60 hover:bg-white/10 disabled:opacity-20"><Ico size={11}><path d="m6 9 6 6 6-6" /></Ico></button>
          </span>
        )}
      </li>
    );
  };

  return (
    <FloatPanel title="Композиция" icon={<LayersIcon />} x={16} y={64} width={300} onClose={onClose}>
      <div className="px-3 pb-1 pt-2 text-[10px] leading-snug text-amber-100/40">Верхний слой — ближе к зрителю. Перетаскивайте строки, глазом отключайте слои.</div>
      <ul className="pb-1" aria-label="Слои композиции">
        {cfg.order.map((id, i) => <Row2 key={id} id={id} idx={i} />)}
        <Row2 id="background" idx={cfg.order.length} pinned />
      </ul>
      <Group title="Очерёдность появления" defaultOpen={false}>
        <div className="px-3 pb-1 text-[10px] leading-snug text-amber-100/40">Сдвигает время слоёв по их порядку: нижние появляются раньше, верхние — позже.</div>
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="text-amber-100/70">Шаг</span>
          <input type="number" min={0} max={2} step={0.05} value={step} onChange={(e) => setStep(Math.max(0, Math.min(2, parseFloat(e.target.value) || 0)))} className={`${inputCls} w-16 text-right`} aria-label="Шаг каскада" />
          <span className="text-[10px] text-amber-100/35">с</span>
        </div>
        <div className="flex gap-1.5 px-3 pb-2">
          <button onClick={cascade} className="flex-1 rounded-md border border-amber-300/30 py-1 text-[11px] text-amber-100 hover:bg-amber-200/10">Каскад</button>
          <button onClick={clearDelays} className="flex-1 rounded-md border border-white/10 py-1 text-[11px] text-amber-100/70 hover:bg-white/5">Сбросить сдвиги</button>
        </div>
      </Group>
      <div className="flex gap-1.5 px-3 py-2">
        <button onClick={() => setCfg((c) => ({ ...c, order: [...DEFAULT_ORDER] }))} className="flex-1 rounded-md border border-white/10 py-1 text-[11px] text-amber-100/70 hover:bg-white/5">Порядок по умолчанию</button>
        <button onClick={() => setCfg((c) => { let out = c; for (const id of ['background', ...c.order]) out = setPath(out, `layers.${id}.enabled`, true); return out; })} className="flex-1 rounded-md border border-white/10 py-1 text-[11px] text-amber-100/70 hover:bg-white/5">Включить все</button>
      </div>
    </FloatPanel>
  );
}

/* ------------------------------------------------------------------ панель «Настройки» */
function diffConfig(cur: any, base: any): any {
  if (Array.isArray(cur)) return JSON.stringify(cur) === JSON.stringify(base) ? undefined : cur;
  if (cur && typeof cur === 'object') {
    const out: any = {};
    for (const k of Object.keys(cur)) { const d = diffConfig(cur[k], base?.[k]); if (d !== undefined) out[k] = d; }
    return Object.keys(out).length ? out : undefined;
  }
  return cur === base ? undefined : cur;
}

type Tab = 'layer' | 'scene' | 'json';

export function SettingsPanel({ cfg, setCfg, setValue, selected, onSelect, onClose, tab, setTab, warn }: {
  cfg: Config; setCfg: (fn: (c: Config) => Config) => void; setValue: Setter; selected: string; onSelect: (id: string) => void;
  onClose: () => void; tab: Tab; setTab: (t: Tab) => void; warn: string | null;
}) {
  const [scene, setScene] = useState<'general' | 'camera' | 'post' | 'looks'>('general');
  const L = (cfg.layers as any)[selected];
  const meta = LAYER_META[selected];
  const resetLayer = () => setCfg((c) => ({ ...c, layers: { ...c.layers, [selected]: cloneConfig((DEFAULT_CONFIG.layers as any)[selected]) } }));
  const tabs: [Tab, string][] = [['layer', 'Слой'], ['scene', 'Сцена'], ['json', 'JSON']];

  return (
    <FloatPanel title="Настройки" icon={<GearIcon />} x={typeof window !== 'undefined' ? Math.max(8, window.innerWidth - 364) : 16} y={64} width={348} onClose={onClose}>
      <div className="sticky top-0 z-10 flex gap-1 border-b border-white/5 bg-[#0a0805]/90 px-2 py-1.5 backdrop-blur" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex-1 rounded-md py-1 text-[10px] uppercase tracking-[0.2em] transition ${tab === id ? 'bg-amber-200/15 text-amber-100' : 'text-amber-100/45 hover:text-amber-100'}`}>{label}</button>
        ))}
      </div>
      {warn && <div role="alert" className="mx-3 mt-2 rounded-md border border-red-300/30 bg-red-500/10 px-2 py-1.5 text-[11px] leading-snug text-red-100">{warn}</div>}

      {tab === 'layer' && (
        <div>
          <div className="flex items-center gap-2 px-3 py-2">
            <select value={selected} onChange={(e) => onSelect(e.target.value)} className={`${inputCls} flex-1 cursor-pointer bg-[#15110a]`} aria-label="Выбранный слой">
              {[...cfg.order, 'background'].map((id) => <option key={id} value={id}>{LAYER_META[id].label}</option>)}
            </select>
            <button onClick={() => setValue(`layers.${selected}.enabled`, !L.enabled)} className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-wider ${L.enabled ? 'border-amber-300/40 text-amber-100' : 'border-white/10 text-amber-100/40'}`}>{L.enabled ? 'Вкл' : 'Выкл'}</button>
          </div>
          <div className="px-3 pb-1 text-[10px] text-amber-100/40">{meta.hint}. Двойной клик по названию параметра — сброс.</div>
          <Fields scope={selected} cfg={cfg} set={setValue} />
          <div className="px-3 py-2"><button onClick={resetLayer} className="w-full rounded-md border border-white/10 py-1 text-[11px] text-amber-100/70 hover:bg-white/5">Сбросить настройки слоя</button></div>
        </div>
      )}

      {tab === 'scene' && (
        <div>
          <div className="flex flex-wrap gap-1 px-3 py-2">
            {([['general', 'Время и экспорт'], ['camera', 'Камера'], ['post', 'Изображение'], ['looks', 'Образы']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setScene(id)} className={`rounded-full border px-2.5 py-0.5 text-[10px] ${scene === id ? 'border-amber-300/50 text-amber-100' : 'border-white/10 text-amber-100/45 hover:text-amber-100'}`}>{label}</button>
            ))}
          </div>
          {scene !== 'looks' && <Fields scope={scene} cfg={cfg} set={setValue} defaultOpen />}
          {scene === 'looks' && (
            <div className="px-3 pb-3">
              <div className="pb-2 text-[10px] leading-snug text-amber-100/40">Готовые образы меняют несколько параметров сразу поверх текущей композиции (порядок слоёв и тексты сохраняются).</div>
              <div className="grid gap-1.5">
                {LOOKS.map((l) => (
                  <button key={l.id} onClick={() => setCfg((c) => applyLook(c, l.patch))} className="rounded-lg border border-white/10 px-3 py-1.5 text-left text-[12px] text-amber-100/80 transition hover:border-amber-300/40 hover:bg-amber-200/5">{l.label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'json' && <JsonTab cfg={cfg} setCfg={setCfg} />}
    </FloatPanel>
  );
}

/** «Образ» = сброс look-параметров к исходным + накладываемый патч. Тексты, порядок слоёв и экспорт не трогаем. */
function applyLook(c: Config, patch: any): Config {
  const D = DEFAULT_CONFIG;
  let out: Config = { ...c, post: cloneConfig(D.post), camera: cloneConfig(D.camera) };
  for (const k of ['impact', 'speed', 'hold']) out = setPath(out, `general.${k}`, (D.general as any)[k]);
  out = setPath(out, 'layers.particles.enabled', true);
  out = setPath(out, 'layers.rings.enabled', true);
  out = setPath(out, 'layers.fx', cloneConfig(D.layers.fx));
  const walk = (o: any, prefix: string) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, `${prefix}${k}.`);
      else out = setPath(out, `${prefix}${k}`, v);
    }
  };
  walk(patch, '');
  return out;
}

function JsonTab({ cfg, setCfg }: { cfg: Config; setCfg: (fn: (c: Config) => Config) => void }) {
  const [compact, setCompact] = useState(true);
  const gen = () => JSON.stringify(compact ? { v: 1, ...diffConfig(cfg, DEFAULT_CONFIG) } : cfg, null, 2);
  const [text, setText] = useState(gen);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!dirty) setText(gen()); /* eslint-disable-next-line */ }, [cfg, compact, dirty]);

  const flash = (ok: boolean, t: string) => { setMsg({ ok, t }); window.setTimeout(() => setMsg(null), 3500); };
  const copy = async () => {
    const out = dirty ? text : gen();
    try { await navigator.clipboard.writeText(out); flash(true, 'JSON скопирован в буфер обмена'); }
    catch { ta.current?.select(); document.execCommand?.('copy'); flash(true, 'Скопировано (выделено вручную)'); }
  };
  const apply = (src: string) => {
    try {
      const raw = JSON.parse(src);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Ожидался объект настроек');
      setCfg(() => sanitizeConfig(raw));
      setDirty(false);
      flash(true, 'Настройки применены');
    } catch (e) { flash(false, `Не удалось применить: ${e instanceof Error ? e.message : e}`); }
  };
  const paste = async () => {
    try { const t = await navigator.clipboard.readText(); setText(t); apply(t); }
    catch { flash(false, 'Нет доступа к буферу — вставьте JSON в поле вручную и нажмите «Применить»'); }
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([dirty ? text : gen()], { type: 'application/json' }));
    a.download = `${cfg.general.fileName || 'intro'}.settings.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="px-3 py-2">
      <div className="mb-2 text-[10px] leading-snug text-amber-100/40">Это полный «рецепт» ролика. Скопируйте и отправьте — получатель вставит его и увидит ту же композицию.</div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-amber-100/70">Только изменения</span>
        <button role="switch" aria-checked={compact} onClick={() => { setDirty(false); setCompact(!compact); }} className={`relative h-4 w-7 rounded-full border transition ${compact ? 'border-amber-300/60 bg-amber-300/30' : 'border-white/15 bg-white/5'}`}>
          <span className={`absolute top-[1px] h-3 w-3 rounded-full transition-all ${compact ? 'left-[13px] bg-amber-200' : 'left-[1px] bg-white/40'}`} />
        </button>
      </div>
      <textarea ref={ta} value={text} spellCheck={false} onChange={(e) => { setText(e.target.value); setDirty(true); }} className={`${inputCls} h-56 w-full resize-y font-mono text-[10px] leading-snug`} aria-label="JSON настроек" />
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button onClick={copy} className="rounded-md border border-amber-300/40 bg-amber-200/10 py-1.5 text-[11px] text-amber-50 hover:bg-amber-200/20">Копировать</button>
        <button onClick={paste} className="rounded-md border border-white/10 py-1.5 text-[11px] text-amber-100/80 hover:bg-white/5">Вставить из буфера</button>
        <button onClick={() => apply(text)} disabled={!dirty} className="rounded-md border border-white/10 py-1.5 text-[11px] text-amber-100/80 hover:bg-white/5 disabled:opacity-30">Применить из поля</button>
        <button onClick={download} className="rounded-md border border-white/10 py-1.5 text-[11px] text-amber-100/80 hover:bg-white/5">Скачать .json</button>
      </div>
      <label className="mt-1.5 block cursor-pointer rounded-md border border-white/10 py-1.5 text-center text-[11px] text-amber-100/80 hover:bg-white/5">
        Загрузить файл настроек…
        <input type="file" accept=".json,application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const t = await f.text(); setText(t); apply(t); } e.target.value = ''; }} />
      </label>
      <button onClick={() => { if (confirm('Сбросить все настройки к значениям по умолчанию?')) { setCfg(() => cloneConfig(DEFAULT_CONFIG)); setDirty(false); } }} className="mt-1.5 w-full rounded-md border border-red-300/20 py-1.5 text-[11px] text-red-200/70 hover:bg-red-500/10">Сбросить всё</button>
      <div className="mt-2 min-h-[16px] text-[11px]" role="status" aria-live="polite">{msg && <span className={msg.ok ? 'text-emerald-200/90' : 'text-red-200/90'}>{msg.t}</span>}</div>
    </div>
  );
}

export { FIELD_INDEX };
export type { Tab };
