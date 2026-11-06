// Animated title templates: ordinary title clips + keyframes, so they render identically in preview and export and
// stay fully editable (text, colour, timing, keyframes) after they are placed.
import type { Keyframes } from "./keyframes";
import { DEFAULT_TRANSFORM, Timeline, Title, Transform, insertTitle, updateClip } from "./timeline";

export type TitleTemplate = { id: string; name: string; desc: string; seconds: number; sample: string;
  make: (W: number, H: number, fps: number, frames: number) => { title: Title; transform: Transform; keyframes: Keyframes; fade_in: number; fade_out: number } };

const k = (t: number, v: number, ease: "linear" | "ease" | "hold" = "ease") => ({ t: Math.max(0, Math.round(t)), v: +v.toFixed(3), ease });
const T = (text: string, font_size: number, color = "#ffffff", bg_color: string | null = null, bg_opacity = 0.75): Title => ({ text, font_size: Math.round(font_size), color, bg_color, bg_opacity });

export const TITLE_TEMPLATES: TitleTemplate[] = [
  { id: "lower-third", name: "Lower third — slide in", desc: "Name + role, slides in from the left and out again", seconds: 5, sample: "Your Name",
    make: (W, H, fps, n) => ({ title: T("Your Name\nCreator · Travel", H * 0.045, "#ffffff", "#0b0b14", 0.8), transform: { ...DEFAULT_TRANSFORM, y: H * 0.3 },
      keyframes: { x: [k(0, -W * 0.75), k(fps * 0.45, -W * 0.28, "hold"), k(n - fps * 0.45, -W * 0.28), k(n - 1, -W * 0.75)] }, fade_in: 0, fade_out: 0 }) },
  { id: "intro-zoom", name: "Intro title — zoom", desc: "Big title that zooms and fades in", seconds: 4, sample: "MY TRAVEL VLOG",
    make: (_W, H, fps) => ({ title: T("MY TRAVEL VLOG", H * 0.11), transform: { ...DEFAULT_TRANSFORM },
      keyframes: { scale: [k(0, 0.6), k(fps * 0.6, 1)], opacity: [k(0, 0, "linear"), k(fps * 0.4, 1, "linear")] }, fade_in: 0, fade_out: Math.round(fps * 0.35) }) },
  { id: "subscribe-pop", name: "Subscribe reminder — pop", desc: "Red pill that pops in and out", seconds: 3, sample: "SUBSCRIBE",
    make: (_W, H, fps, n) => ({ title: T("SUBSCRIBE FOR MORE", H * 0.05, "#ffffff", "#dc2626", 1), transform: { ...DEFAULT_TRANSFORM, y: H * 0.34 },
      keyframes: { scale: [k(0, 0.05), k(fps * 0.25, 1.15), k(fps * 0.45, 1, "hold"), k(n - fps * 0.3, 1), k(n - 1, 0.05)] }, fade_in: 0, fade_out: 0 }) },
  { id: "chapter", name: "Chapter title — rise", desc: "Rises up and fades in, fades out", seconds: 4, sample: "Chapter 1",
    make: (_W, H, fps) => ({ title: T("Chapter 1 — The Beach", H * 0.06), transform: { ...DEFAULT_TRANSFORM },
      keyframes: { y: [k(0, H * 0.05), k(fps * 0.5, 0)], opacity: [k(0, 0, "linear"), k(fps * 0.5, 1, "linear")] }, fade_in: 0, fade_out: Math.round(fps * 0.4) }) },
  { id: "location", name: "Location tag — slide", desc: "Small tag that slides in from the right", seconds: 4, sample: "GOA · INDIA",
    make: (W, H, fps, n) => ({ title: T("GOA · INDIA", H * 0.04, "#ffffff", "#000000", 0.55), transform: { ...DEFAULT_TRANSFORM, y: -H * 0.36 },
      keyframes: { x: [k(0, W * 0.7), k(fps * 0.45, W * 0.32, "hold"), k(n - fps * 0.4, W * 0.32), k(n - 1, W * 0.7)] }, fade_in: 0, fade_out: 0 }) },
  { id: "hindi-hello", name: "Hindi greeting — swing", desc: "नमस्ते with a small swing (any Indian script works)", seconds: 3, sample: "नमस्ते",
    make: (_W, H, fps) => ({ title: T("नमस्ते दोस्तों!", H * 0.09, "#fde047"), transform: { ...DEFAULT_TRANSFORM },
      keyframes: { rotation: [k(0, -8), k(fps * 0.5, 0)], scale: [k(0, 0.8), k(fps * 0.5, 1)], opacity: [k(0, 0, "linear"), k(fps * 0.3, 1, "linear")] }, fade_in: 0, fade_out: Math.round(fps * 0.3) }) },
  { id: "end-card", name: "End card — settle", desc: "Slow settle-in for the last seconds", seconds: 5, sample: "THANKS!",
    make: (_W, H, fps) => ({ title: T("THANKS FOR WATCHING", H * 0.08), transform: { ...DEFAULT_TRANSFORM },
      keyframes: { scale: [k(0, 1.12), k(fps * 1.0, 1)], opacity: [k(0, 0, "linear"), k(fps * 0.6, 1, "linear")] }, fade_in: 0, fade_out: Math.round(fps * 0.5) }) },
  { id: "quote", name: "Quote card — fade", desc: "Light card for quotes and key points", seconds: 5, sample: "“Quote”",
    make: (_W, H, fps) => ({ title: T("“Travel is the only thing you buy\nthat makes you richer.”", H * 0.042, "#111111", "#ffffff", 0.92), transform: { ...DEFAULT_TRANSFORM },
      keyframes: {}, fade_in: Math.round(fps * 0.4), fade_out: Math.round(fps * 0.4) }) },
];

/** Place a template at `start` on the titles track (or the first free video track). */
export function insertTemplate(tl: Timeline, tpl: TitleTemplate, start: number): { tl: Timeline; id: string } | null {
  const frames = Math.round(tpl.seconds * tl.fps);
  const m = tpl.make(tl.width, tl.height, tl.fps, frames);
  const tracks = [tl.tracks.find((t) => t.id === "v2"), ...tl.tracks.filter((t) => t.kind === "video" && t.id !== "v2")].filter(Boolean);
  for (const t of tracks) {
    const r = insertTitle(tl, t!.id, start, frames, m.title);
    if (!r) continue;
    const kf = Object.keys(m.keyframes).length ? m.keyframes : null;
    const u = updateClip(r.tl, r.id, { transform: m.transform, keyframes: kf, fade_in: m.fade_in, fade_out: m.fade_out });
    if (u) return { tl: u, id: r.id };
  }
  return null;
}
