// Rule-based smart editing driven by the worker's real media analysis (scenes, silences, loudness, colour).
// Every operation is a normal, undoable timeline edit — nothing is hidden.
import type { Asset } from "./api";
import { Timeline, Clip, end, splitAt, deleteClip, updateClip, findClip, sp } from "./timeline";
import { isNeutral, sanitizeGrade } from "./grade";

export type Analysis = {
  scenes?: { start: number; end: number; score: number }[];
  silences?: { start: number; end: number }[];
  loudness_lufs?: number | null;
  auto_grade?: any;
  subject_center_x?: number | null;
  error?: string;
};
const an = (a?: Asset): Analysis => ((a as any)?.analysis ?? {}) as Analysis;
const A = (m: Map<string | null, Asset>, id: string | null) => (id ? m.get(id) : undefined);

export const TARGET_LUFS = -14;
const PAD_S = 0.15, MIN_CUT_S = 0.4;

export type Cut = { clipId: string; trackId: string; from: number; to: number };

/** Silent stretches inside clips on the timeline, in timeline frames (padded so words aren't clipped). */
export function silenceCuts(tl: Timeline, assets: Map<string | null, Asset>): Cut[] {
  const fps = tl.fps, out: Cut[] = [];
  for (const t of tl.tracks) {
    if (t.locked) continue;
    for (const c of t.clips) {
      const sil = an(A(assets, c.asset_id)).silences ?? [];
      for (const s of sil) {
        const a = Math.max(s.start + PAD_S, c.in / fps), b = Math.min(s.end - PAD_S, c.out / fps);
        if (b - a < MIN_CUT_S) continue;
        const from = c.start + Math.ceil((a * fps - c.in) / sp(c) - 1e-6), to = c.start + Math.floor((b * fps - c.in) / sp(c) + 1e-6);
        if (to - from >= 1 && from >= c.start && to <= end(c)) out.push({ clipId: c.id, trackId: t.id, from, to });
      }
    }
  }
  return out;
}

/** Remove the cuts with ripple on their own track. Processes right-to-left so earlier frames stay valid. */
export function applyCuts(tl: Timeline, cuts: Cut[]): Timeline {
  let out = tl;
  const byTrack = new Map<string, Cut[]>();
  cuts.forEach((c) => byTrack.set(c.trackId, [...(byTrack.get(c.trackId) ?? []), c]));
  for (const list of byTrack.values()) {
    for (const cut of [...list].sort((a, b) => b.from - a.from)) {
      const track = out.tracks.find((t) => t.id === cut.trackId)!;
      const clip = track.clips.find((c) => cut.from >= c.start && cut.to <= end(c));
      if (!clip) continue;
      let midId = clip.id;
      if (cut.from > clip.start) { const r = splitAt(out, clip.id, cut.from); if (!r) continue; out = r.tl; midId = r.rightId; }
      const mid = findClip(out, midId)!.clip;
      if (cut.to < end(mid)) { const r = splitAt(out, midId, cut.to); if (r) out = r.tl; }
      out = deleteClip(out, midId, true) ?? out;
    }
  }
  return out;
}

/** Split clips at detected scene changes. */
export function sceneSplits(tl: Timeline, assets: Map<string | null, Asset>): { clipId: string; frame: number }[] {
  const fps = tl.fps, out: { clipId: string; frame: number }[] = [];
  for (const t of tl.tracks) if (t.kind === "video" && !t.locked) for (const c of t.clips) {
    for (const s of an(A(assets, c.asset_id)).scenes ?? []) {
      const f = c.start + Math.round((s.start * fps - c.in) / sp(c));
      if (f > c.start + 2 && f < end(c) - 2) out.push({ clipId: c.id, frame: f });
    }
  }
  return out;
}
export function applySceneSplits(tl: Timeline, splits: { frame: number }[]): Timeline {
  let out = tl;
  for (const s of [...splits].sort((a, b) => b.frame - a.frame)) {
    for (const t of out.tracks) if (t.kind === "video" && !t.locked) {
      const c = t.clips.find((c) => s.frame > c.start && s.frame < end(c));
      if (c) { const r = splitAt(out, c.id, s.frame); if (r) out = r.tl; }
    }
  }
  return out;
}

