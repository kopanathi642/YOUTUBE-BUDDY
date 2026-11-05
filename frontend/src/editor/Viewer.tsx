import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, Repeat, Volume2, VolumeX, Maximize } from "lucide-react";
import { Asset } from "../api";
import { Clip, Timeline, end, framesToTimecode } from "../timeline";

function fadeFactor(c: Clip, frame: number): number {
  let f = 1;
  if (c.fade_in && frame - c.start < c.fade_in) f = Math.min(f, (frame - c.start) / c.fade_in);
  if (c.fade_out && end(c) - frame <= c.fade_out) f = Math.min(f, (end(c) - frame) / c.fade_out);
  return Math.max(0, Math.min(1, f));
}

type Layer = { clip: Clip; trackHidden: boolean; trackMuted: boolean; kind: "video" | "audio"; asset: Asset; z: number };

export default function Viewer({ tl, assets, playhead, setPlayhead, playing, setPlaying, total }: {
  tl: Timeline; assets: Map<string, Asset>; playhead: number; setPlayhead: (f: number | ((f: number) => number)) => void;
  playing: boolean; setPlaying: (p: boolean | ((p: boolean) => boolean)) => void; total: number; activeCount: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const stageWrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 360 });
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(false);
  const els = useRef(new Map<string, HTMLMediaElement>());
  const fps = tl.fps;

  useLayoutEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const k = Math.min((r.width - 16) / tl.width, (r.height - 16) / tl.height);
      setSize({ w: Math.max(80, tl.width * k), h: Math.max(45, tl.height * k) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [tl.width, tl.height]);

  // Real-time clock (drives the playhead while playing).
  const clock = useRef<{ t0: number; f0: number } | null>(null);
  useEffect(() => {
    if (!playing) { clock.current = null; return; }
    if (total === 0) { setPlaying(false); return; }
    let start = playhead >= total ? 0 : playhead;
    clock.current = { t0: performance.now(), f0: start };
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

  // Layers mounted around the playhead (pre-roll 2s so media is buffered before it appears).
  const pre = 2 * fps;
  const layers: Layer[] = [];
  let z = 0;
  const vtracks = tl.tracks.filter((t) => t.kind === "video");
  for (const t of [...vtracks].reverse()) {
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

  // Sync every mounted media element to the playhead.
  useEffect(() => {
    for (const L of layers) {
      const el = els.current.get(L.clip.id);
      if (!el) continue;
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

  const k = size.w / tl.width;
  const frameNow = Math.min(playhead, total);
  return (
    <section className="ed-viewer panel" aria-label="Program monitor">
      <div className="viewer-head">
        <span className="badge info">Program</span>
        <span className="muted" style={{ fontSize: 12.5 }}>{tl.width}×{tl.height} · {tl.fps} fps</span>
        <div className="grow" />
        <span className="dim" style={{ fontSize: 11.5 }} title="Playback uses lightweight proxies. Exports always render from your original files.">Proxy preview</span>
        <button className="btn icon ghost" aria-label="Fullscreen" onClick={() => stageWrap.current?.requestFullscreen?.()}><Maximize size={15} /></button>
      </div>
      <div className="viewer-box" ref={box}>
        <div ref={stageWrap} className="stage-wrap">
          <div className="stage" style={{ width: size.w, height: size.h }}>
            {layers.filter((L) => L.kind === "video").sort((a, b) => a.z - b.z).map((L) => {
              const a = L.asset, tf = L.clip.transform;
              const active = playhead >= L.clip.start && playhead < end(L.clip);
              const aw = a.width || tl.width, ah = a.height || tl.height;
              const fit = Math.min((tl.width * tf.scale) / aw, (tl.height * tf.scale) / ah);
              const w = aw * fit * k, h = ah * fit * k;
              const style: React.CSSProperties = {
                width: w, height: h, left: size.w / 2 - w / 2 + tf.x * k, top: size.h / 2 - h / 2 + tf.y * k, zIndex: L.z,
                transform: `rotate(${tf.rotation}deg)`, opacity: active && !L.trackHidden ? tf.opacity * fadeFactor(L.clip, playhead) : 0,
              };
              return a.kind === "image"
                ? <img key={L.clip.id} src={a.proxy_url!} className="layer" style={style} alt="" draggable={false} />
                : <video key={L.clip.id} ref={(el) => { if (el) els.current.set(L.clip.id, el); else els.current.delete(L.clip.id); }}
                  src={a.proxy_url!} className="layer" style={style} preload="auto" playsInline />;
            })}
            {layers.filter((L) => L.kind === "audio").map((L) => (
              <audio key={L.clip.id} ref={(el) => { if (el) els.current.set(L.clip.id, el); else els.current.delete(L.clip.id); }} src={L.asset.proxy_url!} preload="auto" />
            ))}
            {total === 0 && <div className="stage-empty">Add media to the timeline to see it here</div>}
          </div>
        </div>
      </div>
      <div className="transport">
        <span className="mono tc">{framesToTimecode(frameNow, fps)}</span>
        <div className="grow" />
        <button className="btn icon ghost" aria-label="Go to start" onClick={() => { setPlaying(false); setPlayhead(0); }}><SkipBack size={16} /></button>
        <button className="btn icon ghost" aria-label="Previous frame" onClick={() => { setPlaying(false); setPlayhead((f) => Math.max(0, f - 1)); }}><ChevronLeft size={18} /></button>
        <button className="btn icon play" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)} disabled={total === 0}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
        <button className="btn icon ghost" aria-label="Next frame" onClick={() => { setPlaying(false); setPlayhead((f) => f + 1); }}><ChevronRight size={18} /></button>
        <button className="btn icon ghost" aria-label="Go to end" onClick={() => { setPlaying(false); setPlayhead(total); }}><SkipForward size={16} /></button>
        <button className={`btn icon ghost ${loop ? "toggled" : ""}`} aria-pressed={loop} aria-label="Loop playback" onClick={() => setLoop(!loop)}><Repeat size={15} /></button>
        <button className="btn icon ghost" aria-pressed={muted} aria-label={muted ? "Unmute preview" : "Mute preview"} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
        <div className="grow" />
        <span className="mono tc dim">{framesToTimecode(total, fps)}</span>
      </div>
    </section>
  );
}
