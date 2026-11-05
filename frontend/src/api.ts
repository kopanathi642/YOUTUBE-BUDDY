// Thin API client. Cookies carry the session; the custom header is our CSRF defence.
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v1${path}`, {
      method: opts.method ?? "GET",
      credentials: "include",
      signal: opts.signal,
      headers: { "x-requested-with": "creator-universe", ...(opts.body !== undefined ? { "content-type": "application/json" } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const d = data?.detail;
    const msg = typeof d === "string" ? d : d?.message ?? (Array.isArray(d) ? d.map((x: any) => x.msg).join("; ") : `Request failed (${res.status})`);
    throw new ApiError(res.status, msg, d);
  }
  return data as T;
}

export type Workspace = { id: string; name: string; is_personal: boolean; role: "owner" | "admin" | "editor" | "viewer" };
export type Me = { user: { id: string; email: string; display_name: string; email_verified: boolean; avatar_url?: string | null; has_password?: boolean; google_linked?: boolean }; workspaces: Workspace[] };

export type Job = {
  id: string; kind: string; status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  progress: number; stage: string | null; error: string | null; attempts: number; created_at: string;
  started_at: string | null; finished_at: string | null; result: any; project_id?: string | null;
};

export type Asset = {
  id: string; project_id: string; filename: string; kind: "video" | "audio" | "image";
  status: "uploading" | "processing" | "ready" | "failed" | "rejected"; status_detail: string | null;
  size_bytes: number; duration_s: number | null; width: number | null; height: number | null; fps: number | null;
  video_codec: string | null; audio_codec: string | null; has_audio: boolean | null; has_video: boolean | null;
  thumbnail_url: string | null; proxy_url: string | null; waveform_url: string | null; job: Job | null; created_at: string;
};

export type Project = {
  id: string; workspace_id: string; name: string; universe: string; created_at: string; updated_at: string;
  archived: boolean; media_count?: number; sequences?: SequenceDoc[]; my_role?: Workspace["role"];
};

export type SequenceDoc = { id: string; project_id: string; name: string; version: number; timeline: import("./timeline").Timeline; updated_at: string };

export type ExportRec = {
  id: string; sequence_id: string; sequence_version: number; preset: string; created_at: string;
  settings: { width: number; height: number; fps: number; duration_s: number };
  output_size_bytes: number | null; validation: { ok: boolean; checks: Record<string, boolean> } | null;
  download_url: string | null; job: Job;
};

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
}

export function fmtDuration(s: number | null | undefined): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function timeAgo(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
