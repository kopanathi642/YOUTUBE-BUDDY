// Timeline model (mirror of backend schema v1) and pure, frame-exact editing operations.
// Every op returns a NEW timeline or null when the edit is invalid (e.g. it would overlap a clip).

export type Transform = { x: number; y: number; scale: number; rotation: number; opacity: number };
export type Vec3 = [number, number, number];
export type CurvePoint = [number, number];
export type Curves = { master: CurvePoint[]; r: CurvePoint[]; g: CurvePoint[]; b: CurvePoint[] };
export type LutRef = { asset_id: string; strength: number };
import type { Keyframes } from "./keyframes";
import { clampToLength, shiftForTrimStart, sliceKeyframes } from "./keyframes";

export type ColorGrade = {
  enabled: boolean; lift: Vec3; gamma: Vec3; gain: Vec3; offset: Vec3;
  exposure: number; contrast: number; saturation: number; temperature: number; tint: number;
  curves?: Curves | null; lut?: LutRef | null;
};
export type Title = { text: string; font_size: number; color: string; bg_color: string | null; bg_opacity: number;
  align?: "left" | "center" | "right"; stroke?: number; stroke_color?: string; shadow?: number };
/** Composition look (Shorts studio). Sequence pixels at the clip's static size; keyframed clips scale it with the clip. */
export type ClipFx = { blur?: number; radius?: number; border?: number; border_color?: string; shadow?: number; shadow_opacity?: number; flip_h?: boolean };
export type Crop = { left: number; right: number; top: number; bottom: number };
export type Clip = {
  id: string; asset_id: string | null; start: number; in: number; out: number;
  volume: number; fade_in: number; fade_out: number; transform: Transform; keyframes?: Keyframes | null;
  transition_in?: { type: import("./transitions").TransitionType; frames: number } | null;
  color?: ColorGrade | null; denoise?: boolean; speed?: number; crop?: Crop | null; title?: Title | null; fx?: ClipFx | null;
};
export type Track = { id: string; kind: "video" | "audio"; name: string; muted: boolean; hidden: boolean; locked: boolean; clips: Clip[] };
export type Timeline = { schema_version: 1; fps: number; width: number; height: number; tracks: Track[]; notes?: string;
  composition?: import("./compose").Composition | null };

export const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };

export const uid = (p = "c") => `${p}${Math.random().toString(36).slice(2, 10)}`;
export const sp = (c: Clip) => c.speed ?? 1;
/** Frames on the timeline = source span / speed (same rounding as the server). */
export const len = (c: Clip) => Math.max(1, Math.round((c.out - c.in) / sp(c)));
export const end = (c: Clip) => c.start + len(c);
export const duration = (tl: Timeline) => Math.max(0, ...tl.tracks.flatMap((t) => t.clips.map(end)));

export function findClip(tl: Timeline, id: string): { track: Track; clip: Clip } | null {
  for (const track of tl.tracks) for (const clip of track.clips) if (clip.id === id) return { track, clip };
  return null;
}

export function fits(track: Track, start: number, length: number, ignoreId?: string): boolean {
  if (start < 0 || length < 1) return false;
  return track.clips.every((c) => c.id === ignoreId || start >= end(c) || start + length <= c.start);
}

function mapClip(tl: Timeline, id: string, f: (c: Clip, t: Track) => Clip | Clip[] | null): Timeline {
  return { ...tl, tracks: tl.tracks.map((t) => ({ ...t, clips: t.clips.flatMap((c) => (c.id === id ? f(c, t) ?? [] : [c])) })) };
}

/** Earliest free start >= wanted on this track that can hold `length` frames. */
export function freeSlot(track: Track, wanted: number, length: number, ignoreId?: string): number {
  let s = Math.max(0, wanted);
  const sorted = track.clips.filter((c) => c.id !== ignoreId).sort((a, b) => a.start - b.start);
  for (const c of sorted) if (s < end(c) && s + length > c.start) s = end(c);
  return s;
}

