import { PointerEvent as RPE, useEffect, useMemo, useRef, useState } from "react";
import { Scissors, Trash2, Magnet, Lock, Unlock, Eye, EyeOff, Volume2, VolumeX, Plus, ZoomIn, ZoomOut, ArrowLeftToLine } from "lucide-react";
import { Asset } from "../api";
import { Timeline, Track, Clip, end, len, moveClip, trimStart, trimEnd, snap, snapPoints, splitAllAt, deleteClip, updateTrack, addTrack, duration, framesToTimecode } from "../timeline";
import { keyTimes } from "../keyframes";
import { assetFrames } from "./Editor";

const HEAD_W = 214;
const ROW_H = { video: 27, audio: 27 };

type Drag = { mode: "move" | "trimL" | "trimR" | "scrub"; id?: string; x0: number; origStart: number; origEnd: number; base: Timeline; moved: boolean };

export default function TimelinePanel({ tl, assets, edit, playhead, setPlayhead, selected, setSelected, snapOn, setSnapOn, readOnly, onDropAsset, timecode }: {
  tl: Timeline; assets: Map<string | null, Asset>; edit: (t: Timeline | null, coalesce?: string) => boolean; playhead: number; setPlayhead: (f: number) => void;
  selected: string | null; setSelected: (id: string | null) => void; snapOn: boolean; setSnapOn: (f: (s: boolean) => boolean) => void; readOnly: boolean;
  onDropAsset: (assetId: string, trackId: string, frame: number) => void; timecode: string;
}) {
  const [pps, setPps] = useState(60); // pixels per second
  const [draft, setDraft] = useState<Timeline | null>(null);
  const drag = useRef<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const view = draft ?? tl;
  const fps = tl.fps;
  const ppf = pps / fps;
  const total = duration(view);
  const widthFrames = Math.max(total + 15 * fps, 60 * fps);
  const contentW = widthFrames * ppf;
  const xToFrame = (clientX: number, laneLeft: number) => Math.max(0, Math.round((clientX - laneLeft) / ppf));

  // Keep the playhead in view while it moves.
  useEffect(() => {
    const s = scroller.current;
    if (!s || drag.current) return;
    const x = playhead * ppf + HEAD_W;
    if (x < s.scrollLeft + HEAD_W || x > s.scrollLeft + s.clientWidth - 40) s.scrollLeft = Math.max(0, x - HEAD_W - 80);
  }, [playhead, ppf]);

  function trackAt(clientX: number, clientY: number): string | null {
    const el = document.elementsFromPoint(clientX, clientY).find((e) => (e as HTMLElement).dataset?.track);
    return el ? (el as HTMLElement).dataset.track! : null;
  }

  function down(e: RPE, mode: Drag["mode"], clip?: Clip) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (clip) setSelected(clip.id);
    if (mode === "scrub") {
      const lane = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPlayhead(xToFrame(e.clientX, lane.left));
      drag.current = { mode, x0: lane.left, origStart: 0, origEnd: 0, base: tl, moved: false };
    } else {
      if (readOnly) return;
      drag.current = { mode, id: clip!.id, x0: e.clientX, origStart: clip!.start, origEnd: end(clip!), base: tl, moved: false };
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function move(e: RPE) {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "scrub") { setPlayhead(xToFrame(e.clientX, d.x0)); return; }
    const df = Math.round((e.clientX - d.x0) / ppf);
    if (!d.moved && Math.abs(e.clientX - d.x0) < 3) return;
    d.moved = true;
    const pts = snapOn ? snapPoints(d.base, d.id!, playhead) : [];
    const thr = 8 / ppf;
    let next: Timeline | null = null;
    if (d.mode === "move") {
      let s = d.origStart + df;
      if (snapOn) {
        const L = d.origEnd - d.origStart;
        const s1 = snap(s, pts, thr), s2 = snap(s + L, pts, thr) - L;
        s = Math.abs(s1 - s) <= Math.abs(s2 - s) ? s1 : s2;
      }
      s = Math.max(0, s);
      const target = trackAt(e.clientX, e.clientY);
      const orig = d.base.tracks.find((t) => t.clips.some((c) => c.id === d.id))!.id;
      next = (target && moveClip(d.base, d.id!, target, s)) || moveClip(d.base, d.id!, orig, s);
    } else if (d.mode === "trimL") {
      next = trimStart(d.base, d.id!, snapOn ? snap(d.origStart + df, pts, thr) : d.origStart + df);
    } else {
      const c = d.base.tracks.flatMap((t) => t.clips).find((c) => c.id === d.id)!;
      next = trimEnd(d.base, d.id!, snapOn ? snap(d.origEnd + df, pts, thr) : d.origEnd + df, c.title ? Number.POSITIVE_INFINITY : assetFrames(assets.get(c.asset_id), fps));
    }
    if (next) setDraft(next);
  }

  function up() {
    const d = drag.current;
    drag.current = null;
    if (d && d.mode !== "scrub" && d.moved && draft) edit(draft);
    setDraft(null);
  }

  const zoom = (f: number) => setPps((p) => Math.min(600, Math.max(4, p * f)));
  const ticks = useMemo(() => {
    const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300];
    const stepS = steps.find((s) => s * pps >= 70) ?? 600;
    const out: number[] = [];
    for (let s = 0; s * fps <= widthFrames; s += stepS) out.push(s);
    return { stepS, out };
  }, [pps, fps, widthFrames]);

  return (
    <section className="ed-timeline panel" aria-label="Timeline">
      <div className="tl-toolbar">
        <button className="btn sm ghost" onClick={() => edit(splitAllAt(tl, playhead))} disabled={readOnly} title="Split clips at playhead (S)"><Scissors size={14} />Split</button>
        <button className="btn sm ghost" onClick={() => { if (selected && edit(deleteClip(tl, selected))) setSelected(null); }} disabled={!selected || readOnly} title="Delete (Del)"><Trash2 size={14} />Delete</button>
        <button className="btn sm ghost" onClick={() => { if (selected && edit(deleteClip(tl, selected, true))) setSelected(null); }} disabled={!selected || readOnly} title="Ripple delete (Shift+Del)"><ArrowLeftToLine size={14} />Ripple delete</button>
        <span className="tl-sep" />
        <button className={`btn sm ghost ${snapOn ? "toggled" : ""}`} aria-pressed={snapOn} onClick={() => setSnapOn((s) => !s)} title="Snapping (N)"><Magnet size={14} />Snap</button>
        <button className="btn sm ghost" onClick={() => edit(addTrack(tl, "video"))} disabled={readOnly || tl.tracks.length >= 24}><Plus size={14} />Video track</button>
        <button className="btn sm ghost" onClick={() => edit(addTrack(tl, "audio"))} disabled={readOnly || tl.tracks.length >= 24}><Plus size={14} />Audio track</button>
        <div className="grow" />
        {timecode && <><span className="mono" style={{ fontSize: 12.5, color: "var(--cyan)" }}>{timecode}</span><span className="tl-sep" /></>}
        <button className="btn icon ghost" aria-label="Zoom out" onClick={() => zoom(1 / 1.4)}><ZoomOut size={15} /></button>
        <input type="range" min={0} max={100} value={Math.round((Math.log(pps / 4) / Math.log(150)) * 100)} aria-label="Timeline zoom"
          onChange={(e) => setPps(4 * Math.pow(150, +e.target.value / 100))} style={{ width: 110 }} />
        <button className="btn icon ghost" aria-label="Zoom in" onClick={() => zoom(1.4)}><ZoomIn size={15} /></button>
      </div>
      <div className="tl-scroll" ref={scroller} onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); } }}>
        <div className="tl-content" style={{ width: contentW + HEAD_W }}>
          <div className="tl-row tl-ruler-row">
            <div className="tl-head tl-corner">{tl.tracks.length} tracks</div>
            <div className="tl-ruler" onPointerDown={(e) => down(e, "scrub")} onPointerMove={move} onPointerUp={up} style={{ width: contentW }}>
              {ticks.out.map((s) => (
                <div key={s} className="tick" style={{ left: s * pps }}><span>{framesToTimecode(s * fps, fps).slice(3, 8)}</span></div>
              ))}
            </div>
          </div>
          {view.tracks.map((t) => (
            <TrackRow key={t.id} badge={t.kind === "video" ? `V${view.tracks.filter((x) => x.kind === "video").length - view.tracks.filter((x) => x.kind === "video").indexOf(t)}` : `A${view.tracks.filter((x) => x.kind === "audio").indexOf(t) + 1}`} t={t} tl={tl} view={view} ppf={ppf} contentW={contentW} assets={assets} selected={selected} readOnly={readOnly}
              edit={edit} down={down} move={move} up={up}
              onLaneDown={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setSelected(null); setPlayhead(xToFrame(e.clientX, r.left)); }}
              onDrop={(id, x, rectLeft) => onDropAsset(id, t.id, xToFrame(x, rectLeft))} />
          ))}
          <div className="playhead" style={{ left: HEAD_W + playhead * ppf }} aria-hidden><i /></div>
        </div>
      </div>
    </section>
  );
}

