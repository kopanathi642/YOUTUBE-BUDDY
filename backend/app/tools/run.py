"""Executes one generation on the worker: resolve inputs, call the tool's engine, store outputs with provenance."""
import json
import mimetypes
import os
import uuid

from sqlalchemy import select

from .. import jobs, media, storage
from ..models import Generation, MediaAsset, MediaStatus, Project, Sequence, SequenceVersion
from . import providers
from .registry import TOOLS, status

KIND_EXT = {"video": ".mp4", "audio": ".wav", "image": ".png"}
CTYPES = {".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".wav": "audio/wav", ".mp3": "audio/mpeg",
          ".m4a": "audio/mp4", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
          ".glb": "model/gltf-binary", ".json": "application/json", ".srt": "application/x-subrip", ".fbx": "application/octet-stream"}


class ToolError(Exception):
    """Permanent, user-facing failure (bad input, provider refusal)."""


class RunCtx:
    def __init__(self, wctx, gen: Generation, tmp: str):
        self.w, self.db, self.gen, self.tmp = wctx, wctx.db, gen, tmp
        self.tool = TOOLS[gen.tool_id]
        self.p: dict = dict(gen.params or {})
        self.project = self.db.get(Project, gen.project_id)
        self.outputs: list[dict] = []  # {path, kind, name, ai}
        self.result: dict = {}
        self.sequences: list[str] = []
        self.model = gen.model
        self._n = 0

    # progress + cancellation
    def progress(self, f: float, stage: str):
        self.w.progress(max(0.0, min(0.99, f)), stage[:80])

    def cancelled(self) -> bool:
        self.db.refresh(self.w.job, attribute_names=["cancel_requested"])
        return bool(self.w.job.cancel_requested)

    # inputs
    def asset(self, key: str, required: bool = True) -> MediaAsset | None:
        v = self.p.get(key)
        if not v:
            if required:
                raise ToolError(f"Choose a file for “{key}”")
            return None
        return self.asset_by_id(v)

    def asset_by_id(self, aid) -> MediaAsset:
        a = self.db.get(MediaAsset, uuid.UUID(str(aid)))
        if a is None or a.deleted_at or a.workspace_id != self.gen.workspace_id:
            raise ToolError("An input file no longer exists")
        if a.status != MediaStatus.ready:
            raise ToolError(f"“{a.filename}” is still processing — try again when it is ready")
        return a

    def local(self, a: MediaAsset) -> str:
        self._n += 1
        path = os.path.join(self.tmp, f"in{self._n}{os.path.splitext(a.filename)[1].lower() or '.bin'}")
        storage.download(a.storage_key, path)
        return path

    def url(self, a: MediaAsset) -> str:
        return storage.signed_get(a.storage_key)

    def put_url(self, path: str) -> str:
        """Upload a worker-made intermediate file and return a short-lived URL a provider can fetch."""
        key = f"ws/{self.gen.workspace_id}/gen/{self.gen.id}/tmp/{uuid.uuid4().hex}{os.path.splitext(path)[1]}"
        storage.upload(path, key, CTYPES.get(os.path.splitext(path)[1].lower(), "application/octet-stream"))
        return storage.signed_get(key)

    def path(self, name: str) -> str:
        return os.path.join(self.tmp, name)

    # outputs
    def add(self, path: str, kind: str, name: str, ai: bool = False):
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            raise ToolError("The engine produced an empty file")
        self.outputs.append({"path": path, "kind": kind, "name": name, "ai": ai})

    def add_sequence(self, name: str, timeline: dict) -> str:
        s = Sequence(workspace_id=self.gen.workspace_id, project_id=self.gen.project_id, name=name[:200], version=1, timeline=timeline)
        self.db.add(s)
        self.db.flush()
        self.db.add(SequenceVersion(sequence_id=s.id, version=1, timeline=timeline, saved_by=self.gen.created_by))
        self.sequences.append(str(s.id))
        return str(s.id)

    def main_fps(self) -> int:
        s = self.db.scalar(select(Sequence).where(Sequence.project_id == self.gen.project_id).order_by(Sequence.created_at))
        return int(s.timeline.get("fps", 30)) if s else 30


def _label_ai(path: str, kind: str, model: str | None) -> str:
    """Embed a provenance note in the file's metadata (India IT Rules 2026: AI content must carry a label/identifier)."""
    from ..config import get_settings
    note = f"AI-generated with {model or 'an AI model'} in {get_settings().brand_name}"
    ext = os.path.splitext(path)[1].lower()
    if kind == "image":
        try:
            from PIL import Image, PngImagePlugin
            im = Image.open(path)
            out = os.path.splitext(path)[0] + ".labelled.png"
            info = PngImagePlugin.PngInfo()
            info.add_text("Comment", note)
            info.add_text("AIGenerated", "true")
            im.save(out, pnginfo=info)
            return out
        except Exception:  # noqa: BLE001
            return path
    out = os.path.splitext(path)[0] + ".labelled" + (ext if ext in (".mp4", ".mov", ".wav", ".mp3", ".m4a") else ".mp4")
    r = media.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path, "-map", "0", "-c", "copy",
                   "-metadata", f"comment={note}", "-metadata", "ai_generated=true", out], timeout=600)
    return out if r.returncode == 0 and os.path.exists(out) else path


