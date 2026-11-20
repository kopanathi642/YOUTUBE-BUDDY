// Transitions — same rules as backend/app/timeline.py (transition_links + xfade): centred on the cut, capped by both
// clips' lengths; a clip that runs out holds its first/last frame. Progress is linear, measured against FFmpeg xfade.
import type { CSSProperties } from "react";
import { Clip, Track, end, len } from "./timeline";

export type TransitionType = "fade" | "fadeblack" | "fadewhite" | "wipeleft" | "wiperight" | "wipeup" | "wipedown"
  | "slideleft" | "slideright" | "slideup" | "slidedown" | "circleopen"
  | "radial" | "smoothleft" | "smoothright" | "smoothup" | "smoothdown" | "horzopen" | "horzclose" | "vertopen" | "vertclose" | "circleclose" | "coverleft" | "coverright" | "coverup" | "coverdown" | "revealleft" | "revealright" | "revealup" | "revealdown" | "wipetl" | "wipetr" | "wipebl" | "wipebr";
export type Transition = { type: TransitionType; frames: number };

export const TRANSITION_LIST: { type: TransitionType; label: string; group: string }[] = [
  { type: "fade", label: "Cross dissolve", group: "Dissolve" }, { type: "fadeblack", label: "Dip to black", group: "Dissolve" },
  { type: "fadewhite", label: "Dip to white", group: "Dissolve" },
  { type: "wipeleft", label: "Wipe left", group: "Wipe" }, { type: "wiperight", label: "Wipe right", group: "Wipe" },
  { type: "wipeup", label: "Wipe up", group: "Wipe" }, { type: "wipedown", label: "Wipe down", group: "Wipe" },
  { type: "slideleft", label: "Slide left", group: "Slide" }, { type: "slideright", label: "Slide right", group: "Slide" },
  { type: "slideup", label: "Slide up", group: "Slide" }, { type: "slidedown", label: "Slide down", group: "Slide" },
  { type: "circleopen", label: "Iris open (circle)", group: "Iris" }, { type: "circleclose", label: "Iris close (circle)", group: "Iris" },
  { type: "smoothleft", label: "Smooth wipe left", group: "Wipe" }, { type: "smoothright", label: "Smooth wipe right", group: "Wipe" },
  { type: "smoothup", label: "Smooth wipe up", group: "Wipe" }, { type: "smoothdown", label: "Smooth wipe down", group: "Wipe" },
  { type: "radial", label: "Clock wipe", group: "Wipe" }, { type: "wipetl", label: "Corner wipe ↖", group: "Wipe" }, { type: "wipetr", label: "Corner wipe ↗", group: "Wipe" },
  { type: "wipebl", label: "Corner wipe ↙", group: "Wipe" }, { type: "wipebr", label: "Corner wipe ↘", group: "Wipe" },
  { type: "horzopen", label: "Barn door open (horizontal)", group: "Barn door" }, { type: "horzclose", label: "Barn door close (horizontal)", group: "Barn door" },
  { type: "vertopen", label: "Barn door open (vertical)", group: "Barn door" }, { type: "vertclose", label: "Barn door close (vertical)", group: "Barn door" },
  { type: "coverleft", label: "Cover left", group: "Push & cover" }, { type: "coverright", label: "Cover right", group: "Push & cover" },
  { type: "coverup", label: "Cover up", group: "Push & cover" }, { type: "coverdown", label: "Cover down", group: "Push & cover" },
  { type: "revealleft", label: "Reveal left", group: "Push & cover" }, { type: "revealright", label: "Reveal right", group: "Push & cover" },
  { type: "revealup", label: "Reveal up", group: "Push & cover" }, { type: "revealdown", label: "Reveal down", group: "Push & cover" },
];

/** {incoming clip id: [frames before cut, frames after]} for clips sorted by start. */
export function transitionLinks(clips: Clip[]): Map<string, [number, number]> {
  const s = [...clips].sort((a, b) => a.start - b.start), out = new Map<string, [number, number]>();
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1], b = s[i], t = b.transition_in;
    if (!t || end(a) !== b.start) continue;
    const d = Math.min(t.frames, len(a), len(b));
    if (d >= 2) out.set(b.id, [Math.floor(d / 2), d - Math.floor(d / 2)]);
  }
  return out;
}

