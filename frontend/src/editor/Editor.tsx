import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { History as HistoryIcon, X as XIcon, Cloud, CloudOff, Loader2, AlertTriangle, Undo2, Redo2, Home, FolderOpen, Scissors, Workflow, Palette, AudioLines, Sparkles, Activity, Type, Image as ImageIcon, LayoutTemplate } from "lucide-react";
import { api, ApiError, Asset, Project, SequenceDoc } from "../api";
import { useToast } from "../App";
import { Brand, UserMenu } from "../components/Shell";
import { useHistory } from "./useHistory";
import { Title, DEFAULT_TITLE, Timeline, Clip, duration, splitAllAt, splitAt, deleteClip, findClip, insertClip, insertTitle, updateClip, end, fits, freeSlot, addTrack, uid, DEFAULT_TRANSFORM } from "../timeline";
import { EDIT_TYPES, EditType, insert, overwrite, replace, fitToFill, placeOnTop, append, rippleOverwrite } from "../editops";
import { CaptionsModal, TTSModal, VoiceCatalog } from "./AiTools";
import { HighlightsModal, ThumbnailModal, Moment } from "./Creator";
import ObjectRemoveModal from "./ObjectRemove";
import DubStudio from "./DubStudio";
import HistoryPanel from "./HistoryPanel";
import { LOOKS, svgFilterBody, withLook, sanitizeGrade } from "../grade";
import FindAI, { Suggestion } from "./FindAI";
import { buildPlan, applyCuts, silenceCuts, applySceneSplits, sceneSplits, loudnessGain } from "../smart";
import MediaBin, { BinTab } from "./MediaBin";
import type { AssetCtx } from "./AssetLibrary";
import FocusMusic from "./FocusMusic";
import { Workspace, LayoutMenu, WorkspaceBar, useLayout, PanelDef, PanelId } from "./Workspace";
import { Bot, Mic2, Palette as PaletteI, BarChart3, Network, Zap, SlidersHorizontal, Rocket as RocketI, Film as FilmI, Lightbulb } from "lucide-react";
import { loadCatalogue, Generation, Tool } from "../ai/core";
const EmbeddedTool = lazy(() => import("../pages/AiTool").then((m) => ({ default: m.EmbeddedTool })));
import { insertTemplate, TitleTemplate } from "../templates";
import Viewer, { Sampler } from "./Viewer";
import TimelinePanel from "./TimelinePanel";
import QuickAdjustments from "./QuickAdjustments";
import Inspector from "./Inspector";
import ExportDock from "./ExportDock";
import ToolSidebar from "./ToolSidebar";
import ColorPanel from "./ColorPanel";
import ScopesPanel from "./ScopesPanel";
import NodesPanel from "./NodesPanel";
import BottomStrip from "./BottomStrip";
import AutoEdit from "./AutoEdit";
import RecordModal from "./RecordModal";
import { AssistantPanel, VoicePanel, QuickActions, Recommendations, PlanDialog, Caps, Capability } from "./AiPanels";
import { AdDirector } from "./AdDirector";

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict" | "offline";

export function assetFrames(a: Asset | undefined, fps: number): number {
  if (!a) return 0;
  if (a.kind === "image") return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.floor((a.duration_s ?? 0) * fps));
}

// A just-imported clip is usable at once; its waveform/analysis arrive a little later, so keep polling briefly.
function enriching(a: Asset) {
  return a.status === "ready" && (a.kind === "video" || a.kind === "audio") && !a.analysis
    && Date.now() - new Date(a.created_at).getTime() < 15 * 60_000;
}

// Polling returns freshly signed URLs every time; keep the old ones (same file, not near expiry) so the player and
// thumbnails don't reload, and keep a local preview picture until the server thumbnail exists.
function keepUrls(prev: Asset[], next: Asset[]): Asset[] {
  const old = new Map(prev.map((a) => [a.id, a]));
  const path = (u: string | null | undefined) => (u ? u.split("?")[0] : u);
  const fresh = (u: string) => {
    const m = /X-Amz-Date=(\d{8}T\d{6}Z)/.exec(u);
    if (!m) return false;
    const d = m[1];
    const t = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +d.slice(9, 11), +d.slice(11, 13), +d.slice(13, 15));
    return Date.now() - t < 10 * 60_000;
  };
  return next.map((n) => {
    const o = old.get(n.id);
    if (!o) return n;
    const pick = (f: "proxy_url" | "thumbnail_url" | "waveform_url") => {
      const ov = o[f], nv = n[f];
      if (!nv && f === "thumbnail_url" && (ov?.startsWith("data:") || ov?.startsWith("blob:"))) return ov;
      return ov && nv && path(ov) === path(nv) && fresh(ov) ? ov : nv;
    };
    return { ...n, proxy_url: pick("proxy_url"), thumbnail_url: pick("thumbnail_url"), waveform_url: pick("waveform_url") };
  });
}

