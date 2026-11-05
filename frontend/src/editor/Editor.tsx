import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Cloud, CloudOff, Loader2, AlertTriangle, Undo2, Redo2, Rocket, Home, FolderOpen, Scissors, Wand2, Palette, AudioLines, Workflow, Type, Image as ImageIcon } from "lucide-react";
import { api, ApiError, Asset, Project, SequenceDoc } from "../api";
import { useToast } from "../App";
import { Brand, UserMenu } from "../components/Shell";
import { useHistory } from "./useHistory";
import { Timeline, duration, splitAllAt, deleteClip, findClip, insertClip, framesToTimecode, clipsAt } from "../timeline";
import MediaBin from "./MediaBin";
import Viewer from "./Viewer";
import TimelinePanel from "./TimelinePanel";
import Inspector from "./Inspector";
import ExportPanel from "./ExportPanel";
import HistoryPanel from "./HistoryPanel";

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict" | "offline";

export function assetFrames(a: Asset | undefined, fps: number): number {
  if (!a) return 0;
  if (a.kind === "image") return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.floor((a.duration_s ?? 0) * fps));
}

export default function Editor() {
  const { projectId } = useParams();
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [seq, setSeq] = useState<SequenceDoc | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const hist = useHistory<Timeline | null>(null);
  const tl = hist.value;
  const [version, setVersion] = useState(0);
  const savedRef = useRef<Timeline | null>(null);
  const latestRef = useRef<Timeline | null>(null);
  latestRef.current = tl;
  const [save, setSave] = useState<SaveState>("saved");
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"inspector" | "export" | "history">("inspector");
  const [snapOn, setSnapOn] = useState(true);
  const readOnly = project?.my_role === "viewer";

  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  // ---------- load
  const loadMedia = useCallback(async () => {
    try { setAssets(await api<Asset[]>(`/projects/${projectId}/media`)); } catch { /* shown via bin */ }
  }, [projectId]);
  useEffect(() => {
    (async () => {
      try {
        const p = await api<Project>(`/projects/${projectId}`);
        setProject(p);
        const s = p.sequences![0];
        setSeq(s); setVersion(s.version); savedRef.current = s.timeline; hist.reset(s.timeline);
        await loadMedia();
      } catch (e) { setLoadErr((e as Error).message); }
    })();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while any media is still uploading/processing (real worker state).
  useEffect(() => {
    if (!assets.some((a) => a.status === "processing")) return;
    const t = setInterval(loadMedia, 2500);
    return () => clearInterval(t);
  }, [assets, loadMedia]);

  // ---------- autosave (debounced, optimistic concurrency)
  const saving = useRef(false);
  const doSave = useCallback(async (force = false): Promise<boolean> => {
    if (!seq || !tl || readOnly) return true;
    if (!force && tl === savedRef.current) return true;
    if (saving.current) return false;
    saving.current = true; setSave("saving");
    const snapshot = tl;
    try {
      const r = await api<{ version: number }>(`/sequences/${seq.id}`, { method: "PUT", body: { base_version: version, timeline: snapshot } });
      setVersion(r.version); savedRef.current = snapshot;
      setSave(latestRef.current === snapshot ? "saved" : "dirty");
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setSave("conflict");
      else if (e instanceof ApiError && e.status === 0) setSave("offline");
      else { setSave("error"); toast(`Couldn't save: ${(e as Error).message}`); }
      return false;
    } finally { saving.current = false; }
  }, [seq, tl, version, readOnly, toast]);

  useEffect(() => {
    if (!tl || tl === savedRef.current || save === "conflict") return;
    setSave((s) => (s === "saving" ? s : "dirty"));
    const t = setTimeout(() => { doSave(); }, 800);
    return () => clearTimeout(t);
  }, [tl, doSave, save]);
  useEffect(() => {
    if (save !== "offline" && save !== "error") return;
    const t = setTimeout(() => doSave(true), 4000);
    return () => clearTimeout(t);
  }, [save, doSave]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (tl && tl !== savedRef.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [tl]);

  async function resolveConflict(keepMine: boolean) {
    if (!seq) return;
    const latest = await api<SequenceDoc>(`/sequences/${seq.id}`);
    setVersion(latest.version);
    if (keepMine) { savedRef.current = latest.timeline; setSave("dirty"); }
    else { savedRef.current = latest.timeline; hist.reset(latest.timeline); setSave("saved"); }
  }

  const edit = useCallback((next: Timeline | null, coalesce?: string) => {
    if (!next || readOnly) return false;
    hist.commit(next, coalesce);
    return true;
  }, [hist, readOnly]);

  const total = tl ? duration(tl) : 0;
  const fps = tl?.fps ?? 30;

  const addAssetToTimeline = useCallback((a: Asset, trackId?: string, at?: number) => {
    if (!tl || a.status !== "ready") return;
    const kind = a.kind === "audio" ? "audio" : "video";
    // Default target: bottom-most unlocked video track (V1), or the first unlocked audio track (A1).
    const track = trackId ? tl.tracks.find((t) => t.id === trackId)
      : kind === "video" ? [...tl.tracks].reverse().find((t) => t.kind === "video" && !t.locked)
      : tl.tracks.find((t) => t.kind === "audio" && !t.locked);
    if (!track || track.kind !== kind) { toast(kind === "audio" ? "Drop audio on an audio track" : "Drop video and images on a video track"); return; }
    const frames = a.kind === "image" ? 5 * fps : assetFrames(a, fps);
    const r = insertClip(tl, track.id, a.id, at ?? playhead, 0, frames);
    if (r && edit(r.tl)) setSelected(r.id);
    else toast("That track is locked");
  }, [tl, fps, playhead, edit, toast]);

  // ---------- keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, select, textarea, [contenteditable]")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? hist.redo() : hist.undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); hist.redo(); return; }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); doSave(true); return; }
      if (!tl) return;
      switch (e.key) {
        case " ": e.preventDefault(); setPlaying((p) => !p); break;
        case "ArrowLeft": e.preventDefault(); setPlaying(false); setPlayhead((f) => Math.max(0, f - (e.shiftKey ? fps : 1))); break;
        case "ArrowRight": e.preventDefault(); setPlaying(false); setPlayhead((f) => f + (e.shiftKey ? fps : 1)); break;
        case "Home": setPlayhead(0); break;
        case "End": setPlayhead(total); break;
        case "s": case "S": case "b": case "B": edit(splitAllAt(tl, playhead)); break;
        case "n": case "N": setSnapOn((s) => !s); break;
        case "Delete": case "Backspace":
          if (selected) { if (edit(deleteClip(tl, selected, e.shiftKey))) setSelected(null); }
          break;
        case "Escape": setSelected(null); break;
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [tl, playhead, selected, fps, total, hist, edit, doSave]);

  if (loadErr) return <div className="auth-wrap"><div className="card auth-card"><h2>Can't open this project</h2><p className="muted">{loadErr}</p><Link className="btn" to="/projects">Back to projects</Link></div></div>;
  if (!project || !tl || !seq) return <div className="auth-wrap"><div className="spinner" aria-label="Loading editor" /></div>;

  const sel = selected ? findClip(tl, selected) : null;
  const active = clipsAt(tl, playhead);

  return (
    <div className="ed">
      <header className="ed-top">
        <Brand small />
        <nav className="topnav ed-nav" aria-label="Studios">
          <Link to="/home"><Home size={17} />Home</Link>
          <Link to="/projects"><FolderOpen size={17} />Projects</Link>
          <a className="active" aria-current="page"><Scissors size={17} />Edit</a>
          {[["AI", Wand2], ["Color", Palette], ["Audio", AudioLines], ["Fusion", Workflow], ["Graphics", Type], ["Design", ImageIcon]].map(([l, I]: any) => (
            <span key={l} title="Planned — not available yet"><I size={17} />{l}</span>))}
        </nav>
        <div className="grow" />
        <ProjectName project={project} onRename={(n) => setProject({ ...project, name: n })} readOnly={readOnly} />
        <div className="row" style={{ gap: 4 }}>
          <button className="btn icon ghost" onClick={hist.undo} disabled={!hist.canUndo || readOnly} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={16} /></button>
          <button className="btn icon ghost" onClick={hist.redo} disabled={!hist.canRedo || readOnly} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Redo2 size={16} /></button>
        </div>
        <SaveBadge state={readOnly ? "readonly" : save} version={version} />
        <button className="btn primary" onClick={() => setRightTab("export")} disabled={readOnly}><Rocket size={16} />Export</button>
        <UserMenu />
      </header>

      <div>{/* always rendered so the grid rows never shift */}
        {save === "conflict" && (
          <div className="ed-banner" role="alert"><AlertTriangle size={16} />This sequence was changed in another tab or by a teammate.
            <button className="btn sm" onClick={() => resolveConflict(false)}>Load their version</button>
            <button className="btn sm" onClick={() => resolveConflict(true)}>Keep mine (overwrite)</button></div>
        )}
      </div>

      <div className="ed-body">
        <MediaBin projectId={project.id} assets={assets} setAssets={setAssets} reload={loadMedia} readOnly={readOnly} onAdd={(a) => addAssetToTimeline(a)} fps={fps} />
        <Viewer tl={tl} assets={assetMap} playhead={playhead} setPlayhead={setPlayhead} playing={playing} setPlaying={setPlaying} total={total}
          activeCount={active.video.length} />
        <aside className="ed-right panel">
          <div className="tabs" role="tablist">
            {(["inspector", "export", "history"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={rightTab === t} className={rightTab === t ? "on" : ""} onClick={() => setRightTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>))}
          </div>
          <div className="ed-right-body">
            {rightTab === "inspector" && <Inspector tl={tl} sel={sel} asset={sel ? assetMap.get(sel.clip.asset_id) : undefined} edit={edit} readOnly={readOnly} />}
            {rightTab === "export" && <ExportPanel projectId={project.id} sequenceId={seq.id} tl={tl} flush={() => doSave(true)} dirty={tl !== savedRef.current} readOnly={readOnly} />}
            {rightTab === "history" && <HistoryPanel sequenceId={seq.id} current={version} readOnly={readOnly} onRestored={(s) => { setVersion(s.version); savedRef.current = s.timeline; hist.reset(s.timeline); setSave("saved"); toast(`Restored — saved as version ${s.version}`); }} />}
          </div>
        </aside>
      </div>
      <TimelinePanel tl={tl} assets={assetMap} edit={edit} playhead={playhead} setPlayhead={(f) => { setPlaying(false); setPlayhead(f); }}
        selected={selected} setSelected={setSelected} snapOn={snapOn} setSnapOn={setSnapOn} readOnly={readOnly}
        onDropAsset={(id, trackId, at) => { const a = assetMap.get(id); if (a) addAssetToTimeline(a, trackId, at); }}
        timecode={`${framesToTimecode(playhead, fps)} / ${framesToTimecode(total, fps)}`} />
    </div>
  );
}

function SaveBadge({ state, version }: { state: SaveState | "readonly"; version: number }) {
  const m: Record<string, [any, string, string]> = {
    saved: [Cloud, `Cloud saved · v${version}`, "ok"], dirty: [Cloud, "Unsaved changes", "warn"], saving: [Loader2, "Saving…", "info"],
    error: [CloudOff, "Save failed — retrying", "err"], offline: [CloudOff, "Offline — will retry", "err"], conflict: [AlertTriangle, "Save conflict", "err"],
    readonly: [Cloud, "View only", ""],
  };
  const [I, label, cls] = m[state];
  return <span className={`badge ${cls} save-badge`} aria-live="polite"><I size={13} className={state === "saving" ? "spin" : ""} />{label}</span>;
}

function ProjectName({ project, onRename, readOnly }: { project: Project; onRename: (n: string) => void; readOnly: boolean }) {
  const [v, setV] = useState(project.name);
  const toast = useToast();
  async function commit() {
    const n = v.trim();
    if (!n || n === project.name) { setV(project.name); return; }
    try { await api(`/projects/${project.id}`, { method: "PATCH", body: { name: n } }); onRename(n); }
    catch (e) { toast((e as Error).message); setV(project.name); }
  }
  return <input className="proj-name" value={v} disabled={readOnly} onChange={(e) => setV(e.target.value)} onBlur={commit}
    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} aria-label="Project name" maxLength={200} />;
}
