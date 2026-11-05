import { useState } from "react";
import { RotateCcw, MousePointerClick, ChevronRight } from "lucide-react";
import { Asset } from "../api";
import { Clip, Timeline, Track, Transform, DEFAULT_TRANSFORM, framesToTimecode, len, updateClip } from "../timeline";
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

const SOON_ROWS = ["Cropping", "Speed & Time", "Stabilization", "Motion Tracking", "Mask & Roto"];

export default function Inspector({ tl, sel, asset, edit, readOnly, tab, setTab }: {
  tl: Timeline; sel: { track: Track; clip: Clip } | null; asset: Asset | undefined;
  edit: (t: Timeline | null, coalesce?: string) => boolean; readOnly: boolean;
  tab: "inspector" | "effects" | "transition" | "text" | "metadata"; setTab: (t: any) => void;
}) {
  const tabs = [["inspector", "Inspector"], ["effects", "Effects"], ["transition", "Transition"], ["text", "Text"], ["metadata", "Metadata"]] as const;
  const head = <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>;
  if (!sel) return (
    <aside className="panel ed-insp" aria-label="Inspector">{head}
      <div className="empty" style={{ padding: "20px 14px" }}><MousePointerClick size={24} color="#a78bfa" />
        <div style={{ fontSize: 12.5 }}>Select a clip on the timeline.</div>
        <div className="dim" style={{ fontSize: 11, lineHeight: 1.7 }}>Space play · ←/→ frame · S split · Del delete · Shift+Del ripple · Ctrl+Z undo · N snap</div></div>
    </aside>);
  const { clip, track } = sel;
  const ro = readOnly || track.locked;
  const set = (patch: Partial<Clip>, key: string) => edit(updateClip(tl, clip.id, patch), `${clip.id}:${key}`);
  const setT = (patch: Partial<Transform>, key: string) => set({ transform: { ...clip.transform, ...patch } }, key);
  const fps = tl.fps, visual = track.kind === "video" && asset?.has_video, audio = !!asset?.has_audio;
  return (
    <aside className="panel ed-insp" aria-label="Inspector">{head}
      <div className="insp-body">
        <div className="insp-title"><div className="ellipsis" style={{ fontWeight: 600 }}>{asset?.filename ?? "Missing media"}</div>
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
        {tab === "text" && <div className="insp-sec dim" style={{ fontSize: 12 }}>Title and text clips are planned (Phase 2b). Until then, add a PNG title or badge as an image clip on the Titles / Graphics track.</div>}
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
