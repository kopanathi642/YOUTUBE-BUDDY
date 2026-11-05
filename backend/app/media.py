"""FFmpeg/FFprobe media inspection and derivative generation (thumbnail, proxy, waveform)."""
import hashlib
import json
import os
import subprocess

ALLOWED = {
    # extension: (kind, accepted declared MIME types)
    ".mp4": ("video", {"video/mp4"}), ".m4v": ("video", {"video/mp4", "video/x-m4v"}),
    ".mov": ("video", {"video/quicktime"}), ".webm": ("video", {"video/webm", "audio/webm"}),
    ".mkv": ("video", {"video/x-matroska", "video/matroska"}),
    ".mp3": ("audio", {"audio/mpeg", "audio/mp3"}), ".wav": ("audio", {"audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"}),
    ".m4a": ("audio", {"audio/mp4", "audio/x-m4a", "audio/aac"}), ".aac": ("audio", {"audio/aac", "audio/x-aac"}),
    ".ogg": ("audio", {"audio/ogg"}), ".flac": ("audio", {"audio/flac", "audio/x-flac"}),
    ".png": ("image", {"image/png"}), ".jpg": ("image", {"image/jpeg"}), ".jpeg": ("image", {"image/jpeg"}),
    ".webp": ("image", {"image/webp"}),
}
# ffprobe format_name tokens we accept per kind (file *signature* check, independent of the filename)
FORMAT_OK = {
    "video": {"mov", "mp4", "m4a", "3gp", "matroska", "webm"},
    "audio": {"mp3", "wav", "mov", "mp4", "m4a", "aac", "ogg", "flac", "matroska", "webm"},
    "image": {"png_pipe", "image2", "jpeg_pipe", "webp_pipe"},
}
MAX_DURATION_S = 4 * 3600
MAX_DIM = 8192


class MediaRejected(Exception):
    pass


def classify(filename: str, content_type: str) -> str:
    ext = os.path.splitext(filename.lower())[1]
    if ext not in ALLOWED:
        raise MediaRejected(f"Unsupported file type '{ext or filename}'")
    kind, mimes = ALLOWED[ext]
    if content_type and content_type != "application/octet-stream" and content_type not in mimes:
        raise MediaRejected(f"Content type {content_type} does not match {ext}")
    return kind


def run(cmd: list[str], timeout: int = 600) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)


def ffprobe(path: str) -> dict:
    r = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path], timeout=120)
    if r.returncode != 0:
        raise MediaRejected("File could not be decoded as media")
    return json.loads(r.stdout)


def _fps(stream: dict) -> float | None:
    for key in ("avg_frame_rate", "r_frame_rate"):
        v = stream.get(key, "0/0")
        try:
            n, d = (int(x) for x in v.split("/"))
            if d and n:
                return round(n / d, 3)
        except ValueError:
            pass
    return None


def inspect(path: str, claimed_kind: str) -> dict:
    """Validate the real file contents and return typed metadata."""
    p = ffprobe(path)
    fmt = p.get("format", {})
    fmt_names = set(fmt.get("format_name", "").split(","))
    if not fmt_names & FORMAT_OK[claimed_kind]:
        raise MediaRejected(f"File contents ({fmt.get('format_name')}) do not match a {claimed_kind} file")
    streams = p.get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")), None)
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)
    duration = float(fmt.get("duration") or 0) or None
    if claimed_kind == "video" and not v:
        raise MediaRejected("No video stream found")
    if claimed_kind == "audio" and not a:
        raise MediaRejected("No audio stream found")
    if claimed_kind == "image" and not v:
        raise MediaRejected("Not a decodable image")
    if claimed_kind != "image" and (not duration or duration <= 0):
        raise MediaRejected("Media has no duration")
    if duration and duration > MAX_DURATION_S:
        raise MediaRejected("Media longer than 4 hours is not supported yet")
    w, h = (v.get("width"), v.get("height")) if v else (None, None)
    if w and h and (w > MAX_DIM or h > MAX_DIM):
        raise MediaRejected(f"Resolution {w}x{h} exceeds supported maximum {MAX_DIM}px")
    # Respect display rotation metadata (phone footage) so width/height match what the user sees.
    rot = 0
    for sd in (v or {}).get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(sd["rotation"])
    if w and h and abs(rot) % 180 == 90:
        w, h = h, w
    return {
        "kind": claimed_kind,
        "duration_s": None if claimed_kind == "image" else duration,
        "width": w, "height": h,
        "fps": _fps(v) if v and claimed_kind == "video" else None,
        "video_codec": v.get("codec_name") if v else None,
        "audio_codec": a.get("codec_name") if a else None,
        "has_video": bool(v), "has_audio": bool(a),
        "probe": {"format": {k: fmt.get(k) for k in ("format_name", "duration", "bit_rate", "size")},
                  "streams": [{k: s.get(k) for k in ("index", "codec_type", "codec_name", "width", "height", "avg_frame_rate",
                                                       "sample_rate", "channels", "pix_fmt", "color_space", "color_transfer", "color_primaries")}
                              for s in streams]},
    }


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def make_thumbnail(src: str, dst: str, meta: dict) -> None:
    t = min(1.0, (meta.get("duration_s") or 0) / 3) if meta["kind"] == "video" else 0
    r = run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{t:.3f}", "-i", src, "-frames:v", "1",
             "-vf", "scale=480:270:force_original_aspect_ratio=decrease", "-q:v", "4", dst], timeout=120)
    if r.returncode != 0 or not os.path.exists(dst):
        raise RuntimeError(f"thumbnail failed: {r.stderr[-400:]}")


