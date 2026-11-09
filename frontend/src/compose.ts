// Shorts Creative Studio — compositions.
// A composition is a stack of layers (media, text, audio) placed with NORMALIZED canvas coordinates, so it survives any
// change of aspect ratio or resolution. compileComposition() turns it into an ordinary timeline that the existing
// preview (Viewer) and the FFmpeg renderer both play — so the preview and the export are the same picture.
import type { Clip, ColorGrade, Timeline, Track } from "./timeline";
import type { Keyframe, Keyframes } from "./keyframes";

export type RatioId = "9:16" | "4:5" | "2:3" | "1:1" | "16:9" | "3:2" | "custom";
export const RATIOS: { id: Exclude<RatioId, "custom">; label: string; w: number; h: number; use: string }[] = [
  { id: "9:16", label: "9:16", w: 1080, h: 1920, use: "Shorts, Reels, TikTok" },
  { id: "4:5", label: "4:5", w: 1080, h: 1350, use: "Instagram feed" },
  { id: "2:3", label: "2:3", w: 1080, h: 1620, use: "Pinterest, tall feed" },
  { id: "1:1", label: "1:1", w: 1080, h: 1080, use: "Square feed" },
  { id: "16:9", label: "16:9", w: 1920, h: 1080, use: "YouTube, landscape" },
  { id: "3:2", label: "3:2", w: 1620, h: 1080, use: "Landscape photo" },
];
export const ratioOf = (w: number, h: number): RatioId => RATIOS.find((r) => r.w * h === r.h * w)?.id ?? "custom";
/** Even, in-range canvas size for a ratio and a long side. */
export function canvasFor(rw: number, rh: number, long = 1920): { width: number; height: number } {
  const k = long / Math.max(rw, rh);
  const even = (v: number) => Math.max(144, Math.min(3840, Math.round(v / 2) * 2));
  return { width: even(rw * k), height: even(rh * k) };
}

export type Box = { x: number; y: number; w: number; h: number };         // centre x/y and size, fractions of the canvas
export type LayerFx = {
  blur?: number; radius?: number; border?: number; shadow?: number;       // fractions of the canvas short side
  border_color?: string; shadow_opacity?: number; flip_h?: boolean;
  brightness?: number; contrast?: number; saturation?: number;            // -1..1, 0..2, 0..2
};
export type AnimIn = "none" | "fade" | "slide-up" | "slide-down" | "slide-left" | "slide-right" | "zoom-in" | "pop";
export type AnimOut = "none" | "fade" | "slide-up" | "slide-down" | "zoom-out";
export type Anim = { in: AnimIn; out: AnimOut; frames: number; kenburns?: number };   // kenburns: extra zoom over the clip (0..0.5)
export type Graphic = { kind: "solid" | "gradient" | "vignette" | "light_leak"; color: string; color2?: string; angle?: number; strength?: number };
type Base = { id: string; name: string; role: string; hidden?: boolean; locked?: boolean; pinned?: boolean;   // pinned = placed by hand, kept on ratio changes
  opacity: number; rotation: number;
  start: number; length: number | null; anim?: Anim; kf?: { x?: Keyframe[]; y?: Keyframe[]; scale?: Keyframe[] } };
export type MediaLayer = Base & { kind: "media"; asset_id: string | null; slot?: number; graphic?: Graphic; box: Box;
  fit: "cover" | "contain"; focus: { x: number; y: number }; zoom: number; in: number; volume: number; fx?: LayerFx };
export type TextLayer = Base & { kind: "text"; text: string; box: Box; size: number;   // size: fraction of the canvas short side
  color: string; bg_color: string | null; bg_opacity: number;
  align: "left" | "center" | "right"; stroke: number; stroke_color: string; shadow: number };
export type AudioLayer = Base & { kind: "audio"; asset_id: string | null; slot?: number; in: number; volume: number };
export type Layer = MediaLayer | TextLayer | AudioLayer;
export type Style = "stacked" | "cinematic" | "text" | "blur" | "centered" | "mixed" | "custom";
export type Composition = { version: 1; style: Style; template?: string; width: number; height: number; fps: number; duration: number;
  layers: Layer[]; params?: Record<string, unknown> };   // layers: bottom first

export type AssetLike = { id: string; kind: string; width: number | null; height: number | null; duration_s: number | null; has_audio: boolean | null;
  status?: string; analysis?: { subject_center_x?: number | null; subject_center_y?: number | null; face_count?: number; scenes?: unknown[] } | null; filename?: string };
export type Measure = (text: string, px: number) => number;
/** Rough width when no canvas is available (tests): bold sans averages ~0.56 em per character. */
export const roughMeasure: Measure = (t, px) => t.length * px * 0.56;

