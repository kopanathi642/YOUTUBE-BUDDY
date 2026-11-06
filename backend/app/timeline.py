"""Versioned timeline schema + compiler from timeline -> FFmpeg filter graph.

All timing is in integer frames at the sequence frame rate, so edits are frame-exact.
Track order is display order (top to bottom). Video is composited bottom-up, so a video
track that appears higher in the list sits on top in the picture.
"""
from __future__ import annotations

import os
import re
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SCHEMA_VERSION = 1
ALLOWED_FPS = (24, 25, 30, 50, 60)
MAX_CLIPS = 300


class Transform(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: float = Field(0, ge=-10000, le=10000)  # px offset from centre, in sequence pixels
    y: float = Field(0, ge=-10000, le=10000)
    scale: float = Field(1.0, ge=0.05, le=10)
    rotation: float = Field(0, ge=-360, le=360)  # degrees, clockwise
    opacity: float = Field(1.0, ge=0, le=1)


Vec3 = tuple[float, float, float]
Point = tuple[float, float]
IDENTITY_CURVE: list[Point] = [(0.0, 0.0), (1.0, 1.0)]


class Curves(BaseModel):
    """Tone curves (0..1 in, 0..1 out). Each channel curve is applied after the master curve."""
    model_config = ConfigDict(extra="forbid")
    master: list[Point] = Field(default_factory=lambda: list(IDENTITY_CURVE))
    r: list[Point] = Field(default_factory=lambda: list(IDENTITY_CURVE))
    g: list[Point] = Field(default_factory=lambda: list(IDENTITY_CURVE))
    b: list[Point] = Field(default_factory=lambda: list(IDENTITY_CURVE))

    @model_validator(mode="after")
    def _pts(self):
        for name in ("master", "r", "g", "b"):
            pts = getattr(self, name)
            if not (2 <= len(pts) <= 16):
                raise ValueError(f"curve {name} needs 2–16 points")
            xs = [x for x, _ in pts]
            if any(not (0 <= v <= 1) for pt in pts for v in pt):
                raise ValueError(f"curve {name} points must be within 0–1")
            if any(b <= a for a, b in zip(xs, xs[1:])):
                raise ValueError(f"curve {name} points must be in increasing x order")
        return self

    def is_identity(self) -> bool:
        return all([tuple(p) for p in getattr(self, n)] == IDENTITY_CURVE for n in ("master", "r", "g", "b"))


class LutRef(BaseModel):
    """A 3D .cube LUT uploaded to the project (a media asset of kind "lut"), mixed in by `strength`."""
    model_config = ConfigDict(extra="forbid")
    asset_id: uuid.UUID
    strength: float = Field(1.0, ge=0, le=1)


class ColorGrade(BaseModel):
    """Primary grade. Same maths in the browser preview (SVG filter) and the FFmpeg render (lutrgb + matrix).
    Per channel: x*wb -> x*(gain-lift)+lift+offset -> pow(1/gamma) -> contrast around 0.5 -> saturation matrix."""
    model_config = ConfigDict(extra="forbid")
    enabled: bool = True
    lift: Vec3 = (0.0, 0.0, 0.0)
    gamma: Vec3 = (1.0, 1.0, 1.0)
    gain: Vec3 = (1.0, 1.0, 1.0)
    offset: Vec3 = (0.0, 0.0, 0.0)
    exposure: float = Field(0.0, ge=-4, le=4)       # stops
    contrast: float = Field(1.0, ge=0, le=3)
    saturation: float = Field(1.0, ge=0, le=3)
    temperature: float = Field(0.0, ge=-1, le=1)    # + warmer
    tint: float = Field(0.0, ge=-1, le=1)           # + magenta
    curves: Curves | None = None                     # after contrast, before saturation
    lut: LutRef | None = None                        # applied last

    @model_validator(mode="after")
    def _ranges(self):
        for name, lo, hi in (("lift", -1, 1), ("gamma", 0.1, 10), ("gain", 0, 4), ("offset", -1, 1)):
            if any(not (lo <= v <= hi) for v in getattr(self, name)):
                raise ValueError(f"{name} out of range")
        return self

    def is_identity(self) -> bool:
        if not self.enabled:
            return True
        base = self.model_copy(update={"curves": None, "lut": None})
        return (base == ColorGrade(enabled=True) and (self.curves is None or self.curves.is_identity())
                and (self.lut is None or self.lut.strength == 0))

    def wb(self) -> Vec3:
        e = 2 ** self.exposure
        t, ti = self.temperature, self.tint
        return (e * (1 + 0.2 * t) * (1 + 0.1 * ti), e * (1 - 0.2 * ti), e * (1 - 0.2 * t) * (1 + 0.1 * ti))


HEX = r"^#[0-9a-fA-F]{6}$"


class Title(BaseModel):
    """Text/title clip rendered with FFmpeg drawtext using the same bundled font as the browser preview."""
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=300)
    font_size: int = Field(96, ge=8, le=400)  # sequence pixels
    color: str = Field("#ffffff", pattern=HEX)
    bg_color: str | None = Field(None, pattern=HEX)
    bg_opacity: float = Field(0.7, ge=0, le=1)


