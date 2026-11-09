import { MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import { X, Flame, Image as ImageIcon, Download, Upload, Play } from "lucide-react";
import { Asset } from "../api";
import { Timeline, duration, end, sp, framesToTimecode } from "../timeline";
import { titleFont } from "../fonts";
import type { Sampler } from "./Viewer";

// ---------------------------------------------------------------- Highlight finder (rule-based)
type Wave = { peaks_per_second: number; peaks: number[] };
const waveCache = new Map<string, Promise<Wave | null>>();
const getWave = (a: Asset) => {
  if (!a.waveform_url) return Promise.resolve(null);
  if (!waveCache.has(a.id)) waveCache.set(a.id, fetch(a.waveform_url).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return waveCache.get(a.id)!;
};

export type Moment = { from: number; to: number; score: number; reasons: string[] };

/** Score each second of the edit by loudness/energy, speech presence and scene changes, then pick the best windows. */
export async function findHighlights(tl: Timeline, assets: Map<string | null, Asset>, lengthS: number, count: number): Promise<Moment[]> {
  const fps = tl.fps, D = Math.floor(duration(tl) / fps);
  if (D < Math.min(lengthS, 5)) return [];
  const energy = new Array(D).fill(0), speech = new Array(D).fill(0), cuts = new Array(D).fill(0);
  for (const t of tl.tracks) {
    if (t.muted && t.kind === "audio") continue;
    for (const c of t.clips) {
      const a = assets.get(c.asset_id);
      if (!a) continue;
      const w = a.has_audio ? await getWave(a) : null;
      const sorted = w ? [...w.peaks].sort((x, y) => x - y) : [];
      const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] || 1 : 1;
      const sil = (a.analysis?.silences ?? []) as { start: number; end: number }[];
      for (let s = Math.floor(c.start / fps); s < Math.min(D, Math.ceil(end(c) / fps)); s++) {
        const src = (c.in + (s * fps - c.start) * sp(c)) / fps;
        if (w && t.name !== "Music (BGM)") {
          const i0 = Math.floor(src * w.peaks_per_second), i1 = i0 + Math.ceil(w.peaks_per_second * sp(c));
          let m = 0; for (let i = i0; i < i1 && i < w.peaks.length; i++) m += w.peaks[i];
          energy[s] = Math.max(energy[s], Math.min(1, m / Math.max(1, i1 - i0) / p95));
          if (!sil.some((x) => src >= x.start && src < x.end)) speech[s] = 1;
        }
        if (t.kind === "video") for (const sc of a.analysis?.scenes ?? []) if (sc.start > 0 && sc.start >= src && sc.start < src + sp(c)) cuts[s]++;
      }
    }
  }
  const per = energy.map((e, i) => 0.5 * e + 0.35 * speech[i] + 0.15 * Math.min(1, cuts[i]));
  const L = Math.min(lengthS, D), cand: Moment[] = [];
  for (let s = 0; s + L <= D; s++) {
    let sc = 0, en = 0, spch = 0, ct = 0;
    for (let i = s; i < s + L; i++) { sc += per[i]; en += energy[i]; spch += speech[i]; ct += cuts[i]; }
    const reasons = [];
    if (en / L > 0.55) reasons.push("high energy"); if (spch / L > 0.7) reasons.push("continuous speech"); if (ct) reasons.push(`${ct} scene change${ct > 1 ? "s" : ""}`);
    cand.push({ from: s * fps, to: (s + L) * fps, score: sc / L, reasons: reasons.length ? reasons : ["steady section"] });
  }
  cand.sort((a, b) => b.score - a.score);
  const picked: Moment[] = [];
  for (const m of cand) { if (picked.length >= count) break; if (picked.every((p) => m.to <= p.from || m.from >= p.to)) picked.push(m); }
  return picked.sort((a, b) => a.from - b.from);
}

export function HighlightsModal({ tl, assets, onClose, onPreview, onCreate }: {
  tl: Timeline; assets: Map<string | null, Asset>; onClose: () => void; onPreview: (f: number) => void;
  onCreate: (moments: Moment[], format: string) => Promise<void>;
}) {
  const [len, setLen] = useState(30), [count, setCount] = useState(3), [format, setFormat] = useState("vertical");
  const [moments, setMoments] = useState<Moment[] | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => { setMoments(null); findHighlights(tl, assets, len, count).then(setMoments); }, [len, count, tl, assets]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label="Highlight finder" style={{ width: "min(600px,100%)" }}>
        <div className="row"><Flame size={18} color="#fb923c" /><b className="grow" style={{ fontSize: 17 }}>Highlight finder &amp; batch shorts</b><button className="btn icon ghost" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        <p className="muted" style={{ fontSize: 12.5 }}>Ranks every moment of your edit by energy, speech and scene changes (measured, rule-based — it can't promise virality). Each pick becomes its own editable sequence.</p>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <label><span className="label">Length</span><select className="select" value={len} onChange={(e) => setLen(+e.target.value)}>{[15, 30, 45, 60].map((v) => <option key={v} value={v}>{v} s</option>)}</select></label>
          <label><span className="label">How many</span><select className="select" value={count} onChange={(e) => setCount(+e.target.value)}>{[1, 2, 3, 4, 5].map((v) => <option key={v}>{v}</option>)}</select></label>
          <label><span className="label">Format</span><select className="select" value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="vertical">9:16 Shorts / Reels</option><option value="portrait_45">4:5 Feed</option><option value="portrait_23">2:3 Tall</option><option value="square">1:1 Square</option><option value="landscape_32">3:2 Landscape</option><option value="">Same as edit</option></select></label>
        </div>
        <div className="grid" style={{ gap: 6, marginTop: 12 }}>
          {!moments && <div className="row"><span className="spinner" />Scoring…</div>}
          {moments?.length === 0 && <div className="empty">The edit is shorter than the chosen length, or has no measurable media yet.</div>}
          {moments?.map((m, i) => (
            <div key={i} className="plan-op" style={{ alignItems: "center" }}>
              <b className="mono">#{i + 1}</b>
              <div className="grow"><div className="mono" style={{ fontSize: 12.5 }}>{framesToTimecode(m.from, tl.fps).slice(3, 8)} – {framesToTimecode(m.to, tl.fps).slice(3, 8)}</div>
                <div className="dim" style={{ fontSize: 11.5 }}>{m.reasons.join(" · ")}</div></div>
              <div className="progress" style={{ width: 80 }}><i style={{ width: `${Math.round(m.score * 100)}%` }} /></div>
              <button className="btn icon ghost" aria-label={`Preview highlight ${i + 1}`} onClick={() => onPreview(m.from)}><Play size={14} /></button>
            </div>))}
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" disabled={!moments?.length || busy} onClick={async () => { setBusy(true); await onCreate(moments!, format); setBusy(false); }}>
            {busy ? <span className="spinner" /> : <Flame size={15} />}Create {moments?.length ?? 0} short{moments?.length === 1 ? "" : "s"}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Thumbnail designer
export function ThumbnailModal({ samplerRef, onClose, onSave }: { samplerRef: MutableRefObject<Sampler | null>; onClose: () => void; onSave: (f: File) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState<HTMLCanvasElement | null>(null);
  const [text, setText] = useState("EDIT\nGROW\nMONETIZE");
  const [size, setSize] = useState(150), [color, setColor] = useState("#ffffff"), [stroke, setStroke] = useState("#7c3aed");
  const [pos, setPos] = useState<"left" | "center" | "right">("right"), [dark, setDark] = useState(0.35), [tilt, setTilt] = useState(-4);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { try { setFrame(samplerRef.current?.(1280) ?? null); } catch { setErr("Can't read the frame (storage CORS)."); } }, [samplerRef]);
  const font = useMemo(() => titleFont(text), [text]);
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const g = c.getContext("2d")!; c.width = 1280; c.height = 720;
    g.fillStyle = "#000"; g.fillRect(0, 0, 1280, 720);
    if (frame) { const k = Math.max(1280 / frame.width, 720 / frame.height); g.drawImage(frame, (1280 - frame.width * k) / 2, (720 - frame.height * k) / 2, frame.width * k, frame.height * k); }
    const grad = g.createLinearGradient(pos === "left" ? 1280 : 0, 0, pos === "left" ? 0 : 1280, 0);
    grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, `rgba(0,0,0,${dark})`);
    g.fillStyle = pos === "center" ? `rgba(0,0,0,${dark})` : grad; g.fillRect(0, 0, 1280, 720);
    const lines = text.split("\n").filter(Boolean), lh = size * 1.05;
    const x = pos === "left" ? 70 : pos === "right" ? 1210 : 640;
    g.save(); g.translate(x, 360); g.rotate((tilt * Math.PI) / 180);
    g.font = `700 ${size}px ${font}`; g.textAlign = pos === "left" ? "left" : pos === "right" ? "right" : "center"; g.textBaseline = "middle";
    g.lineJoin = "round"; g.lineWidth = size * 0.12; g.strokeStyle = stroke; g.fillStyle = color;
    lines.forEach((l, i) => { const y = (i - (lines.length - 1) / 2) * lh; g.strokeText(l, 0, y); g.fillText(l, 0, y); });
    g.restore();
  });
  const save = () => cv.current?.toBlob((b) => b && onSave(new File([b], `Thumbnail-${Date.now()}.png`, { type: "image/png" })), "image/png");
  const dl = () => { const a = document.createElement("a"); a.href = cv.current!.toDataURL("image/png"); a.download = "thumbnail.png"; a.click(); };
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label="Thumbnail designer" style={{ width: "min(980px,100%)" }}>
        <div className="row"><ImageIcon size={18} color="#c084fc" /><b className="grow" style={{ fontSize: 17 }}>Design &amp; Thumbnail</b><button className="btn icon ghost" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        {err && <div className="error-box">{err}</div>}
        <div className="thumb-grid">
          <canvas ref={cv} className="thumb-canvas" aria-label="Thumbnail preview" />
          <div className="grid" style={{ gap: 8, alignContent: "start" }}>
            <label><span className="label">Text (any language)</span><textarea className="notes" style={{ width: "100%", minHeight: 80 }} value={text} onChange={(e) => setText(e.target.value)} maxLength={120} /></label>
            <label className="cslider"><span>Size</span><input type="range" min={60} max={260} value={size} onChange={(e) => setSize(+e.target.value)} /><span className="mono">{size}</span></label>
            <label className="cslider"><span>Tilt</span><input type="range" min={-12} max={12} value={tilt} onChange={(e) => setTilt(+e.target.value)} /><span className="mono">{tilt}°</span></label>
            <label className="cslider"><span>Shade</span><input type="range" min={0} max={0.9} step={0.05} value={dark} onChange={(e) => setDark(+e.target.value)} /><span className="mono">{Math.round(dark * 100)}%</span></label>
            <label className="cslider"><span>Text</span><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /><span className="mono">{color}</span></label>
            <label className="cslider"><span>Outline</span><input type="color" value={stroke} onChange={(e) => setStroke(e.target.value)} /><span className="mono">{stroke}</span></label>
            <div className="seg">{(["left", "center", "right"] as const).map((p) => <button key={p} className={pos === p ? "on" : ""} onClick={() => setPos(p)}>{p}</button>)}</div>
            <div className="dim" style={{ fontSize: 11 }}>Background = the current frame of your program monitor (1280×720).</div>
            <button className="btn" onClick={dl}><Download size={14} />Download PNG</button>
            <button className="btn primary" onClick={save}><Upload size={14} />Save to media bin</button>
          </div>
        </div>
      </div>
    </div>
  );
}
