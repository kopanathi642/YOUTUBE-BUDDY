"""Operations that create a new media file from an existing one (the original is never modified)."""
import os
import subprocess

from .media import run

MAX_BG_SECONDS = 60


def stabilize(src: str, out: str, has_audio: bool, progress) -> None:
    """Two-pass FFmpeg vid.stab: analyse camera motion, then smooth it (slight zoom hides moving edges)."""
    trf = out + ".trf"
    progress(0.0, "analysing camera shake")
    r = run(["ffmpeg", "-hide_banner", "-y", "-i", src, "-vf", f"vidstabdetect=shakiness=6:accuracy=12:result={trf}", "-f", "null", "-"], timeout=3 * 3600)
    if r.returncode != 0 or not os.path.exists(trf):
        raise RuntimeError("stabilization analysis failed: " + r.stderr[-300:])
    progress(0.5, "smoothing")
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vf",
           f"vidstabtransform=input={trf}:smoothing=24:zoom=3:optzoom=0,unsharp=5:5:0.5",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"]
    cmd += ["-c:a", "aac", "-b:a", "192k"] if has_audio else ["-an"]
    r = run(cmd + ["-movflags", "+faststart", out], timeout=3 * 3600)
    if r.returncode != 0:
        raise RuntimeError("stabilization failed: " + r.stderr[-300:])


MAX_OBJECT_BOXES = 8
MAX_BOX_AREA = 0.25  # of the frame; bigger areas can't be filled convincingly from their edges


def object_boxes_px(boxes: list[dict], width: int, height: int) -> list[tuple[int, int, int, int]]:
    """Normalised boxes (0..1, as drawn on the preview) -> pixel boxes that FFmpeg's delogo accepts.
    Each box grows by a small margin: any sliver of the object left outside the box gets smeared across the fill,
    and hand-drawn boxes are usually tight. delogo needs a 1 px border of real picture, so edges are pulled in by 1 px."""
    out = []
    for b in boxes:
        mx = max(4, round(b["w"] * width * 0.06)); my = max(4, round(b["h"] * height * 0.06))
        x0 = max(1, round(b["x"] * width) - mx); y0 = max(1, round(b["y"] * height) - my)
        x1 = min(width - 2, round((b["x"] + b["w"]) * width) + mx); y1 = min(height - 2, round((b["y"] + b["h"]) * height) + my)
        if x1 - x0 < 3 or y1 - y0 < 3:
            raise ValueError("An area is too small to remove — draw a box at least a few pixels wide")
        out.append((x0, y0, x1 - x0, y1 - y0))
    return out


def remove_object(src: str, out: str, has_audio: bool, width: int, height: int, boxes: list[dict], progress) -> None:
    """Basic object removal on the CPU: every frame, each marked area is rebuilt from the pixels around it
    (FFmpeg delogo). Works for fixed things — logos, watermarks, timestamps, a small object while the camera is still.
    It does not track moving objects or invent new detail (that needs SAM 2 + LaMa, see HANDOFF.md)."""
    if not boxes:
        raise ValueError("Mark at least one area to remove")
    px = object_boxes_px(boxes, width, height)
    progress(0.05, f"removing {len(px)} area{'s' if len(px) > 1 else ''}")
    vf = ",".join(f"delogo=x={x}:y={y}:w={w}:h={h}" for x, y, w, h in px)
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vf", vf,
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"]
    cmd += ["-c:a", "aac", "-b:a", "192k"] if has_audio else ["-an"]
    r = run(cmd + ["-movflags", "+faststart", out], timeout=3 * 3600)
    if r.returncode != 0:
        raise RuntimeError("object removal failed: " + r.stderr[-300:])


def remove_background(src: str, out: str, asset, progress) -> None:
    """Person/subject segmentation per frame with the open-source U²-Net (u2netp, downloaded from GitHub on first use).
    Output: MOV with PNG frames (lossless alpha), max 720p, original audio kept."""
    if (asset.duration_s or 0) > MAX_BG_SECONDS:
        raise ValueError(f"Background removal is limited to {MAX_BG_SECONDS} s clips for now")
    from PIL import Image
    from rembg import new_session, remove
    session = new_session("u2netp")
    fps = asset.fps or 30
    w, h = asset.width or 1280, asset.height or 720
    if h > 720:
        w, h = int(w * 720 / h) // 2 * 2, 720
    total = max(1, int((asset.duration_s or 1) * fps))
    dec = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", src, "-vf", f"scale={w}:{h}",
                            "-f", "rawvideo", "-pix_fmt", "rgb24", "-r", f"{fps}", "-"], stdout=subprocess.PIPE)
    enc_cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{w}x{h}",
               "-r", f"{fps}", "-i", "-"]
    if asset.has_audio:
        enc_cmd += ["-i", src, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-shortest"]
    enc = subprocess.Popen(enc_cmd + ["-c:v", "png", "-pix_fmt", "rgba", out], stdin=subprocess.PIPE)
    frame_bytes, n = w * h * 3, 0
    try:
        while True:
            buf = dec.stdout.read(frame_bytes)
            if len(buf) < frame_bytes:
                break
            img = Image.frombytes("RGB", (w, h), buf)
            enc.stdin.write(remove(img, session=session, post_process_mask=True).tobytes())
            n += 1
            if n % 5 == 0:
                progress(min(0.99, n / total), f"removing background {n}/{total}")
    finally:
        enc.stdin.close()
        dec.stdout.close()
        dec.wait()
        enc.wait()
    if enc.returncode != 0 or n == 0:
        raise RuntimeError("background removal encode failed")
