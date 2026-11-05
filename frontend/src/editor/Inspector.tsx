import { RotateCcw, MousePointerClick, Sparkles } from "lucide-react";
import { Asset } from "../api";
import { Clip, Timeline, Track, Transform, DEFAULT_TRANSFORM, framesToTimecode, len, updateClip } from "../timeline";

function Field({ label, value, min, max, step, unit, onChange, disabled, fmt }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string; disabled?: boolean;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  const id = `f-${label.replace(/\W/g, "")}`;
  return (
    <div className="insp-field">
      <label htmlFor={id}>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(+e.target.value)} aria-labelledby={id} />
      <div className="insp-num">
        <input id={id} type="number" min={min} max={max} step={step} disabled={disabled} value={fmt ? fmt(value) : Math.round(value * 100) / 100}
          onChange={(e) => { const v = +e.target.value; if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v))); }} />
        {unit && <span className="dim">{unit}</span>}
      </div>
    </div>
  );
}

export default function Inspector({ tl, sel, asset, edit, readOnly }: {
  tl: Timeline; sel: { track: Track; clip: Clip } | null; asset: Asset | undefined;
  edit: (t: Timeline | null, coalesce?: string) => boolean; readOnly: boolean;
}) {
  if (!sel) return (
    <div className="empty" style={{ padding: "36px 16px" }}>
      <MousePointerClick size={28} color="#a78bfa" />
      <div style={{ fontSize: 13 }}>Select a clip on the timeline to adjust its position, scale, rotation, opacity, volume and fades.</div>
      <div className="card" style={{ padding: 12, marginTop: 16, textAlign: "left", width: "100%" }}>
        <div className="row" style={{ fontWeight: 600, fontSize: 13 }}><Sparkles size={15} color="#c084fc" />AI Creative Assistant<span className="badge soon" style={{ marginLeft: "auto" }}>Soon</span></div>
        <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>Auto-analysis and AI edits are planned for the AI Creation Universe. Nothing here runs AI today.</div>
      </div>
      <div className="dim" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.7 }}>
        <b>Shortcuts</b><br />Space play · ←/→ frame · Shift+←/→ 1s<br />S split · Del delete · Shift+Del ripple<br />Ctrl+Z undo · Ctrl+Shift+Z redo · N snap
      </div>
    </div>
  );
  const { clip, track } = sel;
  const lockedOrRO = readOnly || track.locked;
  const set = (patch: Partial<Clip>, key: string) => edit(updateClip(tl, clip.id, patch), `${clip.id}:${key}`);
  const setT = (patch: Partial<Transform>, key: string) => set({ transform: { ...clip.transform, ...patch } }, key);
  const fps = tl.fps;
  const isVisual = track.kind === "video" && asset?.has_video;
  const hasAudio = !!asset?.has_audio;
  return (
    <div className="insp">
      <div className="insp-title">
        <div className="ellipsis" style={{ fontWeight: 600 }}>{asset?.filename ?? "Missing media"}</div>
        <div className="dim mono" style={{ fontSize: 11.5 }}>{track.name} · in {framesToTimecode(clip.start, fps)} · length {framesToTimecode(len(clip), fps)}</div>
        {track.locked && <span className="badge warn" style={{ marginTop: 6 }}>Track locked</span>}
      </div>
      {isVisual && (
        <details open className="insp-sec">
          <summary>Transform<button className="btn icon ghost xs" style={{ marginLeft: "auto" }} disabled={lockedOrRO} aria-label="Reset transform" title="Reset"
            onClick={(e) => { e.preventDefault(); set({ transform: { ...DEFAULT_TRANSFORM } }, "reset"); }}><RotateCcw size={12} /></button></summary>
          <Field label="Position X" value={clip.transform.x} min={-tl.width} max={tl.width} step={1} unit="px" disabled={lockedOrRO} onChange={(v) => setT({ x: v }, "x")} />
          <Field label="Position Y" value={clip.transform.y} min={-tl.height} max={tl.height} step={1} unit="px" disabled={lockedOrRO} onChange={(v) => setT({ y: v }, "y")} />
          <Field label="Scale" value={Math.round(clip.transform.scale * 100)} min={5} max={400} step={1} unit="%" disabled={lockedOrRO} onChange={(v) => setT({ scale: v / 100 }, "scale")} />
          <Field label="Rotation" value={clip.transform.rotation} min={-180} max={180} step={0.5} unit="°" disabled={lockedOrRO} onChange={(v) => setT({ rotation: v }, "rot")} />
          <Field label="Opacity" value={Math.round(clip.transform.opacity * 100)} min={0} max={100} step={1} unit="%" disabled={lockedOrRO} onChange={(v) => setT({ opacity: v / 100 }, "op")} />
        </details>
      )}
      {hasAudio && (
        <details open className="insp-sec">
          <summary>Audio</summary>
          <Field label="Volume" value={Math.round(clip.volume * 100)} min={0} max={400} step={1} unit="%" disabled={lockedOrRO} onChange={(v) => set({ volume: v / 100 }, "vol")} />
          {track.muted && <div className="dim" style={{ fontSize: 11.5 }}>This track is muted, so this clip is silent in preview and export.</div>}
        </details>
      )}
      <details open className="insp-sec">
        <summary>Fades</summary>
        <Field label="Fade in" value={+(clip.fade_in / fps).toFixed(2)} min={0} max={+(len(clip) / fps).toFixed(2)} step={1 / fps} unit="s" disabled={lockedOrRO}
          onChange={(v) => { const f = Math.round(v * fps); if (f + clip.fade_out <= len(clip)) set({ fade_in: f }, "fi"); }} />
        <Field label="Fade out" value={+(clip.fade_out / fps).toFixed(2)} min={0} max={+(len(clip) / fps).toFixed(2)} step={1 / fps} unit="s" disabled={lockedOrRO}
          onChange={(v) => { const f = Math.round(v * fps); if (f + clip.fade_in <= len(clip)) set({ fade_out: f }, "fo"); }} />
      </details>
      {asset && (
        <details className="insp-sec">
          <summary>Source metadata</summary>
          <dl className="meta">
            <dt>Type</dt><dd>{asset.kind}</dd>
            {asset.width && <><dt>Resolution</dt><dd>{asset.width}×{asset.height}</dd></>}
            {asset.fps && <><dt>Frame rate</dt><dd>{asset.fps} fps</dd></>}
            {asset.video_codec && <><dt>Video codec</dt><dd>{asset.video_codec}</dd></>}
            {asset.audio_codec && <><dt>Audio codec</dt><dd>{asset.audio_codec}</dd></>}
            {asset.duration_s != null && <><dt>Duration</dt><dd>{asset.duration_s.toFixed(2)} s</dd></>}
          </dl>
        </details>
      )}
      <div className="insp-sec dim" style={{ fontSize: 11.5 }}>Speed, crop, keyframes and effects are planned — not available yet.</div>
    </div>
  );
}