export function insertClip(tl: Timeline, trackId: string, assetId: string, start: number, inF: number, outF: number): { tl: Timeline; id: string } | null {
  const track = tl.tracks.find((t) => t.id === trackId);
  if (!track || track.locked) return null;
  const s = freeSlot(track, start, outF - inF);
  const clip: Clip = { id: uid(), asset_id: assetId, start: s, in: inF, out: outF, volume: 1, fade_in: 0, fade_out: 0, transform: { ...DEFAULT_TRANSFORM } };
  return { id: clip.id, tl: { ...tl, tracks: tl.tracks.map((t) => (t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t)) } };
}

export function moveClip(tl: Timeline, id: string, toTrackId: string, start: number): Timeline | null {
  const f = findClip(tl, id);
  const to = tl.tracks.find((t) => t.id === toTrackId);
  if (!f || !to || f.track.locked || to.locked || to.kind !== f.track.kind) return null;
  if (!fits(to, start, len(f.clip), id)) return null;
  const moved = { ...f.clip, start };
  return { ...tl, tracks: tl.tracks.map((t) => {
    let clips = t.clips.filter((c) => c.id !== id);
    if (t.id === toTrackId) clips = [...clips, moved];
    return { ...t, clips };
  }) };
}

/** Drag the left edge to timeline frame `newStart`. sourceMax = asset length in frames (Infinity for stills). */
export function trimStart(tl: Timeline, id: string, newStart: number): Timeline | null {
  const f = findClip(tl, id);
  if (!f || f.track.locked) return null;
  const delta = newStart - f.clip.start;
  const nin = f.clip.in + Math.round(delta * sp(f.clip));
  if (nin < 0 || nin >= f.clip.out) return null;
  const nlen = Math.max(1, Math.round((f.clip.out - nin) / sp(f.clip)));
  if (nlen <= f.clip.fade_in + f.clip.fade_out || nlen < 1) return null;
  if (!fits(f.track, newStart, nlen, id)) return null;
  return mapClip(tl, id, (c) => ({ ...c, start: newStart, in: nin, keyframes: shiftForTrimStart(c, delta, nlen) }));
}

export function trimEnd(tl: Timeline, id: string, newEnd: number, sourceMax: number): Timeline | null {
  const f = findClip(tl, id);
  if (!f || f.track.locked) return null;
  const nlen = newEnd - f.clip.start;
  const nout = f.clip.in + Math.round(nlen * sp(f.clip));
  if (nlen < 1 || nlen <= f.clip.fade_in + f.clip.fade_out || nout > sourceMax || nout <= f.clip.in) return null;
  if (!fits(f.track, f.clip.start, nlen, id)) return null;
  return mapClip(tl, id, (c) => ({ ...c, out: nout, keyframes: clampToLength(c, nlen) }));
}

export function splitAt(tl: Timeline, id: string, frame: number): { tl: Timeline; rightId: string } | null {
  const f = findClip(tl, id);
  if (!f || f.track.locked || frame <= f.clip.start || frame >= end(f.clip)) return null;
  const cut = f.clip.in + Math.round((frame - f.clip.start) * sp(f.clip));
  if (cut <= f.clip.in || cut >= f.clip.out) return null;
  const rightId = uid();
  const at = frame - f.clip.start, total = len(f.clip);
  const left: Clip = { ...f.clip, out: cut, fade_out: 0, fade_in: Math.min(f.clip.fade_in, frame - f.clip.start - 1), keyframes: sliceKeyframes(f.clip.keyframes, 0, at, f.clip.transform) };
  const right: Clip = { ...f.clip, id: rightId, start: frame, in: cut, fade_in: 0, fade_out: Math.min(f.clip.fade_out, end(f.clip) - frame - 1), keyframes: sliceKeyframes(f.clip.keyframes, at, total, f.clip.transform) };
  return { rightId, tl: mapClip(tl, id, () => [left, right]) };
}

/** Split every unlocked clip under the playhead (the "S" key in most NLEs). */
export function splitAllAt(tl: Timeline, frame: number): Timeline {
  let out = tl;
  for (const t of tl.tracks) for (const c of t.clips) {
    const r = splitAt(out, c.id, frame);
    if (r) out = r.tl;
  }
  return out;
}

