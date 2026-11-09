import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Undo2, Redo2, Save, Download, Loader2, Smartphone, Eye, Film, AlertTriangle, Cloud, CloudOff } from "lucide-react";
import { api, ApiError, Asset, Project, SequenceDoc } from "../api";
import { useToast } from "../App";
import { useHistory } from "../editor/useHistory";
import Viewer, { Sampler } from "../editor/Viewer";
import { titleFont } from "../fonts";
import { AssetLike, Composition, Layer, MediaLayer, RATIOS, TEMPLATES, applyTemplate, canvasFor, changeCanvas, compileComposition,
  fitDuration, graphicKey, ratioOf } from "../compose";
import Canvas from "./Canvas";
import Sidebar, { SideTab } from "./Sidebar";
import LayerInspector from "./LayerInspector";
import Layers from "./Layers";
import ExportPanel from "./ExportPanel";
import "./studio.css";

const measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
export const measure = (t: string, px: number) => { if (!measureCtx) return t.length * px * 0.56; measureCtx.font = `700 ${px}px ${titleFont(t)}`; return measureCtx.measureText(t).width; };
export type Ctx = { comp: Composition; edit: (c: Composition, coalesce?: string) => void; assets: Asset[]; amap: Map<string, AssetLike>;
  selected: string | null; select: (id: string | null) => void; playhead: number; setPlayhead: (f: number) => void; projectId: string; reloadMedia: () => Promise<void> };

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";
const SHORT_SIDES = [1080, 720, 1440, 2160];

