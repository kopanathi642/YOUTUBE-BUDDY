import { useCallback, useEffect, useRef, useState } from "react";
import { X, Eraser, Move, Wand2, Undo2, Save, Plus, Minus, MousePointerClick, Sparkles } from "lucide-react";
import { api, Asset, BASE } from "../api";
import { uploadFile } from "../upload";

/* Magic Edit (photos): tap an object, then Remove, Move / Resize or Replace it — like a phone's generative edit.
 * Select + Remove + Move run free on our server (Segment Anything + LaMa). Replace uses Gemini / Cloudflare
 * when the server has a key, and is labelled as AI-generated. */

type Status = { ready: boolean; preparing: boolean; replace: string[]; note: string | null };
type Session = { sid: string; width: number; height: number; filename: string };

export default function MagicEdit({ projectId, images, initial, readOnly, onClose, onSaved }: {
  projectId: string; images: Asset[]; initial?: string; readOnly: boolean;
  onClose: () => void; onSaved: (a: Asset, replaceOnTimeline: boolean) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [assetId, setAssetId] = useState<string | undefined>(initial);
  const [s, setS] = useState<Session | null>(null);
  const [version, setVersion] = useState(0);
  const [points, setPoints] = useState<[number, number, number][]>([]);
  const [exclude, setExclude] = useState(false);
  const [mask, setMask] = useState<string | null>(null);
  const [tint, setTint] = useState<string | null>(null);
  const [centre, setCentre] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<"select" | "move">("select");
  const [off, setOff] = useState({ dx: 0, dy: 0, scale: 1 });
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aiUsed, setAiUsed] = useState(false);
  const [swap, setSwap] = useState(!!initial);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);

  // status (and first-time model download) — poll while the server prepares the models
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const st = await api<Status>("/magic/status");
        if (stop) return;
        setStatus(st);
        if (!st.ready) setTimeout(tick, 5000);
      } catch (e) { if (!stop) setErr((e as Error).message); }
    };
    tick();
    return () => { stop = true; };
  }, []);

  // open the chosen photo once the models are ready
  useEffect(() => {
    if (!assetId || !status?.ready) return;
    setBusy("Opening the photo…"); setErr(null); setS(null); setPoints([]); setMask(null); setVersion(0); setAiUsed(false);
    api<Session>("/magic/open", { method: "POST", body: { asset_id: assetId } })
      .then(setS).catch((e) => setErr((e as Error).message)).finally(() => setBusy(null));
  }, [assetId, status?.ready]);

  // colour the selection mask (white = selected) as a translucent overlay
  useEffect(() => {
    if (!mask) { setTint(null); return; }
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas");
      c.width = im.width; c.height = im.height;
      const g = c.getContext("2d")!;
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height);
      let x0 = c.width, x1 = 0, y0 = c.height, y1 = 0;
      for (let i = 0; i < d.data.length; i += 4) {
        const on = d.data[i] > 127;
        if (on) { const p = i / 4, x = p % c.width, y = (p / c.width) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        d.data[i] = 56; d.data[i + 1] = 189; d.data[i + 2] = 248; d.data[i + 3] = on ? 120 : 0;
      }
      g.putImageData(d, 0, 0);
      setCentre({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 });
      setTint(c.toDataURL());
    };
    im.src = `data:image/png;base64,${mask}`;
  }, [mask]);

  const imgUrl = s ? `${BASE}/api/v1/magic/${s.sid}/image?v=${version}` : "";
  const toPx = (e: React.MouseEvent) => {
    const r = imgRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * s!.width, ((e.clientY - r.top) / r.height) * s!.height, r.width / s!.width] as const;
  };

  const select = useCallback(async (pts: [number, number, number][]) => {
    if (!s) return;
    setPoints(pts);
    if (!pts.length) { setMask(null); return; }
    setBusy(points.length ? "Updating the selection…" : "Finding the object… (first tap on a photo takes a few seconds)"); setErr(null);
    try {
      const r = await api<{ mask: string; area: number }>(`/magic/${s.sid}/select`, { method: "POST", body: { points: pts } });
      setMask(r.mask);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }, [s, points.length]);

  async function apply(action: "remove" | "move" | "replace") {
    if (!s || !mask) return;
    setBusy(action === "remove" ? "Removing it… (about 5–15 seconds)" : action === "move" ? "Moving it and filling the old spot…" : "Drawing the new object…");
    setErr(null);
    try {
      const body = action === "move" ? { action, mask, ...off } : { action, mask, prompt };
      const r = await api<{ version: number; ai_generated: boolean }>(`/magic/${s.sid}/apply`, { method: "POST", body });
      setVersion(r.version); setAiUsed((x) => x || r.ai_generated);
      setPoints([]); setMask(null); setMode("select"); setOff({ dx: 0, dy: 0, scale: 1 }); setPrompt("");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }

  async function undo() {
    if (!s) return;
    const r = await api<{ version: number }>(`/magic/${s.sid}/undo`, { method: "POST" });
    setVersion(r.version); setPoints([]); setMask(null);
  }

  async function save() {
    if (!s) return;
    setBusy("Saving to your media…"); setErr(null);
    try {
      const blob = await (await fetch(imgUrl, { credentials: "include" })).blob();
      const base = s.filename.replace(/\.[a-z0-9]+$/i, "");
      const file = new File([blob], `${base} (${aiUsed ? "AI edited" : "edited"}).jpg`, { type: "image/jpeg" });
      let a = await uploadFile(projectId, file, () => {}, new AbortController().signal);
      for (let i = 0; i < 60 && a.status !== "ready"; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        a = await api<Asset>(`/media/${a.id}`);
        if (a.status === "failed") throw new Error(a.status_detail || "Processing failed");
      }
      onSaved(a, swap && !!initial);
    } catch (e) { setErr((e as Error).message); setBusy(null); }
  }

  const onPointer = (e: React.MouseEvent) => {
    if (!s || busy || readOnly) return;
    if (mode === "select") {
      const [x, y] = toPx(e);
      select([...points, [Math.round(x), Math.round(y), exclude ? 0 : 1]]);
    }
  };
  const onDown = (e: React.PointerEvent) => {
    if (mode !== "move") return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, dx: off.dx, dy: off.dy };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !imgRef.current || !s) return;
    const k = s.width / imgRef.current.getBoundingClientRect().width;
    setOff((o) => ({ ...o, dx: Math.round(drag.current!.dx + (e.clientX - drag.current!.x) * k), dy: Math.round(drag.current!.dy + (e.clientY - drag.current!.y) * k) }));
  };

  const shown = s ? imgRef.current?.getBoundingClientRect().width ?? 0 : 0;
  const k = s && shown ? shown / s.width : 0;

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="card modal me-modal" role="dialog" aria-modal="true" aria-label="Magic Edit">
        <div className="row"><b className="grow" style={{ fontSize: 17 }}><Sparkles size={16} /> Magic Edit <span className="dim" style={{ fontSize: 12, fontWeight: 500 }}>photos</span></b>
          <button className="btn icon ghost" aria-label="Close" onClick={onClose} disabled={!!busy && busy.startsWith("Saving")}><X size={16} /></button></div>

        {!status ? <div className="me-wait"><span className="spinner" /></div>
        : !status.ready ? <div className="me-wait"><span className="spinner" /><p>{status.note ?? "Getting Magic Edit ready…"}</p></div>
        : !assetId ? <>
          <p className="dim" style={{ fontSize: 13 }}>Pick a photo from this project.</p>
          {images.length === 0 ? <div className="empty">No photos yet. Upload a JPG or PNG to Media first.</div> :
            <div className="me-pick">{images.map((a) => <button key={a.id} onClick={() => setAssetId(a.id)} title={a.filename}>
              {a.thumbnail_url ? <img src={a.thumbnail_url} alt="" /> : null}<span className="ellipsis">{a.filename}</span></button>)}</div>}
        </> : <>
          <div className="me-tools" role="toolbar" aria-label="Magic Edit tools">
            <div className="seg">
              <button className={mode === "select" && !exclude ? "on" : ""} onClick={() => { setMode("select"); setExclude(false); }} title="Tap parts of the object to add them"><Plus size={13} /> Select</button>
              <button className={mode === "select" && exclude ? "on" : ""} onClick={() => { setMode("select"); setExclude(true); }} disabled={!mask} title="Tap parts that should NOT be selected"><Minus size={13} /> Not this</button>
            </div>
            <button className="btn sm ghost" onClick={() => select([])} disabled={!points.length || !!busy}>Clear</button>
            <span className="grow" />
            <button className="btn sm ghost" onClick={undo} disabled={!version || !!busy}><Undo2 size={14} /> Undo</button>
          </div>

          <div className="me-stage" onClick={onPointer}>
            {s ? <div className="me-frame">
              <img ref={imgRef} src={imgUrl} alt="Photo being edited" draggable={false} onLoad={() => setOff((o) => ({ ...o }))} />
              {tint && <img className="me-tint" src={tint} alt="" draggable={false}
                style={mode === "move" ? { transform: `translate(${off.dx * k}px, ${off.dy * k}px) scale(${off.scale})`, transformOrigin: `${centre.x * k}px ${centre.y * k}px`, cursor: "grab", pointerEvents: "auto" } : undefined}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} />}
              {mode === "select" && points.map(([x, y, l], i) => <i key={i} className={`me-dot ${l ? "" : "neg"}`} style={{ left: `${(x / s.width) * 100}%`, top: `${(y / s.height) * 100}%` }} />)}
            </div> : <div className="me-wait"><span className="spinner" /></div>}
            {busy && <div className="me-busy"><span className="spinner" /> {busy}</div>}
          </div>
          {!mask && s && !busy && <p className="me-hint"><MousePointerClick size={13} /> Tap the object you want to change. Tap more parts to add them, or use “Not this”.</p>}

          {err && <div className="error-box">{err}</div>}

          {mask && mode === "select" && <div className="me-actions">
            <button className="btn primary" onClick={() => apply("remove")} disabled={!!busy || readOnly}><Eraser size={15} /> Remove</button>
            <button className="btn" onClick={() => setMode("move")} disabled={!!busy || readOnly}><Move size={15} /> Move / resize</button>
            {status.replace.length > 0 ? <div className="me-replace">
              <input className="input" placeholder="Replace with… e.g. a cup of coffee" value={prompt} maxLength={300}
                onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && prompt.trim() && apply("replace")} />
              <button className="btn" onClick={() => apply("replace")} disabled={!!busy || readOnly || prompt.trim().length < 2}><Wand2 size={15} /> Replace</button>
            </div> : <span className="dim" style={{ fontSize: 12 }}>Replace with a new object switches on when the server has a Gemini or Cloudflare key.</span>}
          </div>}

          {mask && mode === "move" && <div className="me-actions">
            <span className="dim" style={{ fontSize: 12 }}>Drag the blue shape to its new place.</span>
            <label className="me-scale">Size <input type="range" min={20} max={300} value={Math.round(off.scale * 100)} onChange={(e) => setOff((o) => ({ ...o, scale: +e.target.value / 100 }))} /> {Math.round(off.scale * 100)}%</label>
            <button className="btn primary" onClick={() => apply("move")} disabled={!!busy || (off.dx === 0 && off.dy === 0 && off.scale === 1)}><Move size={15} /> Apply</button>
            <button className="btn ghost" onClick={() => { setMode("select"); setOff({ dx: 0, dy: 0, scale: 1 }); }}>Cancel</button>
          </div>}

          <div className="row" style={{ marginTop: 10, gap: 10 }}>
            {aiUsed && <span className="badge info" title="Part of this photo was drawn by AI">AI edited</span>}
            {initial && <label className="row" style={{ gap: 6, fontSize: 12.5 }}><input type="checkbox" checked={swap} onChange={(e) => setSwap(e.target.checked)} /> Replace the photo on the timeline</label>}
            <span className="grow" />
            <button className="btn primary" onClick={save} disabled={!version || !!busy || readOnly}><Save size={15} /> Save to media</button>
          </div>
        </>}
      </div>
    </div>
  );
}
