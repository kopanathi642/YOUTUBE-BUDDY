// Keyframe animation — the same maths as backend/app/timeline.py (kf_value / slice_keyframes), so the preview
// matches the export frame for frame. Keyframe time `t` counts timeline frames from the clip's start.
import type { Clip, Transform } from "./timeline";

export type Ease = "linear" | "ease" | "hold";
export type Keyframe = { t: number; v: number; ease: Ease };
export type KfProp = "x" | "y" | "scale" | "rotation" | "opacity";
export type Keyframes = Partial<Record<KfProp, Keyframe[]>>;
export const KF_PROPS: KfProp[] = ["x", "y", "scale", "rotation", "opacity"];

export function valueAt(kfs: Keyframe[] | undefined, t: number, def: number): number {
  if (!kfs || kfs.length === 0) return def;
  if (t <= kfs[0].t) return kfs[0].v;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i], b = kfs[i + 1];
    if (t < b.t) {
      if (a.ease === "hold") return a.v;
      let u = (t - a.t) / (b.t - a.t);
      if (a.ease === "ease") u = u * u * (3 - 2 * u);
      return a.v + (b.v - a.v) * u;
    }
  }
  return kfs[kfs.length - 1].v;
}

export const isAnimated = (c: Clip, p?: KfProp) => !!c.keyframes && (p ? (c.keyframes[p]?.length ?? 0) > 0 : KF_PROPS.some((k) => (c.keyframes![k]?.length ?? 0) > 0));

/** The clip's transform at clip-local frame t (static values where a property has no keyframes). */
export function tfAt(c: Clip, t: number): Transform {
  const tf = c.transform, kf = c.keyframes;
  if (!kf) return tf;
  return { x: valueAt(kf.x, t, tf.x), y: valueAt(kf.y, t, tf.y), scale: valueAt(kf.scale, t, tf.scale), rotation: valueAt(kf.rotation, t, tf.rotation), opacity: valueAt(kf.opacity, t, tf.opacity) };
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const easeAt = (kfs: Keyframe[], t: number): Ease => { let e: Ease = "linear"; for (const f of kfs) if (f.t <= t) e = f.ease; return e; };

/** Keep the animation for clip frames [a, b), shifted to start at 0 — matches slice_keyframes() on the server. */
export function sliceKeyframes(kf: Keyframes | null | undefined, a: number, b: number, st: Transform): Keyframes | null | undefined {
  if (!kf) return kf;
  const out: Keyframes = {};
  for (const p of KF_PROPS) {
    const kfs = kf[p];
    if (!kfs?.length) continue;
    const keep: Keyframe[] = [{ t: 0, v: r4(valueAt(kfs, a, st[p])), ease: easeAt(kfs, a) }];
    for (const f of kfs) if (f.t > a && f.t < b && f.t - a < b - a - 1) keep.push({ ...f, t: f.t - a });
    const last = { t: b - a - 1, v: r4(valueAt(kfs, b - 1, st[p])), ease: "linear" as Ease };
    if (last.t > keep[keep.length - 1].t) keep.push(last);
    out[p] = keep;
  }
  return out;
}

/** Re-anchor keyframes after the clip's start moves by `delta` frames (trim left): shrink → slice, extend → shift. */
export function shiftForTrimStart(c: Clip, delta: number, newLen: number): Keyframes | null | undefined {
  if (!c.keyframes || delta === 0) return c.keyframes;
  if (delta > 0) return sliceKeyframes(c.keyframes, delta, delta + newLen, c.transform);
  const out: Keyframes = {};
  for (const p of KF_PROPS) if (c.keyframes[p]?.length) out[p] = c.keyframes[p]!.map((f) => ({ ...f, t: f.t - delta }));
  return out;
}

/** Trim the animation to a new (shorter) length; longer clips keep their keyframes. */
export function clampToLength(c: Clip, newLen: number): Keyframes | null | undefined {
  if (!c.keyframes) return c.keyframes;
  const maxT = Math.max(...KF_PROPS.flatMap((p) => (c.keyframes![p] ?? []).map((f) => f.t)), 0);
  return maxT < newLen ? c.keyframes : sliceKeyframes(c.keyframes, 0, newLen, c.transform);
}

export function setKey(kf: Keyframes | null | undefined, p: KfProp, t: number, v: number, ease?: Ease): Keyframes {
  const list = [...(kf?.[p] ?? [])];
  const i = list.findIndex((f) => f.t === t);
  if (i >= 0) list[i] = { ...list[i], v: r4(v), ...(ease ? { ease } : {}) };
  else { list.push({ t, v: r4(v), ease: ease ?? "linear" }); list.sort((a, b) => a.t - b.t); }
  return { ...(kf ?? {}), [p]: list.slice(0, 64) };
}

export function removeKey(kf: Keyframes | null | undefined, p: KfProp, t: number): Keyframes | null {
  const out: Keyframes = { ...(kf ?? {}), [p]: (kf?.[p] ?? []).filter((f) => f.t !== t) };
  if (!out[p]!.length) delete out[p];
  return KF_PROPS.some((k) => out[k]?.length) ? out : null;
}

export function clearProp(kf: Keyframes | null | undefined, p: KfProp): Keyframes | null {
  const out: Keyframes = { ...(kf ?? {}) };
  delete out[p];
  return KF_PROPS.some((k) => out[k]?.length) ? out : null;
}

/** All keyframe times on a clip (for timeline markers and prev/next navigation). */
export const keyTimes = (c: Clip, p?: KfProp) => [...new Set((p ? [p] : KF_PROPS).flatMap((k) => (c.keyframes?.[k] ?? []).map((f) => f.t)))].sort((a, b) => a - b);
