// DaVinci Resolve-style edit operations (edit page): the seven ways to put a clip into the timeline, the four smart-trim
// modes (roll, ripple, slip, slide) and markers. Pure functions on the Timeline, same shape as timeline.ts, so the
// server's export reads the result as-is (nothing here changes render maths).
import { Timeline, Track, Clip, Marker, MarkerColor, end, len, sp, splitAt, findClip, fits, mapClip, uid, duration } from "./timeline";
import { shiftForTrimStart, clampToLength } from "./keyframes";

export type EditType = "insert" | "overwrite" | "replace" | "fit" | "top" | "append" | "rippleOverwrite";
export const EDIT_TYPES: { id: EditType; label: string; hint: string }[] = [
  { id: "insert", label: "Insert", hint: "Put the clip at the playhead and push everything after it later" },
  { id: "overwrite", label: "Overwrite", hint: "Put the clip at the playhead, covering what's there" },
  { id: "replace", label: "Replace", hint: "Swap the selected clip (or the clip under the playhead) for this one, same length" },
  { id: "fit", label: "Fit to Fill", hint: "Speed the clip up or down so it exactly fills the gap or clip under the playhead" },
  { id: "top", label: "Place on Top", hint: "Put the clip on the first free track above, at the playhead" },
  { id: "append", label: "Append at End", hint: "Add the clip after the end of the timeline" },
  { id: "rippleOverwrite", label: "Ripple Overwrite", hint: "Replace the clip under the playhead and move later clips to fit the new length" },
];

const trackOf = (tl: Timeline, id: string) => tl.tracks.find((t) => t.id === id);
const withTrack = (tl: Timeline, id: string, f: (t: Track) => Track): Timeline => ({ ...tl, tracks: tl.tracks.map((t) => (t.id === id ? f(t) : t)) });
const place = (tl: Timeline, trackId: string, c: Clip): Timeline => withTrack(tl, trackId, (t) => ({ ...t, clips: [...t.clips, c] }));
/** A fresh copy of the template clip at `start` (new id, so the same template can be used twice). */
const at = (c: Clip, start: number): Clip => ({ ...c, id: uid(c.title ? "t" : "c"), start });

/** Cut a hole [a, b) in one track: clips crossing an edge are split there, clips inside are removed. */
export function clearRange(tl: Timeline, trackId: string, a: number, b: number): Timeline | null {
  const t0 = trackOf(tl, trackId);
  if (!t0 || t0.locked || b <= a) return t0 && !t0.locked ? tl : null;
  let out = tl;
  for (const edge of [a, b]) for (const c of trackOf(out, trackId)!.clips) {
    if (c.start < edge && end(c) > edge) { const r = splitAt(out, c.id, edge); if (r) out = r.tl; }
  }
  return withTrack(out, trackId, (t) => ({ ...t, clips: t.clips.filter((c) => !(c.start >= a && end(c) <= b)) }));
}

/** Move every clip that starts at or after `from` by `by` frames, on the given tracks (unlocked ones only). */
function shiftAfter(tl: Timeline, from: number, by: number, trackIds: string[]): Timeline {
  return { ...tl, tracks: tl.tracks.map((t) => (!trackIds.includes(t.id) || t.locked ? t : { ...t, clips: t.clips.map((c) => (c.start >= from ? { ...c, start: c.start + by } : c)) })) };
}

export function overwrite(tl: Timeline, trackId: string, clip: Clip, start: number): { tl: Timeline; id: string } | null {
  const cleared = clearRange(tl, trackId, start, start + len(clip));
  if (!cleared) return null;
  const c = at(clip, start);
  return { tl: place(cleared, trackId, c), id: c.id };
}

