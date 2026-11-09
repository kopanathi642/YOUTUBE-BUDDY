"""Shorts studio API: new aspect formats, compositions saved with sequences, generated graphics, custom templates,
and a ZIP of several real exports."""
import io
import zipfile

import httpx

from tests.test_editor_flow import drain, new_project, signup, upload


def test_formats_graphics_and_composition_saved(make_client):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    for fmt, wh in {"portrait_45": (1080, 1350), "portrait_23": (1080, 1620), "landscape_32": (1620, 1080)}.items():
        p = new_project(c, ws, format=fmt)
        tl = p["sequences"][0]["timeline"]
        assert (tl["width"], tl["height"]) == wh
    p = new_project(c, ws, format="vertical")
    seq = c.post(f"/api/v1/projects/{p['id']}/sequences", json={"name": "2:3", "format": "portrait_23"}).json()
    assert (seq["timeline"]["width"], seq["timeline"]["height"]) == (1080, 1620)

    for kind in ("solid", "gradient", "vignette", "light_leak"):
        r = c.post(f"/api/v1/projects/{p['id']}/graphics", json={"kind": kind, "color": "#102030", "color2": "#ff8800", "width": 540, "height": 960})
        assert r.status_code == 201, r.text
    assert c.post(f"/api/v1/projects/{p['id']}/graphics", json={"kind": "plasma"}).status_code == 422
    drain()
    media = c.get(f"/api/v1/projects/{p['id']}/media").json()
    assert len(media) == 4 and all(m["status"] == "ready" and m["width"] == 540 and m["height"] == 960 for m in media), media

    # a composition description travels with the timeline (custom size too)
    s = p["sequences"][0]
    tl = {**s["timeline"], "width": 1000, "height": 1250, "composition": {"version": 1, "style": "blur", "layers": [{"id": "l1"}]}}
    tl["tracks"][3]["clips"] = [{"id": "bg", "asset_id": media[0]["id"], "start": 0, "in": 0, "out": 30,
                                 "fx": {"blur": 30}, "crop": {"left": 0.7, "right": 0.1, "top": 0, "bottom": 0}}]
    r = c.put(f"/api/v1/sequences/{s['id']}", json={"base_version": 1, "timeline": tl})
    assert r.status_code == 200, r.text
    got = c.get(f"/api/v1/sequences/{s['id']}").json()["timeline"]
    assert got["composition"]["style"] == "blur" and got["tracks"][3]["clips"][0]["fx"]["blur"] == 30 and got["width"] == 1000
    bad = {**tl, "tracks": [{**t, "clips": [{**cl, "fx": {"blur": 999}} for cl in t["clips"]]} for t in tl["tracks"]]}
    assert c.put(f"/api/v1/sequences/{s['id']}", json={"base_version": 2, "timeline": bad}).status_code == 422


def test_custom_templates_crud_and_isolation(make_client):
    a, b = make_client(), make_client()
    wa = signup(a)["workspaces"][0]["id"]
    wb = signup(b)["workspaces"][0]["id"]
    data = {"style": "stacked", "layers": [{"id": "l1", "kind": "media", "slot": 0}]}
    assert a.post("/api/v1/composition-templates", json={"workspace_id": wa, "name": "Mine", "data": {"layers": []}}).status_code == 422
    t = a.post("/api/v1/composition-templates", json={"workspace_id": wa, "name": "Mine", "category": "Mythology Edits", "data": data}).json()
    assert t["custom"] and t["category"] == "Mythology Edits"
    d = a.post(f"/api/v1/composition-templates/{t['id']}/duplicate").json()
    assert d["name"] == "Mine copy"
    assert a.patch(f"/api/v1/composition-templates/{d['id']}", json={"favorite": True}).json()["favorite"] is True
    lst = a.get(f"/api/v1/workspaces/{wa}/composition-templates").json()
    assert [x["id"] for x in lst][0] == d["id"] and len(lst) == 2      # favourites first
    assert b.get(f"/api/v1/workspaces/{wa}/composition-templates").status_code == 404   # other workspace
    assert b.delete(f"/api/v1/composition-templates/{t['id']}").status_code == 404
    assert b.get(f"/api/v1/workspaces/{wb}/composition-templates").json() == []
    assert a.delete(f"/api/v1/composition-templates/{t['id']}").status_code == 204
    assert len(a.get(f"/api/v1/workspaces/{wa}/composition-templates").json()) == 1


def test_zip_of_several_exports(make_client, fixtures_media):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws, format="vertical")
    v = upload(c, p["id"], fixtures_media["landscape_mp4"], "video/mp4")
    drain()
    seq = p["sequences"][0]
    ids = []
    for i, (w, h) in enumerate([(360, 640), (360, 450)]):
        tl = {**seq["timeline"], "width": w, "height": h}
        tl["tracks"][3]["clips"] = [{"id": f"c{i}", "asset_id": v["id"], "start": 0, "in": 0, "out": 20}]
        s2 = c.post(f"/api/v1/projects/{p['id']}/sequences", json={"name": f"v{i}"}).json()
        assert c.put(f"/api/v1/sequences/{s2['id']}", json={"base_version": 1, "timeline": tl}).status_code == 200
        ids.append(c.post(f"/api/v1/sequences/{s2['id']}/exports", json={"preset": "match"}).json()["id"])
    assert c.post("/api/v1/exports/zip", json={"export_ids": ids}).status_code == 409           # not rendered yet
    drain()
    j = c.post("/api/v1/exports/zip", json={"export_ids": ids, "name": "my shorts"})
    assert j.status_code == 201, j.text
    drain()
    r = c.get(f"/api/v1/exports/zip/{j.json()['id']}").json()
    assert r["status"] == "succeeded" and r["result"]["files"] == 2
    z = zipfile.ZipFile(io.BytesIO(httpx.get(r["download_url"]).content))
    assert sorted(z.namelist()) == ["my shorts-01-360x640.mp4", "my shorts-02-360x450.mp4"]
    assert all(z.getinfo(n).file_size > 5000 for n in z.namelist())
    other = make_client()
    signup(other)
    assert other.get(f"/api/v1/exports/zip/{j.json()['id']}").status_code == 404
