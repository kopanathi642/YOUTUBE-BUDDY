import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ThumbsUp, ThumbsDown, MessageSquare, Share2, Repeat2, Music2, Search, MoreVertical, Lock } from "lucide-react";
import { Project } from "../api";
import { useAuth } from "../App";
import { Box, Layer, MediaLayer, TextLayer, placeMedia, wrapText } from "../compose";
import type { Ctx } from "./ShortsStudio";
import { measure } from "./ShortsStudio";

type R = { x: number; y: number; w: number; h: number };
const SNAP_PX = 7;

/** On-canvas footprint of a layer, normalized: the picture (contain keeps its own shape) or the text block. */
export function footprint(L: Layer, ctx: Ctx): Box | null {
  const { comp } = ctx, W = comp.width, H = comp.height;
  if (L.kind === "audio") return null;
  if (L.kind === "text") {
    const fs = Math.max(8, Math.min(400, Math.round(L.size * Math.min(W, H))));
    const text = wrapText(L.text || " ", fs, Math.max(fs, L.box.w * W - fs * 0.5), measure);
    const lines = text.split("\n");
    const tw = Math.max(...lines.map((l) => measure(l, fs))) + fs * 0.5;
    return { x: L.box.x, y: L.box.y, w: Math.min(tw, W * 1.5) / W, h: (lines.length * fs * 1.2 + fs * 0.5) / H };
  }
  const a = L.asset_id ? ctx.amap.get(L.asset_id) : undefined;
  if (!a?.width || !a?.height || L.fit === "cover") return L.box;
  const p = placeMedia(L, { width: a.width, height: a.height }, W, H);
  return { x: L.box.x, y: L.box.y, w: p.pw / W, h: p.ph / H };
}

