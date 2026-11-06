import { describe, expect, it } from "vitest";
import { Timeline, insertClip, moveClip, splitAt, splitAllAt, trimStart, trimEnd, deleteClip, duration, snap, framesToTimecode, freeSlot } from "./timeline";

const base = (): Timeline => ({ schema_version: 1, fps: 30, width: 1920, height: 1080, tracks: [
  { id: "v2", kind: "video", name: "V2", muted: false, hidden: false, locked: false, clips: [] },
  { id: "v1", kind: "video", name: "V1", muted: false, hidden: false, locked: false, clips: [] },
  { id: "a1", kind: "audio", name: "A1", muted: false, hidden: false, locked: false, clips: [] },
] });

describe("timeline ops", () => {
  it("inserts into the next free slot instead of overlapping", () => {
    let r = insertClip(base(), "v1", "A", 0, 0, 90)!;
    r = insertClip(r.tl, "v1", "B", 30, 0, 60)!;
    const clips = r.tl.tracks[1].clips;
    expect(clips[1].start).toBe(90);
    expect(duration(r.tl)).toBe(150);
  });
  it("refuses overlapping moves and cross-kind moves", () => {
    let r = insertClip(base(), "v1", "A", 0, 0, 90)!;
    const b = insertClip(r.tl, "v1", "B", 100, 0, 30)!;
    expect(moveClip(b.tl, b.id, "v1", 50)).toBeNull();
    expect(moveClip(b.tl, b.id, "a1", 0)).toBeNull();
    expect(moveClip(b.tl, b.id, "v2", 50)!.tracks[0].clips[0].start).toBe(50);
  });
  it("splits frame-exactly and preserves source continuity", () => {
    const r = insertClip(base(), "v1", "A", 10, 5, 95)!;
    const s = splitAt(r.tl, r.id, 40)!;
    const [l, rt] = s.tl.tracks[1].clips;
    expect([l.start, l.in, l.out]).toEqual([10, 5, 35]);
    expect([rt.start, rt.in, rt.out]).toEqual([40, 35, 95]);
    expect(splitAt(r.tl, r.id, 10)).toBeNull();
    expect(splitAllAt(r.tl, 50).tracks[1].clips.length).toBe(2);
  });
  it("trims within source bounds", () => {
    const r = insertClip(base(), "v1", "A", 30, 30, 90)!;
    expect(trimStart(r.tl, r.id, 0)!.tracks[1].clips[0].in).toBe(0);
    expect(trimStart(r.tl, r.id, -5)).toBeNull(); // cannot reveal media before the source start
    expect(trimStart(r.tl, r.id, 10)!.tracks[1].clips[0].in).toBe(10);
    expect(trimEnd(r.tl, r.id, 200, 120)).toBeNull();
    expect(trimEnd(r.tl, r.id, 110, 120)!.tracks[1].clips[0].out).toBe(110);
  });
  it("ripple delete closes the gap", () => {
    let r = insertClip(base(), "v1", "A", 0, 0, 30)!;
    const b = insertClip(r.tl, "v1", "B", 30, 0, 30)!;
    const out = deleteClip(b.tl, r.id, true)!;
    expect(out.tracks[1].clips[0].start).toBe(0);
  });
  it("locked tracks reject edits", () => {
    const r = insertClip(base(), "v1", "A", 0, 0, 30)!;
    r.tl.tracks[1].locked = true;
    expect(deleteClip(r.tl, r.id)).toBeNull();
  });
  it("helpers", () => {
    expect(snap(52, [0, 50, 100], 3)).toBe(50);
    expect(snap(56, [0, 50, 100], 3)).toBe(56);
    expect(framesToTimecode(30 * 61 + 7, 30)).toBe("00:01:01:07");
    expect(freeSlot(base().tracks[0], 5, 10)).toBe(5);
  });
});

import { valueAt, sliceKeyframes, setKey, removeKey, tfAt } from "./keyframes";
import { splitAt as split2, trimStart as trimS } from "./timeline";

