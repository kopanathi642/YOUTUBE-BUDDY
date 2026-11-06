"""Clients for hosted engines. Keys come only from environment variables (the host's secret manager) and are never
logged, stored, or sent to the browser. Every client accepts a base-URL override so tests can point at a fake server."""
import json
import os
import re
import time

import httpx


class ProviderError(Exception):
    """A provider refused or failed the request. Message is safe to show the user."""


class Cancelled(Exception):
    pass


# ---------------------------------------------------------------- fal.ai queue API


def _fal_base() -> str:
    return os.environ.get("FAL_QUEUE_URL", "https://queue.fal.run").rstrip("/")


def _fal_headers() -> dict:
    key = os.environ.get("FAL_KEY")
    if not key:
        raise ProviderError("This tool needs a fal.ai key (FAL_KEY) on the server")
    return {"Authorization": f"Key {key}", "Content-Type": "application/json"}


def _err_text(r: httpx.Response) -> str:
    try:
        j = r.json()
        d = j.get("detail") or j.get("error") or j
        if isinstance(d, list):  # pydantic-style validation list
            d = "; ".join(f"{'.'.join(str(x) for x in e.get('loc', [])[1:])}: {e.get('msg')}" for e in d)
        return str(d)[:400]
    except Exception:  # noqa: BLE001
        return r.text[:400]


def fal_run(model_id: str, payload: dict, *, progress=lambda p, s: None, should_cancel=lambda: False,
            timeout_s: int = 1800, poll_s: float = 3.0) -> dict:
    """Submit to the fal queue, poll until done, return the model's output JSON."""
    h = _fal_headers()
    with httpx.Client(timeout=60) as c:
        r = c.post(f"{_fal_base()}/{model_id}", headers=h, json=payload)
        if r.status_code == 401 or r.status_code == 403:
            raise ProviderError("fal.ai rejected the key (check FAL_KEY and your fal.ai balance)")
        if r.status_code == 422:
            raise ProviderError(f"The model rejected these settings: {_err_text(r)}")
        if r.status_code >= 400:
            raise ProviderError(f"fal.ai error {r.status_code}: {_err_text(r)}")
        sub = r.json()
        status_url, response_url = sub.get("status_url"), sub.get("response_url")
        cancel_url = sub.get("cancel_url")
        if not status_url or not response_url:
            raise ProviderError("fal.ai did not return a request to follow")
        t0 = time.monotonic()
        while True:
            if should_cancel():
                if cancel_url:
                    try:
                        c.put(cancel_url, headers=h)
                    except httpx.HTTPError:
                        pass
                raise Cancelled()
            if time.monotonic() - t0 > timeout_s:
                raise ProviderError("The model took too long (timed out)")
            s = c.get(status_url, headers=h, params={"logs": 1})
            if s.status_code >= 400:
                raise ProviderError(f"fal.ai status error {s.status_code}: {_err_text(s)}")
            st = s.json()
            state = st.get("status")
            if state == "IN_QUEUE":
                progress(0.12, f"waiting in model queue (position {st.get('queue_position', '?')})")
            elif state == "IN_PROGRESS":
                el = time.monotonic() - t0
                progress(min(0.85, 0.15 + el / 240), "model is generating")
            elif state == "COMPLETED":
                if st.get("error"):
                    raise ProviderError(f"Model failed: {str(st['error'])[:300]}")
                break
            elif state in ("FAILED", "ERROR", "CANCELLED"):
                raise ProviderError(f"Model failed: {str(st.get('error') or state)[:300]}")
            time.sleep(poll_s)
        out = c.get(response_url, headers=h)
        if out.status_code >= 400:
            raise ProviderError(f"Model failed: {_err_text(out)}")
        return out.json()


def output_urls(obj, found=None) -> list[dict]:
    """Every file the model returned, in order: [{url, content_type, file_name}]."""
    found = [] if found is None else found
    if isinstance(obj, dict):
        if isinstance(obj.get("url"), str) and obj["url"].startswith(("http://", "https://", "data:")):
            found.append({"url": obj["url"], "content_type": obj.get("content_type") or "", "file_name": obj.get("file_name") or ""})
        for k, v in obj.items():
            if k != "url":
                output_urls(v, found)
    elif isinstance(obj, list):
        for v in obj:
            output_urls(v, found)
    return found


def download(url: str, dest: str, max_bytes: int = 2 * 1024**3) -> str:
    if url.startswith("data:"):
        import base64
        with open(dest, "wb") as f:
            f.write(base64.b64decode(url.split(",", 1)[1]))
        return dest
    n = 0
    with httpx.stream("GET", url, timeout=300, follow_redirects=True) as r:
        if r.status_code >= 400:
            raise ProviderError(f"could not download the model output ({r.status_code})")
        with open(dest, "wb") as f:
            for chunk in r.iter_bytes(1 << 20):
                n += len(chunk)
                if n > max_bytes:
                    raise ProviderError("model output too large")
                f.write(chunk)
    return dest


# ---------------------------------------------------------------- language model (Claude or OpenAI)


def llm_ready() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY"))


def llm_json(system: str, user: str, max_tokens: int = 4000) -> tuple[dict, str]:
    """Ask for one JSON object. Returns (parsed, model_name)."""
    if os.environ.get("ANTHROPIC_API_KEY"):
        model = os.environ.get("LLM_MODEL", "claude-sonnet-5-5")
        base = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
        r = httpx.post(f"{base}/v1/messages", timeout=180, headers={
            "x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": model, "max_tokens": max_tokens, "system": system,
                  "messages": [{"role": "user", "content": user}]})
        if r.status_code >= 400:
            raise ProviderError(f"Language model error {r.status_code}: {_err_text(r)}")
        text = "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")
    elif os.environ.get("OPENAI_API_KEY"):
        model = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")
        base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com").rstrip("/")
        r = httpx.post(f"{base}/v1/chat/completions", timeout=180, headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
                       json={"model": model, "max_tokens": max_tokens, "response_format": {"type": "json_object"},
                             "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
        if r.status_code >= 400:
            raise ProviderError(f"Language model error {r.status_code}: {_err_text(r)}")
        text = r.json()["choices"][0]["message"]["content"]
    else:
        raise ProviderError("This tool needs a language model key (ANTHROPIC_API_KEY or OPENAI_API_KEY) on the server")
    return parse_json(text), model


def parse_json(text: str) -> dict:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if m:
        text = m.group(1)
    else:
        a, b = text.find("{"), text.rfind("}")
        if a >= 0 and b > a:
            text = text[a:b + 1]
    try:
        out = json.loads(text)
    except json.JSONDecodeError:
        raise ProviderError("The language model returned an unreadable answer — please run it again")
    if not isinstance(out, dict):
        raise ProviderError("The language model returned an unexpected answer")
    return out


# ---------------------------------------------------------------- YouTube Data API v3 (public data, API key)


def yt_get(path: str, **params) -> dict:
    key = os.environ.get("YOUTUBE_API_KEY")
    if not key:
        raise ProviderError("This tool needs YOUTUBE_API_KEY on the server")
    base = os.environ.get("YOUTUBE_API_URL", "https://www.googleapis.com/youtube/v3").rstrip("/")
    r = httpx.get(f"{base}/{path}", params={**params, "key": key}, timeout=30)
    if r.status_code == 403:
        raise ProviderError("YouTube API quota exceeded or key not allowed")
    if r.status_code >= 400:
        raise ProviderError(f"YouTube API error {r.status_code}: {_err_text(r)}")
    return r.json()
