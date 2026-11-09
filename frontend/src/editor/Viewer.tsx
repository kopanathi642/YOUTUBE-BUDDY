import { MutableRefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Rewind, FastForward, Volume2, VolumeX, Maximize, Camera, Frame, Repeat, ChevronDown, Plus, Check, Sparkles } from "lucide-react";
import { Asset, SequenceDoc } from "../api";
import { Clip, Timeline, end, framesToTimecode, len, sp } from "../timeline";
import { titleFont } from "../fonts";
import { tfAt } from "../keyframes";
import { TState, transitionLinks, transitionState } from "../transitions";
import { isNeutral, svgFilterBody } from "../grade";
import { ratioOf } from "../compose";

export type Sampler = (w: number) => HTMLCanvasElement | null;

function fadeFactor(c: Clip, frame: number): number {
  let f = 1;
  if (c.fade_in && frame - c.start < c.fade_in) f = Math.min(f, (frame - c.start) / c.fade_in);
  if (c.fade_out && end(c) - frame <= c.fade_out) f = Math.min(f, (end(c) - frame) / c.fade_out);
  return Math.max(0, Math.min(1, f));
}

/** CSS for the composition look; same geometry as the FFmpeg compiler (sizes scale with keyframed clips). */
export function fxStyle(c: Clip, k: number, scaleNow: number): { wrap: React.CSSProperties; filter: string } {
  const fx = c.fx;
  if (!fx) return { wrap: {}, filter: "" };
  const s = (c.keyframes && (c.keyframes.x?.length || c.keyframes.y?.length || c.keyframes.scale?.length || c.keyframes.rotation?.length) ? scaleNow : 1) * k;
  const shadows: string[] = [];
  if (fx.shadow) shadows.push(`0 ${0.3 * fx.shadow * s}px ${2 * fx.shadow * s}px ${(fx.border ?? 0) * s}px rgba(0,0,0,${fx.shadow_opacity ?? 0.6})`);
  if (fx.border) shadows.push(`0 0 0 ${fx.border * s}px ${fx.border_color ?? "#ffffff"}`);
  return { wrap: { borderRadius: fx.radius ? fx.radius * s : undefined, boxShadow: shadows.length ? shadows.reverse().join(", ") : undefined },
    filter: fx.blur ? `blur(${fx.blur * s}px)` : "" };
}

type Layer = { clip: Clip; trackHidden: boolean; trackMuted: boolean; kind: "video" | "audio"; asset: Asset; z: number; ts?: TState };
const TITLE_ASSET = { kind: "title", width: 0, height: 0, has_audio: false } as unknown as Asset;

