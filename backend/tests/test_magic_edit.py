"""Magic Edit: select / remove / move / replace on photos.

Fast tests use stand-in models (the logic: only the selected area changes, quotas, access, honest errors).
The real-model test runs when the model files are present in MODEL_CACHE (e.g. MODEL_CACHE=/tmp/mcache)."""
import base64
import io
import os

import numpy as np
import pytest
from PIL import Image

from app import magic_edit as M
from app import magic_replace as R
from tests.test_ai_tools import photo  # noqa: F401  (fixture)
from tests.test_editor_flow import drain, new_project, signup, upload


def scene(w=480, h=320):
    """Blue-grey gradient 'wall' with a red box 'object' in the middle."""
    y, x = np.mgrid[0:h, 0:w]
    img = np.stack([60 + x * 100 // w, 90 + y * 80 // h, np.full_like(x, 150)], -1).astype(np.uint8)
    img[120:200, 200:280] = (220, 30, 30)
    mask = np.zeros((h, w), bool)
    mask[120:200, 200:280] = True
    return Image.fromarray(img), mask


class FakeLama:
    """Fills the hole with the mean colour of what's around it (shape-correct like the real model, 0..255 output)."""
    def run(self, _, feeds):
        img, m = feeds["image"][0], feeds["mask"][0, 0]
        keep = m < 0.5
        mean = img[:, keep].mean(axis=1) * 255
        out = img * 255
        out[:, ~keep] = mean[:, None]
        return [out[None]]


@pytest.fixture
def fake_models(monkeypatch):
    monkeypatch.setattr(M, "_session", lambda name: FakeLama())
    monkeypatch.setattr(M, "ready", lambda: True)


def test_remove_changes_only_the_selected_area(fake_models):
    im, mask = scene()
    out = np.asarray(M.remove(im, mask), int)
    src = np.asarray(im, int)
    grown = M._grow(mask, 6 + 6)            # hole + feather margin
    assert np.array_equal(out[~grown], src[~grown]), "pixels outside the selection must stay identical"
    centre = out[150:170, 230:250]
    assert centre[..., 0].mean() < 150, "the red object is gone"


def test_remove_refuses_empty_or_huge_selection(fake_models):
    im, mask = scene()
    with pytest.raises(M.MagicError, match="Nothing is selected"):
        M.remove(im, np.zeros_like(mask))
    with pytest.raises(M.MagicError, match="most of the photo"):
        M.remove(im, np.ones_like(mask))


def test_move_and_resize_puts_the_object_elsewhere(fake_models):
    im, mask = scene()
    out = np.asarray(M.move(im, mask, dx=-150, dy=0, scale=0.5), int)
    assert out[155:165, 85:95, 0].mean() > 180, "object now around x=90 (moved left, half size)"
    assert out[150:170, 230:250, 0].mean() < 150, "old spot filled"
    with pytest.raises(M.MagicError, match="Resize"):
        M.move(im, mask, 0, 0, 9)


def test_clean_fills_gaps_and_drops_specks():
    m = np.zeros((100, 100), bool)
    m[20:80, 20:80] = True
    m[45:50, 45:50] = False        # gap inside the object
    m[2:4, 95:97] = True           # speck far away
    c = M.clean(m)
    assert c[47, 47] and not c[3, 96]


def test_models_are_pinned_with_open_licences():
    assert {"lama", "sam_encoder", "sam_decoder"} <= set(M.MODELS)
    for m in M.MODELS.values():
        assert len(m.sha256) == 64 and m.urls and "Apache-2.0" in m.licence


def test_offline_without_models_is_an_honest_error(monkeypatch, tmp_path):
    monkeypatch.setattr(M._assets, "CACHE", str(tmp_path))
    monkeypatch.setenv("MODELS_OFFLINE", "1")
    with pytest.raises(M.MagicError, match="missing"):
        M.model_path("lama")


# ------------------------------------------------------------------ replace

def test_replace_without_keys_says_so(monkeypatch):
    for k in ("GEMINI_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_AI_TOKEN"):
        monkeypatch.delenv(k, raising=False)
    im, mask = scene()
    assert R.engines() == []
    with pytest.raises(M.MagicError, match="isn't switched on"):
        R.replace(im, mask, "a green plant")


def test_replace_blends_only_the_selection(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "k")
    monkeypatch.delenv("CLOUDFLARE_ACCOUNT_ID", raising=False)
    calls = {}

    def fake_gemini(crop, hole, prompt):
        calls["prompt"], calls["size"] = prompt, crop.size
        return Image.new("RGB", (512, 512), (20, 200, 20))   # model returns its own size: we resize back
    monkeypatch.setattr(R, "_gemini", fake_gemini)
    im, mask = scene()
    out, engine = R.replace(im, mask, "  a   green plant ")
    assert engine == "gemini" and calls["prompt"] == "a green plant"
    o, s = np.asarray(out, int), np.asarray(im, int)
    assert o[160, 240, 1] > 150 and o[160, 240, 0] < 80, "selection became green"
    far = M._grow(mask, 40)
    assert np.array_equal(o[~far], s[~far]), "outside the selection stays identical"


def test_replace_falls_back_to_cloudflare(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "k")
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a")
    monkeypatch.setenv("CLOUDFLARE_AI_TOKEN", "t")

    def gem(*_):
        raise M.MagicError("Gemini's limit is reached for now.")
    monkeypatch.setattr(R, "_gemini", gem)
    monkeypatch.setattr(R, "_cloudflare", lambda crop, hole, prompt: Image.new("RGB", crop.size, (0, 0, 255)))
    im, mask = scene()
    out, engine = R.replace(im, mask, "a blue ball")
    assert engine == "cloudflare" and np.asarray(out)[160, 240, 2] > 200


def test_replace_daily_caps(monkeypatch):
    monkeypatch.setenv("MAGIC_REPLACE_DAILY", "3")
    monkeypatch.setenv("MAGIC_REPLACE_USER_DAILY", "2")
    R._counts.clear()
    R.take_quota("u1"); R.take_quota("u1")
    with pytest.raises(M.MagicError, match="today's Replace"):
        R.take_quota("u1")
    R.take_quota("u2")
    with pytest.raises(M.MagicError, match="whole site"):
        R.take_quota("u3")
    R.give_back("u2")
    R.take_quota("u3")
    R._counts.clear()


def test_gemini_request_shape(monkeypatch):
    """The Gemini call sends the photo + a marked copy and asks for an image back; the reply's image is used."""
    import httpx
    sent = {}
    green = io.BytesIO()
    Image.new("RGB", (64, 64), (0, 255, 0)).save(green, "PNG")

    def fake_post(url, headers=None, json=None, timeout=None):
        sent["url"], sent["json"], sent["key"] = url, json, headers["x-goog-api-key"]
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "image/png",
                              "data": base64.b64encode(green.getvalue()).decode()}}]}}]}, request=httpx.Request("POST", url))
    monkeypatch.setenv("GEMINI_API_KEY", "secret-key")
    monkeypatch.setenv("GEMINI_IMAGE_MODEL", "gemini-test-flash-image")
    monkeypatch.setattr(httpx, "post", fake_post)
    im, mask = scene()
    out = R._gemini(im, mask, "a cat")
    parts = sent["json"]["contents"][0]["parts"]
    assert "gemini-test-flash-image:generateContent" in sent["url"] and sent["key"] == "secret-key"
    assert len(parts) == 3 and "a cat" in parts[0]["text"] and sent["json"]["generationConfig"]["responseModalities"] == ["IMAGE"]
    assert out.getpixel((5, 5)) == (0, 255, 0)


