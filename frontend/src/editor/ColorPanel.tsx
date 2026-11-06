import { PointerEvent as RPE, useEffect, useMemo, useRef, useState } from "react";
import { Palette, RotateCcw, Power, Upload, Trash2 } from "lucide-react";
import { api, Asset } from "../api";
import { ColorGrade, CurvePoint, Curves, Timeline, Track, Clip, updateClip } from "../timeline";
import { IDENTITY_CURVE, LOOKS, NEUTRAL, WHEEL, WheelKey, curveIsIdentity, isNeutral, monotoneCurve, rgbToWheel, wheelToRgb, withLook, sanitizeGrade } from "../grade";
import { Lut3D, gradeImageData, parseCube } from "../lut";

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

type CurveKey = keyof Curves;
const CURVE_COL: Record<CurveKey, string> = { master: "#e5e7eb", r: "#f87171", g: "#4ade80", b: "#60a5fa" };
const EMPTY_CURVES: Curves = { master: IDENTITY_CURVE, r: IDENTITY_CURVE, g: IDENTITY_CURVE, b: IDENTITY_CURVE };

/** Tone-curve editor: drag points; click the line to add one; double-click a middle point to remove it. */
function CurveEditor({ curves, onChange, disabled }: { curves: Curves; onChange: (c: Curves, key: string) => void; disabled: boolean }) {
  const [ch, setCh] = useState<CurveKey>("master");
  const [drag, setDrag] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const S = 150, pts = curves[ch] ?? IDENTITY_CURVE;
  const path = useMemo(() => { const f = monotoneCurve(pts); return Array.from({ length: 61 }, (_, i) => `${i ? "L" : "M"}${(i / 60) * S},${S - f(i / 60) * S}`).join(""); }, [pts]);
  const toXY = (e: { clientX: number; clientY: number }): CurvePoint => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))];
  };
  const put = (next: CurvePoint[], key: string) => onChange({ ...EMPTY_CURVES, ...curves, [ch]: next.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)] as CurvePoint) }, key);
  const move = (i: number, [x, y]: CurvePoint) => {
    const n = [...pts];
    const lo = i === 0 ? 0 : n[i - 1][0] + 0.01, hi = i === n.length - 1 ? 1 : n[i + 1][0] - 0.01;
    n[i] = [i === 0 ? 0 : i === n.length - 1 ? 1 : Math.min(hi, Math.max(lo, x)), y];
    put(n, `curve-${ch}-${i}`);
  };
  return (
    <div className="curves">
      <svg ref={svg} className={`curve-box ${disabled ? "off" : ""}`} viewBox={`0 0 ${S} ${S}`} role="img" aria-label={`${ch} curve with ${pts.length} points`}
        onPointerDown={(e) => { if (disabled || (e.target as Element).tagName === "circle") return; const p = toXY(e); const n = [...pts, p].sort((a, b) => a[0] - b[0]);
          if (n.length > 16) return; const i = n.indexOf(p); put(n, `curve-${ch}-add`); setDrag(i); svg.current!.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (drag !== null && e.buttons & 1) move(drag, toXY(e)); }}
        onPointerUp={() => setDrag(null)}>
        {[0.25, 0.5, 0.75].map((t) => <g key={t} stroke="rgba(255,255,255,.08)"><line x1={t * S} x2={t * S} y1={0} y2={S} /><line y1={t * S} y2={t * S} x1={0} x2={S} /></g>)}
        <line x1={0} y1={S} x2={S} y2={0} stroke="rgba(255,255,255,.12)" strokeDasharray="3 3" />
        <path d={path} fill="none" stroke={CURVE_COL[ch]} strokeWidth={1.6} />
        {pts.map(([x, y], i) => <circle key={i} cx={x * S} cy={S - y * S} r={4.5} fill="#0b0b14" stroke={CURVE_COL[ch]} strokeWidth={1.6}
          role="slider" aria-label={`${ch} point ${i + 1}`} aria-valuetext={`in ${Math.round(x * 255)}, out ${Math.round(y * 255)}`} tabIndex={disabled ? -1 : 0}
          onPointerDown={(e) => { if (disabled) return; e.stopPropagation(); setDrag(i); svg.current!.setPointerCapture(e.pointerId); }}
          onDoubleClick={() => { if (!disabled && i > 0 && i < pts.length - 1) put(pts.filter((_, j) => j !== i), `curve-${ch}-del`); }}
          onKeyDown={(e) => { const d = 0.01, m: any = { ArrowUp: [0, d], ArrowDown: [0, -d], ArrowLeft: [-d, 0], ArrowRight: [d, 0] }[e.key];
            if (m && !disabled) { e.preventDefault(); move(i, [x + m[0], Math.min(1, Math.max(0, y + m[1]))]); } }} />)}
      </svg>
      <div className="curve-side">
        <div className="curve-chs" role="tablist" aria-label="Curve channel">
        {(Object.keys(CURVE_COL) as CurveKey[]).map((k) => <button key={k} role="tab" title={k === "master" ? "Master (all channels)" : `${k.toUpperCase()} channel`} aria-selected={ch === k} className={ch === k ? "on" : ""} style={{ color: CURVE_COL[k] }} onClick={() => setCh(k)}>
          {k === "master" ? "All" : k.toUpperCase()}{!curveIsIdentity(curves[k]) && <i className="dot" />}</button>)}
      </div>
        <button className="btn ghost sm" style={{ justifySelf: "start", fontSize: 11, padding: "3px 8px" }} disabled={disabled || curveIsIdentity(pts)} onClick={() => put(IDENTITY_CURVE, `curve-${ch}-reset`)}>Reset {ch === "master" ? "master" : ch.toUpperCase()}</button>
        <div className="dim curve-help">Click the line to add a point, drag to shape, double-click to remove. Matches the export exactly.</div>
      </div>
    </div>
  );
}