export default function Viewer({ tl, assets, playhead, setPlayhead, playing, setPlaying, total, samplerRef, sequences, currentSeqId, onSwitchSeq, onNewSeq, onSnapshot, autoAdjust, analysed }: {
  tl: Timeline; assets: Map<string | null, Asset>; playhead: number; setPlayhead: (f: number | ((f: number) => number)) => void;
  playing: boolean; setPlaying: (p: boolean | ((p: boolean) => boolean)) => void; total: number;
  samplerRef: MutableRefObject<Sampler | null>; sequences: SequenceDoc[]; currentSeqId: string;
  onSwitchSeq: (id: string) => void; onNewSeq: () => void; onSnapshot: () => void; autoAdjust: boolean; analysed: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const stageWrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 360 });
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(false);
  const [safe, setSafe] = useState(false);
  const [zoom100, setZoom100] = useState(false);
  const [seqMenu, setSeqMenu] = useState(false);
  const els = useRef(new Map<string, HTMLVideoElement | HTMLAudioElement | HTMLImageElement>());
  const fps = tl.fps;

  useLayoutEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const k = Math.min((r.width - 12) / tl.width, (r.height - 12) / tl.height);
      setSize({ w: Math.max(80, tl.width * k), h: Math.max(45, tl.height * k) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [tl.width, tl.height]);
  const view = zoom100 ? { w: Math.min(tl.width, 4000) / 2, h: Math.min(tl.height, 4000) / 2 } : size;

  const clock = useRef<{ t0: number; f0: number } | null>(null);
  useEffect(() => {
    if (!playing) { clock.current = null; return; }
    if (total === 0) { setPlaying(false); return; }
    clock.current = { t0: performance.now(), f0: playhead >= total ? 0 : playhead };
    let raf = 0;
    const tick = () => {
      const c = clock.current!;
      let f = c.f0 + Math.floor(((performance.now() - c.t0) / 1000) * fps);
      if (f >= total) {
        if (loop) { clock.current = { t0: performance.now(), f0: 0 }; f = 0; }
        else { setPlayhead(total); setPlaying(false); return; }
      }
      setPlayhead(f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, fps, total]); // eslint-disable-line react-hooks/exhaustive-deps

  const pre = 2 * fps;
  const layers: Layer[] = [];
  let z = 0;
  for (const t of tl.tracks.filter((t) => t.kind === "video").reverse()) {
    z++;
    const links = transitionLinks(t.clips);
    for (const c of [...t.clips].sort((a, b) => a.start - b.start)) {   // later clip on top during a transition
      const ts = transitionState(t, c, playhead, links);
      if (c.title) { if (ts.visible) layers.push({ clip: c, trackHidden: t.hidden, trackMuted: true, kind: "video", asset: TITLE_ASSET, z, ts }); continue; }
      const a = assets.get(c.asset_id);
      if (!a || a.status !== "ready" || !a.proxy_url) continue;
      if (ts.visible || (playhead >= c.start - pre && playhead < end(c))) layers.push({ clip: c, trackHidden: t.hidden, trackMuted: t.muted, kind: "video", asset: a, z, ts });
    }
  }
  /** Clip-local frame shown now (held on the first/last frame inside a transition). */
  const lf = (L: Layer) => Math.min(len(L.clip) - 1, Math.max(0, playhead - L.clip.start));
  for (const t of tl.tracks.filter((t) => t.kind === "audio")) for (const c of t.clips) {
    const a = assets.get(c.asset_id);
    if (!a || a.status !== "ready" || !a.proxy_url) continue;
    if (playhead >= c.start - pre && playhead < end(c)) layers.push({ clip: c, trackHidden: true, trackMuted: t.muted, kind: "audio", asset: a, z: 0 });
  }

  useEffect(() => {
    for (const L of layers) {
      const el = els.current.get(L.clip.id);
      if (!el || el instanceof HTMLImageElement) continue;
      const held = L.ts?.holdLocal ?? null;
      const active = L.kind === "audio" ? playhead >= L.clip.start && playhead < end(L.clip) : !!L.ts?.visible && held === null;
      const want = (L.clip.in + (held ?? Math.max(0, playhead - L.clip.start)) * sp(L.clip)) / fps;
      if (el.playbackRate !== sp(L.clip)) { el.playbackRate = sp(L.clip); (el as any).preservesPitch = true; }
      el.muted = muted || L.trackMuted || !L.asset.has_audio;
      el.volume = Math.min(1, L.clip.volume * fadeFactor(L.clip, L.clip.start + lf(L)));
      if (active && playing) {
        if (Math.abs(el.currentTime - want) > 0.25) el.currentTime = want;
        if (el.paused) el.play().catch(() => {});
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - want) > 0.5 / fps) el.currentTime = want;
      }
    }
  });

  /** Same maths as the FFmpeg compiler: crop the source, fit it into the (scaled) canvas, then offset. */
  const geom = (L: Layer, k: number) => {
    const a = L.asset, tf = tfAt(L.clip, lf(L)), cr = L.clip.crop;
    const fx = cr ? 1 - cr.left - cr.right : 1, fy = cr ? 1 - cr.top - cr.bottom : 1;
    const aw = (a.width || tl.width) * fx, ah = (a.height || tl.height) * fy;
    const fit = Math.min((tl.width * tf.scale) / aw, (tl.height * tf.scale) / ah);
    const w = aw * fit * k, h = ah * fit * k;
    return { w, h, cx: (tl.width / 2 + tf.x) * k, cy: (tl.height / 2 + tf.y) * k, fullW: w / fx, fullH: h / fy, offX: -(cr?.left ?? 0) * (w / fx), offY: -(cr?.top ?? 0) * (h / fy) };
  };

  // Composite the current frame onto a canvas (same maths as the stage + render). Used by scopes & snapshots.
  const visible = layers.filter((L) => L.kind === "video" && !L.trackHidden && L.ts?.visible).sort((a, b) => a.z - b.z);
  const visRef = useRef(visible);
  visRef.current = visible;
  useEffect(() => {
    samplerRef.current = (W: number) => {
      const k = W / tl.width, H = Math.round(tl.height * k);
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d", { willReadFrequently: true })!;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      for (const L of visRef.current) {
        const el = els.current.get(L.clip.id);
        if (L.clip.title) {
          const ti = L.clip.title, tf = tfAt(L.clip, lf(L)), fs = ti.font_size * tf.scale * k;
          ctx.save(); ctx.globalAlpha = tf.opacity * fadeFactor(L.clip, L.clip.start + lf(L));
          ctx.translate((tl.width / 2 + tf.x) * k, (tl.height / 2 + tf.y) * k); ctx.rotate((tf.rotation * Math.PI) / 180);
          ctx.font = `700 ${fs}px ${titleFont(ti.text)}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          const lines = ti.text.split("\n"), lh = fs * 1.2, tw = Math.max(...lines.map((l) => ctx.measureText(l).width)), th = lh * lines.length, pad = fs * 0.25;
          if (ti.bg_color) { ctx.fillStyle = ti.bg_color; ctx.globalAlpha *= ti.bg_opacity; ctx.fillRect(-tw / 2 - pad, -th / 2 - pad, tw + 2 * pad, th + 2 * pad); ctx.globalAlpha = tf.opacity * fadeFactor(L.clip, L.clip.start + lf(L)); }
          const al = ti.align ?? "center", lx = al === "left" ? -tw / 2 : al === "right" ? tw / 2 : 0;
          ctx.textAlign = al;
          if (ti.shadow) { ctx.shadowColor = `rgba(0,0,0,${ti.shadow})`; ctx.shadowBlur = 0.12 * fs; ctx.shadowOffsetY = 0.06 * fs; }
          if (ti.stroke) { ctx.lineWidth = 2 * ti.stroke * tf.scale * k; ctx.strokeStyle = ti.stroke_color ?? "#000"; ctx.lineJoin = "round";
            lines.forEach((l, i) => ctx.strokeText(l, lx, -th / 2 + lh * (i + 0.5))); ctx.shadowColor = "transparent"; }
          ctx.fillStyle = ti.color; lines.forEach((l, i) => ctx.fillText(l, lx, -th / 2 + lh * (i + 0.5)));
          ctx.restore(); continue;
        }
        if (!el) continue;
        if (el instanceof HTMLVideoElement && el.readyState < 2) continue;
        const g = geom(L, k);
        ctx.save();
        ctx.globalAlpha = tfAt(L.clip, lf(L)).opacity * fadeFactor(L.clip, L.clip.start + lf(L)) * (L.ts?.opacity ?? 1);
        const fxs = fxStyle(L.clip, k, tfAt(L.clip, lf(L)).scale);
        const filt = [isNeutral(L.clip.color) ? "" : `url(#g-${L.clip.id})`, fxs.filter].filter(Boolean).join(" ");
        if (filt) ctx.filter = filt;
        ctx.translate(g.cx, g.cy); ctx.rotate((tfAt(L.clip, lf(L)).rotation * Math.PI) / 180);
        if (L.clip.fx?.flip_h) ctx.scale(-1, 1);
        const rr = typeof fxs.wrap.borderRadius === "number" ? fxs.wrap.borderRadius : 0;
        ctx.beginPath(); if (rr && ctx.roundRect) ctx.roundRect(-g.w / 2, -g.h / 2, g.w, g.h, rr); else ctx.rect(-g.w / 2, -g.h / 2, g.w, g.h); ctx.clip();
        ctx.drawImage(el as CanvasImageSource, -g.w / 2 + g.offX, -g.h / 2 + g.offY, g.fullW, g.fullH);
        ctx.restore();
      }
      return cv;
    };
  });

  const k = view.w / tl.width;
  const graded = layers.filter((L) => L.kind === "video" && !isNeutral(L.clip.color));
  const cur = sequences.find((s) => s.id === currentSeqId);
  return (
    <section className="ed-viewer panel" aria-label="Program monitor">
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <defs dangerouslySetInnerHTML={{ __html: graded.map((L) => `<filter id="g-${L.clip.id}" color-interpolation-filters="sRGB">${svgFilterBody(L.clip.color!)}</filter>`).join("") }} />
      </svg>
      <div className="viewer-head">
        <div style={{ position: "relative" }}>
          <button className="pill" onClick={() => setSeqMenu(!seqMenu)} aria-haspopup="menu" aria-expanded={seqMenu}>
            Program: <b>{cur?.name ?? "Sequence"}</b><ChevronDown size={13} />
          </button>
          {seqMenu && (
            <div className="menu card" role="menu" style={{ left: 0, right: "auto", width: 240 }} onMouseLeave={() => setSeqMenu(false)}>
              {sequences.map((s) => (
                <button key={s.id} role="menuitem" className={`menu-item ${s.id === currentSeqId ? "on" : ""}`} onClick={() => { setSeqMenu(false); onSwitchSeq(s.id); }}>
                  {s.id === currentSeqId ? <Check size={13} /> : <span style={{ width: 13 }} />}{s.name}
                  <span className="dim" style={{ marginLeft: "auto", fontSize: 11 }}>{s.timeline.width}×{s.timeline.height}</span>
                </button>))}
              <button role="menuitem" className="menu-item" onClick={() => { setSeqMenu(false); onNewSeq(); }}><Plus size={13} />New sequence…</button>
            </div>
          )}
        </div>
        <span className="pill static">{tl.width}×{tl.height}</span>
        <span className="pill static">{tl.fps} FPS</span>
        <span className="pill static" title="Standard dynamic range (HDR not supported yet)">SDR</span>
        <div className="grow" />
        <button className={`pill ${zoom100 ? "on" : ""}`} onClick={() => setZoom100(!zoom100)} title="Fit / 50%">{zoom100 ? "50%" : "Fit"}</button>
        <button className="btn icon ghost" aria-label="Snapshot current frame to media" title="Snapshot → media bin" onClick={onSnapshot} disabled={total === 0}><Camera size={15} /></button>
        <button className={`btn icon ghost ${safe ? "toggled" : ""}`} aria-pressed={safe} aria-label="Safe-area guides" title="Safe-area guides" onClick={() => setSafe(!safe)}><Frame size={15} /></button>
        <button className="btn icon ghost" aria-label="Fullscreen" onClick={() => stageWrap.current?.requestFullscreen?.()}><Maximize size={15} /></button>
      </div>
      <div className="viewer-box" ref={box} style={zoom100 ? { overflow: "auto", placeItems: "start" } : undefined}>
        <div ref={stageWrap} className="stage-wrap">
          <div className="stage" style={{ width: view.w, height: view.h }}>
            {layers.filter((L) => L.kind === "video").sort((a, b) => a.z - b.z).map((L) => {
              const a = L.asset, tf = tfAt(L.clip, lf(L));
              const active = !!L.ts?.visible;
              const opacity = active && !L.trackHidden ? tf.opacity * fadeFactor(L.clip, L.clip.start + lf(L)) * (L.ts?.opacity ?? 1) : 0;
              // every layer sits in a full-stage wrapper so a transition never re-mounts the <video> (no flash)
              const wrapT = (node: React.ReactNode) => <div key={L.clip.id} className="tlayer" style={{ position: "absolute", inset: 0, zIndex: L.z, pointerEvents: "none", ...L.ts?.container }}>{node}
                  {L.ts?.dip && <div style={{ position: "absolute", inset: 0, background: L.ts.dip.color, opacity: L.ts.dip.alpha }} />}</div>;
              if (L.clip.title) {
                const ti = L.clip.title, fs = ti.font_size * tf.scale * k;
                return wrapT(<div key={L.clip.id} className="title-layer" style={{ left: (tl.width / 2 + tf.x) * k, top: (tl.height / 2 + tf.y) * k, zIndex: L.z, opacity,
                  transform: `translate(-50%, -50%) rotate(${tf.rotation}deg)`, fontFamily: titleFont(ti.text), fontSize: fs, color: ti.color, padding: fs * 0.25,
                  textAlign: ti.align ?? "center",
                  WebkitTextStroke: ti.stroke ? `${2 * ti.stroke * tf.scale * k}px ${ti.stroke_color ?? "#000000"}` : undefined, paintOrder: ti.stroke ? "stroke fill" : undefined,
                  textShadow: ti.shadow ? `0 ${0.06 * fs}px ${0.12 * fs}px rgba(0,0,0,${ti.shadow})` : undefined,
                  background: ti.bg_color ? `${ti.bg_color}${Math.round(ti.bg_opacity * 255).toString(16).padStart(2, "0")}` : "transparent" }}>{ti.text}</div>);
              }
              const g = geom(L, k);
              const fxs = fxStyle(L.clip, k, tf.scale);
              const filt = [isNeutral(L.clip.color) ? "" : `url(#g-${L.clip.id})`, fxs.filter].filter(Boolean).join(" ");
              const wrap: React.CSSProperties = { width: g.w, height: g.h, left: g.cx - g.w / 2, top: g.cy - g.h / 2, zIndex: L.z,
                transform: `rotate(${tf.rotation}deg)${L.clip.fx?.flip_h ? " scaleX(-1)" : ""}`, opacity, filter: filt || undefined, ...fxs.wrap };
              const inner: React.CSSProperties = { position: "absolute", width: g.fullW, height: g.fullH, left: g.offX, top: g.offY };
              const ref = (el: any) => { if (el) els.current.set(L.clip.id, el); else els.current.delete(L.clip.id); };
              return wrapT(<div key={L.clip.id} className="layer clipwrap" style={wrap}>{a.kind === "image"
                ? <img ref={ref} src={a.proxy_url!} crossOrigin="anonymous" style={inner} alt="" draggable={false} />
                : <video ref={ref} src={a.proxy_url!} crossOrigin="anonymous" style={inner} preload="auto" playsInline />}</div>);
            })}
            {layers.filter((L) => L.kind === "audio").map((L) => (
              <audio key={L.clip.id} ref={(el) => { if (el) els.current.set(L.clip.id, el); else els.current.delete(L.clip.id); }} src={L.asset.proxy_url!} crossOrigin="anonymous" preload="auto" />
            ))}
            {safe && <><div className="safe action" /><div className="safe title" /></>}
            {total === 0 && <div className="stage-empty">Add media to the timeline to see it here</div>}
            {total > 0 && <div className="stage-chips">
              {autoAdjust && <span className="chip ok"><Sparkles size={12} />Auto-Adjust: ON</span>}
              <span className={`chip ${analysed ? "ok" : ""}`}>{analysed ? "Analysis ready" : "Analysing…"}</span>
              {layers.some((L) => L.clip.color?.enabled !== false && (L.clip.color?.lut?.strength ?? 0) > 0 && playhead >= L.clip.start && playhead < end(L.clip)) &&
                <span className="chip" title="LUTs are applied in the export; see the before/after in Color Grading → LUTs">LUT in export</span>}
            </div>}
          </div>
        </div>
      </div>
      <div className="viewer-scrub" onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const set = (x: number) => setPlayhead(Math.round(Math.max(0, Math.min(1, (x - r.left) / r.width)) * total));
        set(e.clientX); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const mv = (ev: PointerEvent) => set(ev.clientX);
        const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
        addEventListener("pointermove", mv); addEventListener("pointerup", up);
      }} role="slider" aria-label="Scrub" aria-valuemin={0} aria-valuemax={total} aria-valuenow={playhead}>
        <i style={{ width: `${total ? (Math.min(playhead, total) / total) * 100 : 0}%` }} />
      </div>
      <div className="transport">
        <span className="mono tc">{framesToTimecode(Math.min(playhead, total), fps)}</span>
        <button className="btn icon ghost" aria-label={muted ? "Unmute preview" : "Mute preview"} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
        <div className="grow" />
        <button className="btn icon ghost" aria-label="Go to start" onClick={() => { setPlaying(false); setPlayhead(0); }}><SkipBack size={16} /></button>
        <button className="btn icon ghost" aria-label="Back 1 second" onClick={() => { setPlaying(false); setPlayhead((f) => Math.max(0, f - fps)); }}><Rewind size={16} /></button>
        <button className="btn icon play" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)} disabled={total === 0}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
        <button className="btn icon ghost" aria-label="Forward 1 second" onClick={() => { setPlaying(false); setPlayhead((f) => f + fps); }}><FastForward size={16} /></button>
        <button className="btn icon ghost" aria-label="Go to end" onClick={() => { setPlaying(false); setPlayhead(total); }}><SkipForward size={16} /></button>
        <div className="grow" />
        <button className={`btn icon ghost ${loop ? "toggled" : ""}`} aria-pressed={loop} aria-label="Loop playback" onClick={() => setLoop(!loop)}><Repeat size={15} /></button>
        <span className="pill static">{ratioOf(tl.width, tl.height) === "custom" ? `${tl.width}×${tl.height}` : ratioOf(tl.width, tl.height)}</span>
        <span className="mono tc" style={{ textAlign: "right" }}>{framesToTimecode(total, fps)}</span>
      </div>
    </section>
  );
}
