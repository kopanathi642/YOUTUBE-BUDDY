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
