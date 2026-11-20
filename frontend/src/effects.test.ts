import { describe, expect, it } from "vitest";
import { saturateM, sepiaM, hueM, vignetteFactor, svgEffectsBody, overlayEffects, animationKeys, applyAnimation, ANIMATIONS, STYLES, clampEffect, EFFECTS } from "./effects";
import { Clip, DEFAULT_TRANSFORM } from "./timeline";

// Reference numbers printed by backend/app/effects.py — preview and export must use the same maths.
const SERVER = {
  sat: [0.4491, 0.5005, 0.0504, 0.1491, 0.8005, 0.0504, 0.1491, 0.5005, 0.3504],
  sep: [0.6358, 0.4614, 0.1134, 0.2094, 0.8116, 0.1008, 0.1632, 0.3204, 0.4786],
  hue: [0.210948, -0.160693, 0.949744, 0.295999, 0.923993, -0.219992, -0.602312, 1.220581, 0.381731],
  vig: 0.165087,
};
const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 5));

describe("effects maths matches the server", () => {
  it("colour matrices", () => { close(saturateM(0.3), SERVER.sat); close(sepiaM(0.6), SERVER.sep); close(hueM(75), SERVER.hue); });
  it("vignette curve", () => expect(vignetteFactor(0.7, 0.8)).toBeCloseTo(SERVER.vig, 5));
  it("svg body and overlays", () => {
    const body = svgEffectsBody([{ type: "posterize", amount: 3 }, { type: "bw", amount: 1 }], 1);
    expect(body.indexOf("feColorMatrix")).toBeLessThan(body.indexOf("discrete"));   // export order: bw before posterize
    expect(body).toContain('tableValues="0 0.5 1"');
    const ov = overlayEffects([{ type: "vignette", amount: 0.5 }, { type: "letterbox", amount: 0.12 }]);
    expect(ov.vignette).toContain("radial-gradient"); expect(ov.bars).toBe(0.12); expect(ov.grain).toBe(0);
  });
  it("every style uses valid effects", () => {
    for (const st of STYLES) for (const e of st.effects) expect(clampEffect(e)).toEqual(e);
    expect(EFFECTS.length).toBe(15);
  });
});

describe("animations", () => {
  const clip: Clip = { id: "c", asset_id: "a", start: 0, in: 0, out: 150, volume: 1, fade_in: 0, fade_out: 0, transform: { ...DEFAULT_TRANSFORM } };
  it("every animation makes valid keyframes (increasing, inside the clip, within limits, ≤ 64)", () => {
    for (const a of ANIMATIONS) {
      const kf = applyAnimation(clip, animationKeys(a.id, a.kind, clip, 150, 30, 1920, 1080));
      const props = Object.entries(kf).filter(([, v]) => v && v.length);
      expect(props.length, a.label).toBeGreaterThan(0);
      for (const [p, ks] of props) {
        expect(ks!.length).toBeLessThanOrEqual(64);
        ks!.forEach((k, i) => { expect(k.t).toBeGreaterThanOrEqual(0); expect(k.t).toBeLessThan(150); if (i) expect(k.t).toBeGreaterThan(ks![i - 1].t); });
        if (p === "scale") ks!.forEach((k) => expect(k.v).toBeGreaterThanOrEqual(0.05));
        if (p === "opacity") ks!.forEach((k) => { expect(k.v).toBeGreaterThanOrEqual(0); expect(k.v).toBeLessThanOrEqual(1); });
      }
    }
  });
  it("in and out animations on the same clip keep each other", () => {
    let c = { ...clip };
    c = { ...c, keyframes: applyAnimation(c, animationKeys("zoomIn", "in", c, 150, 30, 1920, 1080)) };
    c = { ...c, keyframes: applyAnimation(c, animationKeys("zoomOut", "out", c, 150, 30, 1920, 1080)) };
    expect(c.keyframes!.scale!.length).toBe(4);
    expect(c.keyframes!.scale![0].t).toBe(0); expect(c.keyframes!.scale![3].t).toBe(149);
  });
});