export default function ShortsStudio() {
  const { projectId } = useParams();
  const [sp, setSp] = useSearchParams();
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [seqs, setSeqs] = useState<SequenceDoc[]>([]);
  const [seq, setSeq] = useState<SequenceDoc | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [err, setErr] = useState("");
  const hist = useHistory<Composition | null>(null);
  const comp = hist.value;
  const [selected, select] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [save, setSave] = useState<SaveState>("saved");
  const version = useRef(0);
  const [tab, setTab] = useState<SideTab>("layouts");
  const [platform, setPlatform] = useState(false);
  const [original, setOriginal] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [editedOutside, setEditedOutside] = useState(false);
  const samplerRef = useRef<Sampler | null>(null);

  const amap = useMemo(() => new Map<string, AssetLike>(assets.map((a) => [a.id, a as AssetLike])), [assets]);
  const reloadMedia = useCallback(async () => { try { setAssets(await api<Asset[]>(`/projects/${projectId}/media`)); } catch { /* shown in media tab */ } }, [projectId]);
  useEffect(() => {
    if (!assets.some((a) => a.status === "processing" || a.status === "uploading")) return;
    const t = setInterval(reloadMedia, 2000);
    return () => clearInterval(t);
  }, [assets, reloadMedia]);

  // ------------------------------------------------------------ load
  const open = useCallback((s: SequenceDoc) => {
    setSeq(s); version.current = s.version; setPlayhead(0); select(null); setSave("saved");
    hist.reset(s.timeline.composition ?? null);
    if (sp.get("seq") !== s.id) setSp({ seq: s.id }, { replace: true });
  }, [hist, sp, setSp]);
  useEffect(() => {
    (async () => {
      try {
        const p = await api<Project>(`/projects/${projectId}`);
        setProject(p);
        const list = p.sequences ?? [];
        setSeqs(list);
        await reloadMedia();
        const want = list.find((s) => s.id === sp.get("seq")) ?? list.find((s) => s.timeline.composition) ?? null;
        if (want) open(want);
      } catch (e) { setErr((e as Error).message); }
    })();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const tl = useMemo(() => (comp ? compileComposition(comp, amap, measure) : null), [comp, amap]);
  const total = tl ? Math.max(1, comp!.duration) : 0;
  const edit = useCallback((c: Composition, coalesce?: string) => { hist.commit(c, coalesce); setSave("dirty"); }, [hist]);
  // media that becomes ready (e.g. a generated background) changes the timeline without an edit: save that too
  const fingerprint = (t: { tracks: { clips: { asset_id: string | null; start: number; in: number; out: number }[] }[] }) =>
    JSON.stringify(t.tracks.map((x) => x.clips.map((c) => [c.asset_id, c.start, c.in, c.out])));
  useEffect(() => {
    if (!tl || !seq || save !== "saved" || editedOutside) return;
    if (seq.timeline.composition && fingerprint(seq.timeline) !== fingerprint(tl)) setSave("dirty");
  }, [tl]); // eslint-disable-line react-hooks/exhaustive-deps

  // was this sequence changed in the full editor after the studio saved it?
  useEffect(() => {
    if (!seq || !tl || !assets.length) return;
    const norm = (t: any) => JSON.stringify(t.tracks.map((x: any) => x.clips.map((c: any) => [c.asset_id, c.start, c.in, c.out])));
    setEditedOutside(!!seq.timeline.composition && norm(seq.timeline) !== norm(tl) && hist.canUndo === false);
  }, [seq?.id, assets.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // generated backgrounds/overlays: make the image once, then point the layer at it (no undo step)
  const making = useRef(new Set<string>());
  useEffect(() => {
    if (!comp) return;
    for (const L of comp.layers) {
      if (L.kind !== "media" || !L.graphic || L.asset_id) continue;
      const key = graphicKey(L.graphic, comp.width, comp.height);
      const existing = assets.find((a) => { const g = (a as any).analysis?.generation; return g?.source === "studio.graphic" && a.status !== "failed" && graphicKey(g, g.width, g.height) === key; });
      if (existing) { hist.replace((c) => c && ({ ...c, layers: c.layers.map((x) => (x.id === L.id ? { ...x, asset_id: existing.id } as Layer : x)) })); continue; }
      if (making.current.has(key)) continue;
      making.current.add(key);
      const g = L.graphic;
      api<Asset>(`/projects/${projectId}/graphics`, { method: "POST", body: { kind: g.kind, color: g.color, color2: g.color2 ?? g.color, angle: g.angle ?? 180,
        strength: g.strength ?? 0.8, width: comp.width, height: comp.height } })
        .then((a) => setAssets((xs) => [a, ...xs]))
        .catch((e) => { toast((e as Error).message); })
        .finally(() => making.current.delete(key));
    }
  }, [comp, assets]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------ save (auto, 1.2 s after the last change)
  const doSave = useCallback(async () => {
    if (!seq || !tl) return;
    setSave("saving");
    try {
      const r = await api<{ version: number; updated_at: string }>(`/sequences/${seq.id}`, { method: "PUT", body: { base_version: version.current, timeline: tl } });
      const s = { ...seq, version: r.version, updated_at: r.updated_at, timeline: tl };
      version.current = s.version; setSeq(s); setSeqs((xs) => xs.map((x) => (x.id === s.id ? s : x)));
      setSave((cur) => (cur === "saving" ? "saved" : cur)); setEditedOutside(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setSave("conflict"); else { setSave("error"); toast((e as Error).message); }
    }
  }, [seq, tl, toast]);
  useEffect(() => { if (save !== "dirty") return; const t = setTimeout(doSave, 1200); return () => clearTimeout(t); }, [save, tl, doSave]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (save === "dirty" || save === "saving") { e.preventDefault(); e.returnValue = ""; } };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [save]);

  // ------------------------------------------------------------ keyboard: undo/redo, nudge, delete, play
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) hist.redo(); else hist.undo(); setSave("dirty"); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); hist.redo(); setSave("dirty"); return; }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); doSave(); return; }
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); return; }
      if (!comp || !selected) return;
      const L = comp.layers.find((l) => l.id === selected);
      if (!L || L.kind === "audio" || L.locked) return;
      const step = e.shiftKey ? 0.05 : 0.005;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) {
        e.preventDefault();
        edit({ ...comp, layers: comp.layers.map((l) => (l.id === L.id && l.kind !== "audio" ? { ...l, pinned: true, box: { ...l.box, x: l.box.x + d[0], y: l.box.y + d[1] } } as Layer : l)) }, `nudge:${L.id}`);
      }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); edit({ ...comp, layers: comp.layers.filter((l) => l.id !== L.id) }); select(null); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [comp, selected, hist, edit, doSave]);

  // ------------------------------------------------------------ create a composition (first time, or a new one)
  async function create(templateId: string, ratio: string, media: Asset[]) {
    const r = RATIOS.find((x) => x.id === ratio) ?? RATIOS[0];
    const fps = project?.sequences?.[0]?.timeline.fps ?? 30;
    const vids = media.filter((a) => a.kind === "video"), imgs = media.filter((a) => a.kind === "image");
    const t = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0];
    let c = applyTemplate(t, { width: r.w, height: r.h, fps, media: vids as AssetLike[], images: imgs as AssetLike[] }, 30 * fps);
    c = { ...c, duration: fitDuration(c.layers, amap, fps) };
    try {
      const s = await api<SequenceDoc>(`/projects/${projectId}/sequences`, { method: "POST", body: { name: `Shorts ${r.id} · ${t.name}`.slice(0, 200) } });
      const timeline = compileComposition(c, amap, measure);
      const r2 = await api<{ version: number; updated_at: string }>(`/sequences/${s.id}`, { method: "PUT", body: { base_version: s.version, timeline } });
      const saved = { ...s, version: r2.version, updated_at: r2.updated_at, timeline };
      setSeqs((xs) => [...xs, saved]);
      open(saved);
    } catch (e) { toast((e as Error).message); }
  }

  function setCanvas(width: number, height: number) {
    if (!comp) return;
    edit(changeCanvas(comp, width, height, amap));
  }

  if (err) return <div className="auth-wrap"><div className="card auth-card"><h2>Couldn't open the Shorts studio</h2><p className="dim">{err}</p><Link className="btn" to="/editor/projects">Back to projects</Link></div></div>;
  if (!project) return <div className="auth-wrap"><div className="spinner" aria-label="Loading" /></div>;

  const ratio = comp ? ratioOf(comp.width, comp.height) : "9:16";
  const shortSide = comp ? Math.min(comp.width, comp.height) : 1080;
  const ctx: Ctx | null = comp ? { comp, edit, assets, amap, selected, select, playhead, setPlayhead, projectId: projectId!, reloadMedia } : null;
  const selLayer = comp?.layers.find((l) => l.id === selected) ?? null;
  const origAsset = selLayer && selLayer.kind === "media" && selLayer.asset_id ? assets.find((a) => a.id === selLayer.asset_id) : (comp?.layers.find((l) => l.kind === "media" && l.role === "main") as MediaLayer | undefined)?.asset_id ? assets.find((a) => a.id === (comp!.layers.find((l) => l.kind === "media" && l.role === "main") as MediaLayer).asset_id) : undefined;

  return (
    <div className="sts">
      <header className="sts-top">
        <Link to={`/edit/${projectId}${seq ? `?seq=${seq.id}` : ""}`} className="btn ghost sm" title="Back to the full editor"><ArrowLeft size={15} />Editor</Link>
        <div className="sts-title"><b>{project.name}</b><span>Shorts Creative Studio</span></div>
        {comp && <>
          <div className="sts-group">
            <button className="btn icon ghost" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!hist.canUndo} onClick={() => { hist.undo(); setSave("dirty"); }}><Undo2 size={16} /></button>
            <button className="btn icon ghost" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!hist.canRedo} onClick={() => { hist.redo(); setSave("dirty"); }}><Redo2 size={16} /></button>
          </div>
          <div className="sts-group" role="group" aria-label="Aspect ratio">
            {RATIOS.map((r) => <button key={r.id} className={`sts-ratio ${ratio === r.id ? "on" : ""}`} title={`${r.w}×${r.h} · ${r.use}`}
              onClick={() => { const ss = SHORT_SIDES.includes(shortSide) ? shortSide : 1080; const c = canvasFor(r.w, r.h, Math.max(r.w, r.h) * ss / Math.min(r.w, r.h)); setCanvas(c.width, c.height); }}>
              <i style={{ aspectRatio: `${r.w}/${r.h}` }} />{r.label}</button>)}
            <CustomSize w={comp.width} h={comp.height} on={ratio === "custom"} set={setCanvas} />
          </div>
          <label className="sts-sel">Resolution
            <select value={shortSide} onChange={(e) => { const s = +e.target.value, k = s / Math.min(comp.width, comp.height); const ev = (v: number) => Math.min(3840, Math.round(v * k / 2) * 2); setCanvas(ev(comp.width), ev(comp.height)); }}>
              {[...new Set([...SHORT_SIDES, shortSide])].sort((a, b) => a - b).map((s) => <option key={s} value={s}>{Math.round(comp.width * s / shortSide)}×{Math.round(comp.height * s / shortSide)}</option>)}
            </select></label>
          <label className="sts-sel">FPS
            <select value={comp.fps} onChange={(e) => { const f = +e.target.value; edit({ ...comp, fps: f, duration: Math.round(comp.duration * f / comp.fps),
              layers: comp.layers.map((l) => ({ ...l, start: Math.round(l.start * f / comp.fps), length: l.length == null ? null : Math.round(l.length * f / comp.fps),
                ...("in" in l ? { in: Math.round((l as MediaLayer).in * f / comp.fps) } : {}) }) as Layer) }); }}>
              {[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f}</option>)}
            </select></label>
        </>}
        <div className="grow" />
        {comp && <span className={`sts-save ${save}`} role="status">{save === "saving" ? <><Loader2 size={13} className="spin" />Saving</> : save === "saved" ? <><Cloud size={13} />Saved</> :
          save === "dirty" ? <><Cloud size={13} />Unsaved</> : save === "conflict" ? <><AlertTriangle size={13} />Changed elsewhere — reload</> : <><CloudOff size={13} />Not saved</>}</span>}
        {comp && <button className="btn sm" onClick={doSave} disabled={save === "saving"}><Save size={14} />Save</button>}
        {comp && <button className="btn sm sts-go" onClick={async () => { await doSave(); setExportOpen(true); }}><Download size={14} />Export</button>}
      </header>

      {!comp || !ctx ? <StartScreen assets={assets} projectId={projectId!} reload={reloadMedia} seqs={seqs.filter((s) => s.timeline.composition)} onOpen={open} onCreate={create} /> : <>
        {editedOutside && <div className="sts-warn" role="alert"><AlertTriangle size={14} />This sequence was changed in the full editor. Editing it here rebuilds it from the layout and replaces those edits.
          <button className="btn sm" onClick={() => setEditedOutside(false)}>OK</button></div>}
        <div className="sts-body">
          <Sidebar ctx={ctx} tab={tab} setTab={setTab} />
          <main className="sts-center">
            <div className="sts-viewbar">
              <button className={`pill ${platform ? "on" : ""}`} aria-pressed={platform} onClick={() => setPlatform(!platform)} title="Shows how it looks in the Shorts player. Never added to the export."><Smartphone size={13} />Shorts preview</button>
              <button className={`pill ${original ? "on" : ""}`} aria-pressed={original} onClick={() => setOriginal(!original)} disabled={!origAsset} title="Compare with the original clip"><Eye size={13} />{original ? "Showing original" : "Original"}</button>
              <span className="dim" style={{ fontSize: 12 }}>Drag layers on the canvas · arrows nudge (Shift = more)</span>
            </div>
            <div className="sts-stagewrap">
              {original && origAsset?.proxy_url ? <div className="sts-orig">{origAsset.kind === "image" ? <img src={origAsset.proxy_url} alt="" /> : <video src={origAsset.proxy_url} controls playsInline />}
                <span className="pill static">{origAsset.filename} · {origAsset.width}×{origAsset.height}</span></div> :
                <Canvas ctx={ctx} platform={platform} project={project}>
                  <Viewer tl={tl!} assets={new Map<string | null, Asset>(assets.map((a) => [a.id, a]))} playhead={playhead} setPlayhead={setPlayhead as any} playing={playing} setPlaying={setPlaying as any}
                    total={total} samplerRef={samplerRef} sequences={seqs} currentSeqId={seq!.id} onSwitchSeq={(id) => { const s = seqs.find((x) => x.id === id); if (s?.timeline.composition) open(s); else toast("That sequence wasn't made in the Shorts studio — open it in the full editor"); }}
                    onNewSeq={() => hist.reset(null)} onSnapshot={() => toast("Snapshots are in the full editor")} autoAdjust={false} analysed />
                </Canvas>}
            </div>
          </main>
          <LayerInspector ctx={ctx} />
        </div>
        <Layers ctx={ctx} total={total} playing={playing} setPlaying={setPlaying} />
        <Link to={`/edit/${projectId}?seq=${seq!.id}`} className="sts-fulled"><Film size={13} />Open in the full editor (split, ripple delete, keyframe graph, colour wheels)</Link>
      </>}
      {exportOpen && comp && seq && <ExportPanel comp={comp} amap={amap} projectId={projectId!} seq={seq} onClose={() => setExportOpen(false)} />}
    </div>
  );
}