export default function Editor() {
  const { projectId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [sequences, setSequences] = useState<SequenceDoc[]>([]);
  const [seq, setSeq] = useState<SequenceDoc | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const hist = useHistory<Timeline | null>(null);
  const tl = hist.value;
  const [version, setVersionState] = useState(0);
  // The version the server last confirmed, readable synchronously: saves fired from an older render (autosave timer,
  // sequence switch) must never send a stale base_version.
  const versionRef = useRef(0);
  const openSeqId = useRef<string | null>(null);
  const setVersion = useCallback((v: number) => { versionRef.current = v; setVersionState(v); }, []);
  const savedRef = useRef<Timeline | null>(null);
  const latestRef = useRef<Timeline | null>(null);
  latestRef.current = tl;
  const [save, setSave] = useState<SaveState>("saved");
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  // Features that depend on a server key/model are hidden until it is set up (see docs/HIDDEN_FEATURES.md)
  const [hide, setHide] = useState<Set<string>>(new Set(["obj", "lipsync", "stock"]));
  const [aiTools, setAiTools] = useState<Tool[]>([]);
  const [toolOpen, setToolOpen] = useState<{ id: string; media?: string } | null>(null);
  useEffect(() => {
    Promise.all([loadCatalogue().catch(() => null), api<{ pexels: boolean; pixabay: boolean }>("/stock/status").catch(() => null)]).then(([cat, st]) => {
      setAiTools(cat?.tools ?? []);
      const ready = new Set((cat?.tools ?? []).map((t) => t.id));
      const h = new Set<string>();
      if (!ready.has("033")) h.add("lipsync");
      if (!st?.pexels && !st?.pixabay) h.add("stock");
      setHide(h);
    });
  }, []);
  const [binTab, setBinTab] = useState<BinTab>("media");
  const openBin = (tab: BinTab) => {
    setBinTab(tab);
    setLayout((l) => l.media ? l : { ...l, media: true });
    requestAnimationFrame(() => document.querySelector(".ed-bin")?.scrollIntoView({ block: "nearest" }));
  };
  const [inspTab, setInspTab] = useState<"inspector" | "effects" | "transition" | "text" | "metadata">("inspector");
  const [snapOn, setSnapOn] = useState(true);
  const [caps, setCaps] = useState<Caps>(new Map());
  const [plan, setPlan] = useState<ReturnType<typeof buildPlan> | null>(null);
  const [autoEdit, setAutoEdit] = useState(false);
  const [recording, setRecording] = useState(false);
  const [exportFocus, setExportFocus] = useState(0);
  const { layout, setLayout, focus } = useLayout();
  const firstInsp = useRef(true);
  useEffect(() => { if (firstInsp.current) { firstInsp.current = false; return; } focus("inspector"); }, [inspTab, focus]);   // Effects/Text/Transition requests bring the inspector forward
  const [showHistory, setShowHistory] = useState(false);
  type Pending = { type: "swap"; sourceId: string } | { type: "dub"; clipId: string; keep: boolean; target: string } | { type: "tts"; at: number } | { type: "place" };
  const [pending, setPending] = useState<Record<string, Pending>>({}); // new asset id -> what to do when it is ready
  const placeLater = useRef<Asset[]>([]);
  const addRef = useRef<((a: Asset) => void) | null>(null);
  const [catalog, setCatalog] = useState<VoiceCatalog | null>(null);
  const [objFor, setObjFor] = useState<{ assetId: string; at: number } | null>(null);
  const [studioFor, setStudioFor] = useState<string | null>(null);
  const [aiModal, setAiModal] = useState<null | "captions" | "transcript" | "tts" | "highlights" | "thumbnail">(null);
  const [autoAdjust, setAutoAdjustState] = useState(() => { try { return localStorage.getItem("cu.autoAdjust") === "1"; } catch { return false; } });
  const setAutoAdjust = (v: boolean) => { setAutoAdjustState(v); try { localStorage.setItem("cu.autoAdjust", v ? "1" : "0"); } catch { /* ignore */ } };
  const samplerRef = useRef<Sampler | null>(null);
  const uploadRef = useRef<((f: File[]) => void) | null>(null);
  const readOnly = project?.my_role === "viewer";
  const assetMap = useMemo(() => new Map<string | null, Asset>(assets.map((a) => [a.id, a])), [assets]);

  // ---------- load
  const loadMedia = useCallback(async () => {
    try {
      const next = await api<Asset[]>(`/projects/${projectId}/media`);
      setAssets((prev) => keepUrls(prev, next));
    } catch { /* bin shows state */ }
  }, [projectId]);
  const openSequence = useCallback((s: SequenceDoc) => {
    openSeqId.current = s.id;
    setSeq(s); setVersion(s.version); savedRef.current = s.timeline; hist.reset(s.timeline);
    setPlayhead(0); setSelected(null); setSave("saved");
  }, [hist]);
  useEffect(() => {
    (async () => {
      try {
        const p = await api<Project>(`/projects/${projectId}`);
        setProject(p); setSequences(p.sequences ?? []);
        openSequence(p.sequences!.find((x) => x.id === search.get("seq")) ?? p.sequences![0]);
        await loadMedia();
      } catch (e) { setLoadErr((e as Error).message); }
    })();
    api<Capability[]>("/ai/capabilities").then((c) => setCaps(new Map(c.map((x) => [x.id, x])))).catch(() => {});
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!assets.some((a) => a.status === "processing" || enriching(a))) return;
    // just-uploaded files become usable within a second or two: check often for them, gently otherwise
    const fresh = assets.some((a) => a.status === "processing" && Date.now() - new Date(a.created_at).getTime() < 120_000);
    const t = setInterval(loadMedia, fresh ? 700 : 2500);
    return () => clearInterval(t);
  }, [assets, loadMedia]);

  // When generated media (stabilized copy, dub, voice-over) is ready, put it on the timeline — one undoable edit each.
  useEffect(() => {
    if (!tl) return;
    let next = tl;
    const msgs: string[] = [];
    const done: string[] = [];
    for (const [nid, job] of Object.entries(pending)) {
      const a = assets.find((x) => x.id === nid);
      if (!a || a.status === "processing") continue;
      done.push(nid);
      if (a.status !== "ready") { msgs.push(`${a.filename} failed: ${a.status_detail ?? a.job?.error ?? "processing error"}`); continue; }
      if (job.type === "swap") {
        let n = 0;
        for (const t of next.tracks) for (const c of t.clips) if (c.asset_id === job.sourceId) { next = updateClip(next, c.id, { asset_id: nid }) ?? next; n++; }
        msgs.push(n ? `Swapped in “${a.filename}” on ${n} clip${n > 1 ? "s" : ""} — Ctrl+Z to go back to the original` : `“${a.filename}” is ready in the media bin`);
      } else if (job.type === "dub") {
        const src = findClip(next, job.clipId)?.clip;
        if (!src) { msgs.push(`“${a.filename}” is ready in the media bin`); continue; }
        const dubClip: Clip = { id: uid(), asset_id: nid, start: src.start, in: src.in, out: Math.min(src.out, Math.floor((a.duration_s ?? 0) * next.fps)), speed: src.speed ?? 1,
          volume: 1, fade_in: 0, fade_out: 0, transform: { ...DEFAULT_TRANSFORM } };
        let track = next.tracks.find((t) => t.kind === "audio" && !t.locked && fits(t, dubClip.start, Math.round((dubClip.out - dubClip.in) / (dubClip.speed ?? 1)), undefined));
        if (!track) { next = addTrack(next, "audio"); track = next.tracks[next.tracks.length - 1]; next = { ...next, tracks: next.tracks.map((t) => (t.id === track!.id ? { ...t, name: `Dub (${job.target})` } : t)) }; }
        const tid = track.id;
        next = { ...next, tracks: next.tracks.map((t) => (t.id === tid ? { ...t, clips: [...t.clips, dubClip] } : t)) };
        next = updateClip(next, src.id, { volume: job.keep ? 0.15 : 0 }) ?? next;
        msgs.push(`Dubbed audio added under the clip; original voice ${job.keep ? "lowered to 15%" : "muted"} — Ctrl+Z to undo`);
      } else if (job.type === "place") {
        placeLater.current.push(a);
        msgs.push(`“${a.filename}” added to the timeline`);
      } else if (job.type === "tts") {
        const frames = Math.max(1, Math.floor((a.duration_s ?? 1) * next.fps));
        const track = next.tracks.find((t) => t.kind === "audio" && !t.locked) ;
        if (!track) { msgs.push(`“${a.filename}” is ready in the media bin`); continue; }
        const r = insertClip(next, track.id, nid, freeSlot(track, job.at, frames), 0, frames);
        if (r) { next = r.tl; msgs.push(`Voice-over added to ${track.name} at ${(r.tl.tracks.find((t) => t.id === track.id)!.clips.find((c) => c.id === r.id)!.start / next.fps).toFixed(1)}s`); }
      }
    }
    if (!done.length) return;
    setPending((m) => { const n = { ...m }; done.forEach((d) => delete n[d]); return n; });
    if (next !== tl) edit(next);
    msgs.forEach(toast);
    const later = placeLater.current.splice(0);
    if (later.length) setTimeout(() => later.forEach((x) => addRef.current?.(x)), 0);
  }, [assets]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { api<VoiceCatalog>("/ai/voices").then(setCatalog).catch(() => {}); }, []);

  async function derive(assetId: string, op: string, label: string, extra: object = {}) {
    try {
      const a = await api<Asset>(`/media/${assetId}/derive`, { method: "POST", body: { op, ...extra } });
      setAssets((xs) => [a, ...xs]); setPending((m) => ({ ...m, [a.id]: { type: "swap", sourceId: assetId } }));
      toast(`${label} on the cloud worker… “${a.filename}” will replace the original on the timeline when ready`);
    } catch (e) { toast((e as Error).message); }
  }

  /** Clip whose speech gets dubbed: the selected one, else the first clip with sound on the main track. */
  const dubSource = (() => {
    if (!tl) return null;
    const s = selected ? findClip(tl, selected)?.clip : null;
    if (s && s.asset_id && assetMap.get(s.asset_id)?.has_audio) return s;
    const base = [...tl.tracks].reverse().find((t) => t.kind === "video");
    return base?.clips.find((c) => assetMap.get(c.asset_id)?.has_audio) ?? null;
  })();
  function videoSel(): string | null {
    const s = selected && tl ? findClip(tl, selected)?.clip : null;
    const a = s?.asset_id ? assetMap.get(s.asset_id) : undefined;
    if (!a || a.kind !== "video") { toast("Select a video clip on the timeline first"); return null; }
    return a.id;
  }

  function addTitle(style?: Partial<Title>) {
    if (!tl) return;
    const track = tl.tracks.find((t) => t.id === "v2" && !t.locked) ?? tl.tracks.find((t) => t.kind === "video" && !t.locked);
    if (!track) { toast("Unlock a video track first"); return; }
    const r = insertTitle(tl, track.id, playhead, 3 * fps, style ? { ...DEFAULT_TITLE, ...style } : undefined);
    if (r && edit(r.tl)) {
      const at = r.tl.tracks.find((t) => t.id === track.id)!.clips.find((c) => c.id === r.id)!.start;
      setSelected(r.id); setInspTab("text"); setPlaying(false); setPlayhead(at);
      toast(at === playhead ? "Title added — edit its text in the Text tab" : `That spot was taken, so the title went to the next free gap at ${(at / fps).toFixed(1)}s`);
    }
  }

  // ---------- autosave
  const saving = useRef(false);
  const doSave = useCallback(async (force = false): Promise<boolean> => {
    if (!seq || !tl || readOnly) return true;
    if (!force && tl === savedRef.current) return true;
    if (saving.current) return false;
    saving.current = true; setSave("saving");
    const snapshot = tl;
    const unchanged = snapshot === savedRef.current;
    try {
      const r = await api<{ version: number }>(`/sequences/${seq.id}`, { method: "PUT", body: { base_version: versionRef.current, timeline: snapshot } });
      setSequences((ss) => ss.map((x) => (x.id === seq.id ? { ...x, timeline: snapshot, version: r.version } : x)));
      if (openSeqId.current !== seq.id) return true;   // the user switched sequence while this save was in flight
      setVersion(r.version); savedRef.current = snapshot;
      setSave(latestRef.current === snapshot ? "saved" : "dirty");
      return true;
    } catch (e) {
      if (openSeqId.current !== seq.id) return false;   // a stale save of a sequence that's no longer open: ignore
      if (e instanceof ApiError && e.status === 409 && unchanged) {
        // nothing of ours to lose (a forced save of an already-saved timeline): just catch up with the server's version
        try { const cur = await api<SequenceDoc>(`/sequences/${seq.id}`); setVersion(cur.version); setSave("saved"); return true; }
        catch { setSave("conflict"); }
      } else if (e instanceof ApiError && e.status === 409) setSave("conflict");
      else if (e instanceof ApiError && e.status === 0) setSave("offline");
      else { setSave("error"); toast(`Couldn't save: ${(e as Error).message}`); }
      return false;
    } finally { saving.current = false; }
  }, [seq, tl, readOnly, toast, setVersion]);
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
    savedRef.current = latest.timeline;
    if (keepMine) setSave("dirty"); else { hist.reset(latest.timeline); setSave("saved"); }
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
    const track = trackId ? tl.tracks.find((t) => t.id === trackId)
      : kind === "video" ? (a.kind === "image" ? tl.tracks.find((t) => t.id === "v2" && !t.locked) : undefined) ?? [...tl.tracks].reverse().find((t) => t.kind === "video" && !t.locked)
      : tl.tracks.find((t) => t.kind === "audio" && !t.locked && (a.analysis?.silences?.length ? t.id === "a1" : t.id === "a2")) ?? tl.tracks.find((t) => t.kind === "audio" && !t.locked);
    if (!track || track.kind !== kind) { toast(kind === "audio" ? "Drop audio on an audio track" : "Drop video and images on a video track"); return; }
    const frames = a.kind === "image" ? 5 * fps : assetFrames(a, fps);
    const r = insertClip(tl, track.id, a.id, at ?? (a.kind === "image" ? playhead : 0), 0, frames);
    if (!r) { toast("That track is locked"); return; }
    let next = r.tl;
    if (autoAdjust) { // AI Auto-Adjust: apply measured colour + level to new clips
      if (a.analysis?.auto_grade && kind === "video") next = updateClip(next, r.id, { color: sanitizeGrade(a.analysis.auto_grade) }) ?? next;
      const g = loudnessGain(a); if (g) next = updateClip(next, r.id, { volume: g }) ?? next;
    }
    if (edit(next)) setSelected(r.id);
  }, [tl, fps, playhead, edit, toast, autoAdjust]);

  /** Resolve's seven edit types, from the edit overlay on the program monitor. */
  const editDrop = useCallback((type: EditType, assetId: string) => {
    const a = assetMap.get(assetId);
    if (!tl || !a) return;
    if (a.status !== "ready") { toast("That file is still processing"); return; }
    const kind = a.kind === "audio" ? "audio" : "video";
    const frames = a.kind === "image" ? 5 * fps : assetFrames(a, fps);
    let clip: Clip = { id: "tmp", asset_id: a.id, start: 0, in: 0, out: frames, volume: 1, fade_in: 0, fade_out: 0, transform: { ...DEFAULT_TRANSFORM } };
    if (autoAdjust) {
      if (a.analysis?.auto_grade && kind === "video") clip = { ...clip, color: sanitizeGrade(a.analysis.auto_grade) };
      const g = loudnessGain(a); if (g) clip = { ...clip, volume: g };
    }
    const sel = selected ? findClip(tl, selected) : null;
    const track = (sel && sel.track.kind === kind && !sel.track.locked ? sel.track : null)
      ?? (kind === "video" ? [...tl.tracks].reverse().find((t) => t.kind === "video" && !t.locked) : tl.tracks.find((t) => t.kind === "audio" && !t.locked));
    if (!track && type !== "top") { toast(`No unlocked ${kind} track`); return; }
    const under = track ? track.clips.find((c) => playhead >= c.start && playhead < end(c)) : undefined;
    const target = sel && sel.track.id === track?.id ? sel.clip : under;
    const label = EDIT_TYPES.find((t) => t.id === type)!.label;
    let r: { tl: Timeline; id: string } | null = null;
    switch (type) {
      case "insert": r = insert(tl, track!.id, clip, playhead); break;
      case "overwrite": r = overwrite(tl, track!.id, clip, playhead); break;
      case "append": r = append(tl, track!.id, clip); break;
      case "top": if (kind === "audio") { toast("Place on Top is for video and images"); return; } r = placeOnTop(tl, clip, playhead); break;
      case "replace": case "rippleOverwrite":
        if (!target) { toast(`${label}: select a clip on the timeline (or put the playhead on one) first`); return; }
        r = type === "replace" ? replace(tl, target.id, clip) : rippleOverwrite(tl, target.id, clip); break;
      case "fit": {
        let a0: number, b0: number;
        if (target) { a0 = target.start; b0 = end(target); }
        else {
          a0 = Math.max(0, ...track!.clips.filter((c) => end(c) <= playhead).map(end));
          const nexts = track!.clips.filter((c) => c.start > playhead).map((c) => c.start);
          if (!nexts.length) { toast("Fit to Fill: put the playhead in a gap between clips, or on a clip to fill"); return; }
          b0 = Math.min(...nexts);
        }
        if (a.kind === "image") { toast("Fit to Fill needs a video or audio clip"); return; }
        const f = fitToFill(tl, track!.id, clip, a0, b0);
        if (!f) { toast("Fit to Fill would need a speed outside 25%–400%"); return; }
        r = f; toast(`Fit to Fill at ${Math.round(f.speed * 100)}% speed`); break;
      }
    }
    if (!r) { toast(`${label}: the track is locked or there is no room`); return; }
    if (edit(r.tl)) { setSelected(r.id); if (type !== "fit") toast(`${label}: ${a.filename}`); }
  }, [tl, assetMap, fps, playhead, selected, edit, toast, autoAdjust]);

  // ---------- sequences, reframe, snapshot
  async function switchSequence(id: string) {
    if (id === seq?.id) return;
    await doSave(true);
    try { openSequence(await api<SequenceDoc>(`/sequences/${id}`)); } catch (e) { toast((e as Error).message); }
  }
  async function createSequence(body: object, okMsg: string) {
    if (!project) return;
    if (!await doSave(true)) { toast("Finish saving the current sequence before creating another."); return; }
    try {
      const s = await api<SequenceDoc>(`/projects/${project.id}/sequences`, { method: "POST", body });
      setSequences((ss) => [...ss, s]); openSequence(s); toast(okMsg);
    } catch (e) { toast((e as Error).message); }
  }
  const reframe = (format: string, name: string) => seq && total > 0
    ? createSequence({ name, from_sequence_id: seq.id, format, reframe: true }, `Created “${name}” — subject-centred crop of your edit. It's a separate sequence; the original is untouched.`)
    : toast("Add clips to the timeline first");
  function snapshot() {
    const cv = samplerRef.current?.(Math.min(1920, tl!.width));
    if (!cv) return;
    try {
      cv.toBlob((b) => {
        if (!b) return;
        const tc = `${Math.floor(playhead / fps / 60)}m${Math.floor((playhead / fps) % 60)}s`;
        uploadRef.current?.([new File([b], `Snapshot-${tc}.png`, { type: "image/png" })]);
        toast("Snapshot added to your media bin");
      }, "image/png");
    } catch { toast("Snapshot needs cross-origin access to media storage"); }
  }

  /** Open an AI tool in the drawer, with the selected clip's file filled in. */
  function openTool(id: string) {
    const a = sel?.clip.asset_id ? assetMap.get(sel.clip.asset_id) : undefined;
    setToolOpen({ id, media: a && a.kind !== "lut" ? a.id : undefined });
  }
  /** A tool finished: new files go on the timeline (or wait until processed); a new edit opens as a sequence. */
  async function toolDone(g: Generation) {
    if (!project) return;
    const seqIds: string[] = g.result?.sequence_ids ?? [];
    if (seqIds.length && !g.outputs.length) {
      await doSave(true);
      try {
        const p = await api<Project>(`/projects/${project.id}`);
        setSequences(p.sequences ?? []);
        const s = p.sequences?.find((x) => x.id === seqIds[0]);
        if (s) { openSequence(s); toast(`Opened “${s.name}” — switch back with the Program menu`); }
      } catch (e) { toast((e as Error).message); }
      setToolOpen(null);
      return;
    }
    await loadMedia();
    let placed = 0;
    for (const a of g.outputs.filter((x) => ["video", "image", "audio"].includes(x.kind))) {
      if (a.status === "ready") { addAssetToTimeline(a); placed++; }
      else setPending((m) => ({ ...m, [a.id]: { type: "place" } }));
    }
    toast(placed ? `Added ${g.tool_name} result to the timeline — Ctrl+Z to undo` : "The result is processing — it goes on the timeline when ready");
    setToolOpen(null);
  }

  function action(id: string) {
    if (!tl) return;
    /** Open an AI Generator tool with this project and the selected clip already filled in; its result has Edit in Timeline. */
    const toGenerator = (toolId: string) => {
      const a = sel?.clip.asset_id ? assetMap.get(sel.clip.asset_id) : undefined;
      if (!a || a.kind !== "video") { toast("Select a video clip on the timeline first"); return; }
      setToolOpen({ id: toolId, media: a.id });
    };
    const scroll = (sel: string) => document.querySelector(sel)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    switch (id) {
      case "media": openBin("media"); break;
      case "edit": scroll(".ed-timeline"); break;
      case "magic": setPlan(buildPlan(tl, assetMap)); break;
      case "studio": navigate(`/shorts/${projectId}`); break;
      case "short916": case "reframe": reframe("vertical", `Short 9:16 (${seq?.name ?? "edit"})`); break;
      case "reels45": reframe("portrait_45", `Reel 4:5 (${seq?.name ?? "edit"})`); break;
      case "viral": case "batch": setAiModal("highlights"); break;
      case "design": setAiModal("thumbnail"); break;
      case "clips": { const s = sceneSplits(tl, assetMap); if (!s.length) { toast("No scene changes found in the clips on the timeline"); break; } edit(applySceneSplits(tl, s)); toast(`Split into clips at ${s.length} scene change${s.length > 1 ? "s" : ""} — select and delete the parts you don't need`); break; }
      case "scenes": { const s = sceneSplits(tl, assetMap); toast(s.length ? `${s.length} scene change${s.length > 1 ? "s" : ""} found — see the Scenes tab below` : "No scene changes found in clips on the timeline"); focus("story"); setTimeout(() => document.querySelector<HTMLButtonElement>(".storyboard [role=tab]:nth-child(2)")?.click(), 50); break; }
      case "silence": { const c = silenceCuts(tl, assetMap); if (!c.length) { toast("No removable silences found (≥ 0.6 s below -35 dB)"); break; } edit(applyCuts(tl, c)); toast(`Removed ${c.length} silence${c.length > 1 ? "s" : ""} — Ctrl+Z to undo`); break; }
      case "autocolor": case "loudness": case "denoise": { const op = buildPlan(tl, assetMap).find((o) => o.id === (id === "autocolor" ? "color" : id === "loudness" ? "loud" : "denoise")); if (!op) { toast("Nothing to change for the clips on the timeline"); break; } edit(op.apply(tl)); toast(op.label + " — done"); break; }
      case "color": focus("color"); break;
      case "fusion": focus("nodes"); break;
      case "effects": setInspTab("effects"); break;
      case "motion": case "title": addTitle(); break;
      case "autoedit": setAutoEdit(true); break;
      case "assistant": focus("assistant"); break;
      case "templates": case "elements": openBin("templates"); break;
      case "stock": openBin("stock"); break;
      case "transitions": setInspTab("transition"); break;
      case "export": focus("export"); setExportFocus((n) => n + 1); break;
      case "bg": { const id = videoSel(); if (id) derive(id, "remove_bg", "Removing the background"); break; }
      case "stabilize": { const id = videoSel(); if (id) derive(id, "stabilize", "Stabilizing"); break; }
      case "obj": {   // basic remover on the worker; mark areas on the selected clip's own frame
        const id = videoSel(); if (!id || !tl) break;
        const c = findClip(tl, selected!)!.clip;
        const into = Math.min(Math.max(0, playhead - c.start), Math.max(0, Math.round((c.out - c.in) / (c.speed ?? 1)) - 1));
        setObjFor({ assetId: id, at: (c.in + into * (c.speed ?? 1)) / tl.fps });
        break;
      }
      case "subtitle": setAiModal("captions"); break;
      case "voice": focus("voice"); break;
      case "tts": setAiModal("tts"); break;
      case "lipsync": toGenerator("033"); break;  // Lip Sync lives in the AI Generator (hosted lip-sync model)
      case "transcribe": setAiModal("transcript"); break;
      default: toast("Planned — not available yet");
    }
  }

  // ---------- keyboard
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
        case "Delete": case "Backspace": if (selected && edit(deleteClip(tl, selected, e.shiftKey))) setSelected(null); break;
        case "Escape": setSelected(null); break;
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [tl, playhead, selected, fps, total, hist, edit, doSave]);

  if (loadErr) return <div className="auth-wrap"><div className="card auth-card"><h2>Can't open this project</h2><p className="muted">{loadErr}</p><Link className="btn" to="/editor/projects">Back to projects</Link></div></div>;
  if (!project || !tl || !seq) return <div className="auth-wrap"><div className="spinner" aria-label="Loading editor" /></div>;

  const sel = selected ? findClip(tl, selected) : null;
  const selAsset = sel ? assetMap.get(sel.clip.asset_id) : undefined;
  const placeTemplate = (t: TitleTemplate) => {
    if (readOnly) return;
    const r = insertTemplate(tl, t, playhead);
    if (!r) { toast("No free space at the playhead for this title — move the playhead or add a track"); return; }
    edit(r.tl); setSelected(r.id); setInspTab("text"); setPlaying(false); toast(`${t.name} added at the playhead`);
  };
  const assetCtx: AssetCtx = { tl, sel, selAsset, readOnly, fps, tools: aiTools, hide, caps, action, openTool, addTitle, onTemplate: placeTemplate,
    focus: (p) => focus(p),
    setClip: (patch, key) => { if (sel) edit(updateClip(tl, sel.clip.id, patch), sel.clip.id + ":" + key); } };
  const inspector = (tab: typeof inspTab, showTabs = false) => <Inspector tab={tab} setTab={setInspTab} showTabs={showTabs} tl={tl} sel={sel} asset={selAsset} edit={edit} readOnly={readOnly}
    onAddTitle={() => addTitle()} onStabilize={(id) => derive(id, "stabilize", "Stabilizing")} toast={toast}
    playhead={playhead} setPlayhead={setPlayhead} />;
  /* Find AI suggestions: real checks on this timeline (silences, colour, levels, noise), then format and selection tips. */
  const findSuggestions: Suggestion[] = (() => {
    const out: Suggestion[] = buildPlan(tl, assetMap).slice(0, 4).map((o) => ({ key: o.id, label: o.label, detail: o.detail, run: () => { edit(o.apply(tl)); toast(o.label + " — done · Ctrl+Z to undo"); } }));
    const vids = tl.tracks.filter((t) => t.kind === "video").flatMap((t) => t.clips);
    if (vids.length && tl.width > tl.height) out.push({ key: "short", label: "Make a Short (9:16) from this video", detail: "Centred on the face, as a new sequence", run: () => action("short916") });
    if (vids.length && !vids.some((c) => c.title)) out.push({ key: "title", label: "Add a title", detail: "Big text at the playhead", run: () => action("motion") });
    if (selAsset?.kind === "video") out.push({ key: "look", label: "Give this clip a Cinematic look", detail: "Colour preset · change it in Colour", run: () => edit(updateClip(tl, sel!.clip.id, { color: withLook(LOOKS[0].grade) })) });
    if (vids.length) out.push({ key: "caps", label: "Add captions", detail: "Subtitles from your speech", run: () => action("subtitle") });
    if (!vids.length) out.push({ key: "media", label: "Add your first video", detail: "Import or drag files into Media", run: () => action("media") });
    return out.slice(0, 7);
  })();
  const onTl = new Set(tl.tracks.flatMap((t) => t.clips.map((c) => c.asset_id)).filter((id): id is string => !!id)); // titles have no media
  const analysed = [...onTl].every((id) => { const a = assetMap.get(id); return a && a.status === "ready" && (a.kind === "image" || a.analysis); });
  const NAV: [string, any, string | null][] = [["Fusion (Nodes)", Workflow, "fusion"], ["Color", Palette, "color"], ["Audio", AudioLines, "loudness-nav"], ["VFX", Activity, "fusion"], ["Motion", Type, "motion"], ["Graphics", ImageIcon, "media"], ["Design", ImageIcon, "design"], ["AI Studio", Sparkles, "magic"], ["Templates", LayoutTemplate, "templates"]];

  addRef.current = (a: Asset) => addAssetToTimeline(a);

  return (
    <div className="ed2">
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <defs dangerouslySetInnerHTML={{ __html: LOOKS.map((l, i) => `<filter id="look-${i}" color-interpolation-filters="sRGB">${svgFilterBody(withLook(l.grade))}</filter>`).join("") }} />
      </svg>
      <header className="ed-top">
        <Brand small />
        <nav className="topnav ed-nav" aria-label="Studios">
          <Link to="/editor" title="Home"><Home size={17} />Home</Link>
          <Link to="/editor/projects" title="Projects"><FolderOpen size={17} />Project</Link>
          <a className="active" aria-current="page" title="Edit"><Scissors size={17} />Edit</a>
          {NAV.map(([l, I, act]) => act
            ? <a key={l} role="button" tabIndex={0} title={l} aria-label={l} onClick={() => act === "loudness-nav" ? (focus("inspector"), setInspTab("inspector")) : action(act)}><I size={17} />{l}</a>
            : <span key={l} title={l === "YouTube" ? "Planned — needs Google API verification" : "Planned — not available yet"}><I size={17} />{l}</span>)}
        </nav>
        <FindAI action={action} hasSel={!!sel} isVideoSel={selAsset?.kind === "video"} hide={hide}
          onLook={(i) => sel && edit(updateClip(tl, sel.clip.id, { color: withLook(LOOKS[i].grade) }))}
          onTransitions={() => { focus("inspector"); setInspTab("transition"); }}
          onTool={(id) => openTool(id)}
          suggestions={findSuggestions} />
        <div className="grow" />
        <ProjectName project={project} onRename={(n) => setProject({ ...project, name: n })} readOnly={readOnly} />
        <div className="row" style={{ gap: 2 }}>
          <button className="btn icon ghost" onClick={hist.undo} disabled={!hist.canUndo || readOnly} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={16} /></button>
          <button className="btn icon ghost" onClick={hist.redo} disabled={!hist.canRedo || readOnly} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Redo2 size={16} /></button>
        </div>
        <button className="btn icon ghost" onClick={() => setShowHistory(true)} title="Version history" aria-label="Version history"><HistoryIcon size={17} /></button>
        <FocusMusic assets={assets} editorPlaying={playing} />
        <LayoutMenu layout={layout} setLayout={setLayout} />
        <button className="btn sm" disabled={readOnly} onClick={() => setAutoEdit(true)}><Sparkles size={15} />Auto-edit</button>
        <button className="btn sm primary" onClick={() => action("export")} title="Export video"><RocketI size={15} />Export</button>
        <SaveBlock state={readOnly ? "readonly" : save} version={version} />
        <UserMenu />
      </header>
      {save === "conflict" && (
        <div className="ed-banner" role="alert"><AlertTriangle size={16} />This sequence was changed in another tab or by a teammate.
          <button className="btn sm" onClick={() => resolveConflict(false)}>Load their version</button>
          <button className="btn sm" onClick={() => resolveConflict(true)}>Keep mine (overwrite)</button></div>
      )}
      <div className={`ed2-body ${layout.side ? "" : "norail"}`}>
        {layout.side && <ToolSidebar caps={caps} onAction={action} readOnly={readOnly} hide={hide} onAsset={openBin} activeAsset={layout.media ? binTab : null} />}
        <Workspace layout={layout} setLayout={setLayout}
          media={<MediaBin projectId={project.id} seqSize={{ w: tl.width, h: tl.height }} assets={assets} setAssets={setAssets} reload={loadMedia} readOnly={readOnly} onAdd={(a) => addAssetToTimeline(a)} fps={fps}
              uploadRef={uploadRef} onRecord={() => setRecording(true)} onTTS={() => setAiModal("tts")}
              binTab={binTab} setBinTab={setBinTab} ctx={assetCtx}
              adjustments={<QuickAdjustments clip={sel?.clip} disabled={readOnly || sel?.track.kind !== "video" || sel.track.locked || !selAsset?.has_video}
                    onChange={(color, key) => sel && edit(updateClip(tl, sel.clip.id, { color }), sel.clip.id + ":color:" + key)} />}
              hideStock={hide.has("stock")} onTemplate={placeTemplate} />}
          viewer={<Viewer tl={tl} assets={assetMap} playhead={playhead} setPlayhead={setPlayhead} playing={playing} setPlaying={setPlaying} total={total}
              samplerRef={samplerRef} sequences={sequences} currentSeqId={seq.id} onSwitchSeq={switchSequence} autoAdjust={autoAdjust} analysed={analysed}
              onNewSeq={() => createSequence({ name: `Sequence ${sequences.length + 1}`, format: tl.width >= tl.height ? "landscape" : "vertical" }, "New empty sequence created")}
              onSnapshot={snapshot} onEditDrop={readOnly ? undefined : editDrop} />}
          timeline={<TimelinePanel tl={tl} assets={assetMap} edit={edit} playhead={playhead} setPlayhead={(f) => { setPlaying(false); setPlayhead(f); }}
              selected={selected} setSelected={setSelected} snapOn={snapOn} setSnapOn={setSnapOn} readOnly={readOnly}
              onDropAsset={(id, trackId, at) => { const a = assetMap.get(id); if (a) addAssetToTimeline(a, trackId, at); }}
              timecode="" />}
          panels={{
            assistant: { id: "assistant", label: "AI Assistant", icon: Bot, node: <><section className="panel" style={{padding: 12}}><h3>AI Editor Brain</h3><p>Describe your footage and the feeling you want. Get an editable cut with sound and colour.</p><button className="btn primary" disabled={readOnly} onClick={() => setAutoEdit(true)}>Auto-edit my video</button></section><AdDirector assets={assets} disabled={readOnly} create={ad => createSequence({name: "Director · 30-second ad", ad}, "Ad draft ready to edit")} /><AssistantPanel caps={caps} autoAdjust={autoAdjust} setAutoAdjust={setAutoAdjust} onMagic={() => action("magic")} readOnly={readOnly} pending={!analysed} /></> },
            voice: { id: "voice", label: "Translate & Voice", icon: Mic2, node: <VoicePanel caps={caps} catalog={catalog} onStudio={() => dubSource?.asset_id && setStudioFor(dubSource.asset_id)} onLipSync={hide.has("lipsync") ? undefined : () => action("lipsync")}
              source={dubSource ? { name: assetMap.get(dubSource.asset_id)?.filename ?? "clip" } : null} /> },
            color: { id: "color", label: "Color", icon: PaletteI, node: <div className="color-panel-anchor"><ColorPanel tl={tl} sel={sel} asset={selAsset} edit={edit} readOnly={readOnly} luts={assets.filter((a) => a.kind === "lut")} projectId={projectId!} onLutUploaded={loadMedia} /></div> },
            scopes: { id: "scopes", label: "Scopes", icon: BarChart3, node: <ScopesPanel samplerRef={samplerRef} tick={playhead} /> },
            nodes: { id: "nodes", label: "Nodes", icon: Network, node: <div className="nodes-anchor"><NodesPanel tl={tl} sel={sel} asset={selAsset} edit={edit} readOnly={readOnly} /></div> },
            quick: { id: "quick", label: "Quick Actions", icon: Zap, node: <QuickActions caps={caps} onAction={action} readOnly={readOnly} hide={hide} /> },
            inspector: { id: "inspector", label: "Inspector", icon: SlidersHorizontal, node: inspector(inspTab, true) },
            export: { id: "export", label: "Export", icon: RocketI, node: <ExportDock projectId={project.id} sequenceId={seq.id} tl={tl} flush={() => doSave(true)} dirty={tl !== savedRef.current} readOnly={readOnly} focusSignal={exportFocus} /> },
            story: { id: "story", label: "Storyboard", icon: FilmI, node: <BottomStrip tl={tl} assets={assetMap} setPlayhead={(f) => { setPlaying(false); setPlayhead(f); }} setSelected={setSelected} readOnly={readOnly}
              setNotes={(n) => edit({ ...tl, notes: n })}
              onAddScene={() => { const base = tl.tracks.filter((t) => t.kind === "video").slice(-1)[0]; const c = base?.clips.find((c) => playhead > c.start && playhead < end(c)); const r = c && splitAt(tl, c.id, playhead); if (r) edit(r.tl); else toast("Put the playhead inside a clip on the Video track"); }} /> },
            suggest: { id: "suggest", label: "Suggestions", icon: Lightbulb, node: <Recommendations tl={tl} assets={assetMap} edit={edit} readOnly={readOnly} /> },
          } as Record<PanelId, PanelDef>} />
      </div>
      <WorkspaceBar layout={layout} setLayout={setLayout} icons={{ edit: Scissors, color: PaletteI, ai: Bot, audio: AudioLines, deliver: RocketI, classic: Workflow }} />
      {autoEdit && <AutoEdit key={project.id} projectId={project.id} assets={assets} readOnly={readOnly} timelineIds={tl.tracks.flatMap(t => t.clips).sort((a, b) => a.start - b.start).flatMap(c => c.asset_id ? [c.asset_id] : [])} onClose={() => setAutoEdit(false)} onOpen={async id => {
        if (!await doSave(true)) throw new Error("Save the current timeline before opening your cut.");
        const next = await api<SequenceDoc>(`/sequences/${id}`);
        setSequences(ss => [...ss.filter(s => s.id !== id), next]);
        openSequence(next); void loadMedia();
      }} />}
      {plan && <PlanDialog ops={plan} onClose={() => setPlan(null)} onApply={(ids) => { let t = tl; for (const o of plan) if (ids.has(o.id)) t = o.apply(t); edit(t); setPlan(null); toast(`AI Magic applied ${ids.size} change${ids.size > 1 ? "s" : ""} — Ctrl+Z to undo`); }} />}
      {showHistory && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setShowHistory(false)}>
          <div className="card modal" role="dialog" aria-modal="true" aria-label="Version history" style={{ width: "min(460px,100%)", maxHeight: "80vh", overflow: "auto", padding: 0 }}>
            <div className="row" style={{ padding: "12px 14px 0" }}><b className="grow">Version history · {seq.name}</b><button className="btn icon ghost" aria-label="Close" onClick={() => setShowHistory(false)}><XIcon size={16} /></button></div>
            <HistoryPanel sequenceId={seq.id} current={version} readOnly={readOnly} onRestored={(s) => { setVersion(s.version); savedRef.current = s.timeline; hist.reset(s.timeline); setSave("saved"); setShowHistory(false); toast(`Restored — saved as version ${s.version}`); }} />
          </div>
        </div>)}
      {(aiModal === "captions" || aiModal === "transcript") && <CaptionsModal tl={tl} assets={assetMap} catalog={catalog} mode={aiModal} onClose={() => setAiModal(null)} refresh={loadMedia}
        onApply={(t) => { edit(t); setAiModal(null); toast("Captions added on the Captions track — edit any line in the Text tab"); }} />}
      {aiModal === "highlights" && <HighlightsModal tl={tl} assets={assetMap} onClose={() => setAiModal(null)} onPreview={(f) => { setPlaying(false); setPlayhead(f); }}
        onCreate={async (ms: Moment[], format: string) => {
          await doSave(true);
          let first: SequenceDoc | null = null;
          for (const [i, m] of ms.entries()) {
            try {
              const s = await api<SequenceDoc>(`/projects/${project.id}/sequences`, { method: "POST", body: {
                name: `Short ${i + 1} (${Math.floor(m.from / fps / 60)}:${String(Math.floor((m.from / fps) % 60)).padStart(2, "0")})`, from_sequence_id: seq.id,
                range_from: m.from, range_to: m.to, ...(format ? { format, reframe: true } : {}) } });
              setSequences((ss) => [...ss, s]); first = first ?? s;
            } catch (e) { toast((e as Error).message); }
          }
          setAiModal(null);
          if (first) { openSequence(first); toast(`Created ${ms.length} short${ms.length > 1 ? "s" : ""} — switch between them with the Program menu`); }
        }} />}
      {studioFor && assetMap.get(studioFor) && <DubStudio asset={assetMap.get(studioFor)!} onClose={() => setStudioFor(null)} toast={toast}
        onPlace={(id) => { loadMedia(); setPending((m) => ({ ...m, [id]: { type: "place" } })); toast("Adding the dubbed file to the timeline as soon as it's processed…"); setStudioFor(null); }} />}
      {objFor && assetMap.get(objFor.assetId) && <ObjectRemoveModal asset={assetMap.get(objFor.assetId)!} at={objFor.at} onClose={() => setObjFor(null)}
        onApply={(boxes) => { const id = objFor.assetId; setObjFor(null); derive(id, "remove_object", "Removing the marked areas", { boxes }); }} />}
      {aiModal === "thumbnail" && <ThumbnailModal samplerRef={samplerRef} onClose={() => setAiModal(null)}
        onSave={(f) => { uploadRef.current?.([f]); setAiModal(null); toast("Thumbnail saved to your media bin"); }} />}
      {aiModal === "tts" && <TTSModal catalog={catalog} projectId={project.id} onClose={() => setAiModal(null)}
        onCreated={(a) => { setAssets((xs) => [a, ...xs]); setPending((m) => ({ ...m, [a.id]: { type: "tts", at: playhead } })); setAiModal(null); toast("Generating voice on the cloud worker…"); }} />}
      {toolOpen && <div className="ed-tooldrawer" role="dialog" aria-label="AI tool">
        <Suspense fallback={<div className="ws-loading"><span className="spinner" /></div>}>
          <EmbeddedTool key={toolOpen.id} id={toolOpen.id} embed={{ pid: project.id, media: toolOpen.media, onClose: () => setToolOpen(null), onDone: toolDone }} />
        </Suspense></div>}
      {recording && <RecordModal onClose={() => setRecording(false)} onDone={(f) => { setRecording(false); uploadRef.current?.([f]); toast("Recording is uploading to your media bin"); }} />}
    </div>
  );
}

function SaveBlock({ state, version }: { state: SaveState | "readonly"; version: number }) {
  const m: Record<string, [any, string, string]> = {
    saved: [Cloud, "Cloud Saved", `Auto Backup · v${version}`], dirty: [Cloud, "Unsaved changes", "saving shortly"], saving: [Loader2, "Saving…", "to the cloud"],
    error: [CloudOff, "Save failed", "retrying"], offline: [CloudOff, "Offline", "will retry"], conflict: [AlertTriangle, "Save conflict", "choose a version"],
    readonly: [Cloud, "View only", "no edits"],
  };
  const [I, a, b] = m[state];
  return <div className={`save-block ${state}`} aria-live="polite"><I size={18} className={state === "saving" ? "spin" : ""} /><div><b>{a}</b><small>{b}</small></div></div>;
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