let n = 0;
export const lid = (p = "L") => `${p}${Date.now().toString(36).slice(-4)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

export const DEFAULT_ANIM: Anim = { in: "none", out: "none", frames: 12 };

// ------------------------------------------------------------------------------------------- geometry

/** Source region (crop fractions) and the scale/offset that put it in the layer's box. Same maths as the renderer. */
export function placeMedia(L: MediaLayer, a: { width: number; height: number }, W: number, H: number) {
  const sw = a.width, sh = a.height;
  const bw = L.box.w * W, bh = L.box.h * H;
  const z = clamp(L.zoom || 1, 1, 20);
  let rw: number, rh: number;
  if (L.fit === "cover") {
    const ra = bw / bh;
    if (sw / sh > ra) { rh = sh; rw = sh * ra; } else { rw = sw; rh = sw / ra; }
  } else { rw = sw; rh = sh; }
  rw = Math.max(sw * 0.04, rw / z); rh = Math.max(sh * 0.04, rh / z);
  const left = (sw - rw) * clamp(L.focus.x, 0, 1), top = (sh - rh) * clamp(L.focus.y, 0, 1);
  const crop = { left: r4(left / sw), right: r4(Math.max(0, (sw - rw - left) / sw)), top: r4(top / sh), bottom: r4(Math.max(0, (sh - rh - top) / sh)) };
  // shown size of the region: cover -> exactly the box; contain -> as large as fits in the box
  const s = L.fit === "cover" ? bw / rw : Math.min(bw / rw, bh / rh);
  const pw = rw * s;
  const fit0 = Math.min(W / rw, H / rh);         // what the renderer does at scale 1: fit the region into the canvas
  return { crop, scale: clamp(pw / (rw * fit0), 0.05, 10), x: (L.box.x - 0.5) * W, y: (L.box.y - 0.5) * H, pw, ph: rh * s };
}

/** Wrap text so each line fits the box width (box.w * W). */
export function wrapText(text: string, px: number, maxW: number, measure: Measure): string {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${word}` : word;
      if (!line || measure(t, px) <= maxW) line = t; else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out.join("\n").slice(0, 300);
}

function grade(fx?: LayerFx): ColorGrade | null {
  if (!fx || (!fx.brightness && (fx.contrast ?? 1) === 1 && (fx.saturation ?? 1) === 1)) return null;
  return { enabled: true, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], offset: [0, 0, 0], exposure: r4(clamp((fx.brightness ?? 0) * 2, -4, 4)),
    contrast: clamp(fx.contrast ?? 1, 0, 3), saturation: clamp(fx.saturation ?? 1, 0, 3), temperature: 0, tint: 0 };
}

/** Entrance/exit animation and Ken Burns as keyframes around the static transform. */
function animKeyframes(L: Base, len: number, st: { x: number; y: number; scale: number; opacity: number }, W: number, H: number): Keyframes | null {
  const a = L.anim ?? DEFAULT_ANIM;
  const f = clamp(Math.round(a.frames || 12), 2, Math.max(2, Math.floor(len / 2)));
  const kf: Record<string, Keyframe[]> = { x: [], y: [], scale: [], opacity: [] };
  const last = len - 1;
  const push = (p: string, t: number, v: number, ease: Keyframe["ease"] = "ease") => {
    const arr = kf[p]; t = clamp(Math.round(t), 0, last);
    if (arr.length && arr[arr.length - 1].t >= t) { if (arr[arr.length - 1].t === t) arr[arr.length - 1] = { t, v, ease }; return; }
    arr.push({ t, v, ease });
  };
  const kb = clamp(a.kenburns ?? 0, 0, 0.5);
  const sAt = (t: number) => st.scale * (1 + kb * (t / Math.max(1, last)));
  const dx = W * 0.6, dy = H * 0.35;
  // entrance
  if (a.in === "fade") { push("opacity", 0, 0); push("opacity", f, st.opacity); }
  if (a.in === "slide-up") { push("y", 0, st.y + dy); push("y", f, st.y); }
  if (a.in === "slide-down") { push("y", 0, st.y - dy); push("y", f, st.y); }
  if (a.in === "slide-left") { push("x", 0, st.x + dx); push("x", f, st.x); }
  if (a.in === "slide-right") { push("x", 0, st.x - dx); push("x", f, st.x); }
  if (a.in === "zoom-in") { push("scale", 0, sAt(0) * 0.7); push("scale", f, sAt(f)); }
  if (a.in === "pop") { push("scale", 0, sAt(0) * 0.6); push("scale", f * 0.65, sAt(f) * 1.08); push("scale", f, sAt(f)); }
  if (a.in.startsWith("slide") || a.in === "fade") { /* nothing else */ }
  // Ken Burns: slow zoom across the clip (between the entrance and the exit)
  if (kb > 0) { if (!kf.scale.length) push("scale", 0, sAt(0), "linear"); push("scale", last - (a.out === "none" ? 0 : f), sAt(last - (a.out === "none" ? 0 : f)), "linear"); }
  // exit
  const e0 = last - f;
  if (a.out === "fade") { if (!kf.opacity.length) push("opacity", 0, st.opacity); push("opacity", e0, st.opacity); push("opacity", last, 0); }
  if (a.out === "slide-up" || a.out === "slide-down") { if (!kf.y.length) push("y", 0, st.y); push("y", e0, st.y); push("y", last, st.y + (a.out === "slide-up" ? -dy : dy)); }
  if (a.out === "zoom-out") { if (!kf.scale.length) push("scale", 0, sAt(0)); push("scale", e0, sAt(e0)); push("scale", last, sAt(e0) * 0.7); }
  // user keyframes (normalized) — merged in after presets
  for (const p of ["x", "y", "scale"] as const) {
    const u = L.kf?.[p];
    if (u?.length) kf[p] = u.map((k) => ({ ...k, v: p === "x" ? (k.v - 0.5) * W : p === "y" ? (k.v - 0.5) * H : clamp(k.v * st.scale, 0.05, 10) }));
  }
  const out: Keyframes = {};
  for (const [p, arr] of Object.entries(kf)) if (arr.length >= 2 || (arr.length === 1 && arr[0].t > 0)) (out as any)[p] = arr.map((k) => ({ ...k,
    v: p === "scale" ? r4(clamp(k.v, 0.05, 10)) : p === "opacity" ? r4(clamp(k.v, 0, 1)) : r1(clamp(k.v, -10000, 10000)) }));
  return Object.keys(out).length ? out : null;
}

