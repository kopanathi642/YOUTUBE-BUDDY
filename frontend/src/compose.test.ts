import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { AssetLike, CATEGORIES, RATIOS, STYLES, TEMPLATES, applyTemplate, canvasFor, changeCanvas, compileComposition, fitDuration,
  fromTemplateData, mediaLayer, placeMedia, ratioOf, suggestLayouts, toTemplateData, Composition, MediaLayer } from "./compose";

const LAND: AssetLike = { id: "A_LAND", kind: "video", width: 1280, height: 720, duration_s: 4, has_audio: true, status: "ready",
  analysis: { subject_center_x: 0.62, subject_center_y: 0.4, face_count: 1, scenes: [0, 1] } };
const PORT: AssetLike = { id: "A_PORT", kind: "video", width: 360, height: 640, duration_s: 3, has_audio: true, status: "ready", analysis: { face_count: 0 } };
const IMG: AssetLike = { id: "A_IMG", kind: "image", width: 400, height: 200, duration_s: null, has_audio: false, status: "ready" };
const assets = new Map([LAND, PORT, IMG].map((a) => [a.id, a]));

function checkTimeline(tl: ReturnType<typeof compileComposition>) {
  expect(tl.width % 2).toBe(0); expect(tl.height % 2).toBe(0);
  expect(tl.tracks.length).toBeLessThanOrEqual(24);
  for (const t of tl.tracks) for (const c of t.clips) {
    expect(c.out).toBeGreaterThan(c.in);
    expect(c.transform.scale).toBeGreaterThanOrEqual(0.05); expect(c.transform.scale).toBeLessThanOrEqual(10);
    if (c.crop) { expect(c.crop.left + c.crop.right).toBeLessThanOrEqual(0.96); expect(c.crop.top + c.crop.bottom).toBeLessThanOrEqual(0.96); }
    for (const [p, arr] of Object.entries(c.keyframes ?? {})) {
      const ts = (arr as any[]).map((k) => k.t);
      expect(ts).toEqual([...ts].sort((a, b) => a - b)); expect(new Set(ts).size).toBe(ts.length);
      expect(Math.max(...ts)).toBeLessThan(c.out - c.in);
      if (p === "scale") for (const k of arr as any[]) expect(k.v).toBeGreaterThanOrEqual(0.05);
    }
    if (c.title) { expect(c.title.font_size).toBeGreaterThanOrEqual(8); expect(c.title.font_size).toBeLessThanOrEqual(400); }
  }
}

describe("geometry", () => {
  it("cover fills the box exactly, keeps the source shape and the subject", () => {
    const L = mediaLayer("p", "P", LAND, { x: 0.5, y: 0.25, w: 1, h: 0.3 });
    const p = placeMedia(L, { width: 1280, height: 720 }, 1080, 1920);
    expect(p.pw).toBeCloseTo(1080, 3); expect(p.ph).toBeCloseTo(576, 3);
    const rw = 1280 * (1 - p.crop.left - p.crop.right), rh = 720 * (1 - p.crop.top - p.crop.bottom);
    expect(rw / rh).toBeCloseTo(1080 / 576, 2);                               // no stretching
    expect(p.y).toBeCloseTo(-480);
    const narrow = placeMedia(mediaLayer("p", "P", LAND, { x: 0.5, y: 0.5, w: 0.3, h: 1 }), { width: 1280, height: 720 }, 1080, 1920);
    const keep = 1 - narrow.crop.left - narrow.crop.right;
    expect(narrow.crop.left / (narrow.crop.left + narrow.crop.right)).toBeCloseTo(0.62, 2);   // face at 62% stays in view
    expect(keep).toBeGreaterThan(0.04);
  });
  it("contain keeps the whole picture inside the box", () => {
    const L = mediaLayer("m", "M", LAND, { x: 0.5, y: 0.5, w: 1, h: 1 }, { fit: "contain" });
    const p = placeMedia(L, { width: 1280, height: 720 }, 1080, 1920);
    expect(p.crop).toEqual({ left: 0, right: 0, top: 0, bottom: 0 }); expect(p.pw).toBeCloseTo(1080); expect(p.ph).toBeCloseTo(607.5);
    expect(p.scale).toBeCloseTo(1);
  });
  it("ratios and canvas sizes", () => {
    expect(RATIOS.map((r) => r.id)).toEqual(["9:16", "4:5", "2:3", "1:1", "16:9", "3:2"]);
    for (const r of RATIOS) expect(ratioOf(r.w, r.h)).toBe(r.id);
    expect(ratioOf(1000, 1250)).toBe("4:5"); expect(ratioOf(1000, 1300)).toBe("custom");
    expect(canvasFor(21, 9)).toEqual({ width: 1920, height: 822 });
  });
});