def store_outputs(rc: RunCtx) -> list[str]:
    ids = []
    g = rc.gen
    for i, o in enumerate(rc.outputs):
        path = _label_ai(o["path"], o["kind"], rc.model) if o["ai"] else o["path"]
        ext = os.path.splitext(path)[1].lower() or KIND_EXT.get(o["kind"], ".bin")
        if o["kind"] == "model3d" or ext in (".glb", ".fbx", ".json", ".srt"):
            key = f"ws/{g.workspace_id}/gen/{g.id}/out{i}{ext}"
            storage.upload(path, key, CTYPES.get(ext, "application/octet-stream"))
            rc.result.setdefault("files", []).append({"key": key, "name": o["name"] + ext, "kind": o["kind"]})
            continue
        nid = uuid.uuid4()
        a = MediaAsset(id=nid, workspace_id=g.workspace_id, project_id=g.project_id, uploaded_by=g.created_by,
                       filename=(o["name"][:180] + ext), kind=o["kind"], declared_content_type=CTYPES.get(ext, mimetypes.guess_type(path)[0] or "application/octet-stream"),
                       size_bytes=os.path.getsize(path), storage_key=f"ws/{g.workspace_id}/proj/{g.project_id}/media/{nid}/original{ext}",
                       status=MediaStatus.processing,
                       analysis={"generation": {"id": str(g.id), "tool_id": rc.tool["id"], "tool": rc.tool["name"], "model": rc.model,
                                                "engine": g.engine, "params": g.params, "version": g.version,
                                                "parent_asset_ids": _input_ids(g.params)}, "ai_generated": bool(o["ai"])})
        rc.db.add(a)
        rc.db.flush()
        storage.upload(path, a.storage_key, a.declared_content_type)
        jobs.enqueue(rc.db, workspace_id=g.workspace_id, project_id=g.project_id, created_by=g.created_by, kind="media.process",
                     payload={"asset_id": str(nid)})
        ids.append(str(nid))
    rc.db.commit()
    return ids


def _input_ids(params: dict) -> list[str]:
    out = []
    for v in params.values():
        vs = v if isinstance(v, list) else [v]
        for x in vs:
            try:
                out.append(str(uuid.UUID(str(x))))
            except (ValueError, TypeError, AttributeError):
                pass
    return out


# ---------------------------------------------------------------- engine dispatch


def execute(wctx, gen: Generation, tmp: str) -> dict:
    rc = RunCtx(wctx, gen, tmp)
    t = rc.tool
    st = status(t)
    eng = t["engine"]
    premium = eng["type"] == "local" and rc.model and rc.model in {m["id"] for m in eng.get("models", [])}
    if st["state"] == "unbuilt":
        raise ToolError(st["detail"])
    if st["state"] == "needs_key" and not premium:
        raise ToolError("Not available yet: needs " + ", ".join(st["needs"]))
    gen.status = "running"
    rc.db.commit()
    from . import engines
    try:
        if premium:
            engines.run_fal(rc)
        elif eng["type"] == "fal":
            engines.run_fal(rc)
        elif eng["type"] == "llm" and eng["task"] == "director":
            from .pipelines import TEMPLATES, director_tool_list, validate_graph
            out = engines.run_llm(rc, "director", {"tool_list": director_tool_list()})
            g = {"nodes": [n for n in out.get("nodes", []) if n.get("tool_id") in TOOLS or n.get("tool_id") in ("input", "approval")],
                 "edges": out.get("edges", [])}
            ids = {n["id"] for n in g["nodes"]}
            g["edges"] = [e for e in g["edges"] if e.get("from") in ids and e.get("to") in ids]
            try:
                validate_graph(g)
            except ToolError as e:
                raise ToolError(f"The agent drafted an invalid workflow ({e}); run it again")
            rc.result = {"kind": "workflow_plan", "summary": out.get("summary"), "graph": g, "est_cost_usd": out.get("est_cost_usd")}
            _ = TEMPLATES
        elif eng["type"] == "llm":
            engines.run_llm(rc, eng["task"])
        elif eng["type"] == "youtube":
            engines.run_youtube(rc, eng["task"])
        elif eng["type"] == "local":
            engines.LOCAL[eng["handler"]](rc)
        elif eng["type"] == "pipeline":
            engines.PIPES[eng["handler"]](rc)
        else:
            raise ToolError("unknown engine")
    except providers.Cancelled:
        from ..worker import Cancelled
        raise Cancelled()
    except providers.ProviderError as e:
        raise ToolError(str(e))
    rc.progress(0.93, "saving outputs")
    ids = store_outputs(rc)
    gen.output_asset_ids = ids
    if rc.sequences:
        rc.result["sequence_ids"] = rc.sequences
    gen.result = rc.result or None
    gen.model = rc.model
    if gen.status != "awaiting_approval":
        gen.status = "succeeded"
    rc.db.commit()
    return {"generation_id": str(gen.id), "outputs": ids, "sequences": rc.sequences}


def estimate_cost(tool: dict, model_id: str | None, params: dict) -> float | None:
    models = tool["engine"].get("models", [])
    m = next((x for x in models if x["id"] == model_id), None)
    if not m:
        return None
    n = int(params.get("variations") or 1)
    if tool["id"] == "005":
        secs = sum(float(s.get("duration") or 5) for s in params.get("shots") or [])
        return round((m.get("usd_per_s") or 0) * secs, 2) if m.get("usd_per_s") else None
    if m.get("usd_per_s"):
        return round(m["usd_per_s"] * float(params.get("duration") or 5) * n, 2)
    if m.get("usd_per_run"):
        return round(m["usd_per_run"] * n, 3)
    return None


def dumps(x) -> str:
    return json.dumps(x, ensure_ascii=False)
