import { describe, expect, it } from "vitest";
import { Timeline, Clip, DEFAULT_TRANSFORM, end, len, duration } from "./timeline";
import { insert, overwrite, replace, fitToFill, placeOnTop, append, rippleOverwrite, roll, rippleTrimEnd, rippleTrimStart, slip, slide, addMarker, removeMarker, markerNear, clearRange } from "./editops";

const clip = (id: string, start: number, inF: number, out: number, asset = id): Clip =>
  ({ id, asset_id: asset, start, in: inF, out, volume: 1, fade_in: 0, fade_out: 0, transform: { ...DEFAULT_TRANSFORM } });
const base = (): Timeline => ({ schema_version: 1, fps: 30, width: 1920, height: 1080, tracks: [
  { id: "v2", kind: "video", name: "V2", muted: false, hidden: false, locked: false, clips: [] },
  { id: "v1", kind: "video", name: "V1", muted: false, hidden: false, locked: false, clips: [clip("A", 0, 0, 100), clip("B", 100, 0, 100)] },
  { id: "a1", kind: "audio", name: "A1", muted: false, hidden: false, locked: false, clips: [clip("M", 0, 0, 200)] },
] });
const v1 = (tl: Timeline) => tl.tracks.find((t) => t.id === "v1")!.clips.slice().sort((a, b) => a.start - b.start);
const src = clip("N", 0, 0, 30, "N");
const max = () => 300;

describe("Resolve edit types", () => {
  it("overwrite covers what is there and splits around it", () => {
    const r = overwrite(base(), "v1", src, 90)!;
    expect(v1(r.tl).map((c) => [c.asset_id, c.start, len(c)])).toEqual([["A", 0, 90], ["N", 90, 30], ["B", 120, 80]]);
    expect(duration(r.tl)).toBe(200);
  });
  it("insert splits at the playhead and pushes later clips on every unlocked track", () => {
    const r = insert(base(), "v1", src, 50)!;
    expect(v1(r.tl).map((c) => [c.asset_id, c.start, len(c)])).toEqual([["A", 0, 50], ["N", 50, 30], ["A", 80, 50], ["B", 130, 100]]);
    const a1 = r.tl.tracks[2].clips.sort((a, b) => a.start - b.start);
    expect(a1.map((c) => [c.start, len(c)])).toEqual([[0, 50], [80, 150]]); // music split and pushed too, stays in sync
  });
  it("replace keeps the slot and length", () => {
    const r = replace(base(), "B", clip("X", 0, 10, 400, "X"))!;
    const b = v1(r.tl)[1];
    expect([b.asset_id, b.start, b.in, b.out]).toEqual(["X", 100, 10, 110]);
  });
  it("fit to fill changes speed to fill the slot exactly", () => {
    const r = fitToFill(base(), "v1", clip("X", 0, 0, 60, "X"), 100, 200)!;
    expect(r.speed).toBeCloseTo(0.6);
    const x = v1(r.tl).find((c) => c.asset_id === "X")!;
    expect([x.start, len(x)]).toEqual([100, 100]);
    expect(fitToFill(base(), "v1", clip("X", 0, 0, 1000, "X"), 100, 110)).toBeNull(); // would need 100×
  });
  it("place on top uses the first free track above, or adds one", () => {
    const r = placeOnTop(base(), src, 10)!;
    expect(r.tl.tracks[0].clips[0].asset_id).toBe("N");
    const r2 = placeOnTop(r.tl, src, 10)!;
    expect(r2.tl.tracks.length).toBe(4);
    expect(r2.tl.tracks[0].clips[0].asset_id).toBe("N");
  });
  it("append adds after the end of the timeline", () => {
    const r = append(base(), "v1", src)!;
    expect(v1(r.tl).at(-1)!.start).toBe(200);
  });
  it("ripple overwrite moves later clips by the change in length", () => {
    const r = rippleOverwrite(base(), "A", src)!;
    expect(v1(r.tl).map((c) => [c.asset_id, c.start])).toEqual([["N", 0], ["B", 30]]);
  });
  it("clearRange removes covered clips", () => {
    expect(v1(clearRange(base(), "v1", 0, 100)!).map((c) => c.id)).toEqual(["B"]);
  });
});

describe("smart trim", () => {
  it("roll moves the cut, total length unchanged", () => {
    const t = roll(base(), "A", "B", 120, max)!;
    const [a, b] = v1(t);
    expect([end(a), b.start, b.in, end(b)]).toEqual([120, 120, 20, 200]);
  });
  it("roll refuses to reveal media before the source start", () => {
    expect(roll(base(), "A", "B", 60, max)).toBeNull(); // B would need in = -40
  });
  it("ripple end moves later clips", () => {
    const [a, b] = v1(rippleTrimEnd(base(), "A", 70, max)!);
    expect([end(a), b.start]).toEqual([70, 70]);
  });
  it("ripple start keeps the clip in place and closes the gap", () => {
    const [a, b] = v1(rippleTrimStart(base(), "A", 20)!);
    expect([a.start, a.in, len(a), b.start]).toEqual([0, 20, 80, 80]);
    expect(rippleTrimStart(base(), "A", -5)).toBeNull(); // nothing before frame 0 of the source
  });
  it("slip changes the source window only", () => {
    const t = slip({ ...base(), tracks: base().tracks.map((x) => x.id === "v1" ? { ...x, clips: [clip("A", 0, 50, 150)] } : x) }, "A", -20, max)!;
    const a = t.tracks[1].clips[0];
    expect([a.start, a.in, a.out]).toEqual([0, 30, 130]);
  });
  it("slide moves a clip between neighbours", () => {
    const tl = { ...base(), tracks: base().tracks.map((x) => x.id === "v1" ? { ...x, clips: [clip("A", 0, 0, 100), clip("B", 100, 0, 50), clip("C", 150, 20, 120)] } : x) };
    const [a, b, c] = v1(slide(tl, "B", 110, max)!);
    expect([end(a), b.start, end(b), c.start, c.in, end(c)]).toEqual([110, 110, 160, 160, 30, 250]);
    const [a2, b2, c2] = v1(slide(tl, "B", 90, max)!);
    expect([end(a2), b2.start, c2.start, c2.in]).toEqual([90, 90, 140, 10]);
  });
});

describe("markers", () => {
  it("adds, finds and removes markers", () => {
    let t = addMarker(base(), 50);
    t = addMarker(t, 10);
    t = addMarker(t, 10); // no duplicates on the same frame
    expect(t.markers!.map((m) => m.frame)).toEqual([10, 50]);
    expect(markerNear(t, 20, 1)!.frame).toBe(50);
    expect(markerNear(t, 20, -1)!.frame).toBe(10);
    expect(removeMarker(t, t.markers![0].id).markers!.length).toBe(1);
  });
});