/** Frames a media layer can show (video: what's left after `in`; stills: unlimited). */
export function available(L: MediaLayer | AudioLayer, a: AssetLike | undefined, fps: number): number {
  if (!a || a.kind === "image" || !a.duration_s) return Number.MAX_SAFE_INTEGER;
  return Math.max(1, Math.floor(a.duration_s * fps) - L.in);
}

/** Composition -> ordinary timeline (top track first). Layers whose media isn't ready yet are left out. */
export function compileComposition(c: Composition, assets: Map<string, AssetLike>, measure: Measure = roughMeasure): Timeline {
  const W = c.width, H = c.height, fps = c.fps, short = Math.min(W, H);
  const video: Track[] = [], audio: Track[] = [];
  c.layers.forEach((L, i) => {
    const len0 = Math.max(1, Math.min(L.length ?? c.duration - L.start, c.duration - L.start));
    if (L.start >= c.duration) return;
    if (L.kind === "text") {
      if (!L.text.trim()) return;
      const fs = clamp(Math.round(L.size * short), 8, 400);
      const text = wrapText(L.text, fs, Math.max(fs, L.box.w * W - fs * 0.5), measure);
      const st = { x: r1((L.box.x - 0.5) * W), y: r1((L.box.y - 0.5) * H), scale: 1, opacity: clamp(L.opacity, 0, 1) };
      const clip: Clip = { id: `${L.id}c`, asset_id: null, start: L.start, in: 0, out: len0, volume: 1, fade_in: 0, fade_out: 0,
        transform: { x: st.x, y: st.y, scale: 1, rotation: clamp(L.rotation, -360, 360), opacity: st.opacity },
        title: { text, font_size: fs, color: L.color, bg_color: L.bg_color, bg_opacity: L.bg_opacity, align: L.align,
          stroke: clamp(Math.round(L.stroke * fs), 0, 24), stroke_color: L.stroke_color, shadow: clamp(L.shadow, 0, 1) },
        keyframes: animKeyframes(L, len0, st, W, H) };
      video.push({ id: `t${i}`, kind: "video", name: L.name.slice(0, 60), muted: false, hidden: !!L.hidden, locked: false, clips: [clip] });
      return;
    }
    const a = L.asset_id ? assets.get(L.asset_id) : undefined;
    if (!a || (a.status && a.status !== "ready")) return;
    if (L.kind === "audio") {
      if (!a.has_audio) return;
      const len = Math.min(len0, available(L, a, fps));
      audio.push({ id: `a${i}`, kind: "audio", name: L.name.slice(0, 60), muted: !!L.hidden, hidden: false, locked: false,
        clips: [{ id: `${L.id}c`, asset_id: a.id, start: L.start, in: L.in, out: L.in + len, volume: clamp(L.volume, 0, 4), fade_in: 0, fade_out: 0,
          transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 } }] });
      return;
    }
    if (a.kind !== "video" && a.kind !== "image") return;
    const len = Math.min(len0, available(L, a, fps));
    const sw = a.width || W, sh = a.height || H;
    const p = placeMedia(L, { width: sw, height: sh }, W, H);
    const st = { x: r1(p.x), y: r1(p.y), scale: r4(p.scale), opacity: clamp(L.opacity, 0, 1) };
    const fx = L.fx ?? {};
    const px = (v?: number) => (v ? r1(clamp(v * short, 0, 2000)) : 0);
    const cfx = { blur: px(fx.blur) && Math.min(200, px(fx.blur)), radius: px(fx.radius), border: Math.min(200, px(fx.border)),
      border_color: fx.border_color ?? "#ffffff", shadow: Math.min(200, px(fx.shadow)), shadow_opacity: clamp(fx.shadow_opacity ?? 0.6, 0, 1), flip_h: !!fx.flip_h };
    const hasFx = cfx.blur || cfx.radius || cfx.border || cfx.shadow || cfx.flip_h;
    const isImg = a.kind === "image";
    const crop = p.crop.left || p.crop.right || p.crop.top || p.crop.bottom ? p.crop : null;
    const clip: Clip = { id: `${L.id}c`, asset_id: a.id, start: L.start, in: isImg ? 0 : L.in, out: (isImg ? 0 : L.in) + len,
      volume: a.has_audio ? clamp(L.volume, 0, 4) : 1, fade_in: 0, fade_out: 0,
      transform: { x: st.x, y: st.y, scale: st.scale, rotation: clamp(L.rotation, -360, 360), opacity: st.opacity },
      crop, color: grade(fx), fx: hasFx ? cfx : null, keyframes: animKeyframes(L, len, st, W, H) };
    video.push({ id: `v${i}`, kind: "video", name: L.name.slice(0, 60), muted: L.volume === 0, hidden: !!L.hidden, locked: false, clips: [clip] });
  });
  const tracks = [...video.reverse(), ...audio].slice(0, 24);
  return { schema_version: 1, fps, width: W, height: H, tracks, composition: c };
}

// ------------------------------------------------------------------------------------------- layer factories

export type Slot = { asset: AssetLike };
const focusOf = (a?: AssetLike) => ({ x: a?.analysis?.subject_center_x ?? 0.5, y: a?.analysis?.subject_center_y != null ? clamp(a.analysis.subject_center_y - 0.1, 0, 1) : 0.5 });
export const aspectOf = (a?: AssetLike) => (a?.width && a?.height ? a.width / a.height : 16 / 9);