/** LUT tab: upload .cube files to the project, apply one to the clip with a strength, see before/after. */
function LutTab({ g, set, luts, projectId, onUploaded, asset, disabled }: { g: ColorGrade; set: (p: Partial<ColorGrade>, k: string) => void; luts: Asset[]; projectId: string; onUploaded: () => void; asset?: Asset; disabled: boolean }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [cube, setCube] = useState<Lut3D | null>(null), [split, setSplit] = useState(0.5);
  const cur = g.lut ? luts.find((l) => l.id === g.lut!.asset_id) : undefined;
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    setCube(null);
    if (!cur?.proxy_url) return;
    let live = true;
    fetch(cur.proxy_url).then((r) => r.text()).then((t) => { if (live) setCube(parseCube(t)); }).catch(() => live && setErr("Could not load the LUT for preview"));
    return () => { live = false; };
  }, [cur?.id, cur?.proxy_url]);
  useEffect(() => {
    const c = canvas.current; if (!c || !asset?.thumbnail_url) return;
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = 320, h = Math.round((img.height / img.width) * w) || 180; c.width = w; c.height = h;
      const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0, w, h);
      try {
        const cut = Math.round(w * split), after = ctx.getImageData(cut, 0, w - cut, h);
        gradeImageData(after, g, cube, g.lut?.strength ?? 0); ctx.putImageData(after, cut, 0);
        const before = ctx.getImageData(0, 0, cut, h); gradeImageData(before, { ...g, lut: null }, null, 0); ctx.putImageData(before, 0, 0);
        ctx.fillStyle = "#fff"; ctx.fillRect(cut - 1, 0, 2, h);
      } catch { /* storage without CORS: preview unavailable, export still applies the LUT */ }
    };
    img.src = asset.thumbnail_url;
  }, [asset?.thumbnail_url, cube, g, split]);
  async function upload(f: File) {
    setErr(null);
    if (!f.name.toLowerCase().endsWith(".cube")) { setErr("Choose a .cube LUT file"); return; }
    if (f.size > 8 * 1024 * 1024) { setErr("LUT file is larger than 8 MB"); return; }
    const text = await f.text();
    try { parseCube(text); } catch (e) { setErr((e as Error).message); return; }
    setBusy(true);
    try { const a = await api<Asset>(`/projects/${projectId}/luts`, { method: "POST", body: { filename: f.name, content: text } }); onUploaded(); set({ lut: { asset_id: a.id, strength: 1 } }, "lut-pick"); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="lut-tab">
      <div className="lut-side">
        <label className={`btn sm ${disabled || busy ? "disabled" : ""}`}><Upload size={13} />{busy ? "Uploading…" : "Import .cube LUT"}
          <input type="file" accept=".cube" hidden disabled={disabled || busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} /></label>
        <div className="lut-list" role="listbox" aria-label="Project LUTs">
          {luts.length === 0 && <div className="dim" style={{ fontSize: 11.5 }}>No LUTs yet. Import a 3D .cube file (from a camera maker or a colourist).</div>}
          {luts.map((l) => <button key={l.id} role="option" aria-selected={g.lut?.asset_id === l.id} className={`lut-item ${g.lut?.asset_id === l.id ? "on" : ""}`} disabled={disabled}
            onClick={() => set({ lut: g.lut?.asset_id === l.id ? null : { asset_id: l.id, strength: g.lut?.strength ?? 1 } }, "lut-pick")}>
            <span className="ellipsis">{l.filename.replace(/\.cube$/i, "")}</span><span className="dim mono">{l.analysis?.lut?.size}³</span></button>)}
        </div>
        {g.lut && <div className="lut-strength">
          <span>Strength <b className="mono">{Math.round(g.lut.strength * 100)}%</b></span>
          <button className="btn icon ghost xs" title="Remove LUT from this clip" aria-label="Remove LUT from clip" disabled={disabled} onClick={() => set({ lut: null }, "lut-remove")}><Trash2 size={12} /></button>
          <input type="range" min={0} max={1} step={0.01} value={g.lut.strength} disabled={disabled} aria-label="LUT strength" onChange={(e) => set({ lut: { ...g.lut!, strength: +e.target.value } }, "lut-strength")} />
        </div>}
        {err && <div className="error-box" style={{ fontSize: 11.5 }}>{err}</div>}
      </div>
      <div className="lut-preview">
        {g.lut ? <>
          <canvas ref={canvas} aria-label="Before and after LUT preview" />
          <input type="range" min={0.05} max={0.95} step={0.01} value={split} onChange={(e) => setSplit(+e.target.value)} aria-label="Before / after split" />
          <div className="dim" style={{ fontSize: 10.5 }}>Before | after · applied in the export</div>
        </> : <div className="dim" style={{ fontSize: 12, padding: 8 }}>Pick a LUT to see a before/after preview of this clip.</div>}
      </div>
    </div>
  );
}

