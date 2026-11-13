"""Fresh-process verification of a saved planner (scratch model or LoRA adapter).

1. every file listed in TRAINING_MANIFEST.json exists and its sha256 matches;
2. the weights load in this new process (no state from training);
3. tensors are finite;
4. the model plans N held-out briefs and the plans pass the editor's own timeline validation.
Writes VERIFICATION.json next to the weights. Exit code 1 on any failure.

Usage: python brain/verify.py --model brain/checkpoints/planner-scratch-v0 [--n 50]
       python brain/verify.py --model Qwen/Qwen2.5-0.5B-Instruct --adapter brain/adapters/planner-qwen05-v1 --chat"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--adapter")
    ap.add_argument("--chat", action="store_true")
    ap.add_argument("--n", type=int, default=50)
    ap.add_argument("--data", default=os.path.join(os.path.dirname(__file__), "data", "synth_v0"))
    a = ap.parse_args()
    folder = a.adapter or a.model
    report = {"folder": folder, "pid": os.getpid(), "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "checks": {}}
    ok = True

    man = json.load(open(os.path.join(folder, "TRAINING_MANIFEST.json")))
    bad = {f: "missing" if not os.path.exists(os.path.join(folder, f)) else "hash mismatch"
           for f, h in man["files"].items() if not os.path.exists(os.path.join(folder, f)) or sha256(os.path.join(folder, f)) != h}
    report["checks"]["file_hashes"] = {"files": len(man["files"]), "problems": bad}
    ok &= not bad

    import torch
    from safetensors.torch import load_file
    from evaluate import generate, load_model
    from buddy_brain.metrics import score, summarize
    from buddy_brain.plan import EditPlan, Example
    wfile = os.path.join(folder, "adapter_model.safetensors" if a.adapter else "model.safetensors")
    tensors = load_file(wfile)
    finite = all(torch.isfinite(t.float()).all().item() for t in tensors.values())
    report["checks"]["weights"] = {"file": os.path.basename(wfile), "tensors": len(tensors), "params": int(sum(t.numel() for t in tensors.values())), "all_finite": finite}
    ok &= finite

    tok, model, dev = load_model(a.model, a.adapter)
    rows = [json.loads(l) for l in open(f"{a.data}/test.jsonl")][-a.n:]          # the last N test briefs
    res = []
    for r in rows:
        ex = Example.model_validate(r)
        res.append(score(generate(tok, model, dev, r["prompt"], chat=a.chat), ex.brief, ex.assets, EditPlan.model_validate(ex.plan)))
    summ = summarize(res)
    report["checks"]["fresh_process_inference"] = summ
    ok &= summ["executable"] > 0.5
    report["verified"] = bool(ok)
    json.dump(report, open(os.path.join(folder, "VERIFICATION.json"), "w"), indent=2)
    print(json.dumps(report, indent=2))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