export const previousTouching = (track: Track, c: Clip) => track.clips.find((x) => x.id !== c.id && end(x) === c.start);
export const nextTouching = (track: Track, c: Clip) => track.clips.find((x) => x.id !== c.id && x.start === end(c));

export type TState = { visible: boolean; holdLocal: number | null; container?: CSSProperties; opacity: number; dip?: { color: string; alpha: number } };

/** How a clip shows at `playhead`, including its transitions in and out. holdLocal = clip frame to freeze on. */
export function transitionState(track: Track, c: Clip, playhead: number, links = transitionLinks(track.clips)): TState {
  const L = len(c), s = c.start, e = end(c);
  const tin = links.get(c.id), nxt = nextTouching(track, c), tout = nxt ? links.get(nxt.id) : undefined;
  const before = tin ? tin[0] : 0, after = tout ? tout[1] : 0;
  if (playhead < s - before || playhead >= e + after) return { visible: false, holdLocal: null, opacity: 0 };
  const local = playhead - s;
  const holdLocal = local < 0 ? 0 : local >= L ? L - 1 : null;
  let st: TState = { visible: true, holdLocal, opacity: 1 };
  if (tin && playhead < s + tin[1]) st = apply(st, c.transition_in!.type, (playhead - (s - tin[0])) / (tin[0] + tin[1]), "in");
  if (tout && nxt && playhead >= e - tout[0]) st = apply(st, nxt.transition_in!.type, (playhead - (e - tout[0])) / (tout[0] + tout[1]), "out");
  return st;
}

/** smoothstep, as in FFmpeg xfade */
const S = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));
const N = 48;
/** Mask image for the incoming clip: alpha(t) sampled along a gradient (t = 0…1). */
const mask = (grad: string, alpha: (t: number) => number): CSSProperties => {
  const stops = Array.from({ length: N + 1 }, (_, i) => { const t = i / N; return `rgba(0,0,0,${alpha(t).toFixed(4)}) ${(t * 100).toFixed(2)}%`; }).join(", ");
  const img = `${grad}, ${stops})`;
  return { WebkitMaskImage: img, maskImage: img };
};
const lin = (dir: string, a: (t: number) => number) => mask(`linear-gradient(${dir}`, a);
/** circle reaching the corners = FFmpeg's normalisation by the half diagonal */
const rad = (a: (r: number) => number) => mask("radial-gradient(circle farthest-corner at 50% 50%", a);

