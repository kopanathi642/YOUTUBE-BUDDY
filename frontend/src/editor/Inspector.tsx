import { useState } from "react";
import { RotateCcw, MousePointerClick, ChevronRight } from "lucide-react";
import { Asset } from "../api";
import { Clip, Timeline, Track, Transform, DEFAULT_TRANSFORM, DEFAULT_TITLE, Title, Crop, framesToTimecode, len, updateClip, setSpeed } from "../timeline";
import { LOOKS, withLook, sanitizeGrade } from "../grade";

/** Free typing; applied (and clamped) on Enter or blur. Esc reverts. */
function NumBox({ id, value, disabled, commit }: { id: string; value: string; disabled?: boolean; commit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const apply = () => { if (draft !== null) { const v = parseFloat(draft); if (Number.isFinite(v)) commit(v); } setDraft(null); };
  return <input id={id} type="text" inputMode="decimal" disabled={disabled} value={draft ?? value}
    onFocus={(e) => e.currentTarget.select()} onChange={(e) => setDraft(e.target.value)} onBlur={apply}
    onKeyDown={(e) => { if (e.key === "Enter") { apply(); e.currentTarget.blur(); } if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); } }} />;
}

function Field({ label, value, min, max, step, unit, onChange, disabled, onReset }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string; disabled?: boolean; onChange: (v: number) => void; onReset?: () => void;
}) {
  const id = `f-${label.replace(/\W/g, "")}`;
  return (
    <div className="insp-field">
      <label htmlFor={id}>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(+e.target.value)} aria-label={label} />
      <div className="insp-num">
        <NumBox id={id} value={String(Math.round(value * 100) / 100)} disabled={disabled} commit={(v) => onChange(Math.min(max, Math.max(min, v)))} />
        {unit && <span className="dim">{unit}</span>}
        {onReset && <button className="btn icon ghost xs" aria-label={`Reset ${label}`} disabled={disabled} onClick={onReset}><RotateCcw size={11} /></button>}
      </div>
    </div>
  );
}

const SOON_ROWS = ["Motion Tracking", "Mask & Roto"];
const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4];
const TITLE_STYLES: [string, Partial<Title>][] = [
  ["Purple box", { color: "#ffffff", bg_color: "#7c3aed", bg_opacity: 0.9 }], ["Clean white", { color: "#ffffff", bg_color: null }],
  ["Subtitle", { color: "#ffffff", bg_color: "#000000", bg_opacity: 0.6, font_size: 56 }], ["Yellow pop", { color: "#111111", bg_color: "#facc15", bg_opacity: 1 }],
  ["Neon", { color: "#22d3ee", bg_color: "#0b0d24", bg_opacity: 0.85 }], ["Big headline", { color: "#ffffff", bg_color: null, font_size: 180 }],
];

