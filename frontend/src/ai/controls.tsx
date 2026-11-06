import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Dices, Upload, X, Plus, GripVertical, Film, Music, Image as ImageIcon, Check, Sun, Paintbrush, Eraser, Undo2, Trash2 } from "lucide-react";
import { api, Asset } from "../api";
import { uploadFile } from "../upload";
import type { Param, Tool } from "./core";

export type Ctx = { v: Record<string, any>; set: (k: string, x: any) => void; media: Asset[]; pid: string; reloadMedia: () => Promise<void>; tool: Tool; catalogueTools?: Tool[] };

/* ------------------------------------------------------------------ small parts */

export function Field({ p, children, inline }: { p: Param; children: ReactNode; inline?: boolean }) {
  return (
    <div className={`ai-field ${inline ? "inline" : ""}`}>
      <div className="ai-flabel"><span>{p.label}{p.required && <i className="req">*</i>}</span>{p.help && <span className="ai-help" title={p.help}>?</span>}</div>
      {children}
    </div>
  );
}

const CAMERA_PATHS: Record<string, string> = {
  "static": "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "push in": "M4 12h13m-4-4 4 4-4 4", "pull out": "M20 12H7m4-4-4 4 4 4",
  "pan left": "M19 12H5m4-4-4 4 4 4", "pan right": "M5 12h14m-4-4 4 4-4 4", "tilt up": "M12 19V5m-4 4 4-4 4 4", "tilt down": "M12 5v14m-4-4 4 4 4-4",
  "orbit": "M5 12a7 4 0 1 0 14 0a7 4 0 1 0 -14 0M17 9l2 3", "crane up": "M5 19l12-12m-6 0h6v6", "tracking": "M3 15h4m3 0h4m3 0h4M15 9l3 3-3 3",
  "handheld": "M4 13c2-3 3 3 5 0s3 3 5 0 3 3 5 0", "dolly zoom": "M3 6l9 6-9 6M21 6l-9 6 9 6",
};

export function CameraPad({ p, value, onChange }: { p: Param; value: string; onChange: (x: string) => void }) {
  return (
    <div className="cam-pad" role="radiogroup" aria-label={p.label}>
      {(p.options as string[]).map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} className={`cam-btn ${value === o ? "on" : ""}`} onClick={() => onChange(o)} title={o}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={value === o ? `cam-anim cam-${o.replace(/\s/g, "-")}` : ""}>
            <path d={CAMERA_PATHS[o] || CAMERA_PATHS.static} /></svg>
          <span>{o}</span>
        </button>))}
    </div>
  );
}

const LENS_FOV: Record<string, number> = { "14mm": 104, "24mm": 84, "35mm": 63, "50mm": 47, "85mm": 28, "135mm": 18, "macro": 22 };
export function LensStrip({ p, value, onChange }: { p: Param; value: string; onChange: (x: string) => void }) {
  const fov = LENS_FOV[value] ?? 47;
  const r = (fov / 2) * Math.PI / 180;
  return (
    <div className="lens">
      <svg viewBox="0 0 120 54" className="lens-cone" aria-hidden="true">
        <circle cx="10" cy="27" r="5" fill="currentColor" />
        <path d={`M10 27 L${10 + 105 * Math.cos(r)} ${27 - 105 * Math.sin(r)} L${10 + 105 * Math.cos(r)} ${27 + 105 * Math.sin(r)} Z`} className="lens-fov" />
      </svg>
      <div className="lens-row" role="radiogroup" aria-label={p.label}>
        {(p.options as string[]).map((o) => <button type="button" key={o} role="radio" aria-checked={value === o} className={value === o ? "on" : ""} onClick={() => onChange(o)}>{o}</button>)}
      </div>
    </div>
  );
}

const LIGHT_GRAD: Record<string, string> = {
  "soft daylight": "linear-gradient(135deg,#e0f2fe,#bae6fd,#f8fafc)", "golden hour": "linear-gradient(135deg,#f97316,#fbbf24,#fde68a)",
  "blue hour": "linear-gradient(135deg,#1e3a8a,#3b82f6,#a5b4fc)", "harsh noon": "linear-gradient(135deg,#fef9c3,#ffffff,#fde047)",
  "studio softbox": "radial-gradient(circle at 30% 30%,#ffffff,#a1a1aa 60%,#3f3f46)", "rim light": "radial-gradient(circle at 50% 50%,#0a0a0a 45%,#fef3c7 60%,#0a0a0a 75%)",
  "neon": "linear-gradient(135deg,#ff2a6d,#7c3aed,#05d9e8)", "candlelight": "radial-gradient(circle at 50% 60%,#fbbf24,#9a3412 55%,#1c0a00)",
  "moonlight": "linear-gradient(135deg,#0f172a,#334155,#cbd5e1)", "volumetric fog": "linear-gradient(180deg,#e2e8f0,#94a3b8 40%,#334155)",
};
export function LightPicker({ p, value, onChange }: { p: Param; value: string; onChange: (x: string) => void }) {
  return (
    <div className="light-grid" role="radiogroup" aria-label={p.label}>
      {(p.options as string[]).map((o) => (
        <button type="button" key={o} role="radio" aria-checked={value === o} className={`light ${value === o ? "on" : ""}`} onClick={() => onChange(o)}>
          <i style={{ background: LIGHT_GRAD[o] || "#555" }} /><span>{o}</span>
        </button>))}
    </div>
  );
}