export function mediaLayer(role: string, name: string, a: AssetLike | null, box: Box, over: Partial<MediaLayer> = {}): MediaLayer {
  return { id: lid(), kind: "media", role, name, asset_id: a?.id ?? null, box, fit: "cover", focus: focusOf(a ?? undefined), zoom: 1, in: 0,
    volume: 1, opacity: 1, rotation: 0, start: 0, length: null, anim: { ...DEFAULT_ANIM }, ...over };
}
export function textLayer(role: string, text: string, box: Box, over: Partial<TextLayer> = {}): TextLayer {
  return { id: lid(), kind: "text", role, name: role[0].toUpperCase() + role.slice(1).replace(/-/g, " "), text, box, size: 0.06, color: "#ffffff",
    bg_color: null, bg_opacity: 0.6, align: "center", stroke: 0, stroke_color: "#000000", shadow: 0.6, opacity: 1, rotation: 0, start: 0, length: null,
    anim: { ...DEFAULT_ANIM }, ...over };
}
export const graphicLayer = (role: string, name: string, g: Graphic, over: Partial<MediaLayer> = {}) =>
  mediaLayer(role, name, null, { x: 0.5, y: 0.5, w: 1, h: 1 }, { graphic: g, volume: 0, ...over });

// ------------------------------------------------------------------------------------------- the seven styles

export type StyleParams = {
  panels?: number; gap?: number; radius?: number; border?: number; borderColor?: string; header?: string; footer?: string; caption?: string;
  cta?: string; bg?: "black" | "color" | "gradient" | "blur" | "image"; color?: string; color2?: string; blur?: number; dim?: number;
  frameW?: number; textColor?: string; accent?: string; textBg?: string | null; vignette?: boolean; grade?: "none" | "cinematic" | "warm" | "cool" | "punchy";
};
export const STYLES: { id: Exclude<Style, "custom">; name: string; blurb: string }[] = [
  { id: "stacked", name: "Stacked multi-video", blurb: "2–4 panels, each with its own clip, crop and zoom" },
  { id: "cinematic", name: "Full-screen cinematic", blurb: "Fills the frame, keeps faces in view, film grade" },
  { id: "text", name: "Top / bottom text", blurb: "Video in the middle, header above, footer below" },
  { id: "blur", name: "Blurred background", blurb: "Same clip blurred behind, sharp clip in front" },
  { id: "centered", name: "Centered video", blurb: "Smaller framed video on a colour, gradient or blur" },
  { id: "mixed", name: "Image + video", blurb: "Background image, main video, picture-in-picture, logo" },
];

const GRADES: Record<string, LayerFx> = { none: {}, cinematic: { contrast: 1.12, saturation: 0.92, brightness: -0.03 }, warm: { saturation: 1.12, brightness: 0.03 },
  cool: { saturation: 0.95, contrast: 1.05 }, punchy: { contrast: 1.2, saturation: 1.25 } };

function background(p: StyleParams, main: AssetLike | null, img: AssetLike | null): MediaLayer[] {
  const bg = p.bg ?? "black";
  if (bg === "blur" && main) return [mediaLayer("bg", "Blurred background", main, { x: 0.5, y: 0.5, w: 1, h: 1 },
    { volume: 0, fx: { blur: p.blur ?? 0.035, brightness: -(p.dim ?? 0.12), saturation: 1.1 }, locked: false })];
  if (bg === "image" && img) return [mediaLayer("bg", "Background image", img, { x: 0.5, y: 0.5, w: 1, h: 1 }, { volume: 0, fx: { brightness: -(p.dim ?? 0) } })];
  if (bg === "gradient") return [graphicLayer("bg", "Gradient background", { kind: "gradient", color: p.color ?? "#120a2a", color2: p.color2 ?? "#3b1d7a", angle: 180 })];
  if (bg === "color") return [graphicLayer("bg", "Colour background", { kind: "solid", color: p.color ?? "#0b0b14" })];
  return [];
}

/** Box (normalized) of a picture with aspect `ar` that fits inside (maxW, maxH), centred at (cx, cy). */
function fitBox(ar: number, W: number, H: number, maxW: number, maxH: number, cx = 0.5, cy = 0.5): Box {
  let w = maxW * W, h = w / ar;
  if (h > maxH * H) { h = maxH * H; w = h * ar; }
  return { x: cx, y: cy, w: w / W, h: h / H };
}

export type BuildInput = { width: number; height: number; fps: number; media: AssetLike[]; images?: AssetLike[]; logo?: AssetLike | null; params: StyleParams };

