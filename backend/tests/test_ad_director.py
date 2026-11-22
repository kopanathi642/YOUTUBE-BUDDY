from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.ad_director import AdBrief, build_ad
from app.timeline import Timeline


def test_ad_uses_measured_ranges_and_keeps_reveal():
    first, last, music = uuid4(), uuid4(), uuid4()
    assets = {aid: SimpleNamespace(kind="video", duration_s=16, analysis={"scenes": [{"start": 3.5}]})
              for aid in (first, last)}
    assets[music] = SimpleNamespace(kind="audio", duration_s=40)
    brief = AdBrief(brief="A fast, cool ad", videos=[first, last], reveal=last, music=music, bpm=120)
    timeline = Timeline.model_validate(build_ad(brief, assets, 30, 640, 360))
    clips = next(t.clips for t in timeline.tracks if t.id == "v1")
    assert timeline.duration_frames == 900
    assert clips[0].asset_id == first and clips[0].out - clips[0].in_ == 60
    assert clips[-1].asset_id == last and clips[-1].out == 480 and clips[-1].start == 780
    assert clips[0].color.temperature < 0
    assert next(t.clips[0].asset_id for t in timeline.tracks if t.id == "a2") == music
    for aid in (first, last):
        intervals = sorted((c.in_, c.out) for c in clips if c.asset_id == aid)
        assert all(a[1] <= b[0] for a, b in zip(intervals, intervals[1:]))
    with pytest.raises(ValueError, match="ready video"):
        build_ad(brief, {}, 30, 640, 360)
    assets[first].duration_s = 1
    with pytest.raises(ValueError, match="30 seconds"):
        build_ad(brief, assets, 30, 640, 360)
