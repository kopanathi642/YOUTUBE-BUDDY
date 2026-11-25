"""Step 3 on Kaggle: test the small writer before and after training on held-out examples it never saw.

    python evaluate.py --model /kaggle/working/yb-writer/merged --test /kaggle/working/yb-writer/test.jsonl --out report.md

Same checks as the data builder: valid JSON, right shape and counts, the chosen language's script, honest SEO
scores. Runs the untrained base model too, so the report shows the real improvement.
"""
import argparse
import collections
import json
import os
import sys
import time

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ybw_data as D  # noqa: E402


def run(name, rows, batch=8):
    tok = AutoTokenizer.from_pretrained(name, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained(name, torch_dtype=torch.float16).cuda().eval()
    outs = []
    t0 = time.time()
    for i in range(0, len(rows), batch):
        prompts = [tok.apply_chat_template([{"role": "system", "content": r["system"]}, {"role": "user", "content": r["user"]}],
                                           tokenize=False, add_generation_prompt=True, enable_thinking=False) for r in rows[i:i + batch]]
        enc = tok(prompts, return_tensors="pt", padding=True, add_special_tokens=False).to("cuda")
        with torch.no_grad():
            g = model.generate(**enc, max_new_tokens=1500, do_sample=False, pad_token_id=tok.pad_token_id)
        outs += tok.batch_decode(g[:, enc["input_ids"].shape[1]:], skip_special_tokens=True)
    del model
    torch.cuda.empty_cache()
    print(name, f"{time.time() - t0:.0f}s", flush=True)
    return outs


def score(rows, outs):
    by_task, by_lang, fails = collections.defaultdict(lambda: [0, 0]), collections.defaultdict(lambda: [0, 0]), []
    for r, o in zip(rows, outs):
        ok, why = D.check(r["task"], dict(r["params"]), D.parse_json(o))
        for d, k in ((by_task, r["task"]), (by_lang, r["lang"])):
            d[k][0] += 1
            d[k][1] += ok
        if not ok:
            fails.append((r["task"], r["lang"], why))
    total = sum(v[1] for v in by_task.values()), sum(v[0] for v in by_task.values())
    return by_task, by_lang, total, fails


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="/kaggle/working/yb-writer/merged")
    ap.add_argument("--base", default=os.environ.get("STUDENT", "Qwen/Qwen3-1.7B"))
    ap.add_argument("--test", default="/kaggle/working/yb-writer/test.jsonl")
    ap.add_argument("--out", default="/kaggle/working/report.md")
    ap.add_argument("--limit", type=int, default=160)
    a = ap.parse_args()
    rows = [json.loads(line) for line in open(a.test)][:a.limit]
    base_outs = run(a.base, rows)
    new_outs = run(a.model, rows)
    b, n = score(rows, base_outs), score(rows, new_outs)
    pct = lambda v: f"{v[1]}/{v[0]} ({100 * v[1] / max(1, v[0]):.0f}%)"  # noqa: E731
    lines = ["# YB Writer — held-out test", "", f"{len(rows)} examples the model never saw during training.", "",
             f"**Passed all checks:** before training {pct(b[2][::-1])}, after training {pct(n[2][::-1])}", "",
             "| Tool task | Before | After |", "|---|---|---|"]
    for k in sorted(n[0]):
        lines.append(f"| {k} | {pct(b[0][k])} | {pct(n[0][k])} |")
    lines += ["", "| Language | Before | After |", "|---|---|---|"]
    for k in sorted(n[1]):
        lines.append(f"| {k} | {pct(b[1][k])} | {pct(n[1][k])} |")
    lines += ["", "## Why the trained model failed (after)", ""]
    for k, v in collections.Counter(f"{t} ({lang}): {w}" for t, lang, w in n[3]).most_common(25):
        lines.append(f"- {k} ×{v}")
    lines += ["", "## Sample answers after training (one per task)", ""]
    shown = set()
    for r, o in zip(rows, new_outs):
        if r["task"] in shown:
            continue
        shown.add(r["task"])
        lines += [f"**{r['task']}** ({r['lang']}) — {r['user'][:160]}", "", "```", o[:900], "```", ""]
    open(a.out, "w").write("\n".join(lines))
    print("\n".join(lines[:40]))


if __name__ == "__main__":
    main()