describe("keyframes match the server", () => {
  it("valueAt: linear, ease, hold, before/after", () => {
    const k = [{ t: 0, v: 0, ease: "linear" as const }, { t: 10, v: 100, ease: "ease" as const }, { t: 20, v: 0, ease: "hold" as const }, { t: 30, v: 50, ease: "linear" as const }];
    expect(valueAt(k, -5, 9)).toBe(0); expect(valueAt(k, 5, 9)).toBe(50); expect(valueAt(k, 15, 9)).toBeCloseTo(50);
    expect(valueAt(k, 12, 9)).toBeGreaterThan(80); expect(valueAt(k, 25, 9)).toBe(0); expect(valueAt(k, 99, 9)).toBe(50); expect(valueAt([], 3, 7)).toBe(7);
  });
  it("slice keeps the animation continuous (same numbers as the Python test)", () => {
    const part = sliceKeyframes({ x: [{ t: 0, v: 0, ease: "linear" }, { t: 30, v: 90, ease: "linear" }] }, 10, 20, { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });
    expect(part!.x!.map((f) => [f.t, Math.round(f.v)])).toEqual([[0, 30], [9, 57]]);
  });
  it("set/remove keys and split/trim carry the animation", () => {
    let kf = setKey(null, "x", 0, -100); kf = setKey(kf, "x", 29, 100); kf = setKey(kf, "x", 29, 120);
    expect(kf.x!.map((f) => f.v)).toEqual([-100, 120]);
    expect(removeKey(removeKey(kf, "x", 0), "x", 29)).toBeNull();
    const tl0 = defaultTl();
    const tl = { ...tl0, tracks: tl0.tracks.map((t) => t.id === "v1" ? { ...t, clips: [{ id: "a", asset_id: "m", start: 0, in: 0, out: 30, volume: 1, fade_in: 0, fade_out: 0,
      transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, keyframes: kf }] } : t) };
    const r = split2(tl, "a", 15)!;
    const v1 = r.tl.tracks.find((t) => t.id === "v1")!.clips;
    const left = v1.find((c) => c.id === "a")!, right = v1.find((c) => c.id === r.rightId)!;
    expect(tfAt(left, 14).x).toBeCloseTo(tfAt({ ...left, keyframes: kf }, 14).x, 3);
    expect(tfAt(right, 0).x).toBeCloseTo(-100 + 220 * 15 / 29, 3);
    const t2 = trimS(tl, "a", 10)!.tracks.find((t) => t.id === "v1")!.clips[0];
    expect(tfAt(t2, 0).x).toBeCloseTo(-100 + 220 * 10 / 29, 3);
  });
});

function defaultTl() {
  return { schema_version: 1 as const, fps: 30, width: 320, height: 180, tracks: [
    { id: "v1", kind: "video" as const, name: "Video", muted: false, hidden: false, locked: false, clips: [] as any[] },
    { id: "a1", kind: "audio" as const, name: "Voice", muted: false, hidden: false, locked: false, clips: [] as any[] }] };
}

import { transitionLinks, transitionState } from "./transitions";

describe("transitions match the server", () => {
  const mk = (id: string, start: number, out: number, tr?: any) => ({ id, asset_id: "m", start, in: 0, out, volume: 1, fade_in: 0, fade_out: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, transition_in: tr ?? null });
  it("links need touching clips and are capped (same as Python test)", () => {
    const m = transitionLinks([mk("a", 0, 20), mk("b", 20, 8, { type: "fade", frames: 30 }), mk("c", 40, 20, { type: "fade", frames: 10 })] as any);
    expect([...m.entries()]).toEqual([["b", [4, 4]]]);
  });
  it("dissolve is centred: incoming at 50 % on the cut, outgoing held after its end", () => {
    const track = { id: "v1", kind: "video" as const, name: "", muted: false, hidden: false, locked: false,
      clips: [mk("a", 0, 30), mk("b", 30, 30, { type: "fade", frames: 10 })] as any };
    const [a, b] = track.clips;
    expect(transitionState(track, b, 24).visible).toBe(false);
    expect(transitionState(track, b, 25)).toMatchObject({ visible: true, holdLocal: 0, opacity: 0 });
    expect(transitionState(track, b, 30).opacity).toBeCloseTo(0.5);
    expect(transitionState(track, a, 32)).toMatchObject({ visible: true, holdLocal: 29 });
    expect(transitionState(track, a, 35).visible).toBe(false);
  });
  it("wipe and slide move like FFmpeg xfade", () => {
    const track = { id: "v1", kind: "video" as const, name: "", muted: false, hidden: false, locked: false,
      clips: [mk("a", 0, 30), mk("b", 30, 30, { type: "wipeleft", frames: 10 })] as any };
    expect(transitionState(track, track.clips[1], 30).container).toEqual({ clipPath: "inset(0 0 0 50.000%)" });
    track.clips[1].transition_in = { type: "slideleft", frames: 10 };
    expect(transitionState(track, track.clips[0], 30).container).toEqual({ transform: "translateX(-50.000%)" });
    expect(transitionState(track, track.clips[1], 30).container).toEqual({ transform: "translateX(50.000%)" });
  });
});
