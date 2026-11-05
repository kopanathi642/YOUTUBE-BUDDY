// Resumable multipart upload straight to private object storage via short-lived signed URLs.
// The browser streams slices of the File — it never loads the whole file into memory.
import { api, Asset } from "./api";

export type UploadState = {
  key: string; file: File; assetId?: string; loaded: number; total: number;
  status: "starting" | "uploading" | "finishing" | "done" | "error" | "cancelled"; error?: string;
};

const CONCURRENCY = 3;
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

  const progress = new Map<number, number>();
  const report = () => {
    let n = 0;
    for (const [pn] of done) if (!progress.has(pn)) n += Math.min(init.part_size, file.size - (pn - 1) * init.part_size);
    progress.forEach((v) => (n += v));
    update({ loaded: Math.min(n, file.size) });
  };
  const todo = Array.from({ length: init.part_count }, (_, i) => i + 1).filter((n) => !done.has(n));

  async function worker() {
    while (todo.length) {
      if (signal.aborted) throw new DOMException("cancelled", "AbortError");
      const pn = todo.shift()!;
      const blob = file.slice((pn - 1) * init.part_size, pn * init.part_size);
      for (let attempt = 0; ; attempt++) {
        try {
          const { urls } = await api<{ urls: Record<string, string> }>(`/media/${id}/upload/parts`, { method: "POST", body: { part_numbers: [pn] } });
          const etag = await putPart(urls[pn], blob, (n) => { progress.set(pn, n); report(); }, signal);
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
