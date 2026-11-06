import { useCallback, useEffect, useRef, useState } from "react";
import { api, Asset, Job, Project } from "../api";

export type ParamType = "prompt" | "text" | "longtext" | "media" | "media_multi" | "aspect" | "duration" | "chips" | "multichips" | "slider" | "stepper"
  | "toggle" | "seed" | "camera_move" | "lens" | "lighting" | "lighting_dir" | "style" | "palette" | "color" | "language" | "languages" | "voice"
  | "bpm" | "mask" | "shots" | "nodes" | "background" | "tool";
export type Param = {
  key: string; type: ParamType; label: string; placeholder?: string; required?: boolean; max?: number; min?: number; step?: number; unit?: string;
  default?: any; options?: any[]; accept?: string[]; min_items?: number; max_items?: number; group?: string; help?: string;
};
export type Model = { id: string; label: string; family: string; usd_per_s: number | null; usd_per_run: number | null; tier?: string; durations?: number[]; audio?: boolean };
export type ToolStatus = { state: "ready" | "needs_key" | "unbuilt"; needs: string[]; detail: string };
export type Tool = {
  id: string; slug: string; name: string; studio: string; summary: string; params: Param[]; output: string; timeline: boolean; ui: string;
  engine: "local" | "fal" | "llm" | "youtube" | "pipeline" | "unbuilt"; models: Model[]; consent: boolean; notice?: string | null; status: ToolStatus; premium_models?: boolean;
};
export type Studio = { id: string; code: string; name: string; tagline: string };
export type Catalogue = { studios: Studio[]; tools: Tool[]; keys: { fal: boolean; llm: boolean; youtube: boolean }; counts: Record<string, number>; hidden: number };
export type Generation = {
  id: string; tool_id: string; tool_name: string; studio: string; project_id: string; status: string; engine: string; model: string | null;
  params: Record<string, any>; version: number; root_id: string; parent_id: string | null; outputs: Asset[]; result: any; files: { key: string; name: string; kind: string; url: string }[];
  error: string | null; est_cost_usd: number | null; rating: number | null; created_at: string; job: Job | null; versions?: { id: string; version: number; status: string; created_at: string }[];
};

let cache: Catalogue | null = null;
let inflight: Promise<Catalogue> | null = null;
export function loadCatalogue(force = false): Promise<Catalogue> {
  if (cache && !force) return Promise.resolve(cache);
  // Only tools that can run right now are shown. Tools waiting for a key/model reappear automatically once it's added.
  if (!inflight || force) inflight = api<Catalogue>("/ai/tools").then((c) => {
    const tools = c.tools.filter((t) => t.status.state === "ready");
    const studios = c.studios.filter((s) => tools.some((t) => t.studio === s.id));
    return (cache = { ...c, tools, studios, hidden: c.tools.length - tools.length });
  }).finally(() => { inflight = null; });
  return inflight;
}
export function useCatalogue() {
  const [c, setC] = useState<Catalogue | null>(cache);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadCatalogue().then(setC).catch((e) => setErr(e.message)); }, []);
  return { cat: c, err };
}

const PKEY = "cu.ai.project";
export function useProjects(workspaceId: string | undefined) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [pid, setPidRaw] = useState<string>(() => { try { return localStorage.getItem(PKEY) || ""; } catch { return ""; } });
  const reload = useCallback(async () => {
    if (!workspaceId) return;
    const ps = await api<Project[]>(`/workspaces/${workspaceId}/projects`);
    setProjects(ps);
    setPidRaw((cur) => (ps.some((p) => p.id === cur) ? cur : ps[0]?.id ?? ""));
  }, [workspaceId]);
  useEffect(() => { reload().catch(() => setProjects([])); }, [reload]);
  const setPid = (id: string) => { setPidRaw(id); try { localStorage.setItem(PKEY, id); } catch { /* storage off */ } };
  return { projects, pid, setPid, reload };
}

export function useProjectMedia(pid: string) {
  const [media, setMedia] = useState<Asset[]>([]);
  const reload = useCallback(async () => {
    if (!pid) { setMedia([]); return; }
    setMedia(await api<Asset[]>(`/projects/${pid}/media`));
  }, [pid]);
  useEffect(() => { reload().catch(() => setMedia([])); }, [reload]);
  useEffect(() => {  // keep processing files fresh
    if (!media.some((m) => m.status === "processing" || m.status === "uploading")) return;
    const t = setTimeout(() => reload().catch(() => {}), 2500);
    return () => clearTimeout(t);
  }, [media, reload]);
  return { media, reload };
}

/** Poll a generation until it settles; also refreshes while outputs are still being processed. */
export function useGeneration(id: string | null, onSettle?: (g: Generation) => void) {
  const [g, setG] = useState<Generation | null>(null);
  const cb = useRef(onSettle); cb.current = onSettle;
  useEffect(() => {
    if (!id) { setG(null); return; }
    let stop = false, timer: any;
    const tick = async () => {
      try {
        const x = await api<Generation>(`/generations/${id}`);
        if (stop) return;
        setG(x);
        const busy = ["queued", "running"].includes(x.status) || x.outputs.some((o) => o.status !== "ready" && o.status !== "failed" && o.status !== "rejected");
        if (busy) timer = setTimeout(tick, 1500);
        else cb.current?.(x);
      } catch { if (!stop) timer = setTimeout(tick, 4000); }
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [id]);
  return [g, setG] as const;
}

export function defaults(t: Tool): Record<string, any> {
  const v: Record<string, any> = {};
  for (const p of t.params) if (p.default !== undefined) v[p.key] = p.default;
  if (t.params.some((p) => p.type === "shots")) v.shots = [{ prompt: "", camera_move: "push in", duration: 5 }, { prompt: "", camera_move: "static", duration: 5 }];
  return v;
}

export function estimate(t: Tool, modelId: string | undefined, v: Record<string, any>): number | null {
  const m = t.models.find((x) => x.id === modelId);
  if (!m) return null;
  const n = Number(v.variations || 1);
  if (t.id === "005") return m.usd_per_s ? +(m.usd_per_s * (v.shots || []).reduce((a: number, s: any) => a + Number(s.duration || 5), 0)).toFixed(2) : null;
  if (m.usd_per_s) return +(m.usd_per_s * Number(v.duration || 5) * n).toFixed(2);
  if (m.usd_per_run) return +(m.usd_per_run * n).toFixed(3);
  return null;
}

export function missing(t: Tool, v: Record<string, any>): string | null {
  for (const p of t.params) {
    const x = v[p.key];
    if (p.required && (x === undefined || x === null || x === "" || (Array.isArray(x) && x.length < (p.min_items || 1)))) return p.label;
    if (p.type === "shots" && Array.isArray(x) && x.filter((s: any) => (s.prompt || "").trim()).length < (p.min_items || 1)) return "at least two described shots";
  }
  return null;
}

export const ENGINE_LABEL: Record<string, string> = { local: "Runs on our worker", fal: "Hosted model (fal.ai)", llm: "Language model", youtube: "YouTube data + LLM", pipeline: "Multi-step pipeline", unbuilt: "Not built yet" };
export const fmtUsd = (x: number | null | undefined) => (x == null ? "" : x < 0.01 ? "<$0.01" : `$${x.toFixed(2)}`);
export const download = (url: string, name?: string) => { const a = document.createElement("a"); a.href = url; if (name) a.download = name; a.click(); };
export const saveText = (name: string, text: string, type = "text/plain") => { const u = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` })); download(u, name); setTimeout(() => URL.revokeObjectURL(u), 4000); };
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
