import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Eraser, Trash2, X } from "lucide-react";
import type { Asset } from "../api";

/** A box over the picture, as fractions of its width/height (0..1) from the top-left — the API's format. */
export type Box = { x: number; y: number; w: number; h: number };

const MAX_BOXES = 8;
const MAX_AREA = 0.25;   // must match MAX_BOX_AREA in backend/app/derive.py
const MIN_PX = 6;        // ignore accidental clicks

/**
 * Mark the areas to remove from a video (logo, watermark, timestamp, small object while the camera is still).
 * The worker rebuilds each box from its surroundings on every frame (FFmpeg delogo) and the result replaces
 * the clip on the timeline (undoable). This is a basic remover: it does not follow moving objects.
 */
export default function ObjectRemoveModal({ asset, at, onClose, onApply }: {
  asset: Asset; at: number; onClose: () => void; onApply: (boxes: Box[]) => void;
}) {
  const vid = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [draft, setDraft] = useState<Box | null>(null);
  const [t, setT] = useState(at);
  const [err, setErr] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dur = asset.duration_s ?? 0;
  const aspect = asset.width && asset.height ? asset.width / asset.height : 16 / 9;

  useEffect(() => { if (vid.current && Math.abs(vid.current.currentTime - t) > 0.02) vid.current.currentTime = t; }, [t]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const point = (e: RPointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const norm = (a: { x: number; y: number }, b: { x: number; y: number }): Box =>
    ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

  function down(e: RPointerEvent) {
    if (boxes.length >= MAX_BOXES) { setErr(`Up to ${MAX_BOXES} areas at a time`); return; }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    start.current = point(e); setDraft(null); setErr(null);
  }
  function move(e: RPointerEvent) { if (start.current) setDraft(norm(start.current, point(e))); }
  function up(e: RPointerEvent) {
    if (!start.current) return;
    const b = norm(start.current, point(e)); start.current = null; setDraft(null);
    const r = stage.current!.getBoundingClientRect();
    if (b.w * r.width < MIN_PX || b.h * r.height < MIN_PX) return;
    if (b.w * b.h > MAX_AREA) { setErr(`That box covers ${Math.round(b.w * b.h * 100)}% of the picture. This remover works on smaller things (up to ${MAX_AREA * 100}%) such as logos, watermarks and text.`); return; }
    setBoxes((xs) => [...xs, b]);
  }

  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
  const rect = (b: Box) => ({ left: pct(b.x), top: pct(b.y), width: pct(b.w), height: pct(b.h) });

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal obj-modal" role="dialog" aria-modal="true" aria-label="Remove object">
        <div className="row"><Eraser size={18} color="#c084fc" /><b className="grow" style={{ fontSize: 17 }}>Remove Object</b>
          <button className="btn icon ghost" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        <p className="muted" style={{ margin: "6px 0 10px", fontSize: 13 }}>
          Drag a box over each thing to remove: a logo, watermark, timestamp or a small object while the camera is still.
          The same areas are cleaned on every frame of <b>{asset.filename}</b>, filled in from the picture around them.
          Moving objects aren't followed yet.
        </p>
        {boxes.some((b) => b.x < 0.004 || b.y < 0.004 || b.x + b.w > 0.996 || b.y + b.h > 0.996) && (
          <div className="dim" role="note" style={{ fontSize: 12, marginBottom: 8 }}>
            A box touches the edge of the picture. If the object itself is cut off by the edge, a faint streak can remain there.
          </div>
        )}
        {err && <div className="error-box" role="alert">{err}</div>}
        <div className="obj-stage" ref={stage} style={{ aspectRatio: String(aspect) }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { start.current = null; setDraft(null); }}
          aria-label="Video frame — drag to mark an area">
          {asset.proxy_url
            ? <video ref={vid} src={asset.proxy_url} muted playsInline preload="auto" onLoadedMetadata={() => { if (vid.current) vid.current.currentTime = t; }} />
            : asset.thumbnail_url ? <img src={asset.thumbnail_url} alt="" draggable={false} /> : null}
          {boxes.map((b, i) => <div key={i} className="obj-box" style={rect(b)}><span>{i + 1}</span></div>)}
          {draft && <div className="obj-box draft" style={rect(draft)} />}
        </div>
        {dur > 0 && asset.proxy_url && (
          <label className="cslider" style={{ marginTop: 10 }}><span>Frame</span>
            <input type="range" min={0} max={dur} step={0.04} value={t} onChange={(e) => setT(+e.target.value)} aria-label="Look at another moment" />
            <span className="mono">{t.toFixed(1)}s</span></label>
        )}
        <div className="obj-list">
          {boxes.length === 0 && <span className="dim" style={{ fontSize: 12 }}>No areas marked yet.</span>}
          {boxes.map((b, i) => (
            <span key={i} className="obj-chip">Area {i + 1} · {Math.round(b.w * (asset.width ?? 0))}×{Math.round(b.h * (asset.height ?? 0))}px
              <button className="btn icon ghost" aria-label={`Remove area ${i + 1}`} onClick={() => setBoxes((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={12} /></button></span>
          ))}
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <span className="dim grow" style={{ fontSize: 12 }}>Runs on the cloud worker. The original file is kept; Ctrl+Z puts it back.</span>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!boxes.length} onClick={() => onApply(boxes)}>
            Remove {boxes.length > 1 ? `${boxes.length} areas` : "area"}</button>
        </div>
      </div>
    </div>
  );
}
