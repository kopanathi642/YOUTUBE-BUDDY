// Transitions — same rules as backend/app/timeline.py (transition_links + xfade): centred on the cut, capped by both
// clips' lengths; a clip that runs out holds its first/last frame. Progress is linear, measured against FFmpeg xfade.
import type { CSSProperties } from "react";
import { Clip, Track, end, len } from "./timeline";

export type TransitionType = "fade" | "fadeblack" | "fadewhite" | "wipeleft" | "wiperight" | "wipeup" | "wipedown"
  | "slideleft" | "slideright" | "slideup" | "slidedown" | "circleopen";
export type Transition = { type: TransitionType; frames: number };

export const TRANSITION_LIST: { type: TransitionType; label: string; group: string }[] = [
  { type: "fade", label: "Cross dissolve", group: "Dissolve" }, { type: "fadeblack", label: "Dip to black", group: "Dissolve" },
  { type: "fadewhite", label: "Dip to white", group: "Dissolve" },
  { type: "wipeleft", label: "Wipe left", group: "Wipe" }, { type: "wiperight", label: "Wipe right", group: "Wipe" },
  { type: "wipeup", label: "Wipe up", group: "Wipe" }, { type: "wipedown", label: "Wipe down", group: "Wipe" },
  { type: "slideleft", label: "Slide left", group: "Slide" }, { type: "slideright", label: "Slide right", group: "Slide" },
  { type: "slideup", label: "Slide up", group: "Slide" }, { type: "slidedown", label: "Slide down", group: "Slide" },
  { type: "circleopen", label: "Iris open", group: "Shape" },
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
    case "circleopen": return role === "in" ? { ...st, container: { clipPath: `circle(${pct(p * Math.SQRT1_2 * 1.0)} at 50% 50%)` } } : st;
  }
  return st;
}