export function buildStyle(style: Exclude<Style, "custom">, inp: BuildInput): Layer[] {
  const { width: W, height: H, params: p } = inp;
  const vids = inp.media.length ? inp.media : [];
  const main = vids[0] ?? null;
  const img = inp.images?.[0] ?? null;
  const portrait = H >= W;
  const tcolor = p.textColor ?? "#ffffff";
  const L: Layer[] = [];
  const header = (y: number, maxW = 0.9, over: Partial<TextLayer> = {}) => p.header && L.push(textLayer("header", p.header, { x: 0.5, y, w: maxW, h: 0.1 },
    { size: portrait ? 0.062 : 0.07, color: tcolor, bg_color: p.textBg ?? null, stroke: p.textBg ? 0 : 0.06, shadow: 0.6, ...over }));
  const footer = (y: number, maxW = 0.9, over: Partial<TextLayer> = {}) => p.footer && L.push(textLayer("footer", p.footer, { x: 0.5, y, w: maxW, h: 0.08 },
    { size: portrait ? 0.05 : 0.056, color: p.accent ?? tcolor, bg_color: p.textBg ?? null, stroke: p.textBg ? 0 : 0.06, ...over }));
  const caption = (y: number) => p.caption && L.push(textLayer("caption", p.caption, { x: 0.5, y, w: 0.86, h: 0.08 },
    { size: portrait ? 0.048 : 0.056, color: "#ffffff", stroke: 0.08, stroke_color: "#000000", shadow: 0.5 }));
  const cta = (y: number) => p.cta && L.push(textLayer("cta", p.cta, { x: 0.5, y, w: 0.8, h: 0.06 },
    { size: portrait ? 0.042 : 0.052, color: "#0b0b14", bg_color: p.accent ?? "#7cff6b", bg_opacity: 1, shadow: 0, anim: { in: "pop", out: "none", frames: 12 } }));
  const look = GRADES[p.grade ?? "none"] ?? {};

  if (style === "stacked") {
    const n = clamp(p.panels ?? 3, 2, 6), gap = p.gap ?? 0.012;
    const top = p.header ? (portrait ? 0.14 : 0.16) : gap, bottom = p.footer ? (portrait ? 0.1 : 0.14) : gap;
    L.push(...background(p.bg === "blur" ? p : { ...p, bg: p.bg ?? "black" }, main, img));
    const span = 1 - top - bottom;
    for (let i = 0; i < n; i++) {
      const a = vids.length ? vids[i % vids.length] : null;
      const box: Box = portrait
        ? { x: 0.5, y: top + (span / n) * (i + 0.5), w: 1 - 2 * gap, h: span / n - gap }
        : { x: gap + ((1 - 2 * gap) / n) * (i + 0.5), y: top + span / 2, w: (1 - 2 * gap) / n - gap, h: span };
      // the same clip in every panel? start each panel at a different moment so they don't repeat
      const off = vids.length === 1 && a?.duration_s ? Math.floor(Math.min(a.duration_s / (2 * n), 2) * inp.fps * i) : 0;
      L.push(mediaLayer(`panel-${i}`, `Panel ${i + 1}`, a, box, { in: off, volume: i === 0 ? 1 : 0,
        fx: { radius: p.radius ?? 0.015, border: p.border ?? 0, border_color: p.borderColor ?? "#ffffff", ...look } }));
    }
    header(top / 2, 0.92); footer(1 - bottom / 2, 0.92);
  } else if (style === "cinematic") {
    L.push(mediaLayer("main", "Main video", main, { x: 0.5, y: 0.5, w: 1, h: 1 }, { fx: { ...(GRADES[p.grade ?? "cinematic"] ?? {}) },
      anim: { in: "fade", out: "none", frames: 10, kenburns: 0.06 } }));
    if (p.vignette !== false) L.push(graphicLayer("vignette", "Vignette", { kind: "vignette", color: "#000000", strength: 0.75 }));
    header(portrait ? 0.14 : 0.12, 0.9, { anim: { in: "fade", out: "none", frames: 15 } });
    caption(portrait ? 0.74 : 0.82); cta(portrait ? 0.86 : 0.9);
  } else if (style === "text") {
    L.push(...background(p, main, img));
    const vb = fitBox(aspectOf(main ?? undefined), W, H, portrait ? 1 : 0.72, portrait ? 0.62 : 0.66, 0.5, portrait ? 0.5 : 0.53);
    L.push(mediaLayer("main", "Main video", main, vb, { fit: "contain", fx: { radius: p.radius ?? 0, border: p.border ?? 0, border_color: p.borderColor ?? "#ffffff", ...look } }));
    const above = vb.y - vb.h / 2, below = vb.y + vb.h / 2;
    header(Math.max(0.07, above - (portrait ? 0.07 : 0.08)), 0.92); footer(Math.min(0.93, below + (portrait ? 0.06 : 0.08)), 0.92);
    caption(below - vb.h * 0.12); cta(Math.min(0.95, below + (portrait ? 0.15 : 0.16)));
  } else if (style === "blur") {
    L.push(...background({ ...p, bg: "blur" }, main, img));
    const room = !!(p.header || p.footer);
    const vb = fitBox(aspectOf(main ?? undefined), W, H, 1, portrait ? 0.78 : room ? 0.7 : 1, 0.5, p.header && !portrait ? 0.54 : 0.5);
    L.push(mediaLayer("main", "Main video", main, vb, { fit: "contain", fx: { radius: p.radius ?? 0, shadow: p.radius ? 0.012 : 0, ...look } }));
    header(Math.max(0.08, vb.y - vb.h / 2 - 0.06)); footer(Math.min(0.93, vb.y + vb.h / 2 + 0.05)); caption(vb.y + vb.h / 2 - vb.h * 0.12); cta(0.9);
  } else if (style === "centered") {
    L.push(...background({ ...p, bg: p.bg ?? "gradient" }, main, img));
    const fw = p.frameW ?? (portrait ? 0.84 : 0.6);
    const vb = fitBox(aspectOf(main ?? undefined), W, H, fw, portrait ? 0.6 : 0.68, 0.5, 0.5);
    L.push(mediaLayer("main", "Main video", main, vb, { fit: "contain", fx: { radius: p.radius ?? 0.03, border: p.border ?? 0.006, border_color: p.borderColor ?? "#ffffff", shadow: 0.02, shadow_opacity: 0.7, ...look } }));
    header(Math.max(0.08, vb.y - vb.h / 2 - 0.08)); footer(Math.min(0.93, vb.y + vb.h / 2 + 0.07)); cta(0.92);
  } else if (style === "mixed") {
    if (img) L.push(mediaLayer("bg", "Background image", img, { x: 0.5, y: 0.5, w: 1, h: 1 }, { volume: 0, fx: { brightness: -(p.dim ?? 0.1) } }));
    else L.push(...background({ ...p, bg: p.bg === "blur" ? "blur" : "gradient" }, main, img));
    const vb = fitBox(aspectOf(main ?? undefined), W, H, portrait ? 0.92 : 0.62, portrait ? 0.5 : 0.6, portrait ? 0.5 : 0.42, portrait ? 0.44 : 0.55);
    L.push(mediaLayer("main", "Main video", main, vb, { fit: "contain", fx: { radius: p.radius ?? 0.025, shadow: 0.02, ...look } }));
    const second = vids[1] ?? null;
    if (second) {
      const pw = portrait ? 0.42 : 0.26;
      const sb = fitBox(aspectOf(second), W, H, pw, 0.3, portrait ? 0.72 : 0.82, portrait ? 0.8 : 0.72);
      L.push(mediaLayer("pip", "Picture-in-picture", second, sb, { fit: "contain", volume: 0,
        fx: { radius: 0.02, border: 0.005, border_color: p.accent ?? "#7cff6b", shadow: 0.015 }, anim: { in: "pop", out: "none", frames: 14 } }));
    }
    if (inp.logo) L.push(mediaLayer("logo", "Logo", inp.logo, fitBox(aspectOf(inp.logo), W, H, portrait ? 0.18 : 0.1, 0.1, portrait ? 0.14 : 0.08, portrait ? 0.07 : 0.1), { fit: "contain", volume: 0 }));
    header(portrait ? 0.1 : 0.1, portrait ? 0.9 : 0.6); footer(portrait ? 0.92 : 0.93);
  }
  return L;
}

