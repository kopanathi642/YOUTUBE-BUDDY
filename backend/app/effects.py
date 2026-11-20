"""Per-clip video effects (Resolve / Premiere / CapCut style) as FFmpeg filters.

Same numbers as frontend/src/effects.ts, so the export matches the editor preview:
W3C colour matrices (saturate / sepia / hue-rotate), the invert and posterize transfer functions, a 3x3 sharpen
kernel, FFmpeg's own vignette curve cos(angle*d)^4 (the preview draws that curve as a gradient), RGB split,
film grain and cinema bars."""
import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

EffectType = Literal["bw", "sepia", "hue", "invert", "posterize", "sharpen", "vignette", "grain", "rgbsplit", "letterbox", "flipv",
                     "emboss", "edges", "sketch", "scanlines", "glow", "halation", "hblur", "vblur", "mosaic", "falsecolor",
                     "greenkey", "bluekey", "lumakey", "denoise", "deflicker", "boxblur", "contrastpop"]
RANGES: dict[str, tuple[float, float]] = {
    "bw": (0, 1), "sepia": (0, 1), "hue": (-180, 180), "invert": (0, 1), "posterize": (2, 16), "sharpen": (0.1, 2),
    "vignette": (0.05, 1), "grain": (0.05, 1), "rgbsplit": (1, 40), "letterbox": (0.02, 0.25), "flipv": (1, 1),
    "emboss": (0.2, 2), "edges": (0.5, 3), "sketch": (0.5, 3), "scanlines": (0.1, 0.8),
    "boxblur": (1, 30), "contrastpop": (0.1, 1.5),
    "glow": (0.1, 1), "halation": (0.1, 1), "hblur": (1, 60), "vblur": (1, 60), "mosaic": (4, 80), "falsecolor": (1, 1),
    "greenkey": (1, 12), "bluekey": (1, 12), "lumakey": (0.02, 0.6), "denoise": (0.2, 1), "deflicker": (1, 1),
}
ORDER = ["flipv", "denoise", "deflicker", "greenkey", "bluekey", "lumakey", "boxblur", "hblur", "vblur", "bw", "sepia", "hue", "invert", "posterize",
         "sharpen", "contrastpop", "emboss", "edges", "sketch", "falsecolor", "mosaic", "glow", "halation", "rgbsplit", "vignette", "grain", "scanlines", "letterbox"]
EXPORT_ONLY = {"denoise", "deflicker"}   # clean-up filters: the preview can't run them, the export does (the editor says so)
POP_SIGMA = 10
GLOW_SIGMA = 14          # sequence px, same as the preview
LUMA_KEY_SOFT = 6
# False colour (exposure) palette, 9 evenly spaced stops from black to white — same table as the preview
FALSE_COLOUR = ["#2b0a3d", "#1f3a93", "#2f6fbf", "#6b6b6b", "#3fae49", "#9a9a9a", "#f28cb1", "#f5d431", "#e53935"]


class Effect(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: EffectType
    amount: float = Field(allow_inf_nan=False)

    @model_validator(mode="after")
    def _range(self):
        lo, hi = RANGES[self.type]
        if not lo <= self.amount <= hi:
            raise ValueError(f"{self.type} amount must be between {lo} and {hi}")
        return self


def check_effects(effects: list[Effect] | None) -> None:
    if effects and len({e.type for e in effects}) != len(effects):
        raise ValueError("each effect can be used once per clip")


# ---- colour maths (W3C Filter Effects), identical to effects.ts
def saturate_m(s: float) -> list[float]:
    return [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
            0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
            0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]


def sepia_m(a: float) -> list[float]:
    s = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131]
    return [(1.0 if i % 4 == 0 else 0.0) * (1 - a) + v * a for i, v in enumerate(s)]


def hue_m(deg: float) -> list[float]:
    r = math.radians(deg)
    c, s = math.cos(r), math.sin(r)
    return [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
            0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
            0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072]


def vignette_factor(a: float, d: float) -> float:
    c = math.cos(a * (math.pi / 2) * min(1.0, d))
    return c ** 4


def _n(v: float) -> str:
    return f"{v:.5f}".rstrip("0").rstrip(".") if v != int(v) else str(int(v))


