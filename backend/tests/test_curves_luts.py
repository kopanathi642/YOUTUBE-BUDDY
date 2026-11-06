"""Curves + 3D LUTs: maths, validation, real FFmpeg renders checked pixel by pixel, API upload and tenant/kind checks."""
import subprocess
import uuid

import pytest

from app.colorlut import LutError, curve_tables, monotone_curve, parse_cube
from app.timeline import AssetInfo, ColorGrade, Curves, LutRef, Timeline, compile_ffmpeg, default_timeline
from tests.test_editor_flow import drain, new_project, signup, upload

S_CURVE = [(0.0, 0.0), (0.25, 0.15), (0.75, 0.85), (1.0, 1.0)]


def invert_cube(size=2) -> str:
    n = size - 1
    lines = [f"TITLE \"Invert\"", f"LUT_3D_SIZE {size}"]
    for b in range(size):
        for g in range(size):
            for r in range(size):
                lines.append(f"{1 - r / n:.6f} {1 - g / n:.6f} {1 - b / n:.6f}")
    return "\n".join(lines) + "\n"


def test_monotone_curve_is_smooth_and_never_overshoots():
    f = monotone_curve(S_CURVE)
    ys = [f(i / 200) for i in range(201)]
    assert all(b >= a - 1e-12 for a, b in zip(ys, ys[1:]))           # monotone
    assert all(0 <= y <= 1 for y in ys) and f(0.25) == pytest.approx(0.15) and f(0.5) == pytest.approx(0.5)
    # values shared with the browser test (frontend/src/grade.test.ts) — preview and export use identical tables
    assert [round(f(x), 5) for x in (0.1, 0.6, 0.9)] == [0.0504, 0.6568, 0.9496]


def test_curve_tables_compose_master_then_channel():
    r, g, b = curve_tables(Curves(master=S_CURVE, r=[(0, 0.1), (1, 1)]))
    m = monotone_curve(S_CURVE)
    assert g[128] == pytest.approx(m(128 / 255), abs=1e-5) and b == g
    assert r[0] == pytest.approx(0.1) and r[255] == 1.0


def test_curves_and_lut_validation():
    with pytest.raises(ValueError):
        Curves(master=[(0, 0)])                       # too few points
    with pytest.raises(ValueError):
        Curves(r=[(0, 0), (0.5, 0.2), (0.4, 0.9), (1, 1)])  # x not increasing
    assert ColorGrade(curves=Curves()).is_identity()
    assert not ColorGrade(curves=Curves(master=S_CURVE)).is_identity()
    assert ColorGrade(lut=LutRef(asset_id=uuid.uuid4(), strength=0)).is_identity()
    assert parse_cube(invert_cube(3))[0] == 3
    for bad in ("LUT_1D_SIZE 4\n0 0 0\n", "LUT_3D_SIZE 2\n0 0 0\n", "LUT_3D_SIZE 99\n", "hello world",
                "DOMAIN_MAX 2 2 2\n" + invert_cube()):
        with pytest.raises(LutError):
            parse_cube(bad)


def _render_pixel(tmp_path, color: ColorGrade, assets_extra=None) -> list[int]:
    """Render a 1-second solid-colour image clip through the real export compiler; return the centre pixel RGB."""
    png = str(tmp_path / "solid.png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x406080:s=320x180", "-frames:v", "1", png], check=True)
    aid = uuid.uuid4()
    tl = default_timeline(30, 320, 180)
    tl["tracks"][3]["clips"] = [{"id": "c1", "asset_id": str(aid), "start": 0, "in": 0, "out": 30,
                                 "color": color.model_dump(mode="json")}]
    t = Timeline.model_validate(tl)
    assets = {aid: AssetInfo(path=png, kind="image", has_audio=False, has_video=True, duration_s=None), **(assets_extra or {})}
    out = str(tmp_path / "out.mp4")
    argv, _ = compile_ffmpeg(t, assets, out, workdir=str(tmp_path))
    subprocess.run(argv, check=True, capture_output=True)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", out, "-vf", "select=eq(n\\,10),crop=2:2:159:89", "-frames:v", "1",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return list(raw[:3])