def make_proxy(src: str, dst: str, meta: dict) -> None:
    """Lightweight H.264 540p proxy for smooth browser playback. Originals stay untouched."""
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src,
           "-vf", "scale=-2:'min(540,ih)'", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
           "-g", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    cmd += ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] if meta["has_audio"] else ["-an"]
    r = run(cmd + [dst], timeout=3 * 3600)
    if r.returncode != 0:
        raise RuntimeError(f"proxy failed: {r.stderr[-400:]}")


def make_audio_proxy(src: str, dst: str) -> None:
    r = run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vn", "-c:a", "aac", "-b:a", "160k",
             "-ac", "2", "-movflags", "+faststart", dst], timeout=3600)
    if r.returncode != 0:
        raise RuntimeError(f"audio proxy failed: {r.stderr[-400:]}")


def make_waveform(src: str, dst: str, duration_s: float, peaks_per_second: int = 50) -> None:
    """Decode mono 8 kHz PCM and store max-abs peaks as compact JSON for timeline drawing."""
    sr = 8000
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", src, "-vn", "-ac", "1", "-ar", str(sr),
                        "-f", "s16le", "-"], capture_output=True, timeout=3600, check=False)
    if r.returncode != 0:
        raise RuntimeError("waveform decode failed")
    import array
    pcm = array.array("h")
    pcm.frombytes(r.stdout[: len(r.stdout) // 2 * 2])
    step = max(1, sr // peaks_per_second)
    peaks = [round(max((abs(s) for s in pcm[i:i + step]), default=0) / 32768, 3) for i in range(0, len(pcm), step)]
    with open(dst, "w") as f:
        json.dump({"peaks_per_second": peaks_per_second, "duration_s": duration_s, "peaks": peaks}, f, separators=(",", ":"))


def validate_output(path: str, *, width: int, height: int, fps: int, duration_s: float) -> dict:
    """Check a rendered export really is what we promised."""
    p = ffprobe(path)
    v = next((s for s in p["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in p["streams"] if s["codec_type"] == "audio"), None)
    dur = float(p["format"].get("duration") or 0)
    checks = {
        "file_exists": os.path.getsize(path) > 0,
        "video_stream": v is not None,
        "audio_stream": a is not None,
        "codec_h264": bool(v and v["codec_name"] == "h264"),
        "dimensions": bool(v and (v["width"], v["height"]) == (width, height)),
        "fps": bool(v and abs((_fps(v) or 0) - fps) < 0.01),
        "duration": abs(dur - duration_s) <= max(0.1, 2 / fps),
    }
    # Decodability: actually decode the last second of video.
    r = run(["ffmpeg", "-v", "error", "-sseof", "-1", "-i", path, "-f", "null", "-"], timeout=300)
    checks["decodable"] = r.returncode == 0 and not r.stderr.strip()
    return {"ok": all(checks.values()), "checks": checks, "measured": {
        "duration_s": dur, "width": v and v["width"], "height": v and v["height"], "fps": v and _fps(v),
        "video_codec": v and v["codec_name"], "audio_codec": a and a["codec_name"]}}
