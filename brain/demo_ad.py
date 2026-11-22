"""Run with PYTHONPATH=backend. Produce original demo footage, an editable timeline and two CPU renders."""
import argparse
import json
import math
import subprocess
import tempfile
import wave
from array import array
from pathlib import Path
from types import SimpleNamespace
from uuid import NAMESPACE_URL, uuid5

from PIL import Image, ImageDraw
from app.ad_director import AdBrief, build_ad
from app.analysis import detect_scenes
from app.timeline import AssetInfo, Timeline, compile_ffmpeg


def ff(*args):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", *map(str, args)], check=True)


def probe(path):
    return json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams",
                      "-show_format", "-of", "json", str(path)]))


def watch_shot(folder, name, center, radius):
    image = Image.new("RGB", (960, 540), "#101822")
    draw = ImageDraw.Draw(image)
    x, y = center
    for row in range(540):
        glow = int(22 * (1 - row / 540))
        draw.line((0, row, 960, row), fill=(10 + glow, 14 + glow, 20 + glow))
    draw.rounded_rectangle((x-radius*.4, -radius, x+radius*.4, 540+radius), 24, fill="#26312f")
    for rel, color in [(1, "#a99266"), (.98, "#454640"), (.955, "#e4cf9e"), (.93, "#152223")]:
        r = radius * rel
        draw.ellipse((x-r, y-r, x+r, y+r), fill=color)
    def point(angle, distance):
        return (x + math.sin(angle)*radius*distance, y-math.cos(angle)*radius*distance)
    for tick in range(60):
        a = tick * math.tau / 60
        draw.line([point(a, .82 if tick % 5 == 0 else .87), point(a,.9)], fill="#ded1ab", width=4 if tick%5==0 else 1)
    for angle, length, width in [(-1.04,.53,8),(1.05,.74,5),(2.6,.83,2)]:
        draw.line([(x,y), point(angle,length)], fill="#e1cc9e", width=width)
    draw.text((x, y + radius*.38), "M E R I D I A N", anchor="mm", fill="#e3d5ba")
    png = folder / (name + ".png")
    image.save(png)
    path = folder / (name + ".mp4")
    ff("-i", png, "-vf", "zoompan=z='1+on*0.00025':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=360:s=640x360:fps=30",
       "-frames:v", 360, "-c:v", "libx264", "-threads", 1, "-pix_fmt", "yuv420p", path)
    return path


def soundtrack(path):
    rate = 22050
    samples = array("h")
    for i in range(31 * rate):
        t = i / rate
        beat = t % .5
        note = [220, 261.63, 329.63, 293.66][int(t / 2) % 4]
        pulse = math.exp(-beat * 12) * math.sin(math.tau * 60 * beat)
        tone = math.sin(math.tau * note * t) * math.exp(-beat * 3) * min(1, beat * 65)
        samples.append(round(9000 * pulse + 4000 * tone))
    with wave.open(str(path), "wb") as wav:
        wav.setparams((1, 2, rate, 0, "NONE", ""))
        wav.writeframes(samples.tobytes())


def main(folder):
    folder.mkdir(parents=True, exist_ok=False)
    files = [watch_shot(folder, "dial", (540, 330), 310), watch_shot(folder, "hands", (335, 260), 230),
             watch_shot(folder, "reveal", (480, 270), 171)]
    music = folder / "score.wav"
    soundtrack(music)
    assets, sources = {}, {}
    for path in [*files, music]:
        info = probe(path)
        duration = float(info["format"]["duration"])
        video = path in files
        aid = uuid5(NAMESPACE_URL, "yb-demo/" + path.name)
        assets[aid] = SimpleNamespace(duration_s=duration, kind="video" if video else "audio",
            analysis={"scenes": detect_scenes(str(path), duration)} if video else {})
        sources[aid] = AssetInfo(path=str(path), kind=assets[aid].kind, has_audio=not video,
                                  has_video=video, duration_s=duration, width=640 if video else None, height=360 if video else None)
    videos = list(assets)[:3]
    brief = AdBrief(brief="Create a cinematic 30-second advertisement with an emotional hook and a final product reveal.",
                    videos=videos, reveal=videos[-1], music=list(assets)[-1], bpm=120)
    data = build_ad(brief, assets, 30, 640, 360)
    for version in ("advertisement", "quieter-music"):
        if version == "quieter-music":
            next(track for track in data["tracks"] if track["id"] == "a2")["clips"][0]["volume"] = .16
        (folder / f"{version}.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
        out = folder / f"{version}.mp4"
        with tempfile.TemporaryDirectory() as tmp:
            args, _ = compile_ffmpeg(Timeline.model_validate(data), sources, str(out), workdir=tmp)
            subprocess.run(args, check=True)
        info = probe(out)
        assert {s["codec_type"] for s in info["streams"]} == {"audio", "video"}
        assert abs(float(info["format"]["duration"]) - 30) < .05
        ff("-xerror", "-i", out, "-f", "null", "-")
        print(version, info["format"]["duration"], "seconds; fully decoded", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path, help="New directory for the demonstration")
    main(parser.parse_args().output)