/** Insert pushes later material on every unlocked track, so picture and sound stay in sync (clips under the playhead are split). */
export function insert(tl: Timeline, trackId: string, clip: Clip, start: number): { tl: Timeline; id: string } | null {
  const target = trackOf(tl, trackId);
  if (!target || target.locked) return null;
  let out = tl;
  const ids = tl.tracks.filter((t) => !t.locked).map((t) => t.id);
  for (const id of ids) for (const c of trackOf(out, id)!.clips) if (c.start < start && end(c) > start) { const r = splitAt(out, c.id, start); if (r) out = r.tl; }
  out = shiftAfter(out, start, len(clip), ids);
  const c = at(clip, start);
  return { tl: place(out, trackId, c), id: c.id };
}

/** Swap a clip for another, keeping its place and length (shorter sources leave a gap at the end). */
export function replace(tl: Timeline, targetId: string, clip: Clip): { tl: Timeline; id: string } | null {
  const f = findClip(tl, targetId);
  if (!f || f.track.locked) return null;
  const L = len(f.clip);
  const out = Math.min(clip.out, clip.in + Math.round(L * sp(clip)));
  if (out <= clip.in) return null;
  const c: Clip = { ...at(clip, f.clip.start), out, fade_in: 0, fade_out: 0, keyframes: clampToLength({ ...clip, out }, Math.round((out - clip.in) / sp(clip))) };
  return { tl: mapClip(tl, targetId, () => c), id: c.id };
}

/** Change the clip's speed so its whole source span fills [a, b). Speeds are limited to 0.25×–4× like the inspector. */
export function fitToFill(tl: Timeline, trackId: string, clip: Clip, a: number, b: number): { tl: Timeline; id: string; speed: number } | null {
  const gap = b - a, src = clip.out - clip.in;
  if (gap < 1 || src < 1 || clip.title) return null;
  const speed = Math.round((src / gap) * 10000) / 10000;
  if (speed < 0.25 || speed > 4) return null;
  const c: Clip = { ...clip, speed, out: Math.min(clip.out, clip.in + Math.round(gap * speed)), fade_in: 0, fade_out: 0, keyframes: null };
  for (let i = 0; i < 4 && len(c) > gap; i++) c.out--;              // rounding can leave it a frame long or short
  for (let i = 0; i < 4 && len(c) < gap && c.out < clip.out; i++) c.out++;
  const r = overwrite(tl, trackId, c, a);
  return r && { ...r, speed };
}

/** Place on the first free unlocked video track above everything at the playhead; adds a track on top if none is free. */
export function placeOnTop(tl: Timeline, clip: Clip, start: number): { tl: Timeline; id: string } | null {
  const vids = tl.tracks.filter((t) => t.kind === "video");      // top → bottom
  const L = len(clip);
  let highestBusy = vids.length;                                  // index of the top-most track with something under the playhead
  vids.forEach((t, i) => { if (t.clips.some((c) => c.start < start + L && end(c) > start)) highestBusy = Math.min(highestBusy, i); });
  for (let i = Math.min(highestBusy, vids.length) - 1; i >= 0; i--) {
    const t = vids[i];
    if (!t.locked && fits(t, start, L)) { const c = at(clip, start); return { tl: place(tl, t.id, c), id: c.id }; }
  }
  if (tl.tracks.length >= 24) return null;
  const n = vids.length + 1;
  const track: Track = { id: uid("v"), kind: "video", name: `V${n}`, muted: false, hidden: false, locked: false, clips: [] };
  const c = at(clip, start);
  return { tl: { ...tl, tracks: [{ ...track, clips: [c] }, ...tl.tracks] }, id: c.id };
}

export function append(tl: Timeline, trackId: string, clip: Clip): { tl: Timeline; id: string } | null {
  const t = trackOf(tl, trackId);
  if (!t || t.locked) return null;
  const c = at(clip, duration(tl));
  return { tl: place(tl, trackId, c), id: c.id };
}

/** Replace a clip with one of a different length; later clips on that track move to make room or close up. */
export function rippleOverwrite(tl: Timeline, targetId: string, clip: Clip): { tl: Timeline; id: string } | null {
  const f = findClip(tl, targetId);
  if (!f || f.track.locked) return null;
  const delta = len(clip) - len(f.clip);
  let out = shiftAfter(tl, end(f.clip), delta, [f.track.id]);
  const c = at(clip, f.clip.start);
  out = mapClip(out, targetId, () => c);
  return { tl: out, id: c.id };
}