def _mixer(m: list[float]) -> str:
    keys = ["rr", "rg", "rb", "gr", "gg", "gb", "br", "bg", "bb"]
    return "colorchannelmixer=" + ":".join(f"{k}={_n(max(-2.0, min(2.0, v)))}" for k, v in zip(keys, m))


def _conv(k: list[float]) -> list[str]:
    """3x3 kernel on R, G and B (same numbers as the preview's feConvolveMatrix); alpha (plane 3) untouched."""
    m = " ".join(str(int(round(v * 1000))) for v in k)
    return ["format=gbrap", "convolution=" + ":".join(f"{p}m='{m}':{p}rdiv=0.001" for p in range(3))]


def emboss_k(a: float) -> list[float]:
    return [-2 * a, -a, 0, -a, 1, a, 0, a, 2 * a]


def edge_k(a: float) -> list[float]:
    return [-a, -a, -a, -a, 8 * a, -a, -a, -a, -a]


def _lut_table(vals: list[float]) -> str:
    """lutrgb expression: piecewise-linear table over 0..maxval (like SVG feFuncX type="table")."""
    n = len(vals) - 1
    expr = f"{_n(vals[-1])}*maxval"
    for i in range(n - 1, -1, -1):
        seg = f"({_n(vals[i])}+({_n(vals[i + 1] - vals[i])})*(val*{n}/maxval-{i}))*maxval"
        expr = f"if(lt(val*{n},maxval*{i + 1}),{seg},{expr})"
    return expr


def _screen(tag: str, blurred: str, a: float) -> list[str]:
    """picture screen-blended with a blurred copy at opacity a (glow / halation); alpha kept from the picture."""
    return [f"format=gbrap,split[{tag}a][{tag}b];[{tag}b]gblur=sigma={GLOW_SIGMA}{blurred}[{tag}c];"
            f"[{tag}a][{tag}c]blend=c0_mode=screen:c1_mode=screen:c2_mode=screen:c0_opacity={_n(a)}:c1_opacity={_n(a)}:c2_opacity={_n(a)}:c3_opacity=0"]


def _key(mixer: str, alpha_expr: str) -> list[str]:
    return ["format=rgba", mixer, f"lutrgb=a='{alpha_expr}'"]


