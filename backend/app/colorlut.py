"""Curves and 3D LUTs, computed identically here (FFmpeg export) and in frontend/src/grade.ts (live preview).

Curves: monotone cubic (Fritsch–Carlson) through the control points, sampled to a 256-entry table per channel;
each channel table is composed with the master curve: out = curve_c(master(x)). FFmpeg applies the tables
with lut1d (linear between entries) and the browser with SVG feComponentTransfer type="table" — the same maths.

LUTs: Adobe/Resolve .cube 3D files (LUT_3D_SIZE 2..65, domain 0..1, red fastest). "Strength" is applied by
blending the table with identity before use, so 50 % means exactly half-way in both preview and export."""
from __future__ import annotations

import math
import os

TABLE = 256
MAX_CUBE_BYTES = 8 * 1024 * 1024


class LutError(ValueError):
    pass


def _r5(x: float) -> float:
    return float(f"{x:.5f}")


def monotone_curve(points: list[tuple[float, float]]):
    """Return f(x) for 0..1 through `points` (sorted by x), monotone between points, flat outside."""
    pts = sorted((min(1.0, max(0.0, float(x))), min(1.0, max(0.0, float(y)))) for x, y in points)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    n = len(pts)
    if n == 0:
        return lambda x: x
    if n == 1:
        return lambda x: ys[0]
    d = [(ys[i + 1] - ys[i]) / ((xs[i + 1] - xs[i]) or 1e-9) for i in range(n - 1)]
    m = [d[0]] + [0.0 if d[i - 1] * d[i] <= 0 else (d[i - 1] + d[i]) / 2 for i in range(1, n - 1)] + [d[-1]]
    for i in range(n - 1):  # Fritsch–Carlson: limit tangents so the curve never overshoots
        if d[i] == 0:
            m[i] = m[i + 1] = 0.0
            continue
        a, b = m[i] / d[i], m[i + 1] / d[i]
        s = a * a + b * b
        if s > 9:
            t = 3 / math.sqrt(s)
            m[i], m[i + 1] = t * a * d[i], t * b * d[i]

    def f(x: float) -> float:
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = 0
        while x > xs[i + 1]:
            i += 1
        h = xs[i + 1] - xs[i] or 1e-9
        t = (x - xs[i]) / h
        t2, t3 = t * t, t * t * t
        v = ((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1]
             + (t3 - t2) * h * m[i + 1])
        return min(1.0, max(0.0, v))
    return f


def curve_tables(curves) -> tuple[list[float], list[float], list[float]]:
    """256-entry (r, g, b) tables = channel_curve(master_curve(x))."""
    master = monotone_curve(curves.master)
    out = []
    for pts in (curves.r, curves.g, curves.b):
        c = monotone_curve(pts)
        out.append([_r5(c(master(i / (TABLE - 1)))) for i in range(TABLE)])
    return out[0], out[1], out[2]


def write_1d_cube(tables, path: str) -> str:
    r, g, b = tables
    with open(path, "w") as f:
        f.write(f"LUT_1D_SIZE {TABLE}\n")
        for i in range(TABLE):
            f.write(f"{r[i]:.5f} {g[i]:.5f} {b[i]:.5f}\n")
    return path


def parse_cube(text: str) -> tuple[int, list[tuple[float, float, float]], str]:
    """Validate a 3D .cube file. Returns (size, rows, title)."""
    if len(text.encode()) > MAX_CUBE_BYTES:
        raise LutError("LUT file is larger than 8 MB")
    size, title, rows, dmin, dmax = None, "", [], (0.0, 0.0, 0.0), (1.0, 1.0, 1.0)
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key = line.split()[0].upper()
        if key == "TITLE":
            title = line[5:].strip().strip('"')[:120]
        elif key == "LUT_3D_SIZE":
            size = int(line.split()[1])
        elif key == "LUT_1D_SIZE":
            raise LutError("This is a 1D LUT — please upload a 3D .cube LUT")
        elif key in ("DOMAIN_MIN", "DOMAIN_MAX"):
            v = tuple(float(x) for x in line.split()[1:4])
            if key == "DOMAIN_MIN":
                dmin = v
            else:
                dmax = v
        elif key[0].isdigit() or key[0] in "-.":
            p = line.split()
            if len(p) != 3:
                raise LutError("Bad data line in LUT")
            try:
                v = tuple(float(x) for x in p)
            except ValueError:
                raise LutError("Bad number in LUT")
            if not all(math.isfinite(x) for x in v):
                raise LutError("Bad number in LUT")
            rows.append(v)
        else:
            continue  # unknown keywords (e.g. LUT_IN_VIDEO_RANGE) are ignored
    if size is None or not (2 <= size <= 65):
        raise LutError("Missing or unsupported LUT_3D_SIZE (2–65)")
    if len(rows) != size ** 3:
        raise LutError(f"Expected {size ** 3} colour rows, found {len(rows)}")
    if dmin != (0.0, 0.0, 0.0) or dmax != (1.0, 1.0, 1.0):
        raise LutError("Only LUTs with the standard 0–1 input range are supported")
    return size, rows, title


def write_3d_cube(size: int, rows, strength: float, path: str) -> str:
    """Write the LUT blended with identity by `strength` (0..1). Rows are red-fastest."""
    s = min(1.0, max(0.0, strength))
    n = size - 1
    with open(path, "w") as f:
        f.write(f"LUT_3D_SIZE {size}\n")
        i = 0
        for bi in range(size):
            for gi in range(size):
                for ri in range(size):
                    r, g, b = rows[i]
                    i += 1
                    ir, ig, ib = ri / n, gi / n, bi / n
                    f.write(f"{_r5(ir + s * (r - ir)):.5f} {_r5(ig + s * (g - ig)):.5f} {_r5(ib + s * (b - ib)):.5f}\n")
    return path


def cube_from_path(path: str):
    with open(path, encoding="utf-8", errors="replace") as f:
        return parse_cube(f.read())


def ensure_dir(p: str) -> str:
    os.makedirs(p, exist_ok=True)
    return p