KF_LIMITS = {"x": (-10000, 10000), "y": (-10000, 10000), "scale": (0.05, 10), "rotation": (-360, 360), "opacity": (0, 1)}


class Keyframe(BaseModel):
    """Value of one property at frame `t` (counted from the clip's start on the timeline). `ease` shapes the
    segment that LEAVES this keyframe: linear, ease (smooth in-out), or hold (jump at the next keyframe)."""
    model_config = ConfigDict(extra="forbid")
    t: int = Field(ge=0, le=10_000_000)
    v: float
    ease: Literal["linear", "ease", "hold"] = "linear"


class Keyframes(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: list[Keyframe] = Field(default_factory=list, max_length=64)
    y: list[Keyframe] = Field(default_factory=list, max_length=64)
    scale: list[Keyframe] = Field(default_factory=list, max_length=64)
    rotation: list[Keyframe] = Field(default_factory=list, max_length=64)
    opacity: list[Keyframe] = Field(default_factory=list, max_length=64)

    @model_validator(mode="after")
    def _ok(self):
        for k, (lo, hi) in KF_LIMITS.items():
            kfs = getattr(self, k)
            if any(b.t <= a.t for a, b in zip(kfs, kfs[1:])):
                raise ValueError(f"{k} keyframes must be in increasing time order")
            if any(not (lo <= f.v <= hi) for f in kfs):
                raise ValueError(f"{k} keyframe value out of range")
        return self

    def empty(self) -> bool:
        return not any(getattr(self, k) for k in KF_LIMITS)

    def geometric(self) -> bool:
        return bool(self.x or self.y or self.scale or self.rotation)


def kf_value(kfs: list[Keyframe], t: float, default: float) -> float:
    """Value at clip frame t — identical to valueAt() in frontend/src/keyframes.ts."""
    if not kfs:
        return default
    if t <= kfs[0].t:
        return kfs[0].v
    for a, b in zip(kfs, kfs[1:]):
        if t < b.t:
            if a.ease == "hold":
                return a.v
            u = (t - a.t) / (b.t - a.t)
            if a.ease == "ease":
                u = u * u * (3 - 2 * u)
            return a.v + (b.v - a.v) * u
    return kfs[-1].v


def kf_expr(kfs: list[Keyframe], default: float, n: str = "in") -> str:
    """The same function as an FFmpeg expression of the frame counter `n` (for perspective's per-frame eval)."""
    if not kfs:
        return _f(default)
    expr = _f(kfs[-1].v)
    for a, b in reversed(list(zip(kfs, kfs[1:]))):
        u = f"(({n}-{a.t})/{b.t - a.t})"
        if a.ease == "hold":
            seg = _f(a.v)
        elif a.ease == "ease":
            seg = f"({_f(a.v)}+({_f(b.v - a.v)})*{u}*{u}*(3-2*{u}))"
        else:
            seg = f"({_f(a.v)}+({_f(b.v - a.v)})*{u})"
        expr = f"if(lt({n},{b.t}),{seg},{expr})"
    return f"if(lt({n},{kfs[0].t}),{_f(kfs[0].v)},{expr})"


def slice_keyframes(kf: "Keyframes | None", a: int, b: int, static: "Transform") -> "Keyframes | None":
    """Keep the animation inside clip frames [a, b), shifted to start at 0, with boundary keys so values don't jump."""
    if kf is None or kf.empty():
        return kf
    out = {}
    for k in KF_LIMITS:
        kfs = getattr(kf, k)
        if not kfs:
            out[k] = []
            continue
        inside = [f for f in kfs if a < f.t < b]
        first = Keyframe(t=0, v=round(kf_value(kfs, a, getattr(static, k)), 4), ease=_ease_at(kfs, a))
        last = Keyframe(t=b - a - 1, v=round(kf_value(kfs, b - 1, getattr(static, k)), 4), ease="linear")
        keep = [first] + [Keyframe(t=f.t - a, v=f.v, ease=f.ease) for f in inside if f.t - a < b - a - 1]
        if last.t > keep[-1].t:
            keep.append(last)
        out[k] = keep
    return Keyframes(**out)


def _ease_at(kfs: list[Keyframe], t: int) -> str:
    prev = [f for f in kfs if f.t <= t]
    return prev[-1].ease if prev else "linear"


TRANSITIONS = ("fade", "fadeblack", "fadewhite", "wipeleft", "wiperight", "wipeup", "wipedown",
               "slideleft", "slideright", "slideup", "slidedown", "circleopen")


class Transition(BaseModel):
    """Blend INTO this clip from the clip that ends exactly where this one starts on the same track. Centred on the
    cut: half before, half after. Where a clip has no more frames, its first/last frame is held."""
    model_config = ConfigDict(extra="forbid")
    type: Literal[TRANSITIONS] = "fade"  # type: ignore[valid-type]
    frames: int = Field(15, ge=2, le=300)


class Crop(BaseModel):
    model_config = ConfigDict(extra="forbid")
    left: float = Field(0, ge=0, le=0.45)
    right: float = Field(0, ge=0, le=0.45)
    top: float = Field(0, ge=0, le=0.45)
    bottom: float = Field(0, ge=0, le=0.45)

    def is_identity(self) -> bool:
        return not (self.left or self.right or self.top or self.bottom)


class Clip(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    id: str = Field(min_length=1, max_length=64)
    asset_id: uuid.UUID | None = None
    title: Title | None = None
    speed: float = Field(1.0, ge=0.25, le=4)
    crop: Crop | None = None
    start: int = Field(ge=0)  # timeline frame where the clip begins
    in_: int = Field(0, ge=0, alias="in")  # source offset (frames)
    out: int = Field(gt=0)  # source end (frames, exclusive)
    volume: float = Field(1.0, ge=0, le=4)
    fade_in: int = Field(0, ge=0)
    fade_out: int = Field(0, ge=0)
    transform: Transform = Field(default_factory=Transform)
    color: ColorGrade | None = None
    keyframes: Keyframes | None = None  # animated transform (overrides the static value of each animated property)
    transition_in: Transition | None = None  # blend from the previous touching clip on the same track
    denoise: bool = False  # FFmpeg FFT noise reduction on this clip's audio (applied in export)

    @property
    def length(self) -> int:
        """Frames the clip occupies on the timeline (source span divided by speed)."""
        import math
        return max(1, math.floor((self.out - self.in_) / self.speed + 0.5))  # same rounding as the editor (Math.round)

    @property
    def end(self) -> int:
        return self.start + self.length

    @model_validator(mode="after")
    def _check(self):
        if self.out <= self.in_:
            raise ValueError("clip out must be after in")
        if (self.asset_id is None) == (self.title is None):
            raise ValueError("a clip needs either media (asset_id) or a title, not both")
        if self.title is not None and self.speed != 1:
            raise ValueError("titles have no speed")
        if self.fade_in + self.fade_out > self.length:
            raise ValueError("fades longer than clip")
        return self


class Track(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=64)
    kind: Literal["video", "audio"]
    name: str = Field(max_length=60)
    muted: bool = False
    hidden: bool = False
    locked: bool = False
    clips: list[Clip] = Field(default_factory=list)

    @model_validator(mode="after")
    def _no_overlap(self):
        cs = sorted(self.clips, key=lambda c: c.start)
        for a, b in zip(cs, cs[1:]):
            if b.start < a.end:
                raise ValueError(f"clips {a.id} and {b.id} overlap on track {self.name}")
        return self


class Timeline(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1] = SCHEMA_VERSION
    fps: int
    width: int = Field(ge=144, le=3840)
    height: int = Field(ge=144, le=3840)
    tracks: list[Track] = Field(max_length=24)
    notes: str = Field("", max_length=10000)

    @model_validator(mode="after")
    def _check(self):
        if self.fps not in ALLOWED_FPS:
            raise ValueError(f"fps must be one of {ALLOWED_FPS}")
        if self.width % 2 or self.height % 2:
            raise ValueError("width and height must be even")
        ids = [t.id for t in self.tracks]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate track id")
        cids = [c.id for t in self.tracks for c in t.clips]
        if len(cids) != len(set(cids)):
            raise ValueError("duplicate clip id")
        if len(cids) > MAX_CLIPS:
            raise ValueError(f"at most {MAX_CLIPS} clips per sequence")
        return self

    @property
    def duration_frames(self) -> int:
        return max((c.end for t in self.tracks for c in t.clips), default=0)

    def asset_ids(self) -> set[uuid.UUID]:
        return self.clip_asset_ids() | self.lut_asset_ids()

    def clip_asset_ids(self) -> set[uuid.UUID]:
        return {c.asset_id for t in self.tracks for c in t.clips if c.asset_id}

    def lut_asset_ids(self) -> set[uuid.UUID]:
        return {c.color.lut.asset_id for t in self.tracks for c in t.clips if c.color and c.color.lut}


def default_timeline(fps: int = 30, width: int = 1920, height: int = 1080) -> dict:
    return Timeline(fps=fps, width=width, height=height, tracks=[
        Track(id="v4", kind="video", name="Adjustment Layer"),
        Track(id="v3", kind="video", name="VFX / Compositing"),
        Track(id="v2", kind="video", name="Titles / Graphics"),
        Track(id="v1", kind="video", name="Video"),
        Track(id="a1", kind="audio", name="Voice"),
        Track(id="a2", kind="audio", name="Music (BGM)"),
        Track(id="a3", kind="audio", name="SFX / Ambience"),
    ]).model_dump(by_alias=True, mode="json")


# ---------------------------------------------------------------- compiler

class AssetInfo(BaseModel):
    path: str
    kind: Literal["video", "audio", "image", "lut"]
    has_audio: bool
    has_video: bool
    duration_s: float | None = None


def _f(x: float) -> str:
    return f"{x:.6f}".rstrip("0").rstrip(".") or "0"


KF_PAD = 2  # transparent border: perspective repeats edge pixels outside the shape, so the edge must be transparent


def _perspective(clip: "Clip", W: int, H: int) -> list[str]:
    """Animated position/scale/rotation of a full-canvas layer, evaluated per frame (variable `in` = clip frame).
    The layer gets a transparent border, corners are sent to their animated positions (sense=destination), and the
    result is overlaid at (-KF_PAD, -KF_PAD)."""
    kf, tf = clip.keyframes, clip.transform
    n = "(in-1)"  # perspective's input frame counter starts at 1 (measured); keyframe time 0 = the clip's first frame
    X, Y = kf_expr(kf.x, tf.x, n), kf_expr(kf.y, tf.y, n)
    S, R = kf_expr(kf.scale, tf.scale, n), f"(({kf_expr(kf.rotation, tf.rotation, n)})*PI/180)"
    PW, PH = W + 2 * KF_PAD, H + 2 * KF_PAD
    opts = []
    for i, (cx, cy) in enumerate(((0, 0), (PW, 0), (0, PH), (PW, PH))):
        dx, dy = cx - PW / 2, cy - PH / 2
        opts.append(f"x{i}='{_f(PW / 2)}+({X})+({S})*({_f(dx)}*cos({R})-({_f(dy)})*sin({R}))'")
        opts.append(f"y{i}='{_f(PH / 2)}+({Y})+({S})*({_f(dx)}*sin({R})+({_f(dy)})*cos({R}))'")
    return [f"pad={PW}:{PH}:(ow-iw)/2:(oh-ih)/2:color=black@0", "perspective=" + ":".join(opts) + ":sense=destination:eval=frame"]


def _opacity_filters(clip: "Clip", fps: int, workdir: str, tag: str) -> list[str]:
    """Static opacity, or per-frame opacity from keyframes via a sendcmd file driving colorchannelmixer."""
    kf, tf = clip.keyframes, clip.transform
    if not (kf and kf.opacity):
        return [f"colorchannelmixer=aa={_f(tf.opacity)}"] if tf.opacity < 1 else []
    path = os.path.join(workdir, f"opacity-{tag}.cmd")
    last = None
    with open(path, "w") as f:
        for i in range(clip.length):
            v = round(kf_value(kf.opacity, i, tf.opacity), 4)
            if v != last:
                f.write(f"{i / fps:.6f} colorchannelmixer@op{tag} aa {v};\n")
                last = v
    first = round(kf_value(kf.opacity, 0, tf.opacity), 4)
    return [f"sendcmd=f={_ff_path(path)}", f"colorchannelmixer@op{tag}=aa={first}"]


def _lab(clip_id: str) -> str:
    """Clip ids are free-form; filtergraph labels must not contain separators."""
    return re.sub(r"[^A-Za-z0-9_]", "_", clip_id)


def transition_links(clips: list["Clip"]) -> dict[str, tuple[int, int]]:
    """For clips sorted by start: {incoming clip id: (frames before the cut, frames after)} for every usable transition.
    A transition needs the previous clip to end exactly where this one starts; it is capped by both clips' lengths."""
    out = {}
    for a, b in zip(clips, clips[1:]):
        t = b.transition_in
        if t and a.end == b.start:
            d = min(t.frames, a.length, b.length)
            if d >= 2:
                out[b.id] = (d // 2, d - d // 2)
    return out


def compile_ffmpeg(tl: Timeline, assets: dict[uuid.UUID, AssetInfo], out_path: str,
                   out_w: int | None = None, out_h: int | None = None, crf: int = 20,
                   workdir: str | None = None, watermark: str | None = None) -> tuple[list[str], float]:
    """Return (ffmpeg argv, duration seconds). Raises ValueError for un-renderable timelines."""
    fps = tl.fps
    D = tl.duration_frames / fps
    if D <= 0:
        raise ValueError("timeline is empty")
    W, H = tl.width, tl.height

    args: list[str] = ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-loglevel", "error"]
    graph: list[str] = [
        f"color=c=black:s={W}x{H}:r={fps}:d={_f(D)},format=yuv420p[base0]",
        f"anullsrc=r=48000:cl=stereo,atrim=duration={_f(D)}[abase]",
    ]
    n_inputs = 0
    vlabel = "base0"
    audio_labels: list[str] = []

    import os
    import tempfile
    workdir = workdir or tempfile.mkdtemp(prefix="titles-")
    n_titles = 0

    def add_input(clip: Clip, a: AssetInfo) -> int:
        nonlocal n_inputs
        dur = clip.length / fps
        if a.kind == "image":
            args.extend(["-loop", "1", "-framerate", str(fps), "-t", _f(dur), "-i", a.path])
        else:  # source span (before speed change)
            args.extend(["-ss", _f(clip.in_ / fps), "-t", _f((clip.out - clip.in_) / fps), "-i", a.path])
        n_inputs += 1
        return n_inputs - 1

    # Video: bottom track first.
    video_tracks = [t for t in tl.tracks if t.kind == "video"]
    for track in reversed(video_tracks):
        ordered = sorted(track.clips, key=lambda c: c.start)
        links = transition_links(ordered)
        # chains of clips joined by transitions -> each member becomes a full-canvas layer, blended with xfade
        chain_of: dict[str, list] = {}
        chains: list[list] = []
        for i, c in enumerate(ordered):
            if c.id in links and i and ordered[i - 1].id in chain_of:
                chain = chain_of[ordered[i - 1].id]
            elif c.id in links or (i + 1 < len(ordered) and ordered[i + 1].id in links):
                chain = []
                chains.append(chain)
            else:
                continue
            chain.append(c)
            chain_of[c.id] = chain
        layer_of: dict[str, str] = {}

        def to_layer(clip: "Clip", lab: str, pos: str, chain_filters: list[str]) -> None:
            """Turn a finished clip stream into a full-canvas transparent layer starting at local 0, with held
            frames before/after for the transitions on either side."""
            before = links.get(clip.id, (0, 0))[0]
            nxt = next((c for c in ordered if c.start == clip.end and c.id in links), None)
            after = links[nxt.id][1] if nxt and chain_of.get(nxt.id) is chain_of[clip.id] else 0
            f = chain_filters + ["setpts=PTS-STARTPTS"]
            if before or after:
                f.append(f"tpad=start_mode=clone:start_duration={_f(before / fps)}:stop_mode=clone:stop_duration={_f(after / fps)}")
            total = (clip.length + before + after) / fps
            graph.append(f"{lab}{','.join(f)}[lr{_lab(clip.id)}]")
            graph.append(f"color=c=black@0:s={W}x{H}:r={fps}:d={_f(total)},format=yuva420p[cn{_lab(clip.id)}]")
            graph.append(f"[cn{_lab(clip.id)}][lr{_lab(clip.id)}]overlay={pos}:eof_action=pass,format=yuva420p,fps={fps},settb=AVTB[L{_lab(clip.id)}]")
            layer_of[clip.id] = f"L{_lab(clip.id)}"

        for clip in ordered:
            if clip.title is not None:
                if track.hidden or clip.transform.opacity <= 0:
                    continue
                n_titles += 1
                tf, ti = clip.transform, clip.title
                st, en, dur = clip.start / fps, clip.end / fps, clip.length / fps
                from .titles import render_title_png
                png = os.path.join(workdir, f"title{n_titles}.png")
                anim = clip.keyframes is not None and clip.keyframes.geometric()
                # animated titles are drawn centred at scale 1; the per-frame transform then moves/scales/rotates them
                render_title_png(ti, Transform(opacity=tf.opacity) if anim else tf, W, H, png)
                args.extend(["-loop", "1", "-framerate", str(fps), "-t", _f(dur), "-i", png])
                n_inputs += 1
                chain = ["format=yuva420p"]
                if anim:
                    chain += ["setpts=PTS-STARTPTS", *_perspective(clip, W, H)]
                chain += _opacity_filters(clip, fps, workdir, f"t{n_titles}")
                if clip.fade_in:
                    chain.append(f"fade=t=in:st=0:d={_f(clip.fade_in / fps)}:alpha=1")
                if clip.fade_out:
                    chain.append(f"fade=t=out:st={_f(dur - clip.fade_out / fps)}:d={_f(clip.fade_out / fps)}:alpha=1")
                at = f"-{KF_PAD}:-{KF_PAD}" if anim else "0:0"
                if clip.id in chain_of:
                    to_layer(clip, f"[{n_inputs - 1}:v]", f"x={at.split(':')[0]}:y={at.split(':')[1]}", chain)
                    continue
                chain.append(f"setpts=PTS-STARTPTS+{_f(st)}/TB")
                lab = f"ti{n_titles}"
                graph.append(f"[{n_inputs - 1}:v]{','.join(chain)}[{lab}]")
                nxt = f"tbase{n_titles}"
                graph.append(f"[{vlabel}][{lab}]overlay={at}:eof_action=pass:enable='between(t,{_f(st)},{_f(en)})'[{nxt}]")
                vlabel = nxt
                continue
            a = assets.get(clip.asset_id)
            if a is None:
                raise ValueError(f"missing media for clip {clip.id}")
            use_v = a.has_video and not track.hidden and clip.transform.opacity > 0
            use_a = a.has_audio and not track.muted and clip.volume > 0
            if not (use_v or use_a):
                continue
            idx = add_input(clip, a)
            st, en, dur = clip.start / fps, clip.end / fps, clip.length / fps
            if use_v:
                tf = clip.transform
                bw, bh = max(2, int(W * tf.scale)), max(2, int(H * tf.scale))
                anim = clip.keyframes is not None and clip.keyframes.geometric()
                if anim:
                    bw, bh = W, H  # fit the canvas at scale 1; the per-frame transform does the rest
                chain = []
                if clip.speed != 1 and a.kind != "image":
                    chain.append(f"setpts=(PTS-STARTPTS)/{_f(clip.speed)}")
                elif clip.keyframes:
                    chain.append("setpts=PTS-STARTPTS")
                chain.append(f"fps={fps}")
                if clip.crop and not clip.crop.is_identity():
                    c = clip.crop
                    chain.append(f"crop=iw*{_f(1 - c.left - c.right)}:ih*{_f(1 - c.top - c.bottom)}:iw*{_f(c.left)}:ih*{_f(c.top)}")
                chain += [f"scale={bw}:{bh}:force_original_aspect_ratio=decrease:force_divisible_by=2", "setsar=1"]
                if clip.color and not clip.color.is_identity():
                    chain += grade_filters(clip.color, workdir, assets, tag=f"c{idx}")
                chain.append("format=yuva420p")
                if anim:
                    chain += _perspective(clip, W, H)  # pads to the canvas + border, then transforms per frame
                elif tf.rotation:
                    r = f"{_f(tf.rotation)}*PI/180"
                    chain.append(f"rotate={r}:c=none:ow=rotw({r}):oh=roth({r})")
                chain += _opacity_filters(clip, fps, workdir, f"c{idx}")
                if clip.fade_in:
                    chain.append(f"fade=t=in:st=0:d={_f(clip.fade_in / fps)}:alpha=1")
                if clip.fade_out:
                    chain.append(f"fade=t=out:st={_f(dur - clip.fade_out / fps)}:d={_f(clip.fade_out / fps)}:alpha=1")
                pos = f"x=-{KF_PAD}:y=-{KF_PAD}" if anim else f"x=(W-w)/2+({_f(tf.x)}):y=(H-h)/2+({_f(tf.y)})"
                if clip.id in chain_of:
                    to_layer(clip, f"[{idx}:v]", pos, chain)
                else:
                    chain.append(f"setpts=PTS-STARTPTS+{_f(st)}/TB")
                    graph.append(f"[{idx}:v]{','.join(chain)}[cv{idx}]")
                    nxt = f"base{idx + 1}"
                    graph.append(f"[{vlabel}][cv{idx}]overlay={pos}:eof_action=pass:enable='between(t,{_f(st)},{_f(en)})'[{nxt}]")
                    vlabel = nxt
            if use_a:
                audio_labels.append(_audio_chain(graph, idx, clip, fps))

        for chain in chains:  # blend each chain's layers with xfade, then place the result on the canvas
            members = [c for c in chain if c.id in layer_of]
            if not members:
                continue
            s0 = members[0].start
            acc = layer_of[members[0].id]
            for prev, c in zip(members, members[1:]):
                if c.id in links and prev.end == c.start:
                    h, a2 = links[c.id]
                    off = (c.start - h - s0) / fps
                    graph.append(f"[{acc}][{layer_of[c.id]}]xfade=transition={c.transition_in.type}:duration={_f((h + a2) / fps)}"
                                 f":offset={_f(off)}[x{_lab(c.id)}]")
                else:  # shouldn't happen inside a chain; fall back to a hard cut
                    graph.append(f"[{acc}][{layer_of[c.id]}]concat=n=2:v=1:a=0[x{_lab(c.id)}]")
                acc = f"x{_lab(c.id)}"
            e0 = members[-1].end
            graph.append(f"[{acc}]trim=duration={_f((e0 - s0) / fps)},setpts=PTS-STARTPTS+{_f(s0 / fps)}/TB[ch{_lab(members[0].id)}]")
            nxt = f"chb{_lab(members[0].id)}"
            graph.append(f"[{vlabel}][ch{_lab(members[0].id)}]overlay=0:0:eof_action=pass:enable='between(t,{_f(s0 / fps)},{_f(e0 / fps)})'[{nxt}]")
            vlabel = nxt

    for track in (t for t in tl.tracks if t.kind == "audio"):
        if track.muted:
            continue
        for clip in sorted(track.clips, key=lambda c: c.start):
            if clip.asset_id is None:
                continue
            a = assets.get(clip.asset_id)
            if a is None:
                raise ValueError(f"missing media for clip {clip.id}")
            if not a.has_audio or clip.volume == 0:
                continue
            idx = add_input(clip, a)
            audio_labels.append(_audio_chain(graph, idx, clip, fps))

    final = "vout"
    if watermark:   # Free plan: small "Made with …" badge, bottom-right, sized to the output
        final = "vpre"
    if out_w and out_h and (out_w, out_h) != (W, H):
        graph.append(f"[{vlabel}]scale={out_w}:{out_h}:force_original_aspect_ratio=decrease:force_divisible_by=2,"
                     f"pad={out_w}:{out_h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[{final}]")
    else:
        graph.append(f"[{vlabel}]null[{final}]")
    if watermark:
        ow_, oh_ = (out_w or W), (out_h or H)
        wm_w = max(120, int(min(ow_, oh_) * 0.32)) // 2 * 2
        args.extend(["-i", watermark])
        wi = n_inputs
        n_inputs += 1
        m = max(8, int(min(ow_, oh_) * 0.03))
        graph.append(f"[{wi}:v]scale={wm_w}:-2,format=rgba[wm]")
        graph.append(f"[vpre][wm]overlay=W-w-{m}:H-h-{m}:eof_action=repeat:format=auto,format=yuv420p[vout]")
    mix_in = "".join(f"[{l}]" for l in ["abase", *audio_labels])
    graph.append(f"{mix_in}amix=inputs={1 + len(audio_labels)}:duration=first:normalize=0:dropout_transition=0,"
                 f"alimiter=limit=0.98[aout]")

    args += [
        "-filter_complex", ";".join(graph),
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", str(crf), "-pix_fmt", "yuv420p", "-r", str(fps),
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        "-t", _f(D), "-movflags", "+faststart",
        "-progress", "pipe:1", "-nostats", out_path,
    ]
    return args, D


def _ff_path(p: str) -> str:
    """Quote a file path for use inside an FFmpeg filter argument."""
    return "'" + p.replace("\\", "/").replace("'", "") + "'"


def grade_filters(g: ColorGrade, workdir: str | None = None, assets: dict | None = None, tag: str = "g") -> list[str]:
    def ch(i: int) -> str:
        m, L, G, O, Ga, C = g.wb()[i], g.lift[i], g.gain[i], g.offset[i], g.gamma[i], g.contrast
        x = f"clip(val/255*{_f(m)},0,1)"
        x = f"clip({x}*{_f(G - L)}+{_f(L + O)},0,1)"
        x = f"pow({x},{_f(1 / Ga)})"
        x = f"clip(({x}-0.5)*{_f(C)}+0.5,0,1)"
        return f"'{x}*255'"
    from . import colorlut
    import tempfile
    out = ["format=rgba", f"lutrgb=r={ch(0)}:g={ch(1)}:b={ch(2)}"]
    if g.curves and not g.curves.is_identity():
        workdir = workdir or tempfile.mkdtemp(prefix="grade-")
        path = colorlut.write_1d_cube(colorlut.curve_tables(g.curves), os.path.join(workdir, f"curves-{tag}.cube"))
        out.append(f"lut1d=file={_ff_path(path)}:interp=linear")
    s = g.saturation
    if s != 1:  # identical coefficients to the SVG feColorMatrix "saturate" used by the preview
        out.append("colorchannelmixer=" + ":".join(f"{k}={_f(v)}" for k, v in {
            "rr": 0.213 + 0.787 * s, "rg": 0.715 - 0.715 * s, "rb": 0.072 - 0.072 * s,
            "gr": 0.213 - 0.213 * s, "gg": 0.715 + 0.285 * s, "gb": 0.072 - 0.072 * s,
            "br": 0.213 - 0.213 * s, "bg": 0.715 - 0.715 * s, "bb": 0.072 + 0.928 * s}.items()))
    if g.lut and g.lut.strength > 0:
        info = (assets or {}).get(g.lut.asset_id)
        if info is None:
            raise ValueError("LUT file not available for this render")
        workdir = workdir or tempfile.mkdtemp(prefix="grade-")
        size, rows, _ = colorlut.cube_from_path(info.path)
        path = colorlut.write_3d_cube(size, rows, g.lut.strength, os.path.join(workdir, f"lut-{tag}.cube"))
        out.append(f"lut3d=file={_ff_path(path)}:interp=tetrahedral")  # keeps alpha (rgba in, rgba out)
    return out


def _audio_chain(graph: list[str], idx: int, clip: Clip, fps: int) -> str:
    st, dur = clip.start / fps, clip.length / fps
    chain = ["aresample=48000", "aformat=sample_fmts=fltp:channel_layouts=stereo", "asetpts=PTS-STARTPTS"]
    sp = clip.speed
    while sp > 2.0 + 1e-9:
        chain.append("atempo=2"); sp /= 2
    while sp < 0.5 - 1e-9:
        chain.append("atempo=0.5"); sp /= 0.5
    if abs(sp - 1) > 1e-9:
        chain.append(f"atempo={_f(sp)}")
    chain.append(f"atrim=duration={_f(dur)}")
    if clip.denoise:
        chain.append("afftdn=nr=18:nf=-40:tn=1")
    if clip.volume != 1:
        chain.append(f"volume={_f(clip.volume)}")
    if clip.fade_in:
        chain.append(f"afade=t=in:st=0:d={_f(clip.fade_in / fps)}")
    if clip.fade_out:
        chain.append(f"afade=t=out:st={_f(dur - clip.fade_out / fps)}:d={_f(clip.fade_out / fps)}")
    ms = int(round(st * 1000))
    if ms:
        chain.append(f"adelay={ms}:all=1")
    graph.append(f"[{idx}:a]{','.join(chain)}[ca{idx}]")
    return f"ca{idx}"


EXPORT_PRESETS: dict[str, dict] = {
    # short side target; None = match sequence. Only presets the CPU worker genuinely supports are listed.
    "match": {"label": "Match sequence · H.264 MP4", "short_side": None, "crf": 20},
    "720p": {"label": "720p · H.264 MP4", "short_side": 720, "crf": 21},
    "draft": {"label": "Draft 480p · H.264 MP4 (fast)", "short_side": 480, "crf": 26},
}


def preset_dimensions(tl: Timeline, preset: str) -> tuple[int, int]:
    p = EXPORT_PRESETS[preset]
    if not p["short_side"] or min(tl.width, tl.height) <= p["short_side"]:
        return tl.width, tl.height
    k = p["short_side"] / min(tl.width, tl.height)
    return int(tl.width * k) // 2 * 2, int(tl.height * k) // 2 * 2


def slice_timeline(src: dict, a: int, b: int) -> dict:
    """Keep only frames [a, b) of a timeline, shifted to start at 0. Clips are trimmed (speed-aware); fades clamped."""
    import math
    tl = Timeline.model_validate(src)
    if b <= a:
        raise ValueError("empty range")
    for t in tl.tracks:
        kept = []
        for c in t.clips:
            s, e = c.start, c.end
            if e <= a or s >= b:
                continue
            ns, ne = max(s, a), min(e, b)
            c.in_ = c.in_ + math.floor((ns - s) * c.speed + 0.5)
            new_len = ne - ns
            c.out = min(c.out, c.in_ + max(1, math.floor(new_len * c.speed + 0.5)))
            if c.out <= c.in_:
                continue
            c.keyframes = slice_keyframes(c.keyframes, ns - s, ne - s, c.transform)
            c.start = ns - a
            c.fade_in = min(c.fade_in, max(0, c.length - 1)) if ns == s else 0
            c.fade_out = min(c.fade_out, max(0, c.length - 1 - c.fade_in)) if ne == e else 0
            kept.append(c)
        t.clips = kept
    return tl.model_dump(by_alias=True, mode="json")
