"""Free stock media from Pexels and Pixabay (free API keys). Results are normalised; imports are re-looked-up by id on the
server (never a URL from the browser) and downloaded only from the providers' own media hosts, then processed like an
upload. Each imported file keeps its attribution (provider, author, page) in analysis["stock"]."""
from __future__ import annotations

import os
from urllib.parse import urlparse

import httpx

PEXELS = "https://api.pexels.com"
PIXABAY = "https://pixabay.com/api"
MEDIA_HOSTS = {"pexels": ("videos.pexels.com", "images.pexels.com"), "pixabay": ("cdn.pixabay.com", "pixabay.com")}
MAX_BYTES = 600 * 1024 * 1024


class StockError(Exception):
    pass


def keys() -> dict:
    return {"pexels": bool(os.environ.get("PEXELS_API_KEY")), "pixabay": bool(os.environ.get("PIXABAY_API_KEY"))}


def _base(name: str) -> str:
    return os.environ.get(f"{name.upper()}_API_URL") or (PEXELS if name == "pexels" else PIXABAY)


def _get(provider: str, path: str, **params) -> dict:
    try:
        if provider == "pexels":
            r = httpx.get(_base("pexels") + path, params=params, headers={"Authorization": os.environ["PEXELS_API_KEY"]}, timeout=20)
        else:
            r = httpx.get(_base("pixabay") + path, params={**params, "key": os.environ["PIXABAY_API_KEY"]}, timeout=20)
    except KeyError:
        raise StockError(f"The server has no {provider.title()} API key yet")
    except httpx.HTTPError as e:
        raise StockError(f"{provider.title()} could not be reached ({type(e).__name__})")
    if r.status_code == 429:
        raise StockError(f"{provider.title()} rate limit reached — try again in a minute")
    if r.status_code >= 400:
        raise StockError(f"{provider.title()} returned an error ({r.status_code})")
    return r.json()


def _pick_video(files: list[dict]) -> dict | None:
    mp4 = [f for f in files if (f.get("file_type") or "video/mp4") == "video/mp4" and f.get("link") or f.get("url")]
    fit = [f for f in mp4 if (f.get("width") or 0) <= 1920] or mp4
    return max(fit, key=lambda f: f.get("width") or 0) if fit else None


def _norm_pexels(kind: str, x: dict) -> dict:
    if kind == "video":
        f = _pick_video(x.get("video_files", [])) or {}
        return {"provider": "pexels", "kind": "video", "id": str(x["id"]), "thumb": x.get("image"), "preview": f.get("link"),
                "width": f.get("width") or x.get("width"), "height": f.get("height") or x.get("height"), "duration": x.get("duration"),
                "author": (x.get("user") or {}).get("name"), "author_url": (x.get("user") or {}).get("url"), "page_url": x.get("url"),
                "download_url": f.get("link")}
    src = x.get("src") or {}
    return {"provider": "pexels", "kind": "photo", "id": str(x["id"]), "thumb": src.get("medium"), "preview": src.get("large"),
            "width": x.get("width"), "height": x.get("height"), "duration": None, "author": x.get("photographer"),
            "author_url": x.get("photographer_url"), "page_url": x.get("url"), "download_url": src.get("large2x") or src.get("original")}


def _norm_pixabay(kind: str, x: dict) -> dict:
    if kind == "video":
        v = x.get("videos") or {}
        f = next((v[k] for k in ("large", "medium", "small", "tiny") if (v.get(k) or {}).get("url") and (v[k].get("width") or 0) <= 1920), None) or {}
        return {"provider": "pixabay", "kind": "video", "id": str(x["id"]), "thumb": f.get("thumbnail") or (v.get("tiny") or {}).get("thumbnail"),
                "preview": (v.get("tiny") or v.get("small") or {}).get("url"), "width": f.get("width"), "height": f.get("height"),
                "duration": x.get("duration"), "author": x.get("user"), "author_url": f"https://pixabay.com/users/{x.get('user_id')}/" if x.get("user_id") else None,
                "page_url": x.get("pageURL"), "download_url": f.get("url")}
    return {"provider": "pixabay", "kind": "photo", "id": str(x["id"]), "thumb": x.get("webformatURL"), "preview": x.get("webformatURL"),
            "width": x.get("imageWidth"), "height": x.get("imageHeight"), "duration": None, "author": x.get("user"),
            "author_url": f"https://pixabay.com/users/{x.get('user_id')}/" if x.get("user_id") else None, "page_url": x.get("pageURL"),
            "download_url": x.get("largeImageURL") or x.get("webformatURL")}


def search(provider: str, kind: str, q: str, page: int = 1) -> dict:
    if provider == "pexels":
        d = _get("pexels", "/videos/search" if kind == "video" else "/v1/search", query=q, per_page=24, page=page)
        items = [_norm_pexels(kind, x) for x in (d.get("videos") if kind == "video" else d.get("photos")) or []]
        return {"items": items, "total": d.get("total_results", len(items)), "attribution": "Photos and videos provided by Pexels"}
    d = _get("pixabay", "/videos/" if kind == "video" else "/", q=q, per_page=24, page=page, safesearch="true",
             **({} if kind == "video" else {"image_type": "photo"}))
    items = [_norm_pixabay(kind, x) for x in d.get("hits") or []]
    return {"items": items, "total": d.get("totalHits", len(items)), "attribution": "Images and videos from Pixabay"}


def lookup(provider: str, kind: str, item_id: str) -> dict:
    """Fetch one item again by id from the provider (the only source of the download URL we trust)."""
    if not item_id.isdigit():
        raise StockError("Unknown stock item")
    if provider == "pexels":
        x = _get("pexels", f"/videos/videos/{item_id}" if kind == "video" else f"/v1/photos/{item_id}")
        it = _norm_pexels(kind, x)
    else:
        d = _get("pixabay", "/videos/" if kind == "video" else "/", id=item_id)
        hits = d.get("hits") or []
        if not hits:
            raise StockError("That stock item no longer exists")
        it = _norm_pixabay(kind, hits[0])
    url = it.get("download_url") or ""
    host = urlparse(url).hostname or ""
    allowed = MEDIA_HOSTS[provider] + ((urlparse(_base(provider)).hostname,) if os.environ.get(f"{provider.upper()}_API_URL") else ())
    if urlparse(url).scheme not in ("https", "http") or not any(host == h or host.endswith("." + h) for h in allowed):
        raise StockError("Unexpected download location for this stock item")
    return it


def download(url: str, dest: str) -> int:
    n = 0
    with httpx.stream("GET", url, timeout=httpx.Timeout(30, read=120), follow_redirects=True) as r:
        if r.status_code >= 400:
            raise StockError(f"Download failed ({r.status_code})")
        with open(dest, "wb") as f:
            for chunk in r.iter_bytes(1 << 20):
                n += len(chunk)
                if n > MAX_BYTES:
                    raise StockError("Stock file is larger than 600 MB")
                f.write(chunk)
    return n