// ------------------------------------------------------------------------------------------- templates

export type Template = { id: string; name: string; category: string; style: Exclude<Style, "custom">; params: StyleParams; tags: string[]; custom?: boolean };
export const CATEGORIES = ["Podcast Shorts", "Cinematic Shorts", "Mythology Edits", "Educational Shorts", "Reaction Videos", "Music Videos", "Dance Videos",
  "Gaming Clips", "Motivation Videos", "News Clips", "Comparison Videos", "Storytelling", "Before and After", "Image Slideshow", "Multi-Video Collage"];
export const TEMPLATES: Template[] = [
  { id: "podcast-blur", name: "Podcast · blurred", category: "Podcast Shorts", style: "blur", tags: ["talk", "interview"],
    params: { header: "The one thing nobody tells you", caption: "", dim: 0.18 } },
  { id: "podcast-card", name: "Podcast · card", category: "Podcast Shorts", style: "centered", tags: ["talk"],
    params: { bg: "gradient", color: "#0d0d1a", color2: "#2b1b5a", header: "Podcast clip", footer: "Full episode on the channel", radius: 0.035 } },
  { id: "cine-full", name: "Cinematic full screen", category: "Cinematic Shorts", style: "cinematic", tags: ["film", "vlog"],
    params: { grade: "cinematic", vignette: true, caption: "" } },
  { id: "cine-bars", name: "Letterbox quote", category: "Cinematic Shorts", style: "text", tags: ["quote", "status"],
    params: { header: "Don't go back to the place where you lost your smile", textColor: "#ffffff", grade: "cinematic", bg: "black" } },
  { id: "myth-stack", name: "Mythology triple stack", category: "Mythology Edits", style: "stacked", tags: ["epic", "scenes"],
    params: { panels: 3, gap: 0.004, radius: 0, grade: "punchy" } },
  { id: "myth-epic", name: "Epic title", category: "Mythology Edits", style: "cinematic", tags: ["epic"],
    params: { grade: "warm", header: "कर्म ही धर्म है", vignette: true } },
  { id: "edu-header", name: "Explainer header", category: "Educational Shorts", style: "text", tags: ["science", "how"],
    params: { header: "THIS V8 DOESN'T NEED FUEL", textColor: "#ffffff", accent: "#ffd400", radius: 0.02, footer: "" } },
  { id: "edu-pip", name: "Demo + side panel", category: "Educational Shorts", style: "mixed", tags: ["tutorial"],
    params: { header: "How it works", bg: "gradient", color: "#06121f", color2: "#0f3b57" } },
  { id: "react-2", name: "Reaction · two panels", category: "Reaction Videos", style: "stacked", tags: ["reaction"],
    params: { panels: 2, gap: 0.006, radius: 0.012 } },
  { id: "react-pip", name: "Reaction · picture-in-picture", category: "Reaction Videos", style: "mixed", tags: ["reaction"],
    params: { bg: "blur", header: "" } },
  { id: "music-lyrics", name: "Lyrics card", category: "Music Videos", style: "centered", tags: ["song", "lyrics"],
    params: { bg: "blur", header: "Song ✕ Sukoon ✓", footer: "Both voices melted my heart", radius: 0.02, border: 0 } },
  { id: "music-full", name: "Music full screen", category: "Music Videos", style: "cinematic", tags: ["song"], params: { grade: "warm", caption: "♪ Now playing" } },
  { id: "dance-pov", name: "POV dance", category: "Dance Videos", style: "text", tags: ["dance", "pov"],
    params: { header: "POV: wait for the last step", footer: "Subscribe for more", textColor: "#fff27a", accent: "#ffffff", bg: "blur" } },
  { id: "game-stack", name: "Gameplay + facecam", category: "Gaming Clips", style: "stacked", tags: ["gaming"], params: { panels: 2, gap: 0, radius: 0 } },
  { id: "motivation", name: "Motivation quote", category: "Motivation Videos", style: "cinematic", tags: ["quote"],
    params: { grade: "cinematic", header: "Discipline beats motivation", vignette: true } },
  { id: "news", name: "News clip", category: "News Clips", style: "text", tags: ["news"],
    params: { header: "BREAKING", footer: "Source: on-screen", textBg: "#d61f2c", textColor: "#ffffff", bg: "color", color: "#0a0a0f" } },
  { id: "compare", name: "Side by side", category: "Comparison Videos", style: "stacked", tags: ["vs"], params: { panels: 2, header: "Which one?", gap: 0.008, border: 0.004 } },
  { id: "story", name: "Storytelling", category: "Storytelling", style: "blur", tags: ["story"], params: { header: "Part 1", caption: "", dim: 0.25 } },
  { id: "before-after", name: "Before / after", category: "Before and After", style: "stacked", tags: ["transformation"],
    params: { panels: 2, header: "Before → After", gap: 0.01, border: 0.004, borderColor: "#7cff6b" } },
  { id: "slideshow", name: "Photo slideshow", category: "Image Slideshow", style: "cinematic", tags: ["photos"], params: { grade: "warm", vignette: false } },
  { id: "collage4", name: "Four-clip collage", category: "Multi-Video Collage", style: "stacked", tags: ["collage"], params: { panels: 4, gap: 0.006, radius: 0.01 } },
];