export default function ColorPanel({ tl, sel, asset, edit, readOnly, luts = [], projectId = "", onLutUploaded = () => {} }: { tl: Timeline; sel: Sel; asset?: Asset; edit: (t: Timeline | null, c?: string) => boolean; readOnly: boolean; luts?: Asset[]; projectId?: string; onLutUploaded?: () => void }) {
  const [tab, setTab] = useState<"wheels" | "hsl" | "looks" | "curves" | "luts">("wheels");
  const usable = !!sel && sel.track.kind === "video" && !!asset?.has_video;
  const g: ColorGrade = sel?.clip.color ?? NEUTRAL;
  const disabled = !usable || readOnly || !!sel?.track.locked;
  const set = (patch: Partial<ColorGrade>, key: string) => sel && edit(updateClip(tl, sel.clip.id, { color: { ...g, ...patch } }), `${sel.clip.id}:color:${key}`);
  return (
    <section className="panel strip-panel" aria-label="Colour grading">
      <div className="strip-head">
        <Palette size={15} /><b>Color Grading</b>
        <div className="mini-tabs" role="tablist">
          {(["wheels", "hsl", "looks", "curves", "luts"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{({ wheels: "Wheels", hsl: "Tone", looks: "Looks", curves: "Curves", luts: "LUTs" } as const)[t]}</button>)}
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
          {tab === "curves" && <CurveEditor curves={{ ...EMPTY_CURVES, ...(g.curves ?? {}) }} disabled={disabled} onChange={(c, key) => set({ curves: c }, key)} />}
          {tab === "luts" && <LutTab g={g} set={set} luts={luts} projectId={projectId} onUploaded={onLutUploaded} asset={asset} disabled={disabled} />}
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