/** Clip directly before / after on the same track (touching, no gap). */
export function neighbours(tl: Timeline, id: string): { prev: Clip | null; next: Clip | null } {
  const f = findClip(tl, id);
  if (!f) return { prev: null, next: null };
  return { prev: f.track.clips.find((c) => end(c) === f.clip.start) ?? null, next: f.track.clips.find((c) => c.start === end(f.clip)) ?? null };
}

type SrcMax = (c: Clip) => number;

/** Move the cut between two touching clips: one gets longer, the other shorter, total length unchanged. */
export function roll(tl: Timeline, leftId: string, rightId: string, cut: number, srcMax: SrcMax): Timeline | null {
  const L = findClip(tl, leftId), R = findClip(tl, rightId);
  if (!L || !R || L.track.id !== R.track.id || L.track.locked || end(L.clip) !== R.clip.start) return null;
  const l = L.clip, r = R.clip;
  if (cut <= l.start || cut >= end(r)) return null;
  const lout = l.in + Math.round((cut - l.start) * sp(l));
  const rin = r.in + Math.round((cut - r.start) * sp(r));
  if (lout > srcMax(l) || lout <= l.in || rin < 0 || rin >= r.out) return null;
  const nl: Clip = { ...l, out: lout, fade_out: Math.min(l.fade_out, cut - l.start - 1), keyframes: clampToLength(l, cut - l.start) };
  const rlen = end(r) - cut;
  const nr: Clip = { ...r, start: cut, in: rin, fade_in: Math.min(r.fade_in, rlen - 1), keyframes: shiftForTrimStart(r, cut - r.start, rlen) };
  return mapClip(mapClip(tl, leftId, () => nl), rightId, () => nr);
}

/** Ripple trim the end: later clips on the track follow the new end. */
export function rippleTrimEnd(tl: Timeline, id: string, newEnd: number, srcMax: SrcMax): Timeline | null {
  const f = findClip(tl, id);
  if (!f || f.track.locked) return null;
  const c = f.clip, nlen = newEnd - c.start, nout = c.in + Math.round(nlen * sp(c));
  if (nlen < 1 || nlen <= c.fade_in + c.fade_out || nout <= c.in || nout > srcMax(c)) return null;
  const out = shiftAfter(tl, end(c), newEnd - end(c), [f.track.id]);
  return mapClip(out, id, (x) => ({ ...x, out: nout, keyframes: clampToLength(x, nlen) }));
}

/** Ripple trim the start: the clip stays where it is, its first frames change, later clips close up or move on. */
export function rippleTrimStart(tl: Timeline, id: string, delta: number): Timeline | null {
  const f = findClip(tl, id);
  if (!f || f.track.locked || delta === 0) return null;
  const c = f.clip, nin = c.in + Math.round(delta * sp(c));
  const nlen = Math.round((c.out - nin) / sp(c));
  if (nin < 0 || nin >= c.out || nlen < 1 || nlen <= c.fade_in + c.fade_out) return null;
  const out = shiftAfter(tl, end(c), nlen - len(c), [f.track.id]);
  return mapClip(out, id, (x) => ({ ...x, in: nin, keyframes: shiftForTrimStart(x, delta, nlen) }));
}

/** Slip: show a different part of the source in the same slot (position and length don't change). */
export function slip(tl: Timeline, id: string, frames: number, srcMax: SrcMax): Timeline | null {
  const f = findClip(tl, id);
  if (!f || f.track.locked || f.clip.title) return null;
  const c = f.clip, d = Math.round(frames * sp(c));
  const lo = -c.in, hi = srcMax(c) - c.out;
  const dd = Math.max(lo, Math.min(hi, d));
  if (dd === 0 || !Number.isFinite(dd)) return null;
  return mapClip(tl, id, (x) => ({ ...x, in: x.in + dd, out: x.out + dd }));
}