function CustomSize({ w, h, on, set }: { w: number; h: number; on: boolean; set: (w: number, h: number) => void }) {
  const [o, setO] = useState(false), [a, setA] = useState(String(w)), [b, setB] = useState(String(h));
  useEffect(() => { setA(String(w)); setB(String(h)); }, [w, h]);
  const ev = (v: string) => Math.max(144, Math.min(3840, Math.round((+v || 0) / 2) * 2));
  return <span style={{ position: "relative" }}>
    <button className={`sts-ratio ${on ? "on" : ""}`} onClick={() => setO(!o)} aria-expanded={o}>Custom</button>
    {o && <form className="card sts-pop" onSubmit={(e) => { e.preventDefault(); set(ev(a), ev(b)); setO(false); }}>
      <label>Width<input className="input" type="number" min={144} max={3840} step={2} value={a} onChange={(e) => setA(e.target.value)} /></label>
      <label>Height<input className="input" type="number" min={144} max={3840} step={2} value={b} onChange={(e) => setB(e.target.value)} /></label>
      <button className="btn sm sts-go">Apply</button><span className="dim">144–3840 px, even numbers</span></form>}
  </span>;
}

function StartScreen({ assets, projectId, reload, seqs, onOpen, onCreate }: { assets: Asset[]; projectId: string; reload: () => Promise<void>; seqs: SequenceDoc[];
  onOpen: (s: SequenceDoc) => void; onCreate: (t: string, ratio: string, media: Asset[]) => void }) {
  const [pick, setPick] = useState<string[]>([]), [ratio, setRatio] = useState("9:16"), [tpl, setTpl] = useState("podcast-blur"), [busy, setBusy] = useState(false);
  const usable = assets.filter((a) => (a.kind === "video" || a.kind === "image") && a.status === "ready" && !(a as any).analysis?.generation?.source?.startsWith("studio."));
  const media = pick.map((id) => usable.find((a) => a.id === id)).filter(Boolean) as Asset[];
  return <div className="sts-start">
    <div className="card sts-start-card">
      <h2>Make Shorts & Reels</h2>
      <p className="dim">Pick clips and images, a shape and a layout. Everything stays editable: move frames, add text, effects and more layers.</p>
      {seqs.length > 0 && <><div className="sts-h">Continue</div><div className="sts-chips">{seqs.map((s) => <button key={s.id} className="btn sm" onClick={() => onOpen(s)}>{s.name} · {s.timeline.width}×{s.timeline.height}</button>)}</div></>}
      <div className="sts-h">1 · Media <span className="dim">(first video = main; add more for stacks and picture-in-picture)</span></div>
      <UploadButton projectId={projectId} onDone={reload} />
      <div className="sts-pick">{usable.length ? usable.map((a) => <button key={a.id} className={`sts-thumb ${pick.includes(a.id) ? "on" : ""}`} onClick={() => setPick((p) => p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id])}>
        {a.thumbnail_url ? <img src={a.thumbnail_url} alt="" /> : <span>{a.kind}</span>}{pick.includes(a.id) && <b>{pick.indexOf(a.id) + 1}</b>}<em>{a.filename}</em></button>) :
        <div className="dim">No ready media yet — upload a video or image.</div>}</div>
      <div className="sts-h">2 · Shape</div>
      <div className="sts-chips">{RATIOS.map((r) => <button key={r.id} className={`sts-ratio big ${ratio === r.id ? "on" : ""}`} onClick={() => setRatio(r.id)}><i style={{ aspectRatio: `${r.w}/${r.h}` }} />{r.label}<small>{r.use}</small></button>)}</div>
      <div className="sts-h">3 · Layout</div>
      <select className="input" value={tpl} onChange={(e) => setTpl(e.target.value)} aria-label="Layout">{TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.category} — {t.name}</option>)}</select>
      <button className="btn sts-go" style={{ marginTop: 14 }} disabled={!media.length || busy} onClick={async () => { setBusy(true); await onCreate(tpl, ratio, media); setBusy(false); }}>
        {busy ? <Loader2 size={15} className="spin" /> : null}Create</button>
    </div>
  </div>;
}

export function UploadButton({ projectId, onDone }: { projectId: string; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [n, setN] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  return <>
    <input ref={ref} type="file" accept="video/*,image/*,audio/*" multiple hidden onChange={async (e) => {
      const files = [...(e.target.files ?? [])]; e.target.value = "";
      const { uploadFile } = await import("../upload");
      setN((x) => x + files.length);
      await Promise.all(files.map((f) => uploadFile(projectId, f, () => {}, new AbortController().signal).then(onDone).catch((x) => toast(`${f.name}: ${(x as Error).message}`)).finally(() => setN((v) => v - 1))));
    }} />
    <button className="btn sm" onClick={() => ref.current?.click()}>{n ? <><Loader2 size={13} className="spin" />Uploading {n}…</> : "Upload media"}</button>
  </>;
}