def effect_filters(effects: list[Effect] | None, tag: str = "e") -> tuple[list[str], list[str]]:
    """(geometry filters to run with the flips, picture filters to run after colour grade and blur)."""
    geo: list[str] = []
    pic: list[str] = []
    for e in sorted(effects or [], key=lambda e: ORDER.index(e.type)):
        a = e.amount
        if e.type == "flipv":
            geo.append("vflip")
        elif e.type == "bw":
            pic.append(_mixer(saturate_m(1 - a)))
        elif e.type == "sepia":
            pic.append(_mixer(sepia_m(a)))
        elif e.type == "hue":
            pic.append(_mixer(hue_m(a)))
        elif e.type == "invert":
            ex = f"val*{_n(1 - 2 * a)}+{_n(a)}*maxval"
            pic.append(f"lutrgb=r='{ex}':g='{ex}':b='{ex}'")
        elif e.type == "posterize":
            n = int(round(a))
            ex = f"floor(val*{n}/(maxval+1))*maxval/{n - 1}"
            pic.append(f"lutrgb=r='{ex}':g='{ex}':b='{ex}'")
        elif e.type == "sharpen":
            pic += _conv([0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0])
        elif e.type == "emboss":
            pic += _conv(emboss_k(a))
        elif e.type == "edges":
            pic += _conv(edge_k(a))
        elif e.type == "sketch":
            pic += [_mixer(saturate_m(0)), *_conv(edge_k(a)), "lutrgb=r='maxval-val':g='maxval-val':b='maxval-val'"]
        elif e.type == "glow":
            pic += _screen(f"{tag}g", "", a)
        elif e.type == "halation":   # red-orange bloom around highlights
            pic += _screen(f"{tag}h", ",colorchannelmixer=rr=1:gg=0.25:bb=0", a)
        elif e.type == "boxblur":
            r = int(round(a))
            pic.append(f"avgblur=sizeX={r}:sizeY={r}")
        elif e.type == "contrastpop":   # A·(1+a) − blur(A)·a, alpha kept
            t = f"{tag}p"
            ex = f"A*{_n(1 + a)}-B*{_n(a)}"
            pic.append(f"format=gbrap,split[{t}a][{t}b];[{t}b]gblur=sigma={POP_SIGMA}[{t}c];"
                       f"[{t}a][{t}c]blend=c0_expr='{ex}':c1_expr='{ex}':c2_expr='{ex}':c3_expr=A")
        elif e.type == "hblur":
            pic.append(f"gblur=sigma={_n(a)}:sigmaV=0")
        elif e.type == "vblur":
            pic += ["transpose=1", f"gblur=sigma={_n(a)}:sigmaV=0", "transpose=2"]
        elif e.type == "mosaic":
            b = int(round(a))
            pic.append(f"pixelize=w={b}:h={b}:m=avg")
        elif e.type == "falsecolor":
            cols = [[int(c[i:i + 2], 16) / 255 for i in (1, 3, 5)] for c in FALSE_COLOUR]
            r, g, b = (_lut_table([c[j] for c in cols]) for j in range(3))
            pic += [_mixer(saturate_m(0)), f"lutrgb=r='{r}':g='{g}':b='{b}'"]
        elif e.type in ("greenkey", "bluekey"):
            # alpha = clamp(1 - s·(key − mean of the other two)); mixer gives clamp(1 − d), the lut stretches it by s
            mix = "colorchannelmixer=aa=1:ar=0.5:ag=-1:ab=0.5" if e.type == "greenkey" else "colorchannelmixer=aa=1:ar=0.5:ag=0.5:ab=-1"
            pic += _key(mix, f"clip(maxval-{_n(a)}*(maxval-val),0,maxval)")
        elif e.type == "lumakey":   # alpha = clamp(6·(luma − threshold))
            pic += _key("colorchannelmixer=aa=0:ar=0.213:ag=0.715:ab=0.072", f"clip({LUMA_KEY_SOFT}*(val-{_n(a)}*maxval),0,maxval)")
        elif e.type == "denoise":
            pic.append(f"hqdn3d={_n(4 * a)}:{_n(3 * a)}:{_n(6 * a)}:{_n(4.5 * a)}")
        elif e.type == "deflicker":
            pic.append("deflicker=size=5:mode=am")
        elif e.type == "scanlines":   # a dark 1 px line every 4 px, like the preview's repeating gradient
            pic.append(f"drawgrid=w=iw*2:h=4:x=iw:y=3:t=1:color=black@{_n(a)}")
        elif e.type == "rgbsplit":
            p = int(round(a))
            pic += ["format=gbrap", f"rgbashift=rh={-p}:bh={p}:edge=smear"]
        elif e.type == "vignette":
            pic.append(f"vignette=angle={_n(a * math.pi / 2)}:eval=init")
        elif e.type == "grain":
            pic.append(f"noise=alls={int(round(a * 40))}:allf=t+u")
        elif e.type == "letterbox":
            pic.append(f"drawbox=x=0:y=0:w=iw:h=ih*{_n(a)}:color=black:t=fill,drawbox=x=0:y=ih-ih*{_n(a)}:w=iw:h=ih*{_n(a)}:color=black:t=fill")
    return geo, pic


# ======================= Fairlight-style audio effects =======================
# Same parameters in frontend/src/audiofx.ts (Web Audio preview). Biquads follow the RBJ cookbook in both
# (FFmpeg bass/treble/equalizer/highpass/lowpass/bandreject and Web Audio BiquadFilterNode), echo and reverb are
# the same delay taps, stereo width is the same mid/side matrix. Compressor/limiter/tremolo use each engine's own
# detector, so they sound close rather than sample-identical; de-esser, pitch and leveler run in the export only.
AudioFxType = Literal["eqlow", "eqmid", "eqhigh", "highpass", "lowpass", "dehum", "echo", "reverb", "compressor", "limiter",
                      "distortion", "tremolo", "width", "deesser", "pitch", "leveler"]