/** Slide: move a clip between its neighbours; the clip before gets longer/shorter and the one after the opposite. */
export function slide(tl: Timeline, id: string, newStart: number, srcMax: SrcMax): Timeline | null {
  const f = findClip(tl, id);
  if (!f || f.track.locked) return null;
  const c = f.clip, d = newStart - c.start, L = len(c);
  if (d === 0) return null;
  const { prev, next } = neighbours(tl, id);
  let out: Timeline | null = tl;
  // shrink first, then move, then grow, so nothing ever overlaps on the way
  if (d > 0 && next) out = rippleFree(out, next.id, end(c) + d, "start", srcMax);
  if (d < 0 && prev) out = rippleFree(out, prev.id, newStart, "end", srcMax);
  if (!out) return null;
  const t = findClip(out, id)!.track;
  if (!fits(t, newStart, L, id)) return null;
  out = mapClip(out, id, (x) => ({ ...x, start: newStart }));
  if (d > 0 && prev) out = rippleFree(out, prev.id, newStart, "end", srcMax);
  if (d < 0 && next) out = rippleFree(out, next.id, newStart + L, "start", srcMax);
  return out;
}

/** Set one edge of a clip without the overlap check (callers keep things consistent). */
function rippleFree(tl: Timeline | null, id: string, frame: number, edge: "start" | "end", srcMax: SrcMax): Timeline | null {
  if (!tl) return null;
  const f = findClip(tl, id);
  if (!f) return null;
  const c = f.clip;
  if (edge === "end") {
    const nlen = frame - c.start, nout = c.in + Math.round(nlen * sp(c));
    if (nlen < 1 || nout <= c.in || nout > srcMax(c)) return null;
    return mapClip(tl, id, (x) => ({ ...x, out: nout, fade_out: Math.min(x.fade_out, nlen - 1), keyframes: clampToLength(x, nlen) }));
  }
  const delta = frame - c.start, nin = c.in + Math.round(delta * sp(c)), nlen = end(c) - frame;
  if (nlen < 1 || nin < 0 || nin >= c.out) return null;
  return mapClip(tl, id, (x) => ({ ...x, start: frame, in: nin, fade_in: Math.min(x.fade_in, nlen - 1), keyframes: shiftForTrimStart(x, delta, nlen) }));
}

// ---------- markers
const COLORS: MarkerColor[] = ["blue", "cyan", "green", "yellow", "red", "pink", "purple"];
export const MARKER_HEX: Record<MarkerColor, string> = { blue: "#3b82f6", cyan: "#22d3ee", green: "#22c55e", yellow: "#facc15", red: "#ef4444", pink: "#f472b6", purple: "#a78bfa" };

export function addMarker(tl: Timeline, frame: number, color: MarkerColor = "blue"): Timeline {
  const ms = tl.markers ?? [];
  if (ms.some((m) => m.frame === frame) || ms.length >= 500) return tl;
  const m: Marker = { id: uid("m"), frame, name: `Marker ${ms.length + 1}`, color };
  return { ...tl, markers: [...ms, m].sort((a, b) => a.frame - b.frame) };
}
export const removeMarker = (tl: Timeline, id: string): Timeline => ({ ...tl, markers: (tl.markers ?? []).filter((m) => m.id !== id) });
export const updateMarker = (tl: Timeline, id: string, patch: Partial<Omit<Marker, "id">>): Timeline =>
  ({ ...tl, markers: (tl.markers ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)).sort((a, b) => a.frame - b.frame) });
export const nextMarkerColor = (c: MarkerColor): MarkerColor => COLORS[(COLORS.indexOf(c) + 1) % COLORS.length];
export function markerNear(tl: Timeline, frame: number, dir: 1 | -1): Marker | null {
  const ms = tl.markers ?? [];
  return dir > 0 ? ms.find((m) => m.frame > frame) ?? null : [...ms].reverse().find((m) => m.frame < frame) ?? null;
}