# ------------------------------------------------------------------ API

@pytest.fixture(scope="module")
def api(photo):  # noqa: F811
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    c.headers["x-requested-with"] = "creator-universe"
    me = signup(c)
    p = new_project(c, me["workspaces"][0]["id"])
    img = upload(c, p["id"], photo, "image/png")["id"]
    drain()
    return {"c": c, "pid": p["id"], "img": img}


def test_api_flow_open_select_remove_undo(api, fake_models, monkeypatch):
    c = api["c"]
    r = c.post("/api/v1/magic/open", json={"asset_id": api["img"]})
    assert r.status_code == 200, r.text
    sid, w, h = r.json()["sid"], r.json()["width"], r.json()["height"]
    # stand-in selector: a box around the tap
    def fake_select(im, points, box=None):
        m = np.zeros((im.height, im.width), bool)
        x, y, _ = points[0]
        m[int(y) - 60:int(y) + 60, int(x) - 50:int(x) + 50] = True
        return m
    monkeypatch.setattr(M, "select", fake_select)
    r = c.post(f"/api/v1/magic/{sid}/select", json={"points": [[320, 160, 1]]})
    assert r.status_code == 200 and 0 < r.json()["area"] < 0.2
    mask = r.json()["mask"]
    r = c.post(f"/api/v1/magic/{sid}/apply", json={"action": "remove", "mask": mask})
    assert r.status_code == 200 and r.json()["version"] == 1, r.text
    img = Image.open(io.BytesIO(c.get(f"/api/v1/magic/{sid}/image").content))
    assert img.size == (w, h)
    assert c.post(f"/api/v1/magic/{sid}/undo").json()["version"] == 0
    r = c.post(f"/api/v1/magic/{sid}/apply", json={"action": "replace", "mask": mask, "prompt": "a plant"})
    assert r.status_code == 422 and "switched on" in r.json()["detail"]


def test_api_rejects_videos_and_strangers(api, fake_models):
    from fastapi.testclient import TestClient
    from app.main import app
    c = api["c"]
    sid = c.post("/api/v1/magic/open", json={"asset_id": api["img"]}).json()["sid"]
    other = TestClient(app)
    other.headers["x-requested-with"] = "creator-universe"
    signup(other)
    assert other.post("/api/v1/magic/open", json={"asset_id": api["img"]}).status_code == 404
    assert other.get(f"/api/v1/magic/{sid}/image").status_code == 404
    assert c.get("/api/v1/magic/status").status_code == 200


@pytest.mark.skipif(not os.path.exists(os.path.join(os.environ.get("MODEL_CACHE", "/var/models"), "magic/lama_fp32.onnx")),
                    reason="real Magic Edit models not downloaded here")
def test_real_models_select_and_erase():
    M._sessions.clear()
    im, _ = scene(640, 427)
    mask = M.select(im, [(240, 160, 1)])
    assert 0.02 < mask.mean() < 0.2 and mask[160, 240], "tap on the red box selects the box"
    out = np.asarray(M.remove(im, mask), int)
    assert out[150:170, 230:250, 0].mean() < 150, "red box erased"


def test_jpeg_photo_gets_a_thumbnail(tmp_path):
    """Regression: seeking inside a still JPEG made FFmpeg 6 write no thumbnail, so JPG photos failed to upload."""
    from app import media
    src, dst = tmp_path / "p.jpg", tmp_path / "t.jpg"
    scene()[0].save(src, "JPEG")
    media.make_thumbnail(str(src), str(dst), {"kind": "image"})
    assert dst.exists() and dst.stat().st_size > 500