export function loudnessGain(a?: Asset): number | null {
  const L = an(a).loudness_lufs;
  if (L == null) return null;
  const g = Math.pow(10, (TARGET_LUFS - L) / 20);
  return Math.abs(TARGET_LUFS - L) < 2 ? null : Math.min(4, Math.max(0.25, +g.toFixed(2)));
}

export type PlanOp = { id: string; label: string; detail: string; apply: (tl: Timeline) => Timeline };

/** "AI Magic" plan: only operations backed by real measurements of the media on this timeline. */
export function buildPlan(tl: Timeline, assets: Map<string | null, Asset>): PlanOp[] {
  const ops: PlanOp[] = [];
  const cuts = silenceCuts(tl, assets);
  if (cuts.length) {
    const secs = cuts.reduce((s, c) => s + (c.to - c.from), 0) / tl.fps;
    ops.push({ id: "silence", label: `Cut ${cuts.length} silence${cuts.length > 1 ? "s" : ""}`, detail: `Removes ${secs.toFixed(1)}s of dead air (≤ -35 dB, ≥ 0.6s), keeps 0.15s around speech`, apply: (t) => applyCuts(t, silenceCuts(t, assets)) });
  }
  // Targets are re-found at apply time, so earlier steps (e.g. silence cuts that split clips) are covered.
  const colorTargets = (t: Timeline): Clip[] => t.tracks.filter((x) => x.kind === "video" && !x.locked).flatMap((x) => x.clips).filter((c) => { const g = an(A(assets, c.asset_id)).auto_grade; return isNeutral(c.color) && !!g && !isNeutral(sanitizeGrade(g)); });
  const gainTargets = (t: Timeline) => t.tracks.filter((x) => !x.locked).flatMap((x) => x.clips).map((c) => ({ c, g: loudnessGain(A(assets, c.asset_id)) })).filter((x) => x.g && x.c.volume === 1);
  const noiseTargets = (t: Timeline) => t.tracks.filter((x) => !x.locked).flatMap((x) => x.clips).filter((c) => A(assets, c.asset_id)?.has_audio && !c.denoise);
  const nc = colorTargets(tl).length, ng = gainTargets(tl).length, nn = noiseTargets(tl).length;
  if (nc) ops.push({ id: "color", label: `Auto colour & exposure on ${nc} clip${nc > 1 ? "s" : ""}`, detail: "Levels + white balance measured from each clip", apply: (t) => {
    let o = t; for (const c of colorTargets(t)) o = updateClip(o, c.id, { color: sanitizeGrade(an(A(assets, c.asset_id)).auto_grade) }) ?? o; return o; } });
  if (ng) ops.push({ id: "loud", label: `Balance audio levels on ${ng} clip${ng > 1 ? "s" : ""}`, detail: `Brings each clip to about ${TARGET_LUFS} LUFS (online-video level)`, apply: (t) => {
    let o = t; for (const { c, g } of gainTargets(t)) o = updateClip(o, c.id, { volume: g! }) ?? o; return o; } });
  if (nn) ops.push({ id: "denoise", label: "Remove background noise", detail: "FFT noise reduction on clip audio (heard in the export)", apply: (t) => {
    let o = t; for (const c of noiseTargets(t)) o = updateClip(o, c.id, { denoise: true }) ?? o; return o; } });
  const first = tl.tracks.filter((t) => t.kind === "video").flatMap((t) => t.clips).sort((a, b) => a.start - b.start);
  if (first.length && !first[0].fade_in) ops.push({ id: "fades", label: "Fade in & out", detail: "0.5s fade from black at the start and to black at the end", apply: (t) => {
    const f = Math.round(t.fps / 2); const vs = t.tracks.filter((x) => x.kind === "video" && !x.locked).flatMap((x) => x.clips).sort((a, b) => a.start - b.start);
    let o = t; const a = vs[0], z = [...vs].sort((a, b) => end(b) - end(a))[0];
    if (a && a.fade_in === 0 && f + a.fade_out <= a.out - a.in) o = updateClip(o, a.id, { fade_in: f }) ?? o;
    const zz = z && findClip(o, z.id)?.clip; if (zz && zz.fade_out === 0 && f + zz.fade_in <= zz.out - zz.in) o = updateClip(o, zz.id, { fade_out: f }) ?? o; return o; } });
  return ops;
}

export function analysisPending(assets: Asset[]): boolean {
  return assets.some((a) => a.status === "processing");
}