function TrackRow({ badge, t, tl, view, ppf, contentW, assets, selected, readOnly, edit, down, move, up, onLaneDown, onDrop }: {
  badge: string; t: Track; tl: Timeline; view: Timeline; ppf: number; contentW: number; assets: Map<string | null, Asset>; selected: string | null; readOnly: boolean;
  edit: (t: Timeline | null) => boolean; down: (e: RPE, m: Drag["mode"], c?: Clip) => void; move: (e: RPE) => void; up: () => void;
  onLaneDown: (e: RPE) => void; onDrop: (assetId: string, clientX: number, laneLeft: number) => void;
}) {
  const [over, setOver] = useState(false);
  const accepts = (types: readonly string[]) => types.includes("application/x-cu-asset") &&
    (t.kind === "audio" ? types.includes("application/x-cu-kind-audio") : !types.includes("application/x-cu-kind-audio"));
  return (
    <div className="tl-row" style={{ height: ROW_H[t.kind] }}>
      <div className={`tl-head ${t.kind}`}>
        <span className="tl-badge">{badge}</span>
        <span className="tl-name ellipsis" title={t.name}>{t.name}</span>
        <div className="row" style={{ gap: 0 }}>
          <button className="btn icon ghost xs" aria-pressed={t.locked} aria-label={`${t.locked ? "Unlock" : "Lock"} ${t.name}`} disabled={readOnly}
            onClick={() => edit(updateTrack(tl, t.id, { locked: !t.locked }))}>{t.locked ? <Lock size={13} /> : <Unlock size={13} className="dim" />}</button>
          {t.kind === "video" && <button className="btn icon ghost xs" aria-pressed={t.hidden} aria-label={`${t.hidden ? "Show" : "Hide"} ${t.name}`} disabled={readOnly}
            onClick={() => edit(updateTrack(tl, t.id, { hidden: !t.hidden }))}>{t.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>}
          <button className="btn icon ghost xs" aria-pressed={t.muted} aria-label={`${t.muted ? "Unmute" : "Mute"} ${t.name}`} disabled={readOnly}
            onClick={() => edit(updateTrack(tl, t.id, { muted: !t.muted }))}>{t.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}</button>
        </div>
      </div>
      <div className={`tl-lane ${t.kind} ${over ? "over" : ""} ${t.locked ? "locked" : ""}`} data-track={t.id} style={{ width: contentW }}
        onPointerDown={onLaneDown}
        onDragOver={(e) => { if (accepts(e.dataTransfer.types) && !t.locked && !readOnly) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { setOver(false); const id = e.dataTransfer.getData("application/x-cu-asset"); if (id) { e.preventDefault(); onDrop(id, e.clientX, e.currentTarget.getBoundingClientRect().left); } }}>
        {t.clips.map((c) => {
          const a = assets.get(c.asset_id);
          const w = Math.max(4, len(c) * ppf);
          const missing = !c.title && (!a || a.status !== "ready");
          return (
            <div key={c.id} className={`clip ${t.kind} ${c.title ? "title" : a?.kind ?? ""} ${selected === c.id ? "sel" : ""} ${missing ? "missing" : ""} ${t.hidden || t.muted ? "off" : ""}`}
              style={{ left: c.start * ppf, width: w, backgroundImage: t.kind === "video" && a?.thumbnail_url ? `url(${a.thumbnail_url})` : a?.kind === "image" && a.proxy_url ? `url(${a.proxy_url})` : undefined }}
              onPointerDown={(e) => down(e, "move", c)} onPointerMove={move} onPointerUp={up} role="button" tabIndex={0}
              aria-label={`${c.title ? "Title: " + c.title.text : a?.filename ?? "Missing media"} clip, ${framesToTimecode(len(c), view.fps)}`}
              onKeyDown={(e) => e.key === "Enter" && down(e as any, "move", c)}>
              {!readOnly && !t.locked && <span className="edge l" onPointerDown={(e) => down(e, "trimL", c)} onPointerMove={move} onPointerUp={up} />}
              <span className="clip-label">{c.title ? `T  ${c.title.text}` : missing ? "⚠ Missing media" : a!.filename}{(c.speed ?? 1) !== 1 ? `  ·  ${c.speed}×` : ""}</span>
              {a?.waveform_url && (t.kind === "audio" || w > 60) && <Wave url={a.waveform_url} assetId={a.id} inS={c.in / view.fps} outS={c.out / view.fps} width={w} audioTrack={t.kind === "audio"} />}
              {(c.fade_in > 0 || c.fade_out > 0) && <>
                {c.fade_in > 0 && <span className="fade in" style={{ width: c.fade_in * ppf }} />}
                {c.fade_out > 0 && <span className="fade out" style={{ width: c.fade_out * ppf }} />}
                {keyTimes(c).map((kt) => <span key={kt} className="kf-mark" style={{ left: kt * ppf }} aria-hidden="true" />)}
              </>}
              {!readOnly && !t.locked && <span className="edge r" onPointerDown={(e) => down(e, "trimR", c)} onPointerMove={move} onPointerUp={up} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const waveCache = new Map<string, Promise<{ peaks_per_second: number; peaks: number[] }>>();

function Wave({ url, assetId, inS, outS, width, audioTrack }: { url: string; assetId: string; inS: number; outS: number; width: number; audioTrack: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!waveCache.has(assetId)) waveCache.set(assetId, fetch(url).then((r) => { if (!r.ok) throw new Error(); return r.json(); }).catch((e) => { waveCache.delete(assetId); throw e; }));
    let live = true;
    waveCache.get(assetId)!.then((w) => {
      const cv = ref.current;
      if (!live || !cv) return;
      const W = Math.min(4000, Math.ceil(width)), H = cv.clientHeight || 30;
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d")!;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = audioTrack ? "rgba(52, 211, 153, .85)" : "rgba(103, 232, 249, .55)";
      const a = inS * w.peaks_per_second, b = outS * w.peaks_per_second;
      for (let x = 0; x < W; x++) {
        const i0 = Math.floor(a + ((b - a) * x) / W), i1 = Math.max(i0 + 1, Math.floor(a + ((b - a) * (x + 1)) / W));
        let m = 0;
        for (let i = i0; i < i1 && i < w.peaks.length; i++) m = Math.max(m, w.peaks[i]);
        const h = Math.max(1, m * H);
        ctx.fillRect(x, (H - h) / 2, 1, h);
      }
    }).catch(() => {});
    return () => { live = false; };
  }, [url, assetId, inS, outS, width, audioTrack]);
  return <canvas ref={ref} className="wave" aria-hidden />;
}