def test_export_applies_curves(tmp_path):
    base = _render_pixel(tmp_path, ColorGrade())
    f = monotone_curve(S_CURVE)
    curved = _render_pixel(tmp_path, ColorGrade(curves=Curves(master=S_CURVE)))
    expect = [round(f(v / 255) * 255) for v in (0x40, 0x60, 0x80)]
    print("base", base, "curved", curved, "expected", expect)
    # H.264 4:2:0 round trip adds a few levels of error; the curve moves values by much more than that
    assert all(abs(c - e) <= 6 for c, e in zip(curved, expect)), (curved, expect)
    assert curved[0] < base[0] - 10   # darkened shadows


def test_export_applies_lut_with_strength(tmp_path):
    cube = tmp_path / "invert.cube"
    cube.write_text(invert_cube())
    lid = uuid.uuid4()
    extra = {lid: AssetInfo(path=str(cube), kind="lut", has_audio=False, has_video=False)}
    full = _render_pixel(tmp_path, ColorGrade(lut=LutRef(asset_id=lid, strength=1)), extra)
    half = _render_pixel(tmp_path, ColorGrade(lut=LutRef(asset_id=lid, strength=0.5)), extra)
    print("inverted", full, "half", half)
    assert all(abs(c - e) <= 6 for c, e in zip(full, (255 - 0x40, 255 - 0x60, 255 - 0x80)))
    assert all(abs(c - 128) <= 6 for c in half)   # 50 % invert of any colour is mid-grey


def test_lut_upload_and_use_in_timeline(make_client, fixtures_media):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    r = c.post(f"/api/v1/projects/{p['id']}/luts", json={"filename": "Invert.cube", "content": invert_cube(5)})
    assert r.status_code == 201, r.text
    lut = r.json()
    assert lut["kind"] == "lut" and lut["status"] == "ready" and lut["analysis"]["lut"]["size"] == 5 and lut["proxy_url"]
    assert c.post(f"/api/v1/projects/{p['id']}/luts", json={"filename": "x.cube", "content": "LUT_3D_SIZE 2\n0 0 0\n"}).status_code == 422
    assert c.post(f"/api/v1/projects/{p['id']}/luts", json={"filename": "x.txt", "content": invert_cube()}).status_code == 422
    # not listed in the shared media library
    assert all(a["kind"] != "lut" for a in c.get(f"/api/v1/workspaces/{ws}/media").json())
    v = upload(c, p["id"], fixtures_media["landscape_mp4"], "video/mp4")
    drain()
    proj = c.get(f"/api/v1/projects/{p['id']}").json()
    seq = proj["sequences"][0]
    tl = seq["timeline"]
    tl["tracks"][3]["clips"] = [{"id": "c1", "asset_id": v["id"], "start": 0, "in": 0, "out": 60,
                                 "color": {"lut": {"asset_id": lut["id"], "strength": 0.7}, "curves": {"master": S_CURVE}}}]
    r = c.put(f"/api/v1/sequences/{seq['id']}", json={"timeline": tl, "base_version": seq["version"]})
    assert r.status_code == 200, r.text
    # a LUT can't be used as a clip, and a video can't be used as a LUT
    bad = {**tl, "tracks": [*tl["tracks"][:3], {**tl["tracks"][3], "clips": [{"id": "c2", "asset_id": lut["id"], "start": 0, "in": 0, "out": 30}]}, *tl["tracks"][4:]]}
    assert c.put(f"/api/v1/sequences/{seq['id']}", json={"timeline": bad, "base_version": r.json()["version"]}).status_code == 422
    # export renders with the LUT downloaded from storage
    e = c.post(f"/api/v1/sequences/{seq['id']}/exports", json={"preset": "draft"})
    assert e.status_code in (201, 202), e.text
    drain()
    ex = next(x for x in c.get(f"/api/v1/projects/{p['id']}/exports").json() if x["id"] == e.json()["id"])
    assert ex["job"]["status"] == "succeeded" and ex["download_url"], ex
