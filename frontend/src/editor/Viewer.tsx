import { MutableRefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Rewind, FastForward, Volume2, VolumeX, Maximize, Camera, Frame, Repeat, ChevronDown, Plus, Check, Sparkles } from "lucide-react";
import { Asset, SequenceDoc } from "../api";
import { Clip, Timeline, end, framesToTimecode } from "../timeline";
import { isNeutral, svgFilterBody } from "../grade";

export type Sampler = (w: number) => HTMLCanvasElement | null;

function fadeFactor(c: Clip, frame: number): number {
  let f = 1;
  if (c.fade_in && frame - c.start < c.fade_in) f = Math.min(f, (frame - c.start) / c.fade_in);
  if (c.fade_out && end(c) - frame <= c.fade_out) f = Math.min(f, (end(c) - frame) / c.fade_out);
  return Math.max(0, Math.min(1, f));
}

type Layer = { clip: Clip; trackHidden: boolean; trackMuted: boolean; kind: "video" | "audio"; asset: Asset; z: number };

export default function Viewer({ tl, assets, playhead, setPlayhead, playing, setPlaying, total, samplerRef, sequences, currentSeqId, onSwitchSeq, onNewSeq, onSnapshot, autoAdjust, analysed }: {
  tl: Timeline; assets: Map<string, Asset>; playhead: number; setPlayhead: (f: number | ((f: number) => number)) => void;
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
    for (const c of t.clips) {
      const a = assets.get(c.asset_id);
      if (!a || a.status !== "ready" || !a.proxy_url) continue;
      if (playhead >= c.start - pre && playhead < end(c)) layers.push({ clip: c, trackHidden: t.hidden, trackMuted: t.muted, kind: "video", asset: a, z });
    }
  }
  for (const t of tl.tracks.filter((t) => t.kind === "audio")) for (const c of t.clips) {
    const a = assets.get(c.asset_id);
    if (!a || a.status !== "ready" || !a.proxy_url) continue;
    if (playhead >= c.start - pre && playhead < end(c)) layers.push({ clip: c, trackHidden: true, trackMuted: t.muted, kind: "audio", asset: a, z: 0 });
  }

  useEffect(() => {
    for (const L of layers) {
      const el = els.current.get(L.clip.id);
      if (!el || el instanceof HTMLImageElement) continue;
      const active = playhead >= L.clip.start && playhead < end(L.clip);
      const want = (L.clip.in + Math.max(0, playhead - L.clip.start)) / fps;
      el.muted = muted || L.trackMuted || !L.asset.has_audio;
      el.volume = Math.min(1, L.clip.volume * fadeFactor(L.clip, playhead));
      if (active && playing) {
        if (Math.abs(el.currentTime - want) > 0.25) el.currentTime = want;
        if (el.paused) el.play().catch(() => {});
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - want) > 0.5 / fps) el.currentTime = want;
      }
    }
  });

  const geom = (L: Layer, k: number) => {
    const a = L.asset, tf = L.clip.transform;
    const aw = a.width || tl.width, ah = a.height || tl.height;
    const fit = Math.min((tl.width * tf.scale) / aw, (tl.height * tf.scale) / ah);
    return { w: aw * fit * k, h: ah * fit * k, cx: (tl.width / 2 + tf.x) * k, cy: (tl.height / 2 + tf.y) * k };
  };

  // Composite the current frame onto a canvas (same maths as the stage + render). Used by scopes & snapshots.
  const visible = layers.filter((L) => L.kind === "video" && !L.trackHidden && playhead >= L.clip.start && playhead < end(L.clip)).sort((a, b) => a.z - b.z);
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
        if (!el) continue;
        if (el instanceof HTMLVideoElement && el.readyState < 2) continue;
        const g = geom(L, k);
        ctx.save();
        ctx.globalAlpha = L.clip.transform.opacity * fadeFactor(L.clip, playhead);
        if (!isNeutral(L.clip.color)) ctx.filter = `url(#g-${L.clip.id})`;
        ctx.translate(g.cx, g.cy); ctx.rotate((L.clip.transform.rotation * Math.PI) / 180);
        ctx.drawImage(el as CanvasImageSource, -g.w / 2, -g.h / 2, g.w, g.h);
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
              const a = L.asset, tf = L.clip.transform, g = geom(L, k);
              const active = playhead >= L.clip.start && playhead < end(L.clip);
              const style: React.CSSProperties = {
                width: g.w, height: g.h, left: g.cx - g.w / 2, top: g.cy - g.h / 2, zIndex: L.z,
                transform: `rotate(${tf.rotation}deg)`, opacity: active && !L.trackHidden ? tf.opacity * fadeFactor(L.clip, playhead) : 0,
                filter: isNeutral(L.clip.color) ? undefined : `url(#g-${L.clip.id})`,
              };
              const ref = (el: any) => { if (el) els.current.set(L.clip.id, el); else els.current.delete(L.clip.id); };
              return a.kind === "image"
                ? <img key={L.clip.id} ref={ref} src={a.proxy_url!} crossOrigin="anonymous" className="layer" style={style} alt="" draggable={false} />
                : <video key={L.clip.id} ref={ref} src={a.proxy_url!} crossOrigin="anonymous" className="layer" style={style} preload="auto" playsInline />;
            })}
            {layers.filter((L) => L.kind === "audio").map((L) => (
              <audio key={L.clip.id} ref={(el) => { if (el) els.current.set(L.clip.id, el); else els.current.delete(L.clip.id); }} src={L.asset.proxy_url!} crossOrigin="anonymous" preload="auto" />
            ))}
            {safe && <><div className="safe action" /><div className="safe title" /></>}
            {total === 0 && <div className="stage-empty">Add media to the timeline to see it here</div>}
            {total > 0 && <div className="stage-chips">
              {autoAdjust && <span className="chip ok"><Sparkles size={12} />Auto-Adjust: ON</span>}
              <span className={`chip ${analysed ? "ok" : ""}`}>{analysed ? "Analysis ready" : "Analysing…"}</span>
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
        <span className="pill static">{tl.width > tl.height ? "16:9" : tl.width === tl.height ? "1:1" : tl.width * 16 === tl.height * 9 ? "9:16" : "4:5"}</span>
        <span className="mono tc" style={{ textAlign: "right" }}>{framesToTimecode(total, fps)}</span>
      </div>
    </section>
  );
}
