import { PointerEvent as RPE, useEffect, useMemo, useRef, useState } from "react";
import { MousePointer2, Scissors, Trash2, Magnet, Lock, Unlock, Eye, EyeOff, Plus, ZoomIn, ZoomOut, ArrowLeftToLine, Hand, SquareSplitHorizontal, Maximize2, UnfoldHorizontal, Flag, FileDown } from "lucide-react";
import { Asset } from "../api";
import { Timeline, Track, Clip, end, len, moveClip, trimStart, trimEnd, snap, snapPoints, splitAt, splitAllAt, deleteClip, updateTrack, addTrack, duration, framesToTimecode, DEFAULT_TRANSFORM } from "../timeline";
import { keyTimes } from "../keyframes";
import { roll, rippleTrimEnd, rippleTrimStart, slip, slide, neighbours, addMarker, removeMarker, markerNear, MARKER_HEX } from "../editops";
import { assetFrames } from "./Editor";

/* Premiere-style timeline: tools panel on the left, big blue timecode over the track headers, full-timecode ruler,
   lock · V1 · eye / M track headers, violet video and green audio clips with an fx badge, a zoom/scroll bar with
   handles underneath, and audio meters on the right (driven by the real waveform of whatever is under the playhead). */

const HEAD_W = 196;
const ROW_H = { video: 34, audio: 34 };
const rowHeight = (t: Track, badge: string) => (badge === "V1" ? 64 : t.kind === "audio" && (badge === "A1" || badge === "A2") ? 48 : ROW_H[t.kind]);

type Tool = "select" | "trim" | "razor" | "hand";
type TrimKind = "roll" | "rippleL" | "rippleR" | "slip" | "slide";
const TRIM_LABEL: Record<TrimKind, string> = { roll: "Roll", rippleL: "Ripple", rippleR: "Ripple", slip: "Slip", slide: "Slide" };
type Drag = { mode: "move" | "trimL" | "trimR" | "scrub" | "pan" | "smart"; trim?: TrimKind; other?: string; id?: string; x0: number; origStart: number; origEnd: number; base: Timeline; moved: boolean };

/** Does the clip carry anything Premiere would show a lit "fx" badge for? */
const hasFx = (c: Clip) => !!(c.color || c.fx || c.denoise || c.crop || c.transition_in || keyTimes(c).length > 0 || (c.speed ?? 1) !== 1 ||
  (["x", "y", "scale", "rotation", "opacity"] as const).some((k) => c.transform && c.transform[k] !== DEFAULT_TRANSFORM[k]));

/** Duration without leading zero hours/minutes: 05:12 (s:frames), 1:05:12, 1:02:05:12. */
export function shortTc(frames: number, fps: number) {
  const tc = framesToTimecode(frames, fps).split(":");
  while (tc.length > 2 && tc[0] === "00") tc.shift();
  return tc.map((x, i) => (i === 0 ? String(+x) : x)).join(":");
}