export default function Canvas({ ctx, platform, project, children }: { ctx: Ctx; platform: boolean; project: Project; children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<R | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [safe, setSafe] = useState(true);
  const { me } = useAuth();
  const { comp } = ctx;

  const measureStage = useCallback(() => {
    const w = wrap.current, st = w?.querySelector(".stage") as HTMLElement | null;
    if (!w || !st) return;
    const a = st.getBoundingClientRect(), b = w.getBoundingClientRect();
    setRect((r) => (r && Math.abs(r.x - (a.left - b.left)) < 0.5 && Math.abs(r.y - (a.top - b.top)) < 0.5 && Math.abs(r.w - a.width) < 0.5 && Math.abs(r.h - a.height) < 0.5 ? r
      : { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height }));
  }, []);
  useLayoutEffect(() => {
    measureStage();
    const ro = new ResizeObserver(measureStage);
    if (wrap.current) ro.observe(wrap.current);
    const st = wrap.current?.querySelector(".stage");
    if (st) ro.observe(st);
    const t = setInterval(measureStage, 500);   // the stage resizes itself after layout changes
    return () => { ro.disconnect(); clearInterval(t); };
  }, [measureStage, comp.width, comp.height]);

  const visible = comp.layers.filter((l) => l.kind !== "audio" && !l.hidden && ctx.playhead >= l.start && ctx.playhead < l.start + (l.length ?? comp.duration - l.start));

  function startDrag(e: React.PointerEvent, L: Layer, mode: "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w") {
    e.stopPropagation(); e.preventDefault();
    ctx.select(L.id);
    if (L.locked || L.kind === "audio" || !rect) return;
    const fp = footprint(L, ctx)!;
    const b0 = { ...L.box }, x0 = e.clientX, y0 = e.clientY;
    const size0 = L.kind === "text" ? L.size : 0;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const others = visible.filter((o) => o.id !== L.id).map((o) => footprint(o, ctx)).filter(Boolean) as Box[];
    const mv = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / rect.w, dy = (ev.clientY - y0) / rect.h;
      let box: Box = { ...b0 };
      let size = size0;
      const gv: number[] = [], gh: number[] = [];
      if (mode === "move") {
        let nx = b0.x + dx, ny = b0.y + dy;
        if (!ev.altKey) {   // snap centre and edges to the canvas, the safe area and other layers
          const hw = fp.w / 2, hh = fp.h / 2;
          const xs = [0.5, 0, 1, 0.06, 0.94, ...others.flatMap((o) => [o.x, o.x - o.w / 2, o.x + o.w / 2])];
          const ys = [0.5, 0, 1, 0.08, 0.86, ...others.flatMap((o) => [o.y, o.y - o.h / 2, o.y + o.h / 2])];
          const snap = (v: number, half: number, cands: number[], px: number, out: number[]) => {
            let best = v, bd = SNAP_PX / px;
            for (const c of cands) for (const off of [0, -half, half]) { const d = Math.abs(v + off - c); if (d < bd) { bd = d; best = c - off; } }
            if (best !== v) out.push(cands.find((c) => [0, -half, half].some((off) => Math.abs(best + off - c) < 1e-6)) ?? best);
            return best;
          };
          nx = snap(nx, hw, xs, rect.w, gv); ny = snap(ny, hh, ys, rect.h, gh);
        }
        box = { ...b0, x: nx, y: ny };
      } else {
        const sx = mode.includes("e") ? 1 : mode.includes("w") ? -1 : 0, sy = mode.includes("s") ? 1 : mode.includes("n") ? -1 : 0;
        if (mode.length === 2) {   // corners: keep the shape, scale around the centre
          const k = Math.max(0.05, 1 + Math.max((2 * dx * sx) / Math.max(0.02, fp.w), (2 * dy * sy) / Math.max(0.02, fp.h)));
          box = { ...b0, w: Math.max(0.02, b0.w * k), h: Math.max(0.02, b0.h * k) };
          if (L.kind === "text") size = Math.max(0.008, Math.min(0.37, size0 * k));
        } else {                   // edges: change the frame (media is re-cropped, never stretched)
          box = { ...b0, w: sx ? Math.max(0.02, b0.w + 2 * dx * sx) : b0.w, h: sy ? Math.max(0.02, b0.h + 2 * dy * sy) : b0.h };
        }
      }
      setGuides({ v: gv, h: gh });
      const next = comp.layers.map((l) => (l.id === L.id ? ({ ...l, box, pinned: true, ...(L.kind === "text" ? { size } : {}) } as Layer) : l));
      ctx.edit({ ...comp, layers: next }, `drag:${L.id}:${mode}`);
    };
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); setGuides({ v: [], h: [] }); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  }

  useEffect(() => { if (ctx.selected && !comp.layers.some((l) => l.id === ctx.selected)) ctx.select(null); }, [comp.layers, ctx]);
  const handle = "nw ne sw se n s e w".split(" ") as ("nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w")[];
  const name = (me as any)?.display_name ?? project.name;

  return (
    <div className="sts-canvas" ref={wrap}>
      {children}
      {rect && <div className="sts-overlay" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} onPointerDown={() => ctx.select(null)}>
        {safe && !platform && <><div className="sts-safe" title="Title-safe area" /></>}
        {visible.map((L) => {
          const fp = footprint(L, ctx);
          if (!fp) return null;
          const sel = L.id === ctx.selected;
          return <div key={L.id} className={`sts-hit ${sel ? "sel" : ""} ${L.locked ? "locked" : ""}`} data-layer={L.id} aria-label={`${L.name} on canvas`}
            style={{ left: (fp.x - fp.w / 2) * rect.w, top: (fp.y - fp.h / 2) * rect.h, width: fp.w * rect.w, height: fp.h * rect.h,
              transform: L.rotation ? `rotate(${L.rotation}deg)` : undefined, zIndex: comp.layers.indexOf(L) + 1 }}
            onPointerDown={(e) => startDrag(e, L, "move")}>
            {sel && <span className="sts-tag">{L.locked && <Lock size={10} />}{L.name}</span>}
            {sel && !L.locked && handle.filter((h) => L.kind !== "text" || h.length === 2).map((h) => <i key={h} className={`sts-h-${h}`} onPointerDown={(e) => startDrag(e, L, h)} />)}
          </div>;
        })}
        {guides.v.map((g, i) => <div key={`v${i}`} className="sts-guide v" style={{ left: g * rect.w }} />)}
        {guides.h.map((g, i) => <div key={`h${i}`} className="sts-guide h" style={{ top: g * rect.h }} />)}
        {platform && <PlatformUI name={name} title={(comp.layers.find((l) => l.kind === "text" && l.role === "header") as TextLayer | undefined)?.text ?? project.name} />}
      </div>}
      <button className={`pill sts-safebtn ${safe ? "on" : ""}`} aria-pressed={safe} onClick={() => setSafe(!safe)}>Guides</button>
    </div>
  );
}

/** Preview only: how the platform's own buttons sit on top of the video. Never part of the export. */
function PlatformUI({ name, title }: { name: string; title: string }) {
  const h = "@" + name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 18);
  return <div className="sts-pf" aria-label="Shorts player preview (not exported)">
    <div className="sts-pf-top"><b>Shorts</b><span><Search size={16} /><MoreVertical size={16} /></span></div>
    <div className="sts-pf-side">{[[ThumbsUp, "Like"], [ThumbsDown, "Dislike"], [MessageSquare, "Comments"], [Share2, "Share"], [Repeat2, "Remix"]].map(([I, l]: any) =>
      <span key={l}><I size={20} /><small>{l}</small></span>)}</div>
    <div className="sts-pf-bottom">
      <div className="sts-pf-ch"><i>{name.slice(0, 1).toUpperCase()}</i><b>{h}</b><em>Subscribe</em></div>
      <div className="sts-pf-desc">{title.slice(0, 80)}</div>
      <div className="sts-pf-music"><Music2 size={12} />Original sound · {name}</div>
    </div>
    <span className="sts-pf-note">Preview only — not in the export</span>
  </div>;
}

export type { MediaLayer };