export function LightDial({ value, onChange }: { value: number; onChange: (x: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const a = (value - 90) * Math.PI / 180;
  const move = (e: React.PointerEvent) => {
    const b = ref.current!.getBoundingClientRect();
    const deg = Math.round((Math.atan2(e.clientY - b.top - b.height / 2, e.clientX - b.left - b.width / 2) * 180) / Math.PI + 90 + 360) % 360;
    onChange(deg);
  };
  return (
    <div className="dial-wrap">
      <svg ref={ref} viewBox="0 0 100 100" className="dial" onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); move(e); }}
        onPointerMove={(e) => e.buttons && move(e)} role="slider" aria-label="Light direction" aria-valuenow={value} aria-valuemin={0} aria-valuemax={359}
        tabIndex={0} onKeyDown={(e) => { if (e.key === "ArrowRight") onChange((value + 5) % 360); if (e.key === "ArrowLeft") onChange((value + 355) % 360); }}>
        <circle cx="50" cy="50" r="44" className="dial-ring" />
        <circle cx="50" cy="50" r="14" className="dial-subject" />
        <line x1="50" y1="50" x2={50 + 34 * Math.cos(a)} y2={50 + 34 * Math.sin(a)} className="dial-ray" />
        <circle cx={50 + 40 * Math.cos(a)} cy={50 + 40 * Math.sin(a)} r="7" className="dial-sun" />
      </svg>
      <span className="dim">{value}°</span>
    </div>
  );
}

const ASPECT_BOX: Record<string, [number, number]> = { "16:9": [32, 18], "9:16": [14, 25], "1:1": [22, 22], "4:5": [19, 24], "3:2": [30, 20], "21:9": [36, 15] };
export function AspectPicker({ p, value, onChange }: { p: Param; value: string; onChange: (x: string) => void }) {
  return (
    <div className="aspect-row" role="radiogroup" aria-label={p.label}>
      {(p.options as string[]).map((o) => { const [w, h] = ASPECT_BOX[o] || [22, 22]; return (
        <button type="button" key={o} role="radio" aria-checked={value === o} className={`aspect ${value === o ? "on" : ""}`} onClick={() => onChange(o)}>
          <i style={{ width: w, height: h }} /><span>{o}</span></button>); })}
    </div>
  );
}

export function Chips({ p, value, onChange, multi }: { p: Param; value: any; onChange: (x: any) => void; multi?: boolean }) {
  const sel = multi ? new Set(value || []) : null;
  return (
    <div className="chips" role={multi ? "group" : "radiogroup"} aria-label={p.label}>
      {(p.options || []).map((o: any) => { const on = multi ? sel!.has(o) : value === o; return (
        <button type="button" key={String(o)} role={multi ? "checkbox" : "radio"} aria-checked={on} className={`chip ${on ? "on" : ""}`}
          onClick={() => onChange(multi ? (on ? [...sel!].filter((x) => x !== o) : [...sel!, o]) : o)}>{String(o)}{p.unit && typeof o === "number" ? ` ${p.unit}` : ""}</button>); })}
    </div>
  );
}

