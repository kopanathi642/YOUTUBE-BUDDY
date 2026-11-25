"""Step 2 on Kaggle: teach the small writer (the "student") from the teacher's checked answers.

    python train.py --data /kaggle/working/data.jsonl --out /kaggle/working/yb-writer

LoRA on Qwen3-1.7B (Apache-2.0), fp16 on one T4. The prompt is formatted exactly as llama.cpp formats it on the
website (Qwen3 chat template, thinking off), and only the answer tokens are learned.
"""
import argparse
import json
import math
import os
import random
import time

import torch
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer


def load(path, tok, max_len):
    rows = [json.loads(line) for line in open(path)]
    rows = [r for r in rows if r["answer"]]
    rng = random.Random(1)
    rng.shuffle(rows)
    n_test = max(20, len(rows) // 20)
    test, train = rows[:n_test], rows[n_test:]
    examples = []
    for r in train:
        prompt = tok.apply_chat_template([{"role": "system", "content": r["system"]}, {"role": "user", "content": r["user"]}],
                                         tokenize=False, add_generation_prompt=True, enable_thinking=False)
        p = tok(prompt, add_special_tokens=False)["input_ids"]
        a = tok(r["answer"] + "<|im_end|>", add_special_tokens=False)["input_ids"]
        if len(a) > 1400 or len(p) + len(a) > max_len:
            continue
        examples.append((p + a, [-100] * len(p) + a))
    return examples, test


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="/kaggle/working/data.jsonl")
    ap.add_argument("--out", default="/kaggle/working/yb-writer")
    ap.add_argument("--student", default=os.environ.get("STUDENT", "Qwen/Qwen3-1.7B"))
    ap.add_argument("--epochs", type=float, default=2)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--accum", type=int, default=8)
    ap.add_argument("--max_len", type=int, default=2600)
    a = ap.parse_args()
    torch.manual_seed(0)
    tok = AutoTokenizer.from_pretrained(a.student)
    examples, test = load(a.data, tok, a.max_len)
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, "test.jsonl"), "w") as f:
        for r in test:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"train {len(examples)} examples, held-out test {len(test)}", flush=True)

    model = AutoModelForCausalLM.from_pretrained(a.student, torch_dtype=torch.float16).cuda()
    model.gradient_checkpointing_enable()
    model.enable_input_require_grads()
    model = get_peft_model(model, LoraConfig(r=32, lora_alpha=64, lora_dropout=0.05, task_type="CAUSAL_LM",
                                             target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]))
    for p in model.parameters():          # adapters train in fp32 for stable fp16 mixed precision
        if p.requires_grad:
            p.data = p.data.float()
    model.print_trainable_parameters()
    params = [p for p in model.parameters() if p.requires_grad]
    opt = torch.optim.AdamW(params, lr=a.lr, weight_decay=0.0)
    steps = math.ceil(len(examples) * a.epochs / a.accum)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / 30) * 0.5 * (1 + math.cos(math.pi * min(s, steps) / steps)))
    scaler = torch.amp.GradScaler("cuda")
    model.train()
    rng = random.Random(0)
    t0, step, seen, run_loss = time.time(), 0, 0, 0.0
    order = []
    while len(order) < len(examples) * a.epochs:
        e = list(range(len(examples)))
        rng.shuffle(e)
        order += e
    order = order[:int(len(examples) * a.epochs)]
    for i, idx in enumerate(order):
        ids, labels = examples[idx]
        x = torch.tensor([ids], device="cuda")
        y = torch.tensor([labels], device="cuda")
        with torch.autocast("cuda", dtype=torch.float16):
            loss = model(input_ids=x, labels=y).loss / a.accum
        scaler.scale(loss).backward()
        run_loss += loss.item()
        seen += 1
        if seen % a.accum == 0 or i == len(order) - 1:
            scaler.unscale_(opt)
            torch.nn.utils.clip_grad_norm_(params, 1.0)
            scaler.step(opt)
            scaler.update()
            opt.zero_grad(set_to_none=True)
            sched.step()
            step += 1
            if step % 10 == 0 or step == steps:
                print(f"step {step}/{steps} loss {run_loss / 10:.3f} lr {sched.get_last_lr()[0]:.2e} {time.time() - t0:.0f}s", flush=True)
                run_loss = 0.0
    model.save_pretrained(os.path.join(a.out, "adapter"))
    merged = model.merge_and_unload()
    merged = merged.half()
    merged.save_pretrained(os.path.join(a.out, "merged"), safe_serialization=True)
    tok.save_pretrained(os.path.join(a.out, "merged"))
    print("saved", a.out, f"{time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
