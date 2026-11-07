"""Compare Whisper small vs medium and decoding settings on 10 different FLEURS Hindi sentences (CER, speed).

    S=<dir with eval/fleurs/hi_in and models/whisper> python scripts/eval_asr_settings.py
"""
import os, sys, time, csv
sys.path.insert(0, "scripts"); sys.argv = ["x"]
import eval_dubbing as E
from faster_whisper import WhisperModel, decode_audio
S = os.environ["S"]
rows = list(csv.reader(open(f"{S}/eval/fleurs/hi_in/dev.tsv", encoding="utf-8"), delimiter="\t"))
seen, items = set(), []
for r in rows:                         # 10 DIFFERENT sentences
    if r[2] in seen: continue
    seen.add(r[2]); items.append(r)
    if len(items) == 10: break
import tarfile
want = {r[1] for r in items}; W = f"{S}/eval/asrset"; os.makedirs(W, exist_ok=True)
with tarfile.open(f"{S}/eval/fleurs/hi_in/dev.tar.gz") as t:
    for m in t:
        b = os.path.basename(m.name)
        if b in want and not os.path.exists(f"{W}/{b}"): open(f"{W}/{b}", "wb").write(t.extractfile(m).read())
clip = f"{W}/concat.wav"; E.concat([f"{W}/{r[1]}" for r in items[:5]], clip)
CFG = {
  "default":  dict(beam_size=5, condition_on_previous_text=False),
  "strict":   dict(beam_size=5, condition_on_previous_text=False, temperature=0.0, no_repeat_ngram_size=3, initial_prompt="नमस्ते दोस्तों, आज की बात हिंदी में।"),
}
for wm in ("small", "medium"):
    m = WhisperModel(f"{S}/models/whisper/{wm}", device="cpu", compute_type="int8", cpu_threads=4)
    for name, kw in CFG.items():
        e = n = 0; t0 = time.time(); dur = 0
        for r in items:
            a = decode_audio(f"{W}/{r[1]}", sampling_rate=16000); dur += len(a) / 16000
            segs, _ = m.transcribe(a, language="hi", vad_filter=True, **kw)
            h = " ".join(s.text for s in segs)
            ei, ni = E.cer(E.norm(r[2], "hi"), E.norm(h, "hi")); e += ei; n += ni
        segs, _ = m.transcribe(decode_audio(clip, sampling_rate=16000), language="hi", vad_filter=True, **kw)
        latin = sum(1 for s in segs for w in s.text.split() if w.isascii() and w.isalpha())
        print(f"{wm:6} {name:8} CER {100*e/n:5.1f}%  rtf {(time.time()-t0)/dur:.2f}  latin-words-in-hindi-clip {latin}", flush=True)