/** A template with real media layers. Graphics (gradients, vignettes) get assets when the studio applies it. */
export function applyTemplate(t: { style: Exclude<Style, "custom">; params: StyleParams; id?: string; name?: string }, inp: Omit<BuildInput, "params">,
  duration: number): Composition {
  return { version: 1, style: t.style, template: t.id, width: inp.width, height: inp.height, fps: inp.fps, duration,
    layers: buildStyle(t.style, { ...inp, params: t.params }), params: t.params as Record<string, unknown> };
}

/** Change the canvas. Generated layouts are recalculated for the new shape (keeping media, text, looks and timing);
 *  layers the creator added or moved keep their normalized place. */
export function changeCanvas(c: Composition, width: number, height: number, assets: Map<string, AssetLike>): Composition {
  if (c.style === "custom" || !c.params) return { ...c, width, height };
  const media = c.layers.filter((l): l is MediaLayer => l.kind === "media" && l.role.startsWith("panel") || (l.kind === "media" && l.role === "main"))
    .map((l) => (l.asset_id ? assets.get(l.asset_id) : undefined)).filter(Boolean) as AssetLike[];
  const pip = c.layers.find((l) => l.kind === "media" && l.role === "pip") as MediaLayer | undefined;
  if (pip?.asset_id && assets.get(pip.asset_id) && !media.find((m) => m.id === pip.asset_id)) media.splice(1, 0, assets.get(pip.asset_id)!);
  const bgImg = c.layers.find((l) => l.kind === "media" && l.role === "bg" && !l.graphic && l.fx?.blur == null) as MediaLayer | undefined;
  const logo = c.layers.find((l) => l.kind === "media" && l.role === "logo") as MediaLayer | undefined;
  const texts = Object.fromEntries(c.layers.filter((l): l is TextLayer => l.kind === "text").map((l) => [l.role, l.text]));
  const fresh = buildStyle(c.style, { width, height, fps: c.fps, media: dedupe(media), images: bgImg?.asset_id ? [assets.get(bgImg.asset_id)!].filter(Boolean) : [],
    logo: logo?.asset_id ? assets.get(logo.asset_id) ?? null : null,
    params: { ...(c.params as StyleParams), header: texts.header ?? "", footer: texts.footer ?? "", caption: texts.caption ?? "", cta: texts.cta ?? "" } });
  const byRole = new Map(fresh.map((l) => [l.role, l]));
  const used = new Set<string>();
  const layers = c.layers.map((old) => {
    const nu = byRole.get(old.role);
    if (!nu || old.role === "custom" || old.kind !== nu.kind) return old;
    used.add(old.role);
    if (old.pinned) return old;
    if (old.kind === "text" && nu.kind === "text") return { ...old, box: nu.box, size: nu.size };
    if (old.kind === "media" && nu.kind === "media") return { ...old, box: nu.box };
    return old;
  });
  // layers the new shape needs that weren't there (e.g. more panels) are added in their place
  for (const l of fresh) if (!used.has(l.role) && !c.layers.some((o) => o.role === l.role)) {
    const at = l.kind === "text" ? layers.length : Math.max(0, layers.findIndex((o) => o.kind === "text"));
    layers.splice(at < 0 ? layers.length : at, 0, l);
  }
  return { ...c, width, height, layers };
}
const dedupe = (xs: AssetLike[]) => xs.filter((x, i) => xs.findIndex((y) => y.id === x.id) === i);

