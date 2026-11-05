import { describe, expect, it } from "vitest";
import { insertClip, Timeline, duration } from "./timeline";
import { silenceCuts, applyCuts, sceneSplits, applySceneSplits, loudnessGain, buildPlan } from "./smart";

const tl0 = (): Timeline => ({ schema_version: 1, fps: 30, width: 1920, height: 1080, tracks: [
  { id: "v1", kind: "video", name: "Video", muted: false, hidden: false, locked: false, clips: [] },
  { id: "a1", kind: "audio", name: "Voice", muted: false, hidden: false, locked: false, clips: [] }] });
const asset = (analysis: any) => ({ id: "A", kind: "video", has_audio: true, analysis } as any);

describe("smart edits", () => {
  it("cuts a silence with padding and ripples", () => {
    const r = insertClip(tl0(), "v1", "A", 0, 0, 120)!; // 4s clip
    const assets = new Map([["A", asset({ silences: [{ start: 1.5, end: 3.0 }] })]]);
    const cuts = silenceCuts(r.tl, assets);
    expect(cuts).toEqual([{ clipId: r.id, trackId: "v1", from: 50, to: 85 }]);
    const out = applyCuts(r.tl, cuts);
    expect(duration(out)).toBe(120 - 35);
    expect(out.tracks[0].clips.map((c) => [c.start, c.in, c.out])).toEqual([[0, 0, 50], [50, 85, 120]]);
  });
  it("ignores silences shorter than the minimum after padding", () => {
    const r = insertClip(tl0(), "v1", "A", 0, 0, 120)!;
    expect(silenceCuts(r.tl, new Map([["A", asset({ silences: [{ start: 1, end: 1.6 }] })]]))).toEqual([]);
  });
  it("splits at scene changes", () => {
    const r = insertClip(tl0(), "v1", "A", 0, 0, 120)!;
    const assets = new Map([["A", asset({ scenes: [{ start: 0, end: 2, score: 1 }, { start: 2, end: 4, score: 0.9 }] })]]);
    const out = applySceneSplits(r.tl, sceneSplits(r.tl, assets));
    expect(out.tracks[0].clips.length).toBe(2);
  });
  it("loudness gain toward -14 LUFS", () => {
    expect(loudnessGain(asset({ loudness_lufs: -20 }))).toBeCloseTo(2.0, 1);
    expect(loudnessGain(asset({ loudness_lufs: -14.5 }))).toBeNull();
  });
  it("plan only contains measurable operations", () => {
    const r = insertClip(tl0(), "v1", "A", 0, 0, 120)!;
    const ops = buildPlan(r.tl, new Map([["A", asset({ silences: [{ start: 1.5, end: 3 }], loudness_lufs: -24, auto_grade: { gain: [1.2, 1.2, 1.2] } })]]));
    expect(ops.map((o) => o.id)).toEqual(["silence", "color", "loud", "denoise", "fades"]);
    let t = r.tl; for (const o of ops) t = o.apply(t);
    expect(t.tracks[0].clips.length).toBe(2);
    expect(buildPlan(t, new Map([["A", asset({ silences: [], loudness_lufs: -24, auto_grade: { gain: [1.2, 1.2, 1.2] } })]])).map((o) => o.id)).toEqual([]); // nothing left after applying
  });
});
