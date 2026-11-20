"""Per-clip video effects (Resolve / Premiere / CapCut style) as FFmpeg filters.

Same numbers as frontend/src/effects.ts, so the export matches the editor preview:
W3C colour matrices (saturate / sepia / hue-rotate), the invert and posterize transfer functions, a 3x3 sharpen
kernel, FFmpeg's own vignette curve cos(angle*d)^4 (the preview draws that curve as a gradient), RGB split,
film grain and cinema bars."""
import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

EffectType = Literal["bw", "sepia", "hue", "invert", "posterize", "sharpen", "vignette", "grain", "rgbsplit", "letterbox", "flipv"]
RANGES: dict[str, tuple[float, float]] = {
    "bw": (0, 1), "sepia": (0, 1), "hue": (-180, 180), "invert": (0, 1), "posterize": (2, 16), "sharpen": (0.1, 2),
    "vignette": (0.05, 1), "grain": (0.05, 1), "rgbsplit": (1, 40), "letterbox": (0.02, 0.25), "flipv": (1, 1),
}
ORDER = ["flipv", "bw", "sepia", "hue", "invert", "posterize", "sharpen", "rgbsplit", "vignette", "grain", "letterbox"]


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


def effect_filters(effects: list[Effect] | None) -> tuple[list[str], list[str]]:
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
            k = [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0]
            m = " ".join(str(int(round(v * 1000))) for v in k)
            planes = ":".join(f"{p}m='{m}':{p}rdiv=0.001" for p in range(3))
            pic += ["format=gbrp", f"convolution={planes}"]
        elif e.type == "rgbsplit":
            p = int(round(a))
            pic += ["format=gbrp", f"rgbashift=rh={-p}:bh={p}:edge=smear"]
        elif e.type == "vignette":
            pic.append(f"vignette=angle={_n(a * math.pi / 2)}:eval=init")
        elif e.type == "grain":
            pic.append(f"noise=alls={int(round(a * 40))}:allf=t+u")
        elif e.type == "letterbox":
            pic.append(f"drawbox=x=0:y=0:w=iw:h=ih*{_n(a)}:color=black:t=fill,drawbox=x=0:y=ih-ih*{_n(a)}:w=iw:h=ih*{_n(a)}:color=black:t=fill")
    return geo, pic
