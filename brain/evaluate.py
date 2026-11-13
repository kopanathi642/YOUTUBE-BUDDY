"""Held-out evaluation: generate plans for the test split and score them with brain/buddy_brain/metrics.py.
Compares a trained model against the naive baseline (and reports the rule planner as the label ceiling).

Usage: python brain/evaluate.py --model brain/checkpoints/planner-scratch-v0 --n 400 [--adapter path] [--chat]"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from buddy_brain.metrics import score, summarize  # noqa: E402
from buddy_brain.plan import END, EditPlan, Example, plan_text  # noqa: E402
from buddy_brain.rules import naive_plan  # noqa: E402

SYSTEM = ("You are Buddy Editing Planner. Read the brief and the analysed assets and answer only with the plan lines: "
          "'S asset start end transition' per shot, optional 'M music volume', then 'G grade', then <END>.")


def load_model(path, adapter=None):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(adapter or path)
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model = AutoModelForCausalLM.from_pretrained(path, torch_dtype=torch.float16 if dev == "cuda" else torch.float32).to(dev)
    if adapter:
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, adapter).to(dev)
    model.eval()
    return tok, model, dev


def generate(tok, model, dev, prompt, chat=False, max_new=220):
    import torch
    if chat:
        text = tok.apply_chat_template([{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
                                       tokenize=False, add_generation_prompt=True)
        ids = tok(text, return_tensors="pt", add_special_tokens=False).input_ids
    else:
        ids = torch.tensor([[tok.bos_token_id] + tok(prompt, add_special_tokens=False)["input_ids"]])
    stop = [i for i in {tok.eos_token_id, tok.convert_tokens_to_ids(END)} if isinstance(i, int) and i >= 0]
    with torch.no_grad():
        out = model.generate(ids.to(dev), max_new_tokens=max_new, do_sample=False, eos_token_id=stop,
                             pad_token_id=tok.pad_token_id if tok.pad_token_id is not None else stop[0])
    return tok.decode(out[0, ids.shape[1]:], skip_special_tokens=False).replace("<|im_end|>", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--adapter")
    ap.add_argument("--data", default=os.path.join(os.path.dirname(__file__), "data", "synth_v0"))
    ap.add_argument("--n", type=int, default=400)
    ap.add_argument("--chat", action="store_true", help="use the tokenizer's chat template (instruction models)")
    ap.add_argument("--out")
    a = ap.parse_args()
    rows = [json.loads(l) for l in open(f"{a.data}/test.jsonl")][:a.n]
    tok, model, dev = load_model(a.model, a.adapter)
    res, base, samples, t0 = [], [], [], time.time()
    for i, r in enumerate(rows):
        ex = Example.model_validate(r)
        ref = EditPlan.model_validate(ex.plan)
        text = generate(tok, model, dev, r["prompt"], chat=a.chat)
        res.append(score(text, ex.brief, ex.assets, ref))
        base.append(score(plan_text(naive_plan(ex.brief, ex.assets)), ex.brief, ex.assets, ref))
        if i < 5:
            samples.append({"id": ex.id, "brief": ex.brief.text, "output": text.strip(), "score": res[-1]})
        if (i + 1) % 50 == 0:
            print(f"{i + 1}/{len(rows)} {time.time() - t0:.0f}s fully_valid so far {sum(x['fully_valid'] for x in res) / len(res):.3f}", flush=True)
    report = {"model": a.model, "adapter": a.adapter, "test_records": len(rows), "seconds": round(time.time() - t0),
              "model_metrics": summarize(res), "naive_baseline_metrics": summarize(base),
              "label_ceiling": "rule planner = 1.0 on every metric by construction (labels are filtered to be valid)",
              "samples": samples}
    out = a.out or os.path.join(a.adapter or a.model, "EVAL_REPORT.json")
    json.dump(report, open(out, "w"), indent=2)
    print(json.dumps({k: report[k] for k in ("model_metrics", "naive_baseline_metrics")}, indent=2))


if __name__ == "__main__":
    main()
