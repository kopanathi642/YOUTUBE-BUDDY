import { useRef, useState } from "react";
import { Eye, EyeOff, Lock, Unlock, Copy, Trash2, ChevronUp, ChevronDown, Play, Pause, StepBack, StepForward, SkipBack, Type, Film, Music, Image as ImageIcon, Shapes, GripVertical } from "lucide-react";
import { Layer, lid } from "../compose";
import { framesToTimecode } from "../timeline";
import type { Ctx } from "./ShortsStudio";

/** Layer list (top layer first) with a timeline bar per layer: move, trim, reorder, hide, lock, duplicate, delete. */
export default function Layers({ ctx, total, playing, setPlaying }: { ctx: Ctx; total: number; playing: boolean; setPlaying: (p: boolean | ((p: boolean) => boolean)) => void }) {
  const { comp } = ctx;
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const top = [...comp.layers].reverse();
  const set = (id: string, patch: Partial<Layer>, key?: string) => ctx.edit({ ...comp, layers: comp.layers.map((l) => (l.id === id ? { ...l, ...patch } as Layer : l)) }, key);
  const move = (id: string, dir: 1 | -1) => {
    const i = comp.layers.findIndex((l) => l.id === id), j = i + dir;
    if (j < 0 || j >= comp.layers.length) return;
    const ls = [...comp.layers]; [ls[i], ls[j]] = [ls[j], ls[i]];
    ctx.edit({ ...comp, layers: ls });
  };
  const dropOn = (targetId: string) => {
    if (!drag || drag === targetId) return;
    const ls = comp.layers.filter((l) => l.id !== drag), moving = comp.layers.find((l) => l.id === drag)!;
    const at = ls.findIndex((l) => l.id === targetId);
    ls.splice(at + 1, 0, moving);
    ctx.edit({ ...comp, layers: ls }); setDrag(null);
  };
  const fpx = () => (track.current?.getBoundingClientRect().width ?? 1) / Math.max(1, total);
  function barDrag(e: React.PointerEvent, L: Layer, mode: "move" | "l" | "r") {
    e.stopPropagation(); e.preventDefault(); ctx.select(L.id);
    if (L.locked) return;
    const x0 = e.clientX, s0 = L.start, len0 = L.length ?? total - L.start, in0 = "in" in L ? (L as any).in as number : 0;
    const k = fpx();
    const mv = (ev: PointerEvent) => {
      const d = Math.round((ev.clientX - x0) / k);
      if (mode === "move") set(L.id, { start: Math.max(0, Math.min(total - 1, s0 + d)) }, `bar:${L.id}`);
      else if (mode === "r") set(L.id, { length: Math.max(1, Math.min(total - s0, len0 + d)) }, `bar:${L.id}`);
      else {
        const dd = Math.max(-s0, Math.min(len0 - 1, d));
        set(L.id, { start: s0 + dd, length: len0 - dd, ...("in" in L ? { in: Math.max(0, in0 + dd) } : {}) } as Partial<Layer>, `bar:${L.id}`);
      }
    };
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  }
  const seek = (e: React.PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    const f = (x: number) => ctx.setPlayhead(Math.round(Math.max(0, Math.min(1, (x - r.left) / r.width)) * (total - 1)));
    f(e.clientX);
    const mv = (ev: PointerEvent) => f(ev.clientX);
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  };
  const icon = (L: Layer) => L.kind === "text" ? <Type size={13} /> : L.kind === "audio" ? <Music size={13} /> : L.graphic ? <Shapes size={13} />
    : ctx.amap.get(L.asset_id ?? "")?.kind === "image" ? <ImageIcon size={13} /> : <Film size={13} />;
  const ph = Math.min(ctx.playhead, total);

  return <section className="sts-layers" aria-label="Layers and timeline">
    <div className="sts-lhead">
      <b>Layers</b><span className="dim sm">{comp.layers.length} · top layer first · drag ⋮⋮ to reorder</span>
      <div className="grow" />
      <button className="btn icon ghost sm" aria-label="Go to start" onClick={() => ctx.setPlayhead(0)}><SkipBack size={14} /></button>
      <button className="btn icon ghost sm" aria-label="Previous frame" onClick={() => ctx.setPlayhead(Math.max(0, ph - 1))}><StepBack size={14} /></button>
      <button className="btn icon sts-play" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
      <button className="btn icon ghost sm" aria-label="Next frame" onClick={() => ctx.setPlayhead(Math.min(total - 1, ph + 1))}><StepForward size={14} /></button>
      <span className="mono sm">{framesToTimecode(ph, comp.fps)} / {framesToTimecode(total, comp.fps)}</span>
    </div>
    <div className="sts-lgrid">
      <div className="sts-lnames" />
      <div className="sts-ruler" ref={track} onPointerDown={seek} role="slider" aria-label="Playhead" aria-valuemin={0} aria-valuemax={total} aria-valuenow={ph}>
        {Array.from({ length: Math.min(60, Math.ceil(total / comp.fps)) + 1 }, (_, s) => <span key={s} style={{ left: `${(s * comp.fps / total) * 100}%` }}>{s % Math.max(1, Math.ceil(total / comp.fps / 12)) === 0 ? `${s}s` : ""}</span>)}
        <i className="sts-ph-line" style={{ left: `${(ph / total) * 100}%` }} />
      </div>
      {top.map((L) => {
        const len = Math.max(1, Math.min(L.length ?? total - L.start, total - L.start));
        const sel = L.id === ctx.selected;
        return [
          <div key={`n${L.id}`} className={`sts-lname ${sel ? "sel" : ""} ${L.hidden ? "off" : ""}`} onClick={() => ctx.select(L.id)} draggable
            onDragStart={() => setDrag(L.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(L.id)} data-layer-row={L.name}>
            <GripVertical size={12} className="dim" />{icon(L)}<span className="grow" title={L.name}>{L.name}</span>
            <button className="btn icon ghost xs" aria-label={L.hidden ? `Show ${L.name}` : `Hide ${L.name}`} onClick={(e) => { e.stopPropagation(); set(L.id, { hidden: !L.hidden }); }}>{L.hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button>
            <button className="btn icon ghost xs" aria-label={L.locked ? `Unlock ${L.name}` : `Lock ${L.name}`} onClick={(e) => { e.stopPropagation(); set(L.id, { locked: !L.locked }); }}>{L.locked ? <Lock size={12} /> : <Unlock size={12} />}</button>
            <button className="btn icon ghost xs" aria-label={`Move ${L.name} up`} onClick={(e) => { e.stopPropagation(); move(L.id, 1); }}><ChevronUp size={12} /></button>
            <button className="btn icon ghost xs" aria-label={`Move ${L.name} down`} onClick={(e) => { e.stopPropagation(); move(L.id, -1); }}><ChevronDown size={12} /></button>
            <button className="btn icon ghost xs" aria-label={`Duplicate ${L.name}`} onClick={(e) => { e.stopPropagation(); const c = { ...L, id: lid(), name: `${L.name} copy`.slice(0, 60), role: "custom", ...(L.kind !== "audio" ? { box: { ...L.box, x: L.box.x + 0.03, y: L.box.y + 0.03 } } : {}) } as Layer;
              const i = comp.layers.findIndex((x) => x.id === L.id); const ls = [...comp.layers]; ls.splice(i + 1, 0, c); ctx.edit({ ...comp, layers: ls }); ctx.select(c.id); }}><Copy size={12} /></button>
            <button className="btn icon ghost xs" aria-label={`Delete ${L.name}`} onClick={(e) => { e.stopPropagation(); ctx.edit({ ...comp, layers: comp.layers.filter((x) => x.id !== L.id) }); }}><Trash2 size={12} /></button>
          </div>,
          <div key={`b${L.id}`} className="sts-lane" onPointerDown={seek}>
            <div className={`sts-bar k-${L.kind} ${sel ? "sel" : ""} ${L.hidden ? "off" : ""}`} style={{ left: `${(L.start / total) * 100}%`, width: `${(len / total) * 100}%` }}
              onPointerDown={(e) => barDrag(e, L, "move")} aria-label={`${L.name} timing`}>
              <i className="l" onPointerDown={(e) => barDrag(e, L, "l")} /><span>{L.name}</span><i className="r" onPointerDown={(e) => barDrag(e, L, "r")} />
              {L.kind !== "audio" && (L.kf?.x ?? []).map((k) => <em key={k.t} className="kf" style={{ left: `${(k.t / len) * 100}%` }} title={`Keyframe ${framesToTimecode(k.t, comp.fps)}`} />)}
            </div>
            <i className="sts-ph-line" style={{ left: `${(ph / total) * 100}%` }} />
          </div>,
        ];
      })}
    </div>
  </section>;
}