export default function Inspector({ tl, sel, asset, edit, readOnly, tab, setTab, onAddTitle, onStabilize, toast }: {
  tl: Timeline; sel: { track: Track; clip: Clip } | null; asset: Asset | undefined;
  edit: (t: Timeline | null, coalesce?: string) => boolean; readOnly: boolean;
  tab: "inspector" | "effects" | "transition" | "text" | "metadata"; setTab: (t: any) => void;
  onAddTitle: () => void; onStabilize: (assetId: string) => void; toast: (m: string) => void;
}) {
  const tabs = [["inspector", "Inspector"], ["effects", "Effects"], ["transition", "Transition"], ["text", "Text"], ["metadata", "Metadata"]] as const;
  const head = <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>;
  if (!sel) return (
    <aside className="panel ed-insp" aria-label="Inspector">{head}
      <div className="empty" style={{ padding: "20px 14px" }}><MousePointerClick size={24} color="#a78bfa" />
        <div style={{ fontSize: 12.5 }}>Select a clip on the timeline.</div>
        {tab === "text" && <button className="btn primary sm" disabled={readOnly} onClick={onAddTitle}>T  Add title at playhead</button>}
        <div className="dim" style={{ fontSize: 11, lineHeight: 1.7 }}>Space play · ←/→ frame · S split · Del delete · Shift+Del ripple · Ctrl+Z undo · N snap</div></div>
    </aside>);
  const { clip, track } = sel;
  const ro = readOnly || track.locked;
  const set = (patch: Partial<Clip>, key: string) => edit(updateClip(tl, clip.id, patch), `${clip.id}:${key}`);
  const setT = (patch: Partial<Transform>, key: string) => set({ transform: { ...clip.transform, ...patch } }, key);
  const fps = tl.fps, isTitle = !!clip.title, visual = track.kind === "video" && (asset?.has_video || isTitle), audio = !!asset?.has_audio;
  const ti: Title = clip.title ?? DEFAULT_TITLE;
  const setTitle = (patch: Partial<Title>, key: string) => set({ title: { ...ti, ...patch } }, `title:${key}`);
  const cr: Crop = clip.crop ?? { left: 0, right: 0, top: 0, bottom: 0 };
  const setCrop = (patch: Partial<Crop>, key: string) => set({ crop: { ...cr, ...patch } }, `crop:${key}`);
  const speedTo = (v: number) => { const r = setSpeed(tl, clip.id, v); if (r) edit(r, `${clip.id}:speed`); else toast("Not enough room — the faster/slower clip would overlap the next clip. Move it first."); };
  const canSpeed = !isTitle && asset?.kind !== "image";
  return (
    <aside className="panel ed-insp" aria-label="Inspector">{head}
      <div className="insp-body">
        <div className="insp-title"><div className="ellipsis" style={{ fontWeight: 600 }}>{isTitle ? `Title: ${ti.text}` : asset?.filename ?? "Missing media"}</div>
          <div className="dim mono" style={{ fontSize: 11 }}>{track.name} · {framesToTimecode(clip.start, fps)} · len {framesToTimecode(len(clip), fps)}</div>
          {track.locked && <span className="badge warn">Track locked</span>}</div>
        {tab === "inspector" && <>
          {visual && <details open className="insp-sec"><summary>Transform</summary>
            <Field label="Position X" value={clip.transform.x} min={-tl.width} max={tl.width} step={1} disabled={ro} onChange={(v) => setT({ x: v }, "x")} onReset={() => setT({ x: 0 }, "x0")} />
            <Field label="Position Y" value={clip.transform.y} min={-tl.height} max={tl.height} step={1} disabled={ro} onChange={(v) => setT({ y: v }, "y")} onReset={() => setT({ y: 0 }, "y0")} />
            <Field label="Scale" value={Math.round(clip.transform.scale * 100)} min={5} max={400} step={1} unit="%" disabled={ro} onChange={(v) => setT({ scale: v / 100 }, "scale")} onReset={() => setT({ scale: 1 }, "s0")} />
            <Field label="Rotation" value={clip.transform.rotation} min={-180} max={180} step={0.5} unit="°" disabled={ro} onChange={(v) => setT({ rotation: v }, "rot")} onReset={() => setT({ rotation: 0 }, "r0")} />
            <Field label="Opacity" value={Math.round(clip.transform.opacity * 100)} min={0} max={100} step={1} unit="%" disabled={ro} onChange={(v) => setT({ opacity: v / 100 }, "op")} onReset={() => setT({ opacity: 1 }, "o0")} />
            <button className="btn sm ghost" disabled={ro} onClick={() => set({ transform: { ...DEFAULT_TRANSFORM } }, "reset")}><RotateCcw size={12} />Reset transform</button>
          </details>}
          {audio && <details open className="insp-sec"><summary>Audio</summary>
            <Field label="Volume" value={Math.round(clip.volume * 100)} min={0} max={400} step={1} unit="%" disabled={ro} onChange={(v) => set({ volume: v / 100 }, "vol")} onReset={() => set({ volume: 1 }, "v0")} />
            <label className="check"><input type="checkbox" checked={!!clip.denoise} disabled={ro} onChange={(e) => set({ denoise: e.target.checked }, "dn")} />Noise reduction <span className="dim" style={{ fontSize: 11 }}>(heard in export)</span></label>
          </details>}
          {canSpeed && <details className="insp-sec" open={(clip.speed ?? 1) !== 1}><summary>Speed &amp; Time</summary>
            <Field label="Speed" value={clip.speed ?? 1} min={0.25} max={4} step={0.05} unit="×" disabled={ro} onChange={speedTo} onReset={() => speedTo(1)} />
            <div className="look-list">{SPEEDS.map((v) => <button key={v} className={`btn sm ${(clip.speed ?? 1) === v ? "toggled" : ""}`} disabled={ro} onClick={() => speedTo(v)}>{v}×</button>)}</div>
            <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>Audio keeps its pitch. The clip's length on the timeline changes with speed.</div>
          </details>}
          {visual && !isTitle && <details className="insp-sec" open={!!clip.crop}><summary>Cropping</summary>
            {(["left", "right", "top", "bottom"] as const).map((side) => <Field key={side} label={side[0].toUpperCase() + side.slice(1)} value={Math.round(cr[side] * 100)} min={0} max={45} step={1} unit="%" disabled={ro} onChange={(v) => setCrop({ [side]: v / 100 }, side)} />)}
            <button className="btn sm ghost" disabled={ro || !clip.crop} onClick={() => set({ crop: null }, "crop0")}><RotateCcw size={12} />Reset crop</button>
          </details>}
          {visual && !isTitle && asset?.kind === "video" && <details className="insp-sec"><summary>Stabilization</summary>
            <div className="dim" style={{ fontSize: 11.5, marginBottom: 6 }}>Creates a smoothed copy of this clip's video on the cloud worker (original kept). Then swap it in.</div>
            <button className="btn sm" disabled={ro} onClick={() => onStabilize(asset.id)}>Stabilize this video</button>
          </details>}
          {SOON_ROWS.map((r) => <div key={r} className="soon-row"><ChevronRight size={13} />{r}<span className="badge soon">Soon</span></div>)}
        </>}
        {tab === "effects" && <div className="insp-sec">
          {visual ? <><div className="label">Looks (colour presets)</div>
            <div className="look-list">{LOOKS.map((l) => <button key={l.name} className="btn sm" disabled={ro} onClick={() => set({ color: withLook(l.grade) }, "look")}>{l.name}</button>)}
              <button className="btn sm ghost" disabled={ro || !clip.color} onClick={() => set({ color: null }, "nolook")}>None</button></div>
            {asset?.analysis?.auto_grade && <button className="btn sm" style={{ marginTop: 8 }} disabled={ro} onClick={() => set({ color: sanitizeGrade(asset.analysis.auto_grade) }, "auto")}>Auto colour (measured)</button>}</>
            : <div className="dim" style={{ fontSize: 12 }}>Looks apply to video and image clips.</div>}
          {audio && <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={!!clip.denoise} disabled={ro} onChange={(e) => set({ denoise: e.target.checked }, "dn")} />Audio noise reduction</label>}
          <div className="dim" style={{ fontSize: 11, marginTop: 10 }}>Blur, glow, sharpen and keying are planned.</div>
        </div>}
        {tab === "transition" && <div className="insp-sec">
          <Field label="Fade in" value={+(clip.fade_in / fps).toFixed(2)} min={0} max={+(len(clip) / fps).toFixed(2)} step={1 / fps} unit="s" disabled={ro}
            onChange={(v) => { const f = Math.round(v * fps); if (f + clip.fade_out <= len(clip)) set({ fade_in: f }, "fi"); }} />
          <Field label="Fade out" value={+(clip.fade_out / fps).toFixed(2)} min={0} max={+(len(clip) / fps).toFixed(2)} step={1 / fps} unit="s" disabled={ro}
            onChange={(v) => { const f = Math.round(v * fps); if (f + clip.fade_in <= len(clip)) set({ fade_out: f }, "fo"); }} />
          <div className="dim" style={{ fontSize: 11 }}>Fades work on picture and sound. Cross-dissolves and wipes are planned.</div>
        </div>}
        {tab === "text" && (isTitle ? <div className="insp-sec">
          <div className="label">Style</div>
          <div className="look-list" style={{ marginBottom: 8 }}>{TITLE_STYLES.map(([n, st]) => <button key={n} className="btn sm" disabled={ro} onClick={() => setTitle(st, "style")}>{n}</button>)}</div>
          <label className="label" htmlFor="title-text">Text</label>
          <textarea id="title-text" className="notes" style={{ width: "100%", minHeight: 64 }} defaultValue={ti.text} key={clip.id} disabled={ro} maxLength={300}
            onBlur={(e) => e.target.value.trim() && e.target.value !== ti.text && setTitle({ text: e.target.value }, "text")} />
          <div className="dim" style={{ fontSize: 11, margin: "2px 0 8px" }}>Any language — Hindi, Tamil, Telugu, Bengali, Gujarati, Punjabi, Kannada, Malayalam, Odia, Arabic and Latin.</div>
          <Field label="Size" value={ti.font_size} min={8} max={400} step={1} unit="px" disabled={ro} onChange={(v) => setTitle({ font_size: Math.round(v) }, "size")} />
          <label className="cslider"><span>Text colour</span><input type="color" value={ti.color} disabled={ro} onChange={(e) => setTitle({ color: e.target.value }, "color")} /><span className="mono">{ti.color}</span></label>
          <label className="check" style={{ margin: "6px 0" }}><input type="checkbox" checked={!!ti.bg_color} disabled={ro} onChange={(e) => setTitle({ bg_color: e.target.checked ? "#7c3aed" : null }, "bg")} />Background box</label>
          {ti.bg_color && <><label className="cslider"><span>Box colour</span><input type="color" value={ti.bg_color} disabled={ro} onChange={(e) => setTitle({ bg_color: e.target.value }, "bgc")} /><span className="mono">{ti.bg_color}</span></label>
            <Field label="Box opacity" value={Math.round(ti.bg_opacity * 100)} min={0} max={100} step={1} unit="%" disabled={ro} onChange={(v) => setTitle({ bg_opacity: v / 100 }, "bgo")} /></>}
          <div className="dim" style={{ fontSize: 11 }}>Position, size, rotation and opacity are in the Inspector tab; fades in the Transition tab.</div>
        </div> : <div className="insp-sec"><button className="btn primary sm" disabled={readOnly} onClick={onAddTitle}>T  Add title at playhead</button>
          <div className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>Titles go on the Titles / Graphics track and render in any Indian language.</div></div>)}
        {tab === "metadata" && !asset && <div className="insp-sec dim" style={{ fontSize: 12 }}>Titles have no source file.</div>}
        {tab === "metadata" && asset && <div className="insp-sec"><dl className="meta">
          <dt>Type</dt><dd>{asset.kind}</dd>
          {asset.width && <><dt>Resolution</dt><dd>{asset.width}×{asset.height}</dd></>}
          {asset.fps && <><dt>Frame rate</dt><dd>{asset.fps} fps</dd></>}
          {asset.video_codec && <><dt>Video codec</dt><dd>{asset.video_codec}</dd></>}
          {asset.audio_codec && <><dt>Audio codec</dt><dd>{asset.audio_codec}</dd></>}
          {asset.duration_s != null && <><dt>Duration</dt><dd>{asset.duration_s.toFixed(2)} s</dd></>}
          {asset.analysis?.loudness_lufs != null && <><dt>Loudness</dt><dd>{asset.analysis.loudness_lufs.toFixed(1)} LUFS</dd></>}
          {asset.analysis?.scenes && <><dt>Scenes</dt><dd>{asset.analysis.scenes.length}</dd></>}
          {asset.analysis?.silences && <><dt>Silences</dt><dd>{asset.analysis.silences.length}</dd></>}
          {asset.analysis?.subject_center_x != null && <><dt>Subject (face) x</dt><dd>{Math.round(asset.analysis.subject_center_x * 100)}%</dd></>}
        </dl></div>}
      </div>
    </aside>
  );
}