export function Slider({ p, value, onChange }: { p: Param; value: number; onChange: (x: number) => void }) {
  const pct = ((Number(value) - (p.min ?? 0)) / ((p.max ?? 1) - (p.min ?? 0))) * 100;
  return (
    <div className="ai-slider">
      <input type="range" min={p.min} max={p.max} step={p.step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={p.label}
        style={{ "--pct": `${pct}%` } as CSSProperties} />
      <output>{Number(value).toFixed((p.step ?? 1) < 1 ? (p.step! < 0.01 ? 3 : p.step! < 0.1 ? 2 : 1) : 0)}{p.unit ? ` ${p.unit}` : ""}</output>
    </div>
  );
}

export function Stepper({ p, value, onChange }: { p: Param; value: number; onChange: (x: number) => void }) {
  const v = Number(value ?? p.default ?? p.min ?? 1);
  return (
    <div className="stepper" role="group" aria-label={p.label}>
      <button type="button" onClick={() => onChange(Math.max(p.min ?? 1, v - 1))} aria-label="Fewer">−</button>
      <b>{v}</b>
      <button type="button" onClick={() => onChange(Math.min(p.max ?? 10, v + 1))} aria-label="More">+</button>
    </div>
  );
}

export function Toggle({ p, value, onChange }: { p: Param; value: boolean; onChange: (x: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={!!value} aria-label={p.label} className={`switch ${value ? "on" : ""}`} onClick={() => onChange(!value)}><i /></button>;
}

export function Seed({ value, onChange }: { value: any; onChange: (x: any) => void }) {
  return (
    <div className="seed">
      <input className="input" inputMode="numeric" placeholder="random" value={value ?? ""} onChange={(e) => onChange(e.target.value.replace(/\D/g, "") || null)} aria-label="Seed" />
      <button type="button" className="btn sm" onClick={() => onChange(String(Math.floor(Math.random() * 2 ** 31)))} title="Roll a seed"><Dices size={14} /></button>
    </div>
  );
}

const STYLE_ART: Record<string, string> = {
  "cinematic photo": "linear-gradient(135deg,#0f172a,#b45309)", "editorial": "linear-gradient(135deg,#f5f5f4,#78716c)", "anime": "linear-gradient(135deg,#f472b6,#60a5fa)",
  "3D render": "radial-gradient(circle at 35% 35%,#c4b5fd,#4c1d95)", "watercolor": "linear-gradient(135deg,#bae6fd,#fbcfe8,#fef9c3)", "oil painting": "linear-gradient(135deg,#7c2d12,#ca8a04,#1e3a8a)",
  "comic": "repeating-radial-gradient(circle,#fde047 0 2px,#ef4444 2px 6px)", "pixel art": "conic-gradient(#22c55e 25%,#3b82f6 0 50%,#22c55e 0 75%,#3b82f6 0) 0 0/12px 12px",
  "low poly": "conic-gradient(from 30deg,#0ea5e9,#6366f1,#14b8a6,#0ea5e9)", "line art": "repeating-linear-gradient(45deg,#fff 0 2px,#e5e7eb 2px 7px)",
  "claymation": "radial-gradient(circle at 40% 40%,#fb923c,#9a3412)", "vaporwave": "linear-gradient(180deg,#ff71ce,#01cdfe,#b967ff)",
  "Indian miniature": "linear-gradient(135deg,#b91c1c,#ca8a04,#065f46)", "Madhubani": "repeating-conic-gradient(#dc2626 0 15deg,#facc15 0 30deg,#16a34a 0 45deg)",
  "Bollywood poster": "linear-gradient(135deg,#7f1d1d,#f59e0b,#4c1d95)", "documentary": "linear-gradient(135deg,#334155,#a8a29e)",
};
export function StyleGrid({ p, value, onChange }: { p: Param; value: string; onChange: (x: string) => void }) {
  return (
    <div className="style-grid" role="radiogroup" aria-label={p.label}>
      {(p.options as string[]).map((o) => (
        <button type="button" key={o} role="radio" aria-checked={value === o} className={`style-tile ${value === o ? "on" : ""}`} onClick={() => onChange(o)}>
          <i style={{ background: STYLE_ART[o] || "#444" }} /><span>{o}</span></button>))}
    </div>
  );
}

export function Palette({ p, value, onChange }: { p: Param; value: string; onChange: (x: string) => void }) {
  return (
    <div className="palettes" role="radiogroup" aria-label={p.label}>
      {(p.options as { id: string; colors: string[] }[]).map((o) => (
        <button type="button" key={o.id} role="radio" aria-checked={value === o.id} className={`palette ${value === o.id ? "on" : ""}`} onClick={() => onChange(o.id)}>
          <span className="swatches">{o.colors.length ? o.colors.map((c) => <i key={c} style={{ background: c }} />) : <em>auto</em>}</span><span>{o.id}</span>
        </button>))}
    </div>
  );
}

export function ColorIn({ p, value, onChange }: { p: Param; value: string; onChange: (x: string) => void }) {
  return <label className="color-in"><input type="color" value={value || "#ffffff"} onChange={(e) => onChange(e.target.value)} aria-label={p.label} /><code>{value}</code></label>;
}

/* ------------------------------------------------------------------ language & voice */

let voiceCache: any = null;
export function useVoices() {
  const [v, setV] = useState<any>(voiceCache);
  useEffect(() => { if (!voiceCache) api("/ai/voices").then((x) => { voiceCache = x; setV(x); }).catch(() => {}); }, []);
  return v as { voices: { id: string; label: string; language: string; style: string }[]; languages: Record<string, string> } | null;
}

export function LangPicker({ p, value, onChange }: { p: Param; value: string; onChange: (x: string) => void }) {
  const v = useVoices();
  const langs = v?.languages ?? { en: "English", hi: "Hindi" };
  return (
    <select className="input" value={value || ""} onChange={(e) => onChange(e.target.value)} aria-label={p.label}>
      {Object.entries(langs).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
    </select>
  );
}

export function LangsPicker({ p, value, onChange }: { p: Param; value: string[]; onChange: (x: string[]) => void }) {
  const v = useVoices();
  const langs = v?.languages ?? { en: "English", hi: "Hindi" };
  const sel = new Set(value || []);
  return (
    <div className="lang-grid" role="group" aria-label={p.label}>
      {Object.entries(langs).map(([k, n]) => { const on = sel.has(k); return (
        <button type="button" key={k} role="checkbox" aria-checked={on} className={`lang ${on ? "on" : ""}`}
          onClick={() => onChange(on ? [...sel].filter((x) => x !== k) : [...sel, k].slice(0, p.max_items ?? 8))}><b>{k.toUpperCase()}</b>{n}</button>); })}
    </div>
  );
}

export function VoicePick({ p, value, onChange, lang }: { p: Param; value: string; onChange: (x: string) => void; lang?: string }) {
  const v = useVoices();
  const list = (v?.voices ?? []).filter((x) => !lang || x.language === lang);
  useEffect(() => { if (list.length && !list.some((x) => x.id === value)) onChange(list[0].id); }, [lang, v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="voice-list" role="radiogroup" aria-label={p.label}>
      {list.map((x) => (
        <button type="button" key={x.id} role="radio" aria-checked={value === x.id} className={`voice ${value === x.id ? "on" : ""}`} onClick={() => onChange(x.id)}>
          <span className="voice-av">{x.label[0]}</span><span><b>{x.label.split(" (")[0]}</b><small>{v?.languages[x.language] ?? x.language} · {x.style}</small></span>
          <span className="voice-bars" aria-hidden="true"><i /><i /><i /><i /></span>
        </button>))}
      {!list.length && <div className="dim">No built-in voice for this language yet.</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ BPM with tap tempo */

export function Bpm({ p, value, onChange }: { p: Param; value: number; onChange: (x: number) => void }) {
  const taps = useRef<number[]>([]);
  const tap = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length >= 3) {
      const d = taps.current.slice(1).map((t, i) => t - taps.current[i]);
      onChange(Math.max(p.min ?? 60, Math.min(p.max ?? 180, Math.round(60000 / (d.reduce((a, b) => a + b, 0) / d.length)))));
    }
  };
  return (
    <div className="bpm">
      <span className="bpm-pulse" style={{ animationDuration: `${60 / (value || 96)}s` }} aria-hidden="true" />
      <input type="range" min={p.min} max={p.max} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={p.label} />
      <b>{value}</b><span className="dim">BPM</span>
      <button type="button" className="btn sm" onClick={tap}>Tap</button>
    </div>
  );
}

/* ------------------------------------------------------------------ media pickers */

const KIND_ICON: Record<string, any> = { video: Film, audio: Music, image: ImageIcon };

export function useUpload(pid: string, reload: () => Promise<void>) {
  const [busy, setBusy] = useState<string | null>(null);
  const up = async (f: File): Promise<Asset | null> => {
    if (!pid) return null;
    setBusy(`Uploading ${f.name}…`);
    try {
      const a = await uploadFile(pid, f, (s) => setBusy(s.status === "uploading" ? `Uploading ${f.name}…` : s.status === "finishing" ? "Finishing…" : `Uploading ${f.name}…`), new AbortController().signal);
      await reload();
      return a;
    } catch (e) { alertMsg((e as Error).message); return null; } finally { setBusy(null); }
  };
  return { up, busy };
}
function alertMsg(m: string) { console.warn(m); }

export function Thumb({ a, size = 64 }: { a?: Asset; size?: number }) {
  if (!a) return <span className="thumb empty" style={{ width: size, height: size * 0.62 }} />;
  const I = KIND_ICON[a.kind] ?? Film;
  const src = a.thumbnail_url || (a.kind === "image" ? a.proxy_url : null);
  return <span className="thumb" style={{ width: size, height: size * 0.62 }}>{src ? <img src={src} alt="" /> : <I size={18} />}{a.status !== "ready" && <em className="spinner" />}</span>;
}

export function MediaPick({ p, value, onChange, c, big }: { p: Param; value: string; onChange: (x: string) => void; c: Ctx; big?: boolean }) {
  const acc = p.accept ?? [];
  const list = c.media.filter((m) => (!acc.length || acc.includes(m.kind)) && !["rejected", "failed"].includes(m.status));
  const sel = c.media.find((m) => m.id === value);
  const fileRef = useRef<HTMLInputElement>(null);
  const { up, busy } = useUpload(c.pid, c.reloadMedia);
  const [open, setOpen] = useState(false);
  return (
    <div className={`mpick ${big ? "big" : ""}`}>
      <button type="button" className={`mpick-main ${sel ? "has" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <Thumb a={sel} size={big ? 120 : 64} />
        <span className="mpick-text"><b>{sel ? sel.filename : `Choose ${acc.join(" or ") || "a file"}`}</b>
          <small>{sel ? `${sel.kind}${sel.duration_s ? ` · ${sel.duration_s.toFixed(1)} s` : ""}${sel.width ? ` · ${sel.width}×${sel.height}` : ""}${sel.status !== "ready" ? " · processing…" : ""}` : `${list.length} in this project`}</small></span>
      </button>
      {open && (
        <div className="mpick-pop">
          <div className="mpick-grid">
            {list.map((m) => <button type="button" key={m.id} className={`mpick-item ${m.id === value ? "on" : ""}`} disabled={m.status !== "ready"}
              onClick={() => { onChange(m.id); setOpen(false); }} title={m.filename}><Thumb a={m} size={92} /><span className="ellipsis">{m.filename}</span></button>)}
            <button type="button" className="mpick-item up" onClick={() => fileRef.current?.click()} disabled={!!busy}><Upload size={20} /><span>{busy ?? "Upload"}</span></button>
          </div>
        </div>)}
      <input ref={fileRef} type="file" hidden accept={acc.map((k) => `${k}/*`).join(",")} onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (f) { const a = await up(f); if (a) { onChange(a.id); setOpen(false); } }
      }} />
    </div>
  );
}

export function MediaBoard({ p, value, onChange, c }: { p: Param; value: string[]; onChange: (x: string[]) => void; c: Ctx }) {
  const acc = p.accept ?? [];
  const list = c.media.filter((m) => (!acc.length || acc.includes(m.kind)) && m.status === "ready");
  const sel = value || [];
  const fileRef = useRef<HTMLInputElement>(null);
  const { up, busy } = useUpload(c.pid, c.reloadMedia);
  const max = p.max_items ?? 4;
  return (
    <div className="board">
      <div className="board-slots">
        {Array.from({ length: max }).map((_, i) => { const a = c.media.find((m) => m.id === sel[i]); return (
          <div key={i} className={`board-slot ${a ? "has" : ""}`}>
            {a ? <><Thumb a={a} size={110} /><button type="button" className="board-x" aria-label="Remove" onClick={() => onChange(sel.filter((x) => x !== a.id))}><X size={12} /></button></>
              : <span className="dim">Ref {i + 1}</span>}
          </div>); })}
      </div>
      <div className="board-pick">
        {list.filter((m) => !sel.includes(m.id)).slice(0, 18).map((m) => <button type="button" key={m.id} disabled={sel.length >= max} className="board-add" title={m.filename}
          onClick={() => onChange([...sel, m.id])}><Thumb a={m} size={56} /><Plus size={12} className="board-plus" /></button>)}
        <button type="button" className="board-add up" onClick={() => fileRef.current?.click()} disabled={!!busy || sel.length >= max}><Upload size={16} /></button>
      </div>
      {busy && <div className="dim" style={{ fontSize: 12 }}>{busy}</div>}
      <input ref={fileRef} type="file" hidden accept={acc.map((k) => `${k}/*`).join(",")} onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (f) { const a = await up(f); if (a) onChange([...sel, a.id].slice(0, max)); }
      }} />
    </div>
  );
}

export function BackgroundPick({ value, onChange, c }: { value: any; onChange: (x: any) => void; c: Ctx }) {
  const v = value || { type: "color", value: "#0f172a" };
  const imgs = c.media.filter((m) => (m.kind === "image" || m.kind === "video") && m.status === "ready");
  return (
    <div className="bgpick">
      <div className="seg">{(["color", "gradient", "asset"] as const).map((t) => <button type="button" key={t} className={v.type === t ? "on" : ""}
        onClick={() => onChange(t === "color" ? { type: t, value: "#0f172a" } : t === "gradient" ? { type: t, from: "#1e1b4b", to: "#7c3aed" } : { type: t, asset_id: imgs[0]?.id })}>{t === "asset" ? "My media" : t}</button>)}</div>
      {v.type === "color" && <label className="color-in"><input type="color" value={v.value} onChange={(e) => onChange({ ...v, value: e.target.value })} /><code>{v.value}</code></label>}
      {v.type === "gradient" && <div className="row"><input type="color" value={v.from} onChange={(e) => onChange({ ...v, from: e.target.value })} aria-label="From" />
        <span className="grad-prev" style={{ background: `linear-gradient(180deg,${v.from},${v.to})` }} /><input type="color" value={v.to} onChange={(e) => onChange({ ...v, to: e.target.value })} aria-label="To" /></div>}
      {v.type === "asset" && <div className="mpick-grid small">{imgs.map((m) => <button type="button" key={m.id} className={`mpick-item ${v.asset_id === m.id ? "on" : ""}`}
        onClick={() => onChange({ ...v, asset_id: m.id })}><Thumb a={m} size={70} /></button>)}{!imgs.length && <span className="dim">Upload an image or video first.</span>}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ prompt composer */

const PROMPT_TOKENS: Record<string, string[]> = {
  video: ["cinematic", "slow motion", "35mm film grain", "anamorphic flare", "drone shot", "rain-soaked street", "crowded bazaar", "monsoon", "festival lights", "sunrise"],
  image: ["highly detailed", "soft focus background", "studio portrait", "isometric", "macro detail", "sharp focus", "dramatic shadows", "flat lay", "minimal"],
  audio: ["uplifting", "lo-fi", "cinematic", "tabla groove", "ambient pad", "dramatic build", "acoustic", "festive"],
};
export function PromptComposer({ p, value, onChange, flavor = "video", rows = 4 }: { p: Param; value: string; onChange: (x: string) => void; flavor?: string; rows?: number }) {
  const n = (value || "").length;
  return (
    <div className="composer">
      <textarea className="composer-ta" rows={rows} value={value || ""} placeholder={p.placeholder} maxLength={p.max} onChange={(e) => onChange(e.target.value)} aria-label={p.label} />
      <div className="composer-foot">
        <div className="tokens">{(PROMPT_TOKENS[flavor] || PROMPT_TOKENS.video).map((t) => <button type="button" key={t} className="token"
          onClick={() => onChange(((value || "").trim() + (value?.trim() ? ", " : "") + t).slice(0, p.max ?? 2000))}>+ {t}</button>)}</div>
        <span className="dim">{n}/{p.max ?? 2000}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ shot builder (storyboard) */

const MOVES = ["static", "push in", "pull out", "pan left", "pan right", "tilt up", "orbit", "crane up", "tracking", "handheld"];
export function ShotBuilder({ value, onChange }: { value: any[]; onChange: (x: any[]) => void }) {
  const shots = value || [];
  const [drag, setDrag] = useState<number | null>(null);
  const upd = (i: number, k: string, x: any) => onChange(shots.map((s, j) => (j === i ? { ...s, [k]: x } : s)));
  const total = shots.reduce((a, s) => a + Number(s.duration || 5), 0);
  return (
    <div className="shots">
      <div className="shots-track">
        {shots.map((s, i) => (
          <div key={i} className={`shot-card ${drag === i ? "drag" : ""}`} draggable onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}
            onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag === null || drag === i) return; const a = [...shots]; const [m] = a.splice(drag, 1); a.splice(i, 0, m); onChange(a); setDrag(null); }}
            style={{ flexGrow: Number(s.duration || 5) }}>
            <div className="shot-head"><GripVertical size={14} className="dim" /><b>Shot {i + 1}</b><span className="dim">{s.duration || 5}s</span>
              <button type="button" className="btn icon sm ghost" aria-label={`Remove shot ${i + 1}`} disabled={shots.length <= 2} onClick={() => onChange(shots.filter((_, j) => j !== i))}><Trash2 size={13} /></button></div>
            <div className={`shot-frame cam-${(s.camera_move || "static").replace(/\s/g, "-")}`}><span>{s.prompt ? s.prompt.slice(0, 60) : "describe this shot"}</span></div>
            <textarea className="input" rows={3} placeholder="Wide shot of a busy Mumbai street at dusk" value={s.prompt || ""} onChange={(e) => upd(i, "prompt", e.target.value)} aria-label={`Shot ${i + 1} description`} />
            <div className="row" style={{ gap: 6 }}>
              <select className="input sm" value={s.camera_move || "static"} onChange={(e) => upd(i, "camera_move", e.target.value)} aria-label="Camera">{MOVES.map((m) => <option key={m}>{m}</option>)}</select>
              <select className="input sm" value={s.duration || 5} onChange={(e) => upd(i, "duration", Number(e.target.value))} aria-label="Duration">{[5, 8, 10].map((d) => <option key={d} value={d}>{d}s</option>)}</select>
            </div>
          </div>))}
        {shots.length < 8 && <button type="button" className="shot-add" onClick={() => onChange([...shots, { prompt: "", camera_move: "static", duration: 5 }])}><Plus size={18} />Add shot</button>}
      </div>
      <div className="shots-ruler"><span>{shots.length} shots</span><span>{total}s film</span></div>
    </div>
  );
}

/* ------------------------------------------------------------------ mask painter (inpaint) */

export function MaskPainter({ image, value, onChange }: { image?: Asset; value: string; onChange: (x: string) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [brush, setBrush] = useState(40);
  const [mode, setMode] = useState<"paint" | "erase">("paint");
  const hist = useRef<ImageData[]>([]);
  const w = image?.width || 1280, h = image?.height || 720;
  useEffect(() => {
    const c = cv.current; if (!c) return;
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    if (value && value.startsWith("data:image/png")) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, w, h); im.src = value; }
  }, [image?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pt = (e: React.PointerEvent) => { const b = cv.current!.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * w, ((e.clientY - b.top) / b.height) * h]; };
  const last = useRef<number[] | null>(null);
  const draw = (e: React.PointerEvent) => {
    const ctx = cv.current!.getContext("2d")!;
    const [x, y] = pt(e);
    ctx.globalCompositeOperation = mode === "paint" ? "source-over" : "destination-out";
    ctx.strokeStyle = "rgba(255,255,255,1)"; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = brush * (w / 1000);
    ctx.beginPath(); const [lx, ly] = last.current ?? [x, y]; ctx.moveTo(lx, ly); ctx.lineTo(x, y); ctx.stroke();
    last.current = [x, y];
  };
  const commit = () => { last.current = null; onChange(cv.current!.toDataURL("image/png")); };
  const src = image?.proxy_url;
  return (
    <div className="mask">
      <div className="mask-tools">
        <button type="button" className={`btn sm ${mode === "paint" ? "primary" : ""}`} onClick={() => setMode("paint")}><Paintbrush size={14} />Brush</button>
        <button type="button" className={`btn sm ${mode === "erase" ? "primary" : ""}`} onClick={() => setMode("erase")}><Eraser size={14} />Erase mask</button>
        <label className="row dim" style={{ fontSize: 12, gap: 6 }}>Size<input type="range" min={5} max={160} value={brush} onChange={(e) => setBrush(Number(e.target.value))} /></label>
        <button type="button" className="btn sm" disabled={!hist.current.length} onClick={() => { const d = hist.current.pop(); if (d) { cv.current!.getContext("2d")!.putImageData(d, 0, 0); onChange(cv.current!.toDataURL("image/png")); } }}><Undo2 size={14} /></button>
        <button type="button" className="btn sm" onClick={() => { cv.current!.getContext("2d")!.clearRect(0, 0, w, h); onChange(""); }}>Clear</button>
      </div>
      <div className="mask-stage" style={{ aspectRatio: `${w} / ${h}` }}>
        {src ? <img src={src} alt="" draggable={false} /> : <div className="dim mask-empty">Choose an image first</div>}
        <canvas ref={cv} className="mask-cv" onPointerDown={(e) => { if (!src) return; (e.target as Element).setPointerCapture(e.pointerId);
          hist.current = [...hist.current.slice(-15), cv.current!.getContext("2d")!.getImageData(0, 0, w, h)]; draw(e); }}
          onPointerMove={(e) => e.buttons && draw(e)} onPointerUp={commit} aria-label="Paint the area to change" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ dispatcher */

export function Control({ p, c, flavor, compact }: { p: Param; c: Ctx; flavor?: string; compact?: boolean }) {
  const v = c.v[p.key];
  const set = (x: any) => c.set(p.key, x);
  let el: ReactNode;
  switch (p.type) {
    case "prompt": el = <PromptComposer p={p} value={v} onChange={set} flavor={flavor} rows={compact ? 3 : 4} />; break;
    case "text": el = <input className="input" value={v ?? ""} placeholder={p.placeholder} maxLength={p.max} onChange={(e) => set(e.target.value)} aria-label={p.label} />; break;
    case "longtext": el = <textarea className="input" rows={compact ? 4 : 7} value={v ?? ""} placeholder={p.placeholder} maxLength={p.max} onChange={(e) => set(e.target.value)} aria-label={p.label} />; break;
    case "media": el = <MediaPick p={p} value={v} onChange={set} c={c} />; break;
    case "media_multi": el = <MediaBoard p={p} value={v} onChange={set} c={c} />; break;
    case "aspect": el = <AspectPicker p={p} value={v} onChange={set} />; break;
    case "duration": el = <Chips p={{ ...p, unit: p.unit ?? "s" }} value={v} onChange={set} />; break;
    case "chips": el = <Chips p={p} value={v} onChange={set} />; break;
    case "multichips": el = <Chips p={p} value={v} onChange={set} multi />; break;
    case "slider": el = <Slider p={p} value={v ?? p.default ?? p.min ?? 0} onChange={set} />; break;
    case "stepper": el = <Stepper p={p} value={v} onChange={set} />; break;
    case "toggle": el = <Toggle p={p} value={v} onChange={set} />; break;
    case "seed": el = <Seed value={v} onChange={set} />; break;
    case "camera_move": el = <CameraPad p={p} value={v} onChange={set} />; break;
    case "lens": el = <LensStrip p={p} value={v} onChange={set} />; break;
    case "lighting": el = <LightPicker p={p} value={v} onChange={set} />; break;
    case "lighting_dir": el = <LightDial value={Number(v ?? 45)} onChange={set} />; break;
    case "style": el = <StyleGrid p={p} value={v} onChange={set} />; break;
    case "palette": el = <Palette p={p} value={v} onChange={set} />; break;
    case "color": el = <ColorIn p={p} value={v} onChange={set} />; break;
    case "language": el = <LangPicker p={p} value={v} onChange={set} />; break;
    case "languages": el = <LangsPicker p={p} value={v} onChange={set} />; break;
    case "voice": el = <VoicePick p={p} value={v} onChange={set} lang={c.v.target || c.v.language} />; break;
    case "bpm": el = <Bpm p={p} value={v ?? 96} onChange={set} />; break;
    case "background": el = <BackgroundPick value={v} onChange={set} c={c} />; break;
    case "shots": el = <ShotBuilder value={v} onChange={set} />; break;
    case "mask": el = <MaskPainter image={c.media.find((m) => m.id === c.v.image)} value={v} onChange={set} />; break;
    case "tool": el = <select className="input" value={v ?? ""} onChange={(e) => set(e.target.value)} aria-label={p.label}>
      <option value="">Choose a tool…</option>{(c.catalogueTools ?? []).filter((t) => t.status.state === "ready" && t.params.some((x) => x.type === "media") && t.output !== "workflow")
        .map((t) => <option key={t.id} value={t.id}>{t.id} · {t.name}</option>)}</select>; break;
    default: el = <span className="dim">{p.type}</span>;
  }
  return <Field p={p} inline={["toggle", "seed", "stepper", "color"].includes(p.type)}>{el}</Field>;
}

export function Controls({ c, keys, skip = [], flavor, compact }: { c: Ctx; keys?: string[]; skip?: string[]; flavor?: string; compact?: boolean }) {
  const ps = useMemo(() => (keys ? keys.map((k) => c.tool.params.find((p) => p.key === k)).filter(Boolean) as Param[] : c.tool.params.filter((p) => !skip.includes(p.key) && p.group !== "advanced")), [c.tool, keys, skip]);
  return <>{ps.map((p) => <Control key={p.key} p={p} c={c} flavor={flavor} compact={compact} />)}</>;
}

export function Advanced({ c }: { c: Ctx }) {
  const ps = c.tool.params.filter((p) => p.group === "advanced");
  const [open, setOpen] = useState(false);
  if (!ps.length) return null;
  return (
    <div className="adv">
      <button type="button" className="adv-h" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "▾" : "▸"} Advanced ({ps.map((p) => p.label.toLowerCase()).join(", ")})</button>
      {open && <div className="adv-body">{ps.map((p) => <Control key={p.key} p={p} c={c} />)}</div>}
    </div>
  );
}

export function Consent({ c }: { c: Ctx }) {
  if (!c.tool.consent) return null;
  return (
    <label className="consent">
      <input type="checkbox" checked={!!c.v._consent} onChange={(e) => c.set("_consent", e.target.checked)} />
      <span><Check size={12} /> I own this face/voice or have the person's written permission. I won't use it to deceive anyone.</span>
    </label>
  );
}

export { Sun };
