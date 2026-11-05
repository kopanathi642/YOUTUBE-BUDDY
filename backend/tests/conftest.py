import os
import subprocess

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://creator:creator@localhost:5432/creator_test")
os.environ["S3_ENDPOINT_URL"] = "http://127.0.0.1:9100"
os.environ["S3_BUCKET"] = "test-media"
os.environ["S3_REGION"] = "us-east-1"
os.environ["ENV"] = "test"
os.environ["MULTIPART_PART_SIZE"] = str(5 * 1024 * 1024)
os.environ["SCRATCH_DIR"] = "/tmp/creator-worker-test"

from moto.server import ThreadedMotoServer  # noqa: E402

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


def _gen(name, args):
    p = os.path.join(FIX, name)
    if not os.path.exists(p):
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args, p], check=True)
    return p


@pytest.fixture(scope="session", autouse=True)
def fixtures_media():
    """Generated test media (legally clean): colour bars + tones in several containers/orientations."""
    os.makedirs(FIX, exist_ok=True)
    return {
        "landscape_mp4": _gen("landscape_h264_aac.mp4", ["-f", "lavfi", "-i", "testsrc2=s=1280x720:r=30:d=4", "-f", "lavfi",
                              "-i", "sine=f=440:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"]),
        "portrait_webm": _gen("portrait_vp9_opus.webm", ["-f", "lavfi", "-i", "testsrc=s=360x640:r=25:d=3", "-f", "lavfi",
                              "-i", "sine=f=660:d=3", "-c:v", "libvpx-vp9", "-b:v", "300k", "-c:a", "libopus", "-shortest"]),
        "silent_mov": _gen("silent.mov", ["-f", "lavfi", "-i", "smptebars=s=640x480:r=24:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p"]),
        "tone_wav": _gen("tone.wav", ["-f", "lavfi", "-i", "sine=f=220:d=5:sample_rate=48000"]),
        "logo_png": _gen("logo.png", ["-f", "lavfi", "-i", "color=c=orange:s=400x200:d=1", "-frames:v", "1"]),
        "fake_mp4": _write(os.path.join(FIX, "not_really_video.mp4"), b"this is plain text pretending to be a video\n" * 50),
    }


def _write(p, data):
    with open(p, "wb") as f:
        f.write(data)
    return p


@pytest.fixture(scope="session", autouse=True)
def s3():
    srv = ThreadedMotoServer(ip_address="127.0.0.1", port=9100)
    srv.start()
    from app import storage
    storage.ensure_bucket(["http://localhost:5173"])
    yield
    srv.stop()


@pytest.fixture(scope="session", autouse=True)
def database():
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import text
    from app.db import get_engine
    with get_engine().begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "migrations"))
    command.upgrade(cfg, "head")  # also proves migrations apply cleanly from empty
    yield


@pytest.fixture(autouse=True)
def _reset_limits():
    from app.security import auth_limiter
    auth_limiter.reset()


@pytest.fixture
def make_client():
    from fastapi.testclient import TestClient
    from app.main import app

    def mk():
        c = TestClient(app)
        c.headers["x-requested-with"] = "creator-universe"
        return c
    return mk
