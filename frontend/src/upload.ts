// Resumable multipart upload straight to private object storage via short-lived signed URLs.
// The browser streams slices of the File — it never loads the whole file into memory.
import { api, Asset } from "./api";

export type UploadState = {
  key: string; file: File; assetId?: string; loaded: number; total: number; preview?: string; startedAt?: number; rate?: number;
  status: "starting" | "uploading" | "finishing" | "done" | "error" | "cancelled"; error?: string;
};

const CONCURRENCY = 4;
const SIGN_BATCH = 12;   // sign many parts per request instead of one round-trip per part
const RETRIES = 4;

function putPart(url: string, blob: Blob, onProgress: (n: number) => void, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      const etag = xhr.getResponseHeader("ETag");
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
      else reject(new Error(etag ? `Storage returned ${xhr.status}` : "Storage did not return an ETag (check bucket CORS)"));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    signal.addEventListener("abort", () => { xhr.abort(); reject(new DOMException("cancelled", "AbortError")); });
    xhr.send(blob);
  });
}

export async function uploadFile(projectId: string, file: File, update: (s: Partial<UploadState>) => void, signal: AbortSignal): Promise<Asset> {
  const init = await api<{ asset: Asset; part_size: number; part_count: number }>(`/projects/${projectId}/media/uploads`, {
    method: "POST", body: { filename: file.name, size_bytes: file.size, content_type: file.type || "application/octet-stream" },
  });
  const id = init.asset.id;
  update({ assetId: id, status: "uploading" });
  const onAbort = () => { api(`/media/${id}/upload`, { method: "DELETE" }).catch(() => {}); };
  signal.addEventListener("abort", onAbort);

  // Resume support: ask storage which parts already landed.
  const done = new Map<number, string>();
  try {
    const { parts } = await api<{ parts: { part_number: number; etag: string }[] }>(`/media/${id}/upload/parts`);
    parts.forEach((p) => done.set(p.part_number, p.etag));
  } catch { /* fresh upload */ }

  const t0 = Date.now();
  update({ startedAt: t0 });
  const progress = new Map<number, number>();
  const report = () => {
    let n = 0;
    for (const [pn] of done) if (!progress.has(pn)) n += Math.min(init.part_size, file.size - (pn - 1) * init.part_size);
    progress.forEach((v) => (n += v));
    const secs = (Date.now() - t0) / 1000;
    update({ loaded: Math.min(n, file.size), rate: secs > 0.5 ? n / secs : undefined });
  };
  const todo = Array.from({ length: init.part_count }, (_, i) => i + 1).filter((n) => !done.has(n));
  // Signed part URLs, fetched in batches and reused until close to expiry (they live 15 minutes).
  const signed = new Map<number, { url: string; at: number }>();
  let signing: Promise<void> | null = null;
  async function urlFor(pn: number, fresh = false): Promise<string> {
    const s = signed.get(pn);
    if (s && !fresh && Date.now() - s.at < 10 * 60_000) return s.url;
    if (!signing) {
      const batch = [pn, ...todo.slice(0, SIGN_BATCH - 1)];
      signing = api<{ urls: Record<string, string> }>(`/media/${id}/upload/parts`, { method: "POST", body: { part_numbers: batch } })
        .then(({ urls }) => { const at = Date.now(); for (const [k, u] of Object.entries(urls)) signed.set(Number(k), { url: u, at }); })
        .finally(() => { signing = null; });
    }
    await signing;
    const got = signed.get(pn);
    return got && (!fresh || Date.now() - got.at < 5000) ? got.url : urlFor(pn, fresh);
  }
  async function worker() {
    while (todo.length) {
      if (signal.aborted) throw new DOMException("cancelled", "AbortError");
      const pn = todo.shift()!;
      const blob = file.slice((pn - 1) * init.part_size, pn * init.part_size);
      for (let attempt = 0; ; attempt++) {
        try {
          const url = await urlFor(pn, attempt > 0);
          const etag = await putPart(url, blob, (n) => { progress.set(pn, n); report(); }, signal);
          done.set(pn, etag);
          progress.set(pn, blob.size);
          report();
          break;
        } catch (e) {
          if ((e as Error).name === "AbortError" || attempt >= RETRIES) throw e;
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, todo.length)) }, worker));
  signal.removeEventListener("abort", onAbort);
  update({ status: "finishing" });
  const parts = [...done.entries()].map(([part_number, etag]) => ({ part_number, etag }));
  const asset = await api<Asset>(`/media/${id}/upload/complete`, { method: "POST", body: { parts } });
  update({ status: "done", loaded: file.size });
  return asset;
}

/** An instant local thumbnail (no network): images directly, videos from a frame ~0.5 s in. Resolves null if the browser can't. */
export function localPreview(file: File): Promise<string | null> {
  if (file.type.startsWith("image/")) return Promise.resolve(URL.createObjectURL(file));
  if (!file.type.startsWith("video/") && !/\.(mp4|m4v|mov|webm|mkv)$/i.test(file.name)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    let settled = false;
    const finish = (out: string | null) => { if (settled) return; settled = true; URL.revokeObjectURL(url); v.removeAttribute("src"); v.load(); resolve(out); };
    v.muted = true; v.preload = "metadata"; v.playsInline = true;
    v.onloadeddata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 3); };
    v.onseeked = () => {
      try {
        const w = 240, h = Math.max(1, Math.round((v.videoHeight / Math.max(1, v.videoWidth)) * w));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d")!.drawImage(v, 0, 0, w, h);
        finish(c.toDataURL("image/jpeg", 0.7));
      } catch { finish(null); }
    };
    v.onerror = () => finish(null);
    setTimeout(() => finish(null), 4000);
    v.src = url;
  });
}

export function fmtRate(bytesPerS?: number) {
  if (!bytesPerS) return "";
  return bytesPerS > 1e6 ? `${(bytesPerS / 1e6).toFixed(1)} MB/s` : `${Math.round(bytesPerS / 1e3)} KB/s`;
}

export function fmtEta(left: number, bytesPerS?: number) {
  if (!bytesPerS || bytesPerS < 1) return "";
  const s = Math.ceil(left / bytesPerS);
  return s < 60 ? `${s}s left` : `${Math.floor(s / 60)}m ${s % 60}s left`;
}