/** Template data saved by a creator: media replaced by numbered slots so it can be reused with other clips. */
export function toTemplateData(c: Composition): { style: Style; params?: Record<string, unknown>; layers: Layer[] } {
  const slots: string[] = [];
  const layers = c.layers.map((l) => {
    if ((l.kind === "media" || l.kind === "audio") && l.asset_id && !(l.kind === "media" && l.graphic)) {
      let i = slots.indexOf(l.asset_id);
      if (i < 0) { slots.push(l.asset_id); i = slots.length - 1; }
      return { ...l, asset_id: null, slot: i };
    }
    return l.kind === "media" && l.graphic ? { ...l, asset_id: null } : l;
  });
  return { style: c.style, params: c.params, layers };
}
export function fromTemplateData(d: { style: Style; params?: Record<string, unknown>; layers: Layer[] }, media: AssetLike[], base: { width: number; height: number; fps: number; duration: number }): Composition {
  const layers = d.layers.map((l) => {
    const copy = { ...l, id: lid() } as Layer;
    if ((copy.kind === "media" || copy.kind === "audio") && copy.slot != null) copy.asset_id = media.length ? media[copy.slot % media.length].id : null;
    return copy;
  });
  return { version: 1, style: d.style === "custom" ? "custom" : d.style, width: base.width, height: base.height, fps: base.fps, duration: base.duration, layers, params: d.params };
}

// ------------------------------------------------------------------------------------------- AI layout suggestions

export type Suggestion = { template: string; reason: string[]; confidence: "low" | "medium" | "high" };
/** Layout suggestions from what was measured about the uploaded media (orientation, faces, scene cuts, transcript).
 *  Rules, not guesses: every reason names the measurement it came from. Nothing is applied until the creator picks one. */
export function suggestLayouts(media: AssetLike[], images: AssetLike[], target: { width: number; height: number }): Suggestion[] {
  const out: Suggestion[] = [];
  const v = media[0];
  if (!v) return images.length ? [{ template: "slideshow", reason: [`${images.length} image(s) and no video: a photo slideshow with slow zoom fits`], confidence: "medium" }] : [];
  const ar = aspectOf(v), tar = target.width / target.height;
  const an = v.analysis ?? {};
  const faces = an.face_count ?? null, scenes = Array.isArray(an.scenes) ? an.scenes.length : null;
  const dur = v.duration_s ?? 0;
  const transcript = (an as any).transcript?.segments?.length ?? 0;
  const orient = ar > 1.2 ? "landscape" : ar < 0.85 ? "portrait" : "square";
  const why = (s: string) => s;
  const wide = ar > tar * 1.25;
  if (faces != null && faces >= 1 && (transcript > 3 || (scenes != null && scenes <= Math.max(2, dur / 20)))) {
    out.push({ template: wide ? "podcast-blur" : "podcast-card", confidence: transcript > 3 ? "high" : "medium", reason: [
      why(`${faces === 1 ? "One person" : `${faces} people`} on screen in most sampled frames`),
      scenes != null ? why(`Few scene changes (${scenes} in ${Math.round(dur)} s) — a talking clip`) : "",
      transcript ? why(`Speech found (${transcript} transcript lines) — captions will be readable`) : "",
      wide ? why(`${orient} source into a taller frame: blurred background avoids cutting people out`) : ""].filter(Boolean) });
  }
  if (faces != null && faces >= 2) out.push({ template: "react-2", confidence: "medium", reason: [`${faces} faces detected — two panels can frame each person separately`] });
  if (scenes != null && dur > 0 && scenes / Math.max(1, dur) > 0.25) {
    out.push({ template: "myth-stack", confidence: "medium", reason: [`Fast cutting (${scenes} scene changes in ${Math.round(dur)} s) — stacked panels show several moments at once`] });
    out.push({ template: "cine-full", confidence: "medium", reason: ["Many scene changes suit a full-screen cinematic cut", "Face-aware crop keeps the subject in frame"] });
  }
  if (media.length >= 2) out.push({ template: media.length >= 4 ? "collage4" : "compare", confidence: "high",
    reason: [`${media.length} videos selected — ${media.length >= 4 ? "a collage" : "side-by-side panels"} use all of them`] });
  if (images.length && media.length) out.push({ template: "edu-pip", confidence: "medium", reason: ["An image and a video: image as background, video in front"] });
  if (wide) out.push({ template: "cine-bars", confidence: "medium", reason: [`${orient} source (${v.width}×${v.height}) in a ${target.width}×${target.height} frame leaves room above and below for text`] });
  if (!wide) out.push({ template: "cine-full", confidence: "medium", reason: [`Source shape (${orient}) already close to the output — it can fill the frame without heavy cropping`] });
  out.push({ template: "podcast-blur", confidence: "low", reason: ["Safe default: the whole picture stays visible over a blurred copy of itself"] });
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.template) ? false : (seen.add(s.template), true))).slice(0, 4);
}

/** Longest the composition can run without any video layer running out (capped, default 60 s). */
export function fitDuration(layers: Layer[], assets: Map<string, AssetLike>, fps: number, cap = 60 * fps): number {
  let d = cap;
  for (const l of layers) {
    if (l.kind !== "media" || l.hidden || !l.asset_id) continue;
    const a = assets.get(l.asset_id);
    if (a && a.kind === "video" && a.duration_s) d = Math.min(d, l.start + available(l, a, fps));
  }
  return Math.max(1, d === cap && !layers.some((l) => l.kind === "media" && l.asset_id) ? 5 * fps : d);
}

/** Every layer that still needs a generated still (gradient, vignette…) — keyed so identical graphics are made once. */
export const graphicKey = (g: Graphic, w: number, h: number) => `${g.kind}|${g.color}|${g.color2 ?? ""}|${g.angle ?? 180}|${g.strength ?? 0.8}|${w}x${h}`;