describe("every style on every ratio", () => {
  for (const s of STYLES) for (const r of RATIOS) it(`${s.id} @ ${r.id}`, () => {
    const c = applyTemplate({ style: s.id, params: { header: "Header text that is quite long for one line", footer: "Footer", caption: "Caption", cta: "Subscribe", panels: 3 } },
      { width: r.w, height: r.h, fps: 30, media: [LAND, PORT], images: [IMG], logo: IMG }, 90);
    const tl = compileComposition(c, assets);
    checkTimeline(tl);
    expect(tl.tracks.filter((t) => t.kind === "video" && t.clips.some((c) => c.asset_id)).length).toBeGreaterThan(0);
    for (const L of c.layers) if (L.kind !== "audio") {          // nothing placed off the canvas
      expect(L.box.x).toBeGreaterThanOrEqual(0); expect(L.box.x).toBeLessThanOrEqual(1);
      expect(L.box.y).toBeGreaterThanOrEqual(0); expect(L.box.y).toBeLessThanOrEqual(1);
    }
  });
});

describe("templates, canvas changes, saving", () => {
  it("all categories have templates and all templates build", () => {
    for (const cat of CATEGORIES) expect(TEMPLATES.some((t) => t.category === cat)).toBe(true);
    for (const t of TEMPLATES) checkTimeline(compileComposition(applyTemplate(t, { width: 1080, height: 1920, fps: 30, media: [LAND], images: [IMG] }, 60), assets));
  });
  it("changing the ratio recalculates generated layers and keeps hand-placed ones", () => {
    let c = applyTemplate(TEMPLATES.find((t) => t.id === "myth-stack")!, { width: 1080, height: 1920, fps: 30, media: [LAND] }, 60);
    const custom = mediaLayer("custom", "Sticker", IMG, { x: 0.8, y: 0.2, w: 0.2, h: 0.1 }, { fit: "contain" });
    c = { ...c, layers: [...c.layers, custom] };
    const wide = changeCanvas(c, 1920, 1080, assets);
    const panels = wide.layers.filter((l) => l.role.startsWith("panel")) as MediaLayer[];
    expect(panels).toHaveLength(3);
    expect(new Set(panels.map((p) => p.box.y)).size).toBe(1);                   // landscape: panels side by side
    expect(panels.map((p) => p.id)).toEqual(c.layers.filter((l) => l.role.startsWith("panel")).map((l) => l.id));   // same layers kept
    expect((wide.layers.find((l) => l.role === "custom") as MediaLayer).box).toEqual(custom.box);
    checkTimeline(compileComposition(wide, assets));
  });
  it("templates saved with slots work with other media", () => {
    const c = applyTemplate(TEMPLATES[0], { width: 1080, height: 1920, fps: 30, media: [LAND] }, 60);
    const d = toTemplateData(c);
    expect(JSON.stringify(d)).not.toContain("A_LAND");
    const again = fromTemplateData(d, [PORT], { width: 1080, height: 1350, fps: 30, duration: 60 });
    expect(again.layers.filter((l) => l.kind === "media" && !l.graphic).every((l) => (l as MediaLayer).asset_id === "A_PORT")).toBe(true);
  });
  it("duration fits the shortest video and suggestions explain themselves", () => {
    const c = applyTemplate(TEMPLATES.find((t) => t.id === "compare")!, { width: 1080, height: 1920, fps: 30, media: [LAND, PORT] }, 60);
    expect(fitDuration(c.layers, assets, 30)).toBe(90);
    const sug = suggestLayouts([LAND], [], { width: 1080, height: 1920 });
    expect(sug.length).toBeGreaterThan(0);
    for (const s of sug) { expect(TEMPLATES.some((t) => t.id === s.template)).toBe(true); expect(s.reason.length).toBeGreaterThan(0); }
    expect(suggestLayouts([LAND, PORT], [], { width: 1080, height: 1920 }).some((s) => s.template === "compare")).toBe(true);
  });
});

// Fixtures for the server-side render test (real FFmpeg output of every style on every ratio).
if (process.env.WRITE_FIXTURES) {
  it("writes render fixtures", () => {
    const dir = "../backend/tests/fixtures/compositions";
    mkdirSync(dir, { recursive: true });
    const out: Record<string, unknown> = {};
    for (const s of STYLES) for (const r of RATIOS) {
      const small = canvasFor(r.w, r.h, 640);
      let c: Composition = applyTemplate({ style: s.id, params: { header: "Header", footer: "Footer", panels: 3, bg: s.id === "centered" ? "gradient" : undefined } },
        { width: small.width, height: small.height, fps: 30, media: [LAND, PORT], images: [IMG], logo: IMG }, 30);
      c = { ...c, layers: c.layers.map((l) => (l.kind === "media" && l.graphic ? { ...l, asset_id: `G_${l.graphic.kind}` } : l)) };
      const g = new Map(assets);
      for (const k of ["solid", "gradient", "vignette", "light_leak"]) g.set(`G_${k}`, { id: `G_${k}`, kind: "image", width: small.width, height: small.height, duration_s: null, has_audio: false, status: "ready" });
      out[`${s.id}@${r.id}`] = compileComposition(c, g);
    }
    writeFileSync(`${dir}/matrix.json`, JSON.stringify(out));
  });
}