export function deleteClip(tl: Timeline, id: string, ripple = false): Timeline | null {
  const f = findClip(tl, id);
  if (!f || f.track.locked) return null;
  const gap = len(f.clip);
  return { ...tl, tracks: tl.tracks.map((t) => t.id !== f.track.id ? t : {
    ...t, clips: t.clips.filter((c) => c.id !== id).map((c) => (ripple && c.start >= end(f.clip) ? { ...c, start: c.start - gap } : c)),
  }) };
}

export function updateClip(tl: Timeline, id: string, patch: Partial<Clip>): Timeline | null {
  const f = findClip(tl, id);
  if (!f || f.track.locked) return null;
  return mapClip(tl, id, (c) => ({ ...c, ...patch, transform: { ...c.transform, ...(patch.transform ?? {}) } }));
}

/** Change speed; refused if the longer clip would overlap the next one. */
export function setSpeed(tl: Timeline, id: string, speed: number): Timeline | null {
  const f = findClip(tl, id);
  if (!f || f.track.locked || f.clip.title) return null;
  const c2 = { ...f.clip, speed };
  if (len(c2) <= c2.fade_in + c2.fade_out) c2.fade_in = c2.fade_out = 0;
  c2.keyframes = clampToLength(f.clip, len(c2));
  if (!fits(f.track, c2.start, len(c2), id)) return null;
  return mapClip(tl, id, () => c2);
}

export const DEFAULT_TITLE: Title = { text: "Your title", font_size: 110, color: "#ffffff", bg_color: "#7c3aed", bg_opacity: 0.85 };

export function insertTitle(tl: Timeline, trackId: string, start: number, frames: number, title: Title = DEFAULT_TITLE): { tl: Timeline; id: string } | null {
  const track = tl.tracks.find((t) => t.id === trackId);
  if (!track || track.locked || track.kind !== "video") return null;
  const s = freeSlot(track, start, frames);
  const clip: Clip = { id: uid("t"), asset_id: null, title: { ...title }, start: s, in: 0, out: frames, volume: 1, fade_in: 0, fade_out: 0, transform: { ...DEFAULT_TRANSFORM } };
  return { id: clip.id, tl: { ...tl, tracks: tl.tracks.map((t) => (t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t)) } };
}

export function updateTrack(tl: Timeline, id: string, patch: Partial<Omit<Track, "clips" | "id" | "kind">>): Timeline {
  return { ...tl, tracks: tl.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

export function addTrack(tl: Timeline, kind: "video" | "audio"): Timeline {
  const n = tl.tracks.filter((t) => t.kind === kind).length + 1;
  const track: Track = { id: uid(kind[0]), kind, name: `${kind === "video" ? "V" : "A"}${n}`, muted: false, hidden: false, locked: false, clips: [] };
  // New video tracks go on top of the picture (top of the list); audio tracks at the bottom.
  return { ...tl, tracks: kind === "video" ? [track, ...tl.tracks] : [...tl.tracks, track] };
}

export function snapPoints(tl: Timeline, excludeId: string | null, playhead: number): number[] {
  const pts = [0, playhead];
  for (const t of tl.tracks) for (const c of t.clips) if (c.id !== excludeId) pts.push(c.start, end(c));
  return pts;
}

export function snap(v: number, points: number[], threshold: number): number {
  let best = v, bd = threshold + 1;
  for (const p of points) { const d = Math.abs(p - v); if (d < bd) { bd = d; best = p; } }
  return bd <= threshold ? best : v;
}

export function framesToTimecode(f: number, fps: number): string {
  const s = Math.floor(f / fps), ff = Math.floor(f % fps);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return [hh, mm, ss, ff].map((x) => String(x).padStart(2, "0")).join(":");
}

/** Topmost visible video clip at frame (what the program monitor shows). Tracks are listed top→bottom. */
export function clipsAt(tl: Timeline, frame: number) {
  const video: { track: Track; clip: Clip }[] = [];
  const audio: { track: Track; clip: Clip }[] = [];
  for (const track of tl.tracks) for (const clip of track.clips) {
    if (frame >= clip.start && frame < end(clip)) (track.kind === "video" ? video : audio).push({ track, clip });
  }
  return { video, audio };
}
