import { PointerEvent as RPE, useState } from "react";
import { Palette, RotateCcw, Power } from "lucide-react";
import { Asset } from "../api";
import { ColorGrade, Timeline, Track, Clip, updateClip } from "../timeline";
import { LOOKS, NEUTRAL, WHEEL, WheelKey, isNeutral, rgbToWheel, wheelToRgb, withLook, sanitizeGrade } from "../grade";

type Sel = { track: Track; clip: Clip } | null;

function Wheel({ label, k, grade, onChange, disabled }: { label: string; k: WheelKey; grade: ColorGrade; onChange: (v: [number, number, number], key: string) => void; disabled: boolean }) {
  const w = rgbToWheel(k, grade[k]);
  const spec = WHEEL[k];
  const R = 34;
  const setFrom = (e: RPE<HTMLDivElement> | PointerEvent, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    onChange(wheelToRgb(k, x, y, w.master), `${k}-wheel`);
  };
  return (
    <div className="wheel">
      <div className="wheel-label">{label}</div>
      <div className={`wheel-disc ${disabled ? "off" : ""}`} role="slider" aria-label={`${label} colour balance`} aria-valuetext={`x ${w.x.toFixed(2)}, y ${w.y.toFixed(2)}`} tabIndex={0}
        onPointerDown={(e) => { if (disabled) return; const el = e.currentTarget; setFrom(e, el); el.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (e.buttons & 1 && !disabled) setFrom(e, e.currentTarget); }}
        onDoubleClick={() => !disabled && onChange(wheelToRgb(k, 0, 0, w.master), `${k}-reset`)}
        onKeyDown={(e) => { const d = 0.05; const m: any = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] }[e.key]; if (m && !disabled) { e.preventDefault(); onChange(wheelToRgb(k, w.x + m[0], w.y + m[1], w.master), `${k}-key`); } }}>
        <span className="puck" style={{ left: `calc(50% + ${w.x * R}px)`, top: `calc(50% - ${w.y * R}px)` }} />
      </div>
      <input type="range" min={spec.min} max={spec.max} step={0.005} value={w.master} disabled={disabled} aria-label={`${label} master`}
        onChange={(e) => onChange(wheelToRgb(k, w.x, w.y, +e.target.value), `${k}-master`)} />
      <span className="mono dim" style={{ fontSize: 10 }}>{w.master.toFixed(2)}</span>
    </div>
  );
}

function Slider({ label, v, min, max, step, onChange, disabled, fmt }: { label: string; v: number; min: number; max: number; step: number; onChange: (v: number) => void; disabled: boolean; fmt?: (v: number) => string }) {
  return (
    <label className="cslider"><span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} disabled={disabled} onChange={(e) => onChange(+e.target.value)} />
      <span className="mono">{fmt ? fmt(v) : v.toFixed(2)}</span>
    </label>
  );
}

export default function ColorPanel({ tl, sel, asset, edit, readOnly }: { tl: Timeline; sel: Sel; asset?: Asset; edit: (t: Timeline | null, c?: string) => boolean; readOnly: boolean }) {
  const [tab, setTab] = useState<"wheels" | "hsl" | "looks">("wheels");
  const usable = !!sel && sel.track.kind === "video" && !!asset?.has_video;
  const g: ColorGrade = sel?.clip.color ?? NEUTRAL;
  const disabled = !usable || readOnly || !!sel?.track.locked;
  const set = (patch: Partial<ColorGrade>, key: string) => sel && edit(updateClip(tl, sel.clip.id, { color: { ...g, ...patch } }), `${sel.clip.id}:color:${key}`);
  return (
    <section className="panel strip-panel" aria-label="Colour grading">
      <div className="strip-head">
        <Palette size={15} /><b>Color Grading</b>
        <div className="mini-tabs" role="tablist">
          {(["wheels", "hsl", "looks"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "wheels" ? "Wheels" : t === "hsl" ? "Tone" : "Looks"}</button>)}
          <button disabled title="Planned">Curves</button><button disabled title="Planned">LUTs</button>
        </div>
        <div className="grow" />
        {usable && <>
          <button className={`btn icon ghost xs ${g.enabled ? "" : "toggled"}`} title={g.enabled ? "Bypass grade (compare)" : "Grade bypassed — click to enable"} aria-pressed={!g.enabled} disabled={disabled}
            onClick={() => set({ enabled: !g.enabled }, "bypass")}><Power size={13} /></button>
          <button className="btn icon ghost xs" title="Reset grade" aria-label="Reset grade" disabled={disabled || isNeutral(sel?.clip.color)} onClick={() => sel && edit(updateClip(tl, sel.clip.id, { color: null }))}><RotateCcw size={13} /></button>
        </>}
      </div>
      {!usable ? <div className="strip-empty">Select a video or image clip on the timeline to grade it. Changes show in the preview, the scopes and the export.</div> : (
        <div className="strip-body">
          {tab === "wheels" && <div className="wheels">
            {(["lift", "gamma", "gain", "offset"] as WheelKey[]).map((k) => <Wheel key={k} k={k} label={k[0].toUpperCase() + k.slice(1)} grade={g} disabled={disabled} onChange={(v, key) => set({ [k]: v } as any, key)} />)}
          </div>}
          {tab === "hsl" && <div className="tone-grid">
            <Slider label="Exposure" v={g.exposure} min={-2} max={2} step={0.05} disabled={disabled} onChange={(v) => set({ exposure: v }, "exp")} fmt={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)} EV`} />
            <Slider label="Contrast" v={g.contrast} min={0.5} max={2} step={0.01} disabled={disabled} onChange={(v) => set({ contrast: v }, "con")} />
            <Slider label="Saturation" v={g.saturation} min={0} max={2} step={0.01} disabled={disabled} onChange={(v) => set({ saturation: v }, "sat")} />
            <Slider label="Temperature" v={g.temperature} min={-1} max={1} step={0.01} disabled={disabled} onChange={(v) => set({ temperature: v }, "temp")} />
            <Slider label="Tint" v={g.tint} min={-1} max={1} step={0.01} disabled={disabled} onChange={(v) => set({ tint: v }, "tint")} />
            {asset?.analysis?.auto_grade && <button className="btn sm" disabled={disabled} onClick={() => sel && edit(updateClip(tl, sel.clip.id, { color: sanitizeGrade(asset.analysis.auto_grade) }))}>Auto colour (measured)</button>}
          </div>}
          {tab === "looks" && <div className="looks">
            {LOOKS.map((l, i) => (
              <button key={l.name} className="look" disabled={disabled} onClick={() => sel && edit(updateClip(tl, sel.clip.id, { color: withLook(l.grade) }))}>
                {asset?.thumbnail_url ? <img src={asset.thumbnail_url} alt="" style={{ filter: `url(#look-${i})` }} /> : <span className="look-ph" style={{ filter: `url(#look-${i})` }} />}
                <span>{l.name}</span>
              </button>))}
          </div>}
        </div>
      )}
    </section>
  );
}
