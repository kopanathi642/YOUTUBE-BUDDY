"""Step 1 on Kaggle: a big open model (the "teacher") writes good answers for the site's writing tools.

    python gen.py --out /kaggle/working/data.jsonl            (resumes if the file exists)
    python gen.py --fake --out /tmp/data.jsonl --scale 0.02   (offline self-test with a stub teacher)

Teacher: Qwen3-14B-AWQ on vLLM (2x T4), falling back to Qwen3-8B on Hugging Face transformers. Both Apache-2.0.
Every answer is checked (JSON shape, counts, language script, honest SEO scores) before it is kept.
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ybw_data as D  # noqa: E402

COUNTS = {"script": 320, "hooks": 220, "titles": 260, "description": 220, "outline": 170, "dialogue": 170, "shotlist": 170,
          "prompt": 150, "social": 220, "rewrite": 270, "title_ab": 170, "seo": 240, "calendar": 170}
MAX_ANSWER_TOKENS = 1400          # the website asks the local model for at most 1500 tokens


class Teacher:
    def __init__(self, fake=False):
        self.kind = "fake" if fake else None
        if fake:
            return
        try:
            from vllm import LLM, SamplingParams
            self.llm = LLM(model=os.environ.get("TEACHER_VLLM", "Qwen/Qwen3-14B-AWQ"), tensor_parallel_size=int(os.environ.get("TP", "2")),
                           dtype="half", max_model_len=6144, gpu_memory_utilization=0.90, enforce_eager=False)
            self.SP = SamplingParams
            self.kind = "vllm"
            self.ask(["Say OK in JSON."], ["{}"], 20, 0.0)      # smoke test
        except Exception as e:                                    # noqa: BLE001
            print("vLLM unavailable, falling back to transformers:", repr(e)[:300], flush=True)
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
            name = os.environ.get("TEACHER_HF", "Qwen/Qwen3-8B")
            self.tok = AutoTokenizer.from_pretrained(name, padding_side="left")
            self.model = AutoModelForCausalLM.from_pretrained(name, torch_dtype=torch.float16, device_map="auto")
            self.torch = torch
            self.kind = "hf"
        print("teacher:", self.kind, flush=True)

    def ask(self, systems, users, max_tokens, temperature=0.7):
        if self.kind == "fake":
            return [fake_answer(s, u) for s, u in zip(systems, users)]
        msgs = [[{"role": "system", "content": s}, {"role": "user", "content": u}] for s, u in zip(systems, users)]
        if self.kind == "vllm":
            sp = self.SP(max_tokens=max_tokens, temperature=temperature, top_p=0.9)
            res = self.llm.chat(msgs, sp, use_tqdm=False, chat_template_kwargs={"enable_thinking": False})
            return [r.outputs[0].text for r in res]
        outs = []
        for i in range(0, len(msgs), 8):
            batch = [self.tok.apply_chat_template(m, tokenize=False, add_generation_prompt=True, enable_thinking=False) for m in msgs[i:i + 8]]
            enc = self.tok(batch, return_tensors="pt", padding=True).to(self.model.device)
            with self.torch.no_grad():
                g = self.model.generate(**enc, max_new_tokens=max_tokens, do_sample=True, temperature=temperature, top_p=0.9)
            outs += self.tok.batch_decode(g[:, enc["input_ids"].shape[1]:], skip_special_tokens=True)
        return outs


def fake_answer(system, user):
    """Stub teacher for the offline self-test: shape-correct JSON so the plumbing can be checked without a GPU."""
    if user.startswith("Niche:"):
        n = user.split("\n")[0][7:-1]
        return json.dumps({"briefs": [{"brief": f"A video about {n} part {i}", "audience": "Indian viewers"} for i in range(6)],
                           "dialogues": [{"brief": "Two friends talk", "characters": "Ravi: loud\nMeera: calm"}] * 2,
                           "scripts": ["Open on the street. Walk in. Taste. React. Point to the next stall."] * 2,
                           "texts": ["bro this is insane", "pls like and share"] * 2,
                           "title_sets": [["Best food ever", "I tried 5 foods for ₹500", "Food vlog"]] * 2,
                           "metadata": [{"title": "food", "description": "vlog", "tags": "food", "keyword": "food", "quality": q} for q in ("weak", "average", "strong")],
                           "ideas": ["street stall at night"] * 3})
    return '{"text": "ok"}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/kaggle/working/data.jsonl")
    ap.add_argument("--fake", action="store_true")
    ap.add_argument("--scale", type=float, default=1.0, help="multiply the example counts (0.1 for a quick try)")
    ap.add_argument("--rounds", type=int, default=2, help="seed rounds per niche")
    a = ap.parse_args()
    here = os.path.dirname(os.path.abspath(__file__))
    prompts = json.load(open(os.path.join(here, "prompts.json")))
    seeds_path = os.path.join(os.path.dirname(a.out), "seeds.json")
    t = Teacher(a.fake)
    t0 = time.time()

    if os.path.exists(seeds_path):
        seeds = json.load(open(seeds_path))
    else:
        niches = D.NICHES * a.rounds
        if a.scale < 1:
            niches = niches[:max(3, int(len(niches) * a.scale))]
        outs = t.ask([D.SEED_SYSTEM] * len(niches), [D.SEED_USER.format(niche=n) for n in niches], 3000, 0.9)
        seeds = []
        for n, o in zip(niches, outs):
            s = D.parse_json(o)
            if s and D.seed_ok(s):
                s["niche"] = n
                seeds.append(s)
        json.dump(seeds, open(seeds_path, "w"), ensure_ascii=False)
    print(f"seeds: {len(seeds)} niches ok ({time.time() - t0:.0f}s)", flush=True)
    if not seeds:
        sys.exit("No usable seeds: the teacher isn't answering in JSON. Check the log above.")

    counts = {k: max(1, int(v * a.scale)) for k, v in COUNTS.items()}
    todo = D.jobs(prompts, seeds, counts)
    done = 0
    if os.path.exists(a.out):
        done = sum(1 for _ in open(a.out))
        print("resuming after", done, "jobs already tried", flush=True)
    stats = {}
    with open(a.out, "a") as f:
        for i in range(done, len(todo), 64):
            chunk = todo[i:i + 64]
            built = [D.build_prompt(prompts, task, p) for task, p in chunk]
            outs = t.ask([s for s, _ in built], [u for _, u in built], MAX_ANSWER_TOKENS, 0.7)
            for (task, p), (s, u), o in zip(chunk, built, outs):
                ans = D.parse_json(o)
                ok, why = D.check(task, p, ans)
                st = stats.setdefault(task, [0, 0])
                st[0] += 1
                st[1] += ok
                f.write(json.dumps({"task": task, "lang": p.get("language", "en"), "params": p, "system": s, "user": u,
                                    "answer": json.dumps(ans, ensure_ascii=False, separators=(",", ":")) if ok else None,
                                    "reject": why or None}, ensure_ascii=False) + "\n")
            f.flush()
            print(f"{min(i + 64, len(todo))}/{len(todo)} jobs, {time.time() - t0:.0f}s, kept so far: "
                  + ", ".join(f"{k} {v[1]}/{v[0]}" for k, v in stats.items()), flush=True)
    kept = sum(1 for line in open(a.out) if json.loads(line)["answer"])
    print(f"done: {kept} good examples in {a.out}", flush=True)


if __name__ == "__main__":
    main()
