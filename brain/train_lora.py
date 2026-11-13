"""Stage B1 — LoRA / QLoRA fine-tune of a pretrained instruction model as the Buddy Editing Planner (GPU).

Default base: Qwen/Qwen2.5-0.5B-Instruct (Apache-2.0) — fits a free Kaggle T4. For Qwen/Qwen3-4B-Instruct-2507
(Apache-2.0) pass --base ... --qlora (4-bit, needs bitsandbytes + a 16 GB GPU).
Only the adapter is saved (the base model is referenced, not redistributed).

Usage (Kaggle / any CUDA machine):
  python brain/train_lora.py --base Qwen/Qwen2.5-0.5B-Instruct --data brain/data/synth_v0 --out brain/adapters/planner-qwen05-v1
  python brain/evaluate.py --model Qwen/Qwen2.5-0.5B-Instruct --chat --n 200 --out brain/results/baseline_qwen05.json  # Stage A
  python brain/evaluate.py --model Qwen/Qwen2.5-0.5B-Instruct --adapter brain/adapters/planner-qwen05-v1 --chat --n 400
  python brain/verify.py --model Qwen/Qwen2.5-0.5B-Instruct --adapter brain/adapters/planner-qwen05-v1 --chat"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import sys
import time

import torch

sys.path.insert(0, os.path.dirname(__file__))
from evaluate import SYSTEM  # noqa: E402

DEFAULT_TARGETS = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def encode(tok, rec, max_len):
    msgs = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": rec["prompt"]}]
    p = tok(tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True), add_special_tokens=False)["input_ids"]
    c = tok(rec["completion"] + (tok.eos_token or ""), add_special_tokens=False)["input_ids"]
    if len(p) + len(c) > max_len:
        return None
    return p + c, [-100] * len(p) + c


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="Qwen/Qwen2.5-0.5B-Instruct")
    ap.add_argument("--data", default=os.path.join(os.path.dirname(__file__), "data", "synth_v0"))
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "adapters", "planner-qwen05-v1"))
    ap.add_argument("--epochs", type=float, default=2)
    ap.add_argument("--bs", type=int, default=8)
    ap.add_argument("--grad_accum", type=int, default=2)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--r", type=int, default=16)
    ap.add_argument("--alpha", type=int, default=32)
    ap.add_argument("--max_len", type=int, default=1536)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--qlora", action="store_true")
    ap.add_argument("--smoke", action="store_true", help="20 steps only: check memory and loss before the real run")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import AutoModelForCausalLM, AutoTokenizer

    assert torch.cuda.is_available(), "No GPU. On Kaggle: Settings → Accelerator → GPU T4."
    torch.manual_seed(a.seed)
    rng = random.Random(a.seed)
    tok = AutoTokenizer.from_pretrained(a.base)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    kw = {"torch_dtype": torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16}
    if a.qlora:
        from transformers import BitsAndBytesConfig
        kw["quantization_config"] = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                                                       bnb_4bit_compute_dtype=kw["torch_dtype"], bnb_4bit_use_double_quant=True)
    model = AutoModelForCausalLM.from_pretrained(a.base, device_map={"": 0}, **kw)
    if a.qlora:
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    else:
        model.gradient_checkpointing_enable()
        model.enable_input_require_grads()
    model = get_peft_model(model, LoraConfig(r=a.r, lora_alpha=a.alpha, lora_dropout=0.05, target_modules=DEFAULT_TARGETS, task_type="CAUSAL_LM"))
    model.print_trainable_parameters()

    load = lambda s: [json.loads(l) for l in open(f"{a.data}/{s}.jsonl")]  # noqa: E731
    train = load("train")[: a.limit or None]
    tr = [x for x in (encode(tok, r, a.max_len) for r in train) if x]
    va = [x for x in (encode(tok, r, a.max_len) for r in load("val")) if x]
    print(f"train {len(tr)} val {len(va)} (dropped {len(train) - len(tr)} over {a.max_len} tokens)", flush=True)

    def batches(items, shuffle):
        order = sorted(range(len(items)), key=lambda i: len(items[i][0]))
        groups = [order[i:i + a.bs] for i in range(0, len(order), a.bs)]
        if shuffle:
            rng.shuffle(groups)
        for g in groups:
            L = max(len(items[i][0]) for i in g)
            ids = torch.full((len(g), L), tok.pad_token_id); lab = torch.full((len(g), L), -100); att = torch.zeros((len(g), L), dtype=torch.long)
            for r_, i in enumerate(g):
                x, y = items[i]
                ids[r_, :len(x)] = torch.tensor(x); lab[r_, :len(y)] = torch.tensor(y); att[r_, :len(x)] = 1
            yield ids.cuda(), lab.cuda(), att.cuda()

    @torch.no_grad()
    def evaluate_loss():
        model.eval(); tot = n = 0
        for ids, lab, att in batches(va, False):
            out = model(input_ids=ids, attention_mask=att, labels=lab)
            k = (lab[:, 1:] != -100).sum().item(); tot += out.loss.item() * k; n += k
        model.train(); return tot / max(1, n)

    opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=a.lr, weight_decay=0.0)
    per_epoch = math.ceil(len(tr) / a.bs / a.grad_accum)
    total = 20 if a.smoke else max(1, int(per_epoch * a.epochs))
    warm = max(1, total // 20)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(1, s / total))))
    model.train()
    step, micro, run, log, best, t0 = 0, 0, 0.0, [], float("inf"), time.time()
    torch.cuda.reset_peak_memory_stats()
    while step < total:
        for ids, lab, att in batches(tr, True):
            loss = model(input_ids=ids, attention_mask=att, labels=lab).loss / a.grad_accum
            loss.backward(); run += loss.item(); micro += 1
            if micro % a.grad_accum:
                continue
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sched.step(); opt.zero_grad(set_to_none=True); step += 1
            if step % 10 == 0:
                print(f"step {step}/{total} loss {run / 10:.4f} peak_gpu {torch.cuda.max_memory_allocated() / 2**30:.1f}GB {time.time() - t0:.0f}s", flush=True)
                run = 0.0
            if step % max(1, per_epoch // 2) == 0 or step == total:
                vl = evaluate_loss()
                log.append({"step": step, "val_loss": round(vl, 5), "seconds": round(time.time() - t0)})
                print(json.dumps(log[-1]), flush=True)
                if vl < best and not a.smoke:
                    best = vl
                    model.save_pretrained(a.out, safe_serialization=True)
                    tok.save_pretrained(a.out)
            if step >= total:
                break
    if a.smoke:
        print("SMOKE OK — peak GPU", round(torch.cuda.max_memory_allocated() / 2**30, 2), "GB; now run without --smoke")
        return
    manifest = {"model": os.path.basename(a.out), "type": "LoRA adapter", "base_model": a.base, "base_license": "Apache-2.0 (verify on the model card)",
                "config": vars(a), "gpu": torch.cuda.get_device_name(0), "torch": torch.__version__, "training_log": log, "best_val_loss": round(best, 5),
                "dataset": json.load(open(f"{a.data}/MANIFEST.json")),
                "files": {f: sha256(os.path.join(a.out, f)) for f in sorted(os.listdir(a.out)) if os.path.isfile(os.path.join(a.out, f))}}
    json.dump(manifest, open(os.path.join(a.out, "TRAINING_MANIFEST.json"), "w"), indent=2)
    print("saved adapter", a.out, "best val loss", round(best, 4))


if __name__ == "__main__":
    main()