AUDIO_RANGES: dict[str, tuple[float, float]] = {
    "eqlow": (-12, 12), "eqmid": (-12, 12), "eqhigh": (-12, 12), "highpass": (20, 2000), "lowpass": (300, 20000), "dehum": (1, 1),
    "echo": (60, 1000), "reverb": (0.1, 1), "compressor": (0.1, 1), "limiter": (-12, -1), "distortion": (1, 20), "tremolo": (1, 15),
    "width": (0, 2), "deesser": (0.1, 1), "pitch": (-12, 12), "leveler": (1, 1),
}
AUDIO_ORDER = ["highpass", "lowpass", "dehum", "deesser", "eqlow", "eqmid", "eqhigh", "pitch", "distortion", "compressor", "leveler",
               "tremolo", "echo", "reverb", "width", "limiter"]
AUDIO_EXPORT_ONLY = {"deesser", "pitch", "leveler"}
REVERB_TAPS_MS = [23, 37, 53, 71, 89, 113, 139, 167, 199, 233, 271, 311, 359, 409]


def reverb_gains(a: float) -> list[float]:
    return [round(a * 0.55 * math.exp(-d / 160), 4) for d in REVERB_TAPS_MS]


class AudioFx(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: AudioFxType
    amount: float = Field(allow_inf_nan=False)

    @model_validator(mode="after")
    def _range(self):
        lo, hi = AUDIO_RANGES[self.type]
        if not lo <= self.amount <= hi:
            raise ValueError(f"{self.type} amount must be between {lo} and {hi}")
        return self


def check_audio_fx(fx: list[AudioFx] | None) -> None:
    if fx and len({e.type for e in fx}) != len(fx):
        raise ValueError("each audio effect can be used once per clip")


def audio_filters(fx: list[AudioFx] | None) -> list[str]:
    out: list[str] = []
    for e in sorted(fx or [], key=lambda e: AUDIO_ORDER.index(e.type)):
        a = e.amount
        if e.type == "eqlow":
            out.append(f"bass=g={_n(a)}:f=100")   # FFmpeg default slope = RBJ shelf S=1 = Web Audio lowshelf
        elif e.type == "eqmid":
            out.append(f"equalizer=f=1000:t=q:w=1:g={_n(a)}")
        elif e.type == "eqhigh":
            out.append(f"treble=g={_n(a)}:f=8000")
        elif e.type == "highpass":
            out.append(f"highpass=f={_n(a)}:p=2:t=q:w=0.7071")
        elif e.type == "lowpass":
            out.append(f"lowpass=f={_n(a)}:p=2:t=q:w=0.7071")
        elif e.type == "dehum":   # Indian mains: 50 Hz and its first harmonics
            out += [f"bandreject=f={f}:t=q:w=10" for f in (50, 100, 150)]
        elif e.type == "echo":
            out.append(f"aecho=1:1:{_n(a)}:0.4")
        elif e.type == "reverb":
            out.append(f"aecho=1:1:{'|'.join(str(d) for d in REVERB_TAPS_MS)}:{'|'.join(_n(g) for g in reverb_gains(a))}")
        elif e.type == "compressor":
            out.append(f"acompressor=threshold={_n(10 ** ((-10 - 20 * a) / 20))}:ratio=4:attack=5:release=100")
        elif e.type == "limiter":
            out.append(f"alimiter=limit={_n(10 ** (a / 20))}:level=false:attack=1:release=50")
        elif e.type == "distortion":   # tanh(drive·x) / tanh(drive), like the preview's WaveShaper curve
            ex = f"tanh(val(0)*{_n(a)})/{_n(math.tanh(a))}|tanh(val(1)*{_n(a)})/{_n(math.tanh(a))}"
            out.append(f"aeval='{ex}':c=same")
        elif e.type == "tremolo":
            out.append(f"tremolo=f={_n(a)}:d=0.6")
        elif e.type == "width":
            out.append(f"extrastereo=m={_n(a)}:c=false")
        elif e.type == "deesser":
            out.append(f"deesser=i={_n(a)}:m=0.5:f=0.5:s=o")
        elif e.type == "pitch":
            out.append(f"rubberband=pitch={_n(2 ** (a / 12))}")
        elif e.type == "leveler":
            out.append("dynaudnorm=f=250:g=15")
    return out