function apply(st: TState, type: TransitionType, p: number, role: "in" | "out"): TState {
  p = Math.min(1, Math.max(0, p));
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
  switch (type) {
    case "fade": return role === "in" ? { ...st, opacity: st.opacity * p } : st;   // incoming blends over the outgoing
    case "fadeblack": case "fadewhite": {
      const color = type === "fadeblack" ? "#000" : "#fff";
      return role === "in" ? { ...st, opacity: st.opacity * (p < 0.5 ? 0 : 1), dip: { color, alpha: p < 0.5 ? 2 * p : 2 - 2 * p } }
        : { ...st, opacity: p < 0.5 ? st.opacity : 0 };
    }
    case "wipeleft": return role === "in" ? { ...st, container: { clipPath: `inset(0 0 0 ${pct(1 - p)})` } } : st;
    case "wiperight": return role === "in" ? { ...st, container: { clipPath: `inset(0 ${pct(1 - p)} 0 0)` } } : st;
    case "wipeup": return role === "in" ? { ...st, container: { clipPath: `inset(${pct(1 - p)} 0 0 0)` } } : st;
    case "wipedown": return role === "in" ? { ...st, container: { clipPath: `inset(0 0 ${pct(1 - p)} 0)` } } : st;
    case "slideleft": return { ...st, container: { transform: `translateX(${pct(role === "in" ? 1 - p : -p)})` } };
    case "slideright": return { ...st, container: { transform: `translateX(${pct(role === "in" ? -(1 - p) : p)})` } };
    case "slideup": return { ...st, container: { transform: `translateY(${pct(role === "in" ? 1 - p : -p)})` } };
    case "slidedown": return { ...st, container: { transform: `translateY(${pct(role === "in" ? -(1 - p) : p)})` } };
    // soft-edged shapes: alpha formulas measured against FFmpeg xfade frames (≤ 2 % mean difference)
    case "circleopen": return role === "in" ? { ...st, container: rad((r) => 1 - S(r - Math.SQRT2 * (2 * p - 1))) } : st;
    case "circleclose": return role === "in" ? { ...st, container: rad((r) => S(r + Math.SQRT2 * (2 * p - 1))) } : st;
    case "smoothleft": return role === "in" ? { ...st, container: lin("to right", (u) => S(2 * p - 1 + u)) } : st;
    case "smoothright": return role === "in" ? { ...st, container: lin("to right", (u) => S(2 * p - u)) } : st;
    case "smoothup": return role === "in" ? { ...st, container: lin("to bottom", (v) => S(2 * p - 1 + v)) } : st;
    case "smoothdown": return role === "in" ? { ...st, container: lin("to bottom", (v) => S(2 * p - v)) } : st;
    case "horzopen": return role === "in" ? { ...st, container: lin("to bottom", (v) => S(2 * p - Math.abs(2 * v - 1))) } : st;
    case "horzclose": return role === "in" ? { ...st, container: lin("to bottom", (v) => S(Math.abs(2 * v - 1) - 1 + 2 * p)) } : st;
    case "vertopen": return role === "in" ? { ...st, container: lin("to right", (u) => S(2 * p - Math.abs(2 * u - 1))) } : st;
    case "vertclose": return role === "in" ? { ...st, container: lin("to right", (u) => S(Math.abs(2 * u - 1) - 1 + 2 * p)) } : st;
    // clock wipe: FFmpeg xfade radial, alpha = S(θ − (½ − p)·2.5π) with θ = atan2(x, y) from the centre; conic φ = π − θ
    case "radial": return role === "in" ? { ...st, container: mask("conic-gradient(from 0deg at 50% 50%", (t) => S(Math.PI - t * 2 * Math.PI - (0.5 - p) * 2.5 * Math.PI)) } : st;
    // hard-edged moves (exact)
    case "coverleft": return role === "in" ? { ...st, container: { transform: `translateX(${pct(1 - p)})` } } : st;
    case "coverright": return role === "in" ? { ...st, container: { transform: `translateX(${pct(-(1 - p))})` } } : st;
    case "coverup": return role === "in" ? { ...st, container: { transform: `translateY(${pct(1 - p)})` } } : st;
    case "coverdown": return role === "in" ? { ...st, container: { transform: `translateY(${pct(-(1 - p))})` } } : st;
    case "revealleft": return role === "in" ? { ...st, container: { clipPath: `inset(0 0 0 ${pct(1 - p)})` } } : { ...st, container: { transform: `translateX(${pct(-p)})` } };
    case "revealright": return role === "in" ? { ...st, container: { clipPath: `inset(0 ${pct(1 - p)} 0 0)` } } : { ...st, container: { transform: `translateX(${pct(p)})` } };
    case "revealup": return role === "in" ? { ...st, container: { clipPath: `inset(${pct(1 - p)} 0 0 0)` } } : { ...st, container: { transform: `translateY(${pct(-p)})` } };
    case "revealdown": return role === "in" ? { ...st, container: { clipPath: `inset(0 0 ${pct(1 - p)} 0)` } } : { ...st, container: { transform: `translateY(${pct(p)})` } };
    case "wipetl": { const q = pct(1 - p); return role === "in" ? { ...st, container: { clipPath: `polygon(${q} 0, 100% 0, 100% 100%, 0 100%, 0 ${q}, ${q} ${q})` } } : st; }
    case "wipetr": { const q = pct(p), r = pct(1 - p); return role === "in" ? { ...st, container: { clipPath: `polygon(0 0, ${q} 0, ${q} ${r}, 100% ${r}, 100% 100%, 0 100%)` } } : st; }
    case "wipebl": { const q = pct(1 - p), r = pct(p); return role === "in" ? { ...st, container: { clipPath: `polygon(0 0, 100% 0, 100% 100%, ${q} 100%, ${q} ${r}, 0 ${r})` } } : st; }
    case "wipebr": { const q = pct(p); return role === "in" ? { ...st, container: { clipPath: `polygon(0 0, 100% 0, 100% ${q}, ${q} ${q}, ${q} 100%, 0 100%)` } } : st; }
  }
  return st;
}
