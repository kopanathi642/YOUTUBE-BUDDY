"""Builds yb_writer_kaggle.ipynb with the scripts embedded, so Kaggle needs just this one file.

    python build_notebook.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = ["prompts.json", "ybw_data.py", "gen.py", "train.py", "evaluate.py"]


def md(text):
    return {"cell_type": "markdown", "metadata": {}, "source": text}


def code(text):
    return {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": text}


embedded = {f: open(os.path.join(HERE, f), encoding="utf-8").read() for f in FILES}

cells = [
    md("""# YB Writer — train YouTube Buddy's own free writing model

This notebook makes a small writing model for youtubebuddy.com's writing tools (scripts, hooks, titles, descriptions,
story outlines, dialogue, shot lists, prompts, social posts, rewrites, title A/B, SEO and content calendars) in
English, Hindi, Telugu, Tamil, Kannada, Malayalam, Bengali and Marathi.

1. A big free model (**Qwen3-14B**, Apache-2.0) writes thousands of answers to the site's exact prompts. Every answer
   is checked; bad ones (wrong language, wrong JSON, fake SEO scores) are thrown away.
2. A small model (**Qwen3-1.7B**, Apache-2.0) learns from the good answers.
3. It is tested on examples it never saw, before and after training.
4. It is saved as one file, `yb-writer-q4_k_m.gguf` (~1.1 GB), which runs on the ASUS processor for ₹0.

**Before you run:** in the right-hand panel set **Accelerator → GPU T4 x2** and switch **Internet → On**
(both need a phone-verified Kaggle account).

**To run:** click **Save Version → Save & Run All (Commit)**. It keeps running when you close the browser.
It takes about 5–8 hours of your weekly free GPU time. When it finishes, open the version → **Output** tab and
download `yb-writer-q4_k_m.gguf` and `report.md`.
"""),
    code("""# Settings. QUICK = True does a ~1-hour trial with 10% of the data (to check everything works first).
QUICK = False
SCALE = 0.1 if QUICK else 1.0
import os, subprocess
os.environ["TEACHER_VLLM"] = "Qwen/Qwen3-14B-AWQ"   # big teacher (2x T4)
os.environ["TEACHER_HF"] = "Qwen/Qwen3-8B"          # fallback teacher if vLLM can't start
os.environ["STUDENT"] = "Qwen/Qwen3-1.7B"           # the small model the website will run
print(subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv"], capture_output=True, text=True).stdout)
"""),
    code("# Write the training scripts (exported from the YouTube Buddy repo, brain/kaggle/writer/)\n"
         "import os\nos.makedirs('/kaggle/working/ybw', exist_ok=True)\nFILES = " + json.dumps(embedded, ensure_ascii=False) + "\n"
         "for name, text in FILES.items():\n    open(f'/kaggle/working/ybw/{name}', 'w', encoding='utf-8').write(text)\n"
         "print(sorted(os.listdir('/kaggle/working/ybw')))\n"),
    code("""# Install the tools (~5 minutes). If vLLM fails to install, step 1 uses the slower fallback teacher.
!pip install -q -U vllm 2>&1 | tail -2
!pip install -q -U peft accelerate sentencepiece 2>&1 | tail -2
"""),
    code("""# Step 1: the teacher writes and checks the examples (~1-3 hours). Safe to re-run: it resumes.
!cd /kaggle/working/ybw && python gen.py --out /kaggle/working/data.jsonl --scale {SCALE}
"""),
    code("""# Step 2: train the small writer (~1-2 hours)
!cd /kaggle/working/ybw && CUDA_VISIBLE_DEVICES=0 python train.py --data /kaggle/working/data.jsonl --out /kaggle/working/yb-writer
"""),
    code("""# Step 3: test before vs after on examples it never saw (~20 minutes)
!cd /kaggle/working/ybw && CUDA_VISIBLE_DEVICES=0 python evaluate.py --model /kaggle/working/yb-writer/merged --test /kaggle/working/yb-writer/test.jsonl --out /kaggle/working/report.md
"""),
    code("""# Step 4: pack it as one GGUF file for llama.cpp on the ASUS (~15 minutes)
%cd /kaggle/working
!git clone -q --depth 1 https://github.com/ggml-org/llama.cpp
!PYTHONPATH=llama.cpp/gguf-py python llama.cpp/convert_hf_to_gguf.py yb-writer/merged --outtype f16 --outfile yb-writer-f16.gguf 2>&1 | tail -2
!cmake -S llama.cpp -B llama.cpp/build -DGGML_CUDA=OFF -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF > /dev/null && cmake --build llama.cpp/build --target llama-quantize -j 4 2>&1 | tail -1
!llama.cpp/build/bin/llama-quantize yb-writer-f16.gguf yb-writer-q4_k_m.gguf Q4_K_M 2>&1 | tail -2
"""),
    code("""# Step 5: tidy up and show the results
import hashlib, shutil, os
os.chdir('/kaggle/working')
for p in ['yb-writer-f16.gguf', 'llama.cpp', 'yb-writer/merged']:
    shutil.rmtree(p, ignore_errors=True) if os.path.isdir(p) else (os.remove(p) if os.path.exists(p) else None)
h = hashlib.sha256()
with open('yb-writer-q4_k_m.gguf', 'rb') as f:
    for b in iter(lambda: f.read(1 << 20), b''):
        h.update(b)
open('yb-writer-q4_k_m.gguf.sha256', 'w').write(h.hexdigest() + '  yb-writer-q4_k_m.gguf\\n')
print('GGUF size: %.2f GB  sha256: %s' % (os.path.getsize('yb-writer-q4_k_m.gguf') / 1e9, h.hexdigest()))
print(open('report.md').read()[:3000])
"""),
]

nb = {"cells": cells, "nbformat": 4, "nbformat_minor": 5,
      "metadata": {"kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"},
                   "language_info": {"name": "python"},
                   "kaggle": {"accelerator": "nvidiaTeslaT4", "isInternetEnabled": True, "isGpuEnabled": True}}}
out = os.path.join(HERE, "yb_writer_kaggle.ipynb")
json.dump(nb, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("wrote", out)