/** Resolve 21.1 "export markers": a CSV file plus a printable list (the browser's print dialog saves it as PDF). */
export function exportMarkers(tl: Timeline) {
  const ms = tl.markers ?? [];
  if (!ms.length) return;
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = ["#,Timecode,Name,Colour", ...ms.map((m, i) => [i + 1, framesToTimecode(m.frame, tl.fps), esc(m.name), m.color].join(","))].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
  a.download = "markers.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  const w = window.open("", "_blank");
  if (!w) return;
  const h = (v: string) => v.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Markers</title><style>body{font:14px system-ui;margin:32px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 10px;text-align:left}i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}</style>
    <h2>Markers</h2><table><tr><th>#</th><th>Timecode</th><th>Name</th><th>Colour</th></tr>${ms.map((m, i) => `<tr><td>${i + 1}</td><td>${framesToTimecode(m.frame, tl.fps)}</td><td>${h(m.name)}</td><td><i style="background:${MARKER_HEX[m.color]}"></i>${m.color}</td></tr>`).join("")}</table>
    <script>setTimeout(()=>print(),300)<\/script>`);
  w.document.close();
}

/** Resolve's smart trim: what the Trim tool does depends on where on the clip you press. */
function trimZone(tl: Timeline, c: Clip, el: HTMLElement, clientX: number, clientY: number): { kind: TrimKind; other?: string } {
  const r = el.getBoundingClientRect(), edge = Math.min(10, r.width / 4);
  const { prev, next } = neighbours(tl, c.id);
  if (clientX - r.left <= edge) return prev ? { kind: "roll", other: prev.id } : { kind: "rippleL" };
  if (r.right - clientX <= edge) return next ? { kind: "roll", other: next.id } : { kind: "rippleR" };
  return clientY - r.top < r.height / 2 ? { kind: "slip" } : { kind: "slide" };
}

export default function TimelinePanel({ tl, assets, edit, playhead, setPlayhead, selected, setSelected, snapOn, setSnapOn, readOnly, onDropAsset, timecode }: {
  tl: Timeline; assets: Map<string | null, Asset>; edit: (t: Timeline | null, coalesce?: string) => boolean; playhead: number; setPlayhead: (f: number) => void;
  selected: string | null; setSelected: (id: string | null) => void; snapOn: boolean; setSnapOn: (f: (s: boolean) => boolean) => void; readOnly: boolean;
  onDropAsset: (assetId: string, trackId: string, frame: number) => void; timecode: string;
}) {
  const [pps, setPps] = useState(60); // pixels per second
  const [tool, setTool] = useState<Tool>("select");
  const [draft, setDraft] = useState<Timeline | null>(null);
  const [razorX, setRazorX] = useState<number | null>(null);
  const [trimHint, setTrimHint] = useState<{ label: string; x: number; y: number } | null>(null);
  const [view2, setView2] = useState({ left: 0, width: 800 }); // scroller position, for the zoom bar
  const drag = useRef<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const view = draft ?? tl;
  const fps = tl.fps;
  const ppf = pps / fps;
  const total = duration(view);
  const widthFrames = Math.max(total + 15 * fps, 60 * fps);
  const contentW = widthFrames * ppf;
  const xToFrame = (clientX: number, laneLeft: number) => Math.max(0, Math.round((clientX - laneLeft) / ppf));
  const clampPps = (p: number) => Math.min(600, Math.max(2, p));

  // Keep the playhead in view while it moves.
  useEffect(() => {
    const s = scroller.current;
    if (!s || drag.current) return;
    const x = playhead * ppf + HEAD_W;
    if (x < s.scrollLeft + HEAD_W || x > s.scrollLeft + s.clientWidth - 40) s.scrollLeft = Math.max(0, x - HEAD_W - 80);
  }, [playhead, ppf]);

  // Track the scroller so the zoom bar thumb follows it.
  useEffect(() => {
    const s = scroller.current;
    if (!s) return;
    const sync = () => setView2({ left: s.scrollLeft, width: Math.max(1, s.clientWidth - HEAD_W) });
    sync();
    const ro = new ResizeObserver(sync); ro.observe(s);
    s.addEventListener("scroll", sync, { passive: true });
    return () => { ro.disconnect(); s.removeEventListener("scroll", sync); };
  }, [pps]);

  // V = selection, C = razor, H = hand, = / - zoom, \\ zoom to fit (Premiere's keys). S / N / Delete stay with the editor.
  const keys = useRef<{ zoom: (f: number) => void; fit: () => void; marker: () => void; jump: (d: 1 | -1) => void }>({ zoom: () => {}, fit: () => {}, marker: () => {}, jump: () => {} });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || el.closest("input, textarea, select, [contenteditable=true]")) return;
      const t = ({ v: "select", t: "trim", c: "razor", h: "hand" } as Record<string, Tool>)[e.key.toLowerCase()];
      if (t) setTool(t);
      else if (e.key === "m" || e.key === "M") keys.current.marker();
      else if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); keys.current.jump(e.key === "ArrowDown" ? 1 : -1); }
      else if (e.key === "=" || e.key === "+") keys.current.zoom(1.4);
      else if (e.key === "-" || e.key === "_") keys.current.zoom(1 / 1.4);
      else if (e.key === "\\") keys.current.fit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function trackAt(clientX: number, clientY: number): string | null {
    const el = document.elementsFromPoint(clientX, clientY).find((e) => (e as HTMLElement).dataset?.track);
    return el ? (el as HTMLElement).dataset.track! : null;
  }

  function startPan(e: RPE) {
    drag.current = { mode: "pan", x0: e.clientX, origStart: scroller.current?.scrollLeft ?? 0, origEnd: 0, base: tl, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function down(e: RPE, mode: Drag["mode"], clip?: Clip) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (tool === "hand" && mode !== "scrub") { startPan(e); return; }
    if (tool === "trim" && clip && mode !== "scrub") {
      if (readOnly) return;
      const el = (e.currentTarget as HTMLElement).closest(".clip") as HTMLElement;
      const z = trimZone(tl, clip, el, e.clientX, e.clientY);
      setSelected(clip.id);
      drag.current = { mode: "smart", trim: z.kind, other: z.other, id: clip.id, x0: e.clientX, origStart: clip.start, origEnd: end(clip), base: tl, moved: false };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "razor" && clip && mode === "move") {
      if (readOnly) return;
      const lane = (e.currentTarget as HTMLElement).closest(".tl-lane")!.getBoundingClientRect();
      let f = xToFrame(e.clientX, lane.left);
      if (snapOn) f = snap(f, [playhead], 6 / ppf);
      const r = splitAt(tl, clip.id, f);
      if (r && edit(r.tl)) setSelected(r.rightId);
      return;
    }
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
    if (d.mode === "pan") { if (scroller.current) scroller.current.scrollLeft = d.origStart - (e.clientX - d.x0); return; }
    if (d.mode === "scrub") { setPlayhead(xToFrame(e.clientX, d.x0)); return; }
    const df = Math.round((e.clientX - d.x0) / ppf);
    if (!d.moved && Math.abs(e.clientX - d.x0) < 3) return;
    d.moved = true;
    if (d.mode === "smart") {
      const srcMax = (c: Clip) => (c.title ? Number.POSITIVE_INFINITY : assetFrames(assets.get(c.asset_id), fps));
      const id = d.id!, c = d.base.tracks.flatMap((t) => t.clips).find((x) => x.id === id)!;
      let r: Timeline | null = null;
      if (d.trim === "roll") {
        const leftIsMe = d.other && end(c) !== c.start && d.base.tracks.some((t) => t.clips.some((x) => x.id === d.other && x.start === end(c)));
        const cut = (leftIsMe ? d.origEnd : d.origStart) + df;
        r = leftIsMe ? roll(d.base, id, d.other!, cut, srcMax) : roll(d.base, d.other!, id, cut, srcMax);
      } else if (d.trim === "rippleR") r = rippleTrimEnd(d.base, id, d.origEnd + df, srcMax);
      else if (d.trim === "rippleL") r = rippleTrimStart(d.base, id, df);
      else if (d.trim === "slip") r = slip(d.base, id, -df, srcMax);
      else r = slide(d.base, id, Math.max(0, d.origStart + df), srcMax);
      if (r) setDraft(r);
      setTrimHint({ label: `${TRIM_LABEL[d.trim!]} ${df > 0 ? "+" : ""}${df}f`, x: e.clientX, y: e.clientY });
      return;
    }
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
    if (d && (d.mode === "move" || d.mode === "trimL" || d.mode === "trimR" || d.mode === "smart") && d.moved && draft) edit(draft);
    setDraft(null);
    setTrimHint(null);
  }

  /** Zoom around the playhead (or a given frame) so the spot you're working on stays put. */
  function zoomTo(p: number, anchorFrame = playhead) {
    const s = scroller.current, np = clampPps(p);
    if (!s) { setPps(np); return; }
    const screenX = anchorFrame * ppf - s.scrollLeft;
    setPps(np);
    requestAnimationFrame(() => { if (scroller.current) scroller.current.scrollLeft = Math.max(0, anchorFrame * (np / fps) - screenX); });
  }
  const zoom = (f: number) => zoomTo(pps * f);
  const fit = () => { const s = scroller.current; if (!s) return; setPps(clampPps((s.clientWidth - HEAD_W - 40) / Math.max(1, total / fps))); requestAnimationFrame(() => { if (scroller.current) scroller.current.scrollLeft = 0; }); };

  const marker = () => { if (!readOnly) edit(addMarker(tl, playhead)); };
  keys.current = { zoom, fit, marker, jump: (d) => { const m = markerNear(tl, playhead, d); if (m) setPlayhead(m.frame); } };

  const ticks = useMemo(() => {
    const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const stepS = steps.find((s) => s * pps >= 110) ?? 1200;
    const out: number[] = [];
    for (let s = 0; s * fps <= widthFrames; s += stepS) out.push(s);
    return { stepS, out };
  }, [pps, fps, widthFrames]);

  const badgeOf = (t: Track) => {
    const vids = view.tracks.filter((x) => x.kind === "video");
    return t.kind === "video" ? `V${vids.length - vids.indexOf(t)}` : `A${view.tracks.filter((x) => x.kind === "audio").indexOf(t) + 1}`;
  };
  const firstAudio = view.tracks.find((t) => t.kind === "audio")?.id;

  return (
    <section className="ed-timeline panel pr-tl" aria-label="Timeline">
      <div className="tl-toolbar">
        <span className="pr-tab" title="Current sequence"><i aria-hidden />Main sequence</span>
        <div className="grow" />
        <button className="btn sm ghost" onClick={() => edit(addTrack(tl, "video"))} disabled={readOnly || tl.tracks.length >= 24} title="Add a video track"><Plus size={13} />Video track</button>
        <button className="btn sm ghost" onClick={() => edit(addTrack(tl, "audio"))} disabled={readOnly || tl.tracks.length >= 24} title="Add an audio track"><Plus size={13} />Audio track</button>
        {timecode && <><span className="tl-sep" /><span className="mono tl-dur" title="Sequence length">{timecode}</span></>}
        <span className="tl-sep" />
        <button className="btn icon ghost" aria-label="Zoom out" title="Zoom out (−, or Ctrl + scroll)" onClick={() => zoom(1 / 1.4)}><ZoomOut size={15} /></button>
        <button className="btn icon ghost" aria-label="Zoom in" title="Zoom in (=, or Ctrl + scroll)" onClick={() => zoom(1.4)}><ZoomIn size={15} /></button>
      </div>
      <div className="tl-body">
        <div className="tl-tools" role="toolbar" aria-label="Tools" aria-orientation="vertical">
          <button className={`btn icon ghost ${tool === "select" ? "on" : ""}`} aria-pressed={tool === "select"} aria-label="Selection tool" title="Selection tool (V): select, move and trim clips" onClick={() => setTool("select")}><MousePointer2 size={16} /></button>
          <button className={`btn icon ghost ${tool === "trim" ? "on" : ""}`} aria-pressed={tool === "trim"} aria-label="Trim tool" title="Trim tool (T): on a cut = Roll, on a clip edge = Ripple, top half of a clip = Slip, bottom half = Slide" onClick={() => setTool("trim")} disabled={readOnly}><UnfoldHorizontal size={16} /></button>
          <button className={`btn icon ghost ${tool === "razor" ? "on" : ""}`} aria-pressed={tool === "razor"} aria-label="Razor tool" title="Razor tool (C): click a clip to cut it there" onClick={() => setTool("razor")} disabled={readOnly}><Scissors size={16} /></button>
          <button className={`btn icon ghost ${tool === "hand" ? "on" : ""}`} aria-pressed={tool === "hand"} aria-label="Hand tool" title="Hand tool (H): drag to scroll the timeline" onClick={() => setTool("hand")}><Hand size={16} /></button>
          <span className="pr-tsep" />
          <button className="btn icon ghost" aria-label="Split at playhead" title="Split every clip under the playhead (S)" onClick={() => edit(splitAllAt(tl, playhead))} disabled={readOnly}><SquareSplitHorizontal size={16} /></button>
          <button className="btn icon ghost" aria-label="Delete clip" title="Delete the selected clip (Del)" onClick={() => { if (selected && edit(deleteClip(tl, selected))) setSelected(null); }} disabled={!selected || readOnly}><Trash2 size={16} /></button>
          <button className="btn icon ghost" aria-label="Ripple delete" title="Ripple delete: remove and close the gap (Shift+Del)" onClick={() => { if (selected && edit(deleteClip(tl, selected, true))) setSelected(null); }} disabled={!selected || readOnly}><ArrowLeftToLine size={16} /></button>
        </div>
        <div className="pr-mid">
          <div className={`tl-scroll tool-${tool}`} ref={scroller}
            onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); } }}
            onPointerMove={(e) => {
              if (tool === "trim" && !drag.current) {
                const el = (e.target as HTMLElement).closest(".clip") as HTMLElement | null;
                const c = el && view.tracks.flatMap((t) => t.clips).find((x) => el.closest("[data-track]") && x.id === el.dataset.clip);
                setTrimHint(c && el ? { label: TRIM_LABEL[trimZone(view, c, el, e.clientX, e.clientY).kind], x: e.clientX, y: e.clientY } : null);
                return;
              }
              if (tool !== "razor") return; const r = scroller.current!.getBoundingClientRect(); const x = e.clientX - r.left + scroller.current!.scrollLeft - HEAD_W; setRazorX(x >= 0 ? x : null); }}
            onPointerLeave={() => { setRazorX(null); if (!drag.current) setTrimHint(null); }}>
            <div className="tl-content" style={{ width: contentW + HEAD_W }}>
              <div className="tl-row tl-ruler-row">
                <div className="tl-head tl-corner">
                  <span className="pr-tc mono" title="Playhead position">{framesToTimecode(playhead, fps)}</span>
                  <span className="pr-hicons">
                    <button className={`pr-hbtn ${snapOn ? "on" : ""}`} aria-pressed={snapOn} aria-label="Snapping" title="Snap in timeline (N)" onClick={() => setSnapOn((x) => !x)}><Magnet size={14} /></button>
                    {(view.markers?.length ?? 0) > 0 && <button className="pr-hbtn" aria-label="Export markers" title="Export the marker list (CSV for spreadsheets, or print / save as PDF)" onClick={() => exportMarkers(view)}><FileDown size={13} /></button>}
                    <button className="pr-hbtn" aria-label="Add marker" title="Add a marker at the playhead (M). Shift+↑/↓ jumps between markers" onClick={marker} disabled={readOnly}><Flag size={13} /></button>
                    <button className="pr-hbtn" aria-label="Zoom to fit" title="Zoom to fit the whole sequence (\\)" onClick={fit}><Maximize2 size={13} /></button>
                  </span>
                </div>
                <div className="tl-ruler" onPointerDown={(e) => down(e, "scrub")} onPointerMove={move} onPointerUp={up}
                  style={{ width: contentW, ["--minor" as string]: `${(ticks.stepS * pps) / 5}px`, ["--major" as string]: `${ticks.stepS * pps}px` }}>
                  {ticks.out.map((s) => (
                    <div key={s} className="tick" style={{ left: s * pps }}><span>{framesToTimecode(s * fps, fps)}</span></div>
                  ))}
                  {(view.markers ?? []).map((m) => (
                    <button key={m.id} className="pr-marker" style={{ left: m.frame * ppf, ["--mc" as string]: MARKER_HEX[m.color] }} aria-label={`${m.name} at ${framesToTimecode(m.frame, fps)}`}
                      title={`${m.name} · ${framesToTimecode(m.frame, fps)} — click to jump, double-click to remove`}
                      onPointerDown={(e) => e.stopPropagation()} onClick={() => setPlayhead(m.frame)} onDoubleClick={() => { if (!readOnly) edit(removeMarker(tl, m.id)); }} />
                  ))}
                  {total > 0 && <div className="pr-seqbar" style={{ width: total * ppf }} title="Sequence length" />}
                </div>
              </div>
              {view.tracks.map((t) => (
                <TrackRow key={t.id} badge={badgeOf(t)} t={t} tl={tl} view={view} ppf={ppf} contentW={contentW} assets={assets} selected={selected} readOnly={readOnly}
                  divider={t.id === firstAudio} edit={edit} down={down} move={move} up={up}
                  onLaneDown={(e) => {
                    if (tool === "hand") { startPan(e); return; }
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setSelected(null); setPlayhead(xToFrame(e.clientX, r.left));
                  }}
                  onDrop={(id, x, rectLeft) => onDropAsset(id, t.id, xToFrame(x, rectLeft))} />
              ))}
              <div className="playhead" style={{ left: HEAD_W + playhead * ppf }} aria-hidden><i /></div>
              {(view.markers ?? []).map((m) => <div key={m.id} className="pr-mline" style={{ left: HEAD_W + m.frame * ppf, ["--mc" as string]: MARKER_HEX[m.color] }} aria-hidden />)}
              {tool === "razor" && razorX !== null && <div className="pr-razor" style={{ left: HEAD_W + razorX }} aria-hidden />}
            </div>
          </div>
          <ZoomBar contentW={contentW} left={view2.left} width={view2.width} pps={pps}
            onScroll={(x) => { if (scroller.current) scroller.current.scrollLeft = x; }}
            onZoom={(np, leftPx) => { const p = clampPps(np); setPps(p); requestAnimationFrame(() => { if (scroller.current) scroller.current.scrollLeft = leftPx * (p / pps); }); }} />
        </div>
        <AudioMeters tl={view} assets={assets} playhead={playhead} />
        {trimHint && <div className="pr-trimhint" style={{ left: trimHint.x + 14, top: trimHint.y + 16 }} aria-live="polite">{trimHint.label}</div>}
      </div>
    </section>
  );
}

/** Premiere's zoom scroll bar: drag the middle to scroll, drag either round handle to zoom. */
function ZoomBar({ contentW, left, width, pps, onScroll, onZoom }: {
  contentW: number; left: number; width: number; pps: number; onScroll: (x: number) => void; onZoom: (pps: number, leftPx: number) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const d = useRef<{ kind: "mid" | "l" | "r"; x0: number; a: number; b: number } | null>(null);
  const a = Math.min(1, left / contentW), b = Math.min(1, (left + width) / contentW);
  const startDrag = (kind: "mid" | "l" | "r") => (e: RPE) => {
    e.stopPropagation();
    d.current = { kind, x0: e.clientX, a, b };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPE) => {
    const s = d.current, el = bar.current;
    if (!s || !el) return;
    const W = el.clientWidth, dx = (e.clientX - s.x0) / W;
    if (s.kind === "mid") { onScroll(Math.max(0, (s.a + dx) * contentW)); return; }
    let na = s.a, nb = s.b;
    if (s.kind === "l") na = Math.min(s.b - 0.01, Math.max(0, s.a + dx)); else nb = Math.max(s.a + 0.01, Math.min(1, s.b + dx));
    // the visible width stays `width` px, so the new pixels-per-second follow from the new fraction of the content it covers
    const contentSeconds = contentW / pps;
    const np = width / ((nb - na) * contentSeconds);
    onZoom(np, na * contentW);
  };
  return (
    <div className="pr-zbar" ref={bar} onPointerMove={onMove} onPointerUp={() => (d.current = null)}
      onPointerDown={(e) => { const el = bar.current!; const f = (e.clientX - el.getBoundingClientRect().left) / el.clientWidth; onScroll(Math.max(0, (f - (b - a) / 2) * contentW)); }}>
      <div className="pr-zthumb" style={{ left: `${a * 100}%`, width: `${Math.max(2, (b - a) * 100)}%` }} onPointerDown={startDrag("mid")} role="scrollbar" aria-label="Timeline scroll and zoom" aria-valuenow={Math.round(a * 100)}>
        <span className="pr-zh l" onPointerDown={startDrag("l")} aria-hidden />
        <span className="pr-zh r" onPointerDown={startDrag("r")} aria-hidden />
      </div>
    </div>
  );
}

type Peaks = { peaks_per_second: number; peaks: number[] };
const waveCache = new Map<string, Promise<Peaks>>();
const loadPeaks = (assetId: string, url: string) => {
  if (!waveCache.has(assetId)) waveCache.set(assetId, fetch(url).then((r) => { if (!r.ok) throw new Error(); return r.json(); }).catch((e) => { waveCache.delete(assetId); throw e; }));
  return waveCache.get(assetId)!;
};

/** Level meters like Premiere's Audio Meters panel. The level is read from each audible clip's real waveform at the playhead
 *  (times clip volume), so it moves with playback and scrubbing. Mono sources show the same level on both sides. */
function AudioMeters({ tl, assets, playhead }: { tl: Timeline; assets: Map<string | null, Asset>; playhead: number }) {
  const [peaks, setPeaks] = useState<Map<string, Peaks>>(new Map());
  const hold = useRef({ db: -60, t: 0 });
  const audible = tl.tracks.filter((t) => !t.muted).flatMap((t) => t.clips.map((c) => ({ c, a: assets.get(c.asset_id) })))
    .filter(({ c, a }) => a?.waveform_url && playhead >= c.start && playhead < end(c));
  const key = audible.map(({ a }) => a!.id).join(",");
  useEffect(() => {
    for (const { a } of audible) if (!peaks.has(a!.id)) loadPeaks(a!.id, a!.waveform_url!).then((p) => setPeaks((m) => new Map(m).set(a!.id, p))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  let amp = 0;
  for (const { c, a } of audible) {
    const p = peaks.get(a!.id);
    if (!p) continue;
    const src = (c.in + (playhead - c.start) * (c.speed ?? 1)) / tl.fps;
    const i = Math.floor(src * p.peaks_per_second);
    let m = 0;
    for (let k = Math.max(0, i - 2); k <= i + 2 && k < p.peaks.length; k++) m = Math.max(m, p.peaks[k]);
    amp += (m * c.volume) ** 2;
  }
  const db = amp > 0 ? Math.max(-60, 10 * Math.log10(amp)) : -60;
  const now = performance.now();
  if (db >= hold.current.db || now - hold.current.t > 1500) hold.current = { db, t: now };
  const pct = (v: number) => `${((v + 60) / 60) * 100}%`;
  const scale = [0, -6, -12, -18, -24, -30, -36, -42, -48, -54];
  return (
    <div className="pr-meters" role="meter" aria-label="Audio level at the playhead" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.round(db)}
      title={db <= -60 ? "Silence at the playhead" : `${db.toFixed(1)} dB at the playhead`}>
      <div className="pr-mscale" aria-hidden>{scale.map((v) => <span key={v} style={{ bottom: pct(v) }}>{v === 0 ? "0" : v}</span>)}<span style={{ bottom: 0 }}>dB</span></div>
      {[0, 1].map((ch) => (
        <div key={ch} className="pr-mbar" aria-hidden>
          <i className="pr-mcover" style={{ height: `calc(100% - ${pct(db)})` }} />
          {hold.current.db > -60 && <i className="pr-mhold" style={{ bottom: pct(hold.current.db) }} />}
          <b className={`pr-mclip ${db > -0.5 ? "hot" : ""}`} />
        </div>
      ))}
    </div>
  );
}

function TrackRow({ badge, t, tl, view, ppf, contentW, assets, selected, readOnly, divider, edit, down, move, up, onLaneDown, onDrop }: {
  badge: string; t: Track; tl: Timeline; view: Timeline; ppf: number; contentW: number; assets: Map<string | null, Asset>; selected: string | null; readOnly: boolean; divider: boolean;
  edit: (t: Timeline | null) => boolean; down: (e: RPE, m: Drag["mode"], c?: Clip) => void; move: (e: RPE) => void; up: () => void;
  onLaneDown: (e: RPE) => void; onDrop: (assetId: string, clientX: number, laneLeft: number) => void;
}) {
  const [over, setOver] = useState(false);
  const accepts = (types: readonly string[]) => types.includes("application/x-cu-asset") &&
    (t.kind === "audio" ? types.includes("application/x-cu-kind-audio") : !types.includes("application/x-cu-kind-audio"));
  const h = rowHeight(t, badge);
  return (
    <div className={`tl-row${badge === "V1" ? " tl-mainrow" : ""}${divider ? " pr-divider" : ""}`} style={{ height: h }}>
      <div className={`tl-head ${t.kind}`}>
        <button className={`pr-tb ${t.locked ? "on lock" : ""}`} aria-pressed={t.locked} aria-label={`${t.locked ? "Unlock" : "Lock"} ${t.name}`} title="Toggle track lock" disabled={readOnly}
          onClick={() => edit(updateTrack(tl, t.id, { locked: !t.locked }))}>{t.locked ? <Lock size={12} /> : <Unlock size={12} />}</button>
        <span className="tl-badge" title={`${t.kind === "video" ? "Video" : "Audio"} ${badge.slice(1)}`}>{badge}</span>
        <span className="tl-name ellipsis" title={t.name}>{h >= 44 ? t.name : ""}</span>
        {t.kind === "video" ? (
          <button className={`pr-tb ${t.hidden ? "on off" : ""}`} aria-pressed={t.hidden} aria-label={`${t.hidden ? "Show" : "Hide"} ${t.name}`} title="Toggle track output" disabled={readOnly}
            onClick={() => edit(updateTrack(tl, t.id, { hidden: !t.hidden }))}>{t.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
        ) : null}
        <button className={`pr-tb letter ${t.muted ? "on mute" : ""}`} aria-pressed={t.muted} aria-label={`${t.muted ? "Unmute" : "Mute"} ${t.name}`} title="Mute track" disabled={readOnly}
          onClick={() => edit(updateTrack(tl, t.id, { muted: !t.muted }))}>M</button>
      </div>
      <div className={`tl-lane ${t.kind} ${over ? "over" : ""} ${t.locked ? "locked" : ""}`} data-track={t.id} style={{ width: contentW }}
        onPointerDown={onLaneDown} onPointerMove={move} onPointerUp={up}
        onDragOver={(e) => { if (accepts(e.dataTransfer.types) && !t.locked && !readOnly) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { setOver(false); const id = e.dataTransfer.getData("application/x-cu-asset"); if (id) { e.preventDefault(); onDrop(id, e.clientX, e.currentTarget.getBoundingClientRect().left); } }}>
        {t.clips.map((c) => {
          const a = assets.get(c.asset_id);
          const w = Math.max(4, len(c) * ppf);
          const missing = !c.title && (!a || a.status !== "ready");
          const thumb = t.kind === "video" && a?.thumbnail_url ? a.thumbnail_url : a?.kind === "image" && a.proxy_url ? a.proxy_url : null;
          return (
            <div key={c.id} data-clip={c.id} className={`clip ${t.kind} ${c.title ? "title" : a?.kind ?? ""} ${selected === c.id ? "sel" : ""} ${missing ? "missing" : ""} ${t.hidden || t.muted ? "off" : ""}`}
              style={{ left: c.start * ppf, width: w }}
              onPointerDown={(e) => down(e, "move", c)} onPointerMove={move} onPointerUp={up} role="button" tabIndex={0}
              aria-label={`${c.title ? "Title: " + c.title.text : a?.filename ?? "Missing media"} clip, ${framesToTimecode(len(c), view.fps)}`}
              onKeyDown={(e) => e.key === "Enter" && down(e as any, "move", c)}>
              {!readOnly && !t.locked && <span className="edge l" onPointerDown={(e) => down(e, "trimL", c)} onPointerMove={move} onPointerUp={up} />}
              <span className="pr-cbar">
                {hasFx(c) && <b className="pr-fx" title="Effects applied">fx</b>}
                <span className="clip-label">{c.title ? c.title.text : missing ? "⚠ Missing media" : a!.filename}{(c.speed ?? 1) !== 1 ? ` [${Math.round((c.speed ?? 1) * 100)}%]` : ""}</span>
                {w > 96 && <span className="pr-cdur" title="Clip duration">{shortTc(len(c), view.fps)}</span>}
              </span>
              {thumb && h >= 44 && <span className="pr-thumbs" style={{ backgroundImage: `url(${thumb})` }} aria-hidden />}
              {a?.waveform_url && t.kind === "audio" && <Wave url={a.waveform_url} assetId={a.id} inS={c.in / view.fps} outS={c.out / view.fps} width={w} />}
              {(c.fade_in > 0 || c.fade_out > 0) && <>
                {c.fade_in > 0 && <span className="fade in" style={{ width: c.fade_in * ppf }} />}
                {c.fade_out > 0 && <span className="fade out" style={{ width: c.fade_out * ppf }} />}
              </>}
              {keyTimes(c).map((kt) => <span key={kt} className="kf-mark" style={{ left: kt * ppf }} aria-hidden="true" />)}
              {c.transition_in && t.clips.some((x) => x.id !== c.id && x.start + len(x) === c.start) && <span className="tr-mark" title={`Transition: ${c.transition_in.type}`} aria-hidden="true" />}
              {!readOnly && !t.locked && <span className="edge r" onPointerDown={(e) => down(e, "trimR", c)} onPointerMove={move} onPointerUp={up} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Rectified waveform (drawn up from the bottom), Premiere's default look for audio clips. */
function Wave({ url, assetId, inS, outS, width }: { url: string; assetId: string; inS: number; outS: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    loadPeaks(assetId, url).then((w) => {
      const cv = ref.current;
      if (!live || !cv) return;
      const W = Math.min(4000, Math.ceil(width)), H = cv.clientHeight || 30;
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d")!;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "rgba(214, 255, 226, .78)";
      const a = inS * w.peaks_per_second, b = outS * w.peaks_per_second;
      for (let x = 0; x < W; x++) {
        const i0 = Math.floor(a + ((b - a) * x) / W), i1 = Math.max(i0 + 1, Math.floor(a + ((b - a) * (x + 1)) / W));
        let m = 0;
        for (let i = i0; i < i1 && i < w.peaks.length; i++) m = Math.max(m, w.peaks[i]);
        const h = Math.max(1, Math.sqrt(m) * H);
        ctx.fillRect(x, H - h, 1, h);
      }
    }).catch(() => {});
    return () => { live = false; };
  }, [url, assetId, inS, outS, width]);
  return <canvas ref={ref} className="wave" aria-hidden />;
}
