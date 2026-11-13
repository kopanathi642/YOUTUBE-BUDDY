"""Stage B0 — train a small editing-planner language model FROM SCRATCH (no pretrained weights) on CPU or GPU.

Purpose: prove the whole pipeline with real weights — tokenizer, training, checkpoints, held-out evaluation,
hashing, fresh-process reload — where pretrained weights cannot be downloaded. It learns the plan format, the
editor's constraints and the rule-based conventions in BuddyPlan-Synth v0. It does not understand free-form
language beyond the brief templates it was trained on; that is what the LoRA stage on a pretrained model is for.

Usage: python brain/train_scratch.py --data brain/data/synth_v0 --out brain/checkpoints/planner-scratch-v0 --epochs 6"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import time

import torch
from tokenizers import Tokenizer, decoders, models, pre_tokenizers, trainers
from transformers import GPT2Config, GPT2LMHeadModel, PreTrainedTokenizerFast

SPECIAL = ["<pad>", "<bos>", "<END>"]


def load(path):
    return [json.loads(l) for l in open(path)]


def build_tokenizer(texts, vocab_size, out):
    tok = Tokenizer(models.BPE(unk_token=None))
    tok.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    tok.decoder = decoders.ByteLevel()
    tok.train_from_iterator(texts, trainers.BpeTrainer(vocab_size=vocab_size, special_tokens=SPECIAL,
                                                       initial_alphabet=pre_tokenizers.ByteLevel.alphabet()))
    fast = PreTrainedTokenizerFast(tokenizer_object=tok, pad_token="<pad>", bos_token="<bos>", eos_token="<END>")
    fast.save_pretrained(out)
    return fast


def encode(tok, rec, max_len):
    p = tok(rec["prompt"], add_special_tokens=False)["input_ids"]
    c = tok(rec["completion"], add_special_tokens=False)["input_ids"]
    ids = [tok.bos_token_id] + p + c
    labels = [-100] * (1 + len(p)) + c          # learn only the plan, not to copy the prompt
    if len(ids) > max_len:
        return None
    return ids, labels


def make_groups(items, bs, max_tokens):
    """Length-bucketed batches (less padding), capped at bs items AND max_tokens padded tokens (bounds memory)."""
    order = sorted(range(len(items)), key=lambda i: len(items[i][0]))
    groups, cur = [], []
    for i in order:
        if cur and (len(cur) == bs or (len(cur) + 1) * len(items[i][0]) > max_tokens):
            groups.append(cur); cur = []
        cur.append(i)
    return groups + ([cur] if cur else [])


def batches(items, bs, pad_id, shuffle, rng, max_tokens=4000):
    groups = make_groups(items, bs, max_tokens)
    if shuffle:
        rng.shuffle(groups)
    for g in groups:
        L = max(len(items[i][0]) for i in g)
        ids = torch.full((len(g), L), pad_id)
        lab = torch.full((len(g), L), -100)
        att = torch.zeros((len(g), L), dtype=torch.long)
        for r, i in enumerate(g):
            a, b = items[i]
            ids[r, :len(a)] = torch.tensor(a)
            lab[r, :len(b)] = torch.tensor(b)
            att[r, :len(a)] = 1
        yield ids, lab, att


@torch.no_grad()
def val_loss(model, items, bs, pad_id, device):
    model.eval()
    tot = n = 0
    for ids, lab, att in batches(items, bs, pad_id, False, None, 4000):
        out = model(input_ids=ids.to(device), attention_mask=att.to(device), labels=lab.to(device))
        k = (lab[:, 1:] != -100).sum().item()
        tot += out.loss.item() * k
        n += k
    model.train()
    return tot / max(1, n)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="brain/data/synth_v0")
    ap.add_argument("--out", default="brain/checkpoints/planner-scratch-v0")
    ap.add_argument("--epochs", type=int, default=6)
    ap.add_argument("--bs", type=int, default=16)
    ap.add_argument("--lr", type=float, default=1.5e-3)
    ap.add_argument("--layers", type=int, default=6)
    ap.add_argument("--dim", type=int, default=256)
    ap.add_argument("--heads", type=int, default=8)
    ap.add_argument("--vocab", type=int, default=2048)
    ap.add_argument("--max_len", type=int, default=1024)
    ap.add_argument("--max_tokens", type=int, default=4000, help="padded tokens per batch (memory cap)")
    ap.add_argument("--limit", type=int, default=0, help="use only N training records (smoke test)")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    torch.manual_seed(a.seed)
    rng = random.Random(a.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    os.makedirs(a.out, exist_ok=True)

    train, val = load(f"{a.data}/train.jsonl"), load(f"{a.data}/val.jsonl")
    if a.limit:
        train = train[:a.limit]
    tok = build_tokenizer([r["prompt"] + r["completion"] for r in train], a.vocab, a.out)
    tr = [x for x in (encode(tok, r, a.max_len) for r in train) if x]
    va = [x for x in (encode(tok, r, a.max_len) for r in val) if x]
    cfg = GPT2Config(vocab_size=len(tok), n_positions=a.max_len, n_embd=a.dim, n_layer=a.layers, n_head=a.heads,
                     bos_token_id=tok.bos_token_id, eos_token_id=tok.eos_token_id, pad_token_id=tok.pad_token_id,
                     resid_pdrop=0.05, embd_pdrop=0.05, attn_pdrop=0.05)
    cfg._attn_implementation = "sdpa"           # memory-efficient attention (eager OOMs on 7 GB CPU boxes)
    model = GPT2LMHeadModel(cfg).to(device)
    params = sum(p.numel() for p in model.parameters())
    tokens = sum(len(x[0]) for x in tr)
    print(f"device={device} params={params / 1e6:.2f}M train={len(tr)} (dropped {len(train) - len(tr)} too long) "
          f"val={len(va)} tokens/epoch={tokens}", flush=True)

    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=0.05, betas=(0.9, 0.98))
    steps = a.epochs * len(make_groups(tr, a.bs, a.max_tokens))
    warm = max(1, steps // 30)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(1, s / steps))))
    log, best, step, t0 = [], float("inf"), 0, time.time()
    for ep in range(1, a.epochs + 1):
        run = k = 0
        for ids, lab, att in batches(tr, a.bs, tok.pad_token_id, True, rng, a.max_tokens):
            out = model(input_ids=ids.to(device), attention_mask=att.to(device), labels=lab.to(device))
            out.loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sched.step(); opt.zero_grad(set_to_none=True)
            run += out.loss.item(); k += 1; step += 1
            if step % 50 == 0:
                print(f"ep {ep} step {step}/{steps} loss {run / k:.4f} {time.time() - t0:.0f}s", flush=True)
        vl = val_loss(model, va, a.bs, tok.pad_token_id, device)
        log.append({"epoch": ep, "train_loss": round(run / max(1, k), 5), "val_loss": round(vl, 5), "seconds": round(time.time() - t0)})
        print(json.dumps(log[-1]), flush=True)
        if vl < best:                             # keep only the best checkpoint (by held-out val loss)
            best = vl
            model.save_pretrained(a.out, safe_serialization=True)
            ck = os.path.join(a.out, "checkpoints", f"epoch-{ep}")
            os.makedirs(ck, exist_ok=True)
            json.dump(log[-1], open(os.path.join(ck, "metrics.json"), "w"))
    manifest = {
        "model": "buddy-planner-scratch-v0", "architecture": "GPT-2 style decoder, trained from scratch",
        "base_model": None, "params": params, "config": vars(a), "device": device, "torch": torch.__version__,
        "dataset": json.load(open(f"{a.data}/MANIFEST.json")), "training_log": log, "best_val_loss": round(best, 5),
        "files": {f: sha256(os.path.join(a.out, f)) for f in sorted(os.listdir(a.out)) if os.path.isfile(os.path.join(a.out, f))},
        "limitations": "Learns plan format, editor constraints and synthetic_rule_v0 conventions only; not expert taste; "
                       "understands only the templated briefs it was trained on.",
    }
    json.dump(manifest, open(os.path.join(a.out, "TRAINING_MANIFEST.json"), "w"), indent=2)
    print("saved", a.out, "best val loss", round(best, 4))


if __name__ == "__main__":
    main()
