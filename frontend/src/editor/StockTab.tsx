import { useEffect, useState } from "react";
import { Search, Download, ExternalLink, Loader2, KeyRound, Film, ImageIcon } from "lucide-react";
import { api, Asset } from "../api";

type Item = { provider: "pexels" | "pixabay"; kind: "video" | "photo"; id: string; thumb: string | null; preview: string | null;
  width: number | null; height: number | null; duration: number | null; author: string | null; author_url: string | null; page_url: string | null };

/** Free stock footage and photos (Pexels / Pixabay). Search goes through our server so the API keys never reach the browser. */
export default function StockTab({ projectId, readOnly, onImported, reload }: {
  projectId: string; readOnly: boolean; onImported: (a: Asset) => void; reload: () => void;
}) {
  const [keys, setKeys] = useState<{ pexels: boolean; pixabay: boolean } | null>(null);
  const [provider, setProvider] = useState<"pexels" | "pixabay">("pexels");
  const [kind, setKind] = useState<"video" | "photo">("video");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [attr, setAttr] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    api<{ pexels: boolean; pixabay: boolean }>("/stock/status").then((k) => { setKeys(k); if (!k.pexels && k.pixabay) setProvider("pixabay"); }).catch(() => setKeys({ pexels: false, pixabay: false }));
  }, []);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await api<{ items: Item[]; attribution: string }>(`/stock/search?${new URLSearchParams({ q: q.trim(), kind, provider })}`);
      setItems(r.items); setAttr(r.attribution);
      if (!r.items.length) setErr("Nothing found — try another word");
    } catch (x) { setErr((x as Error).message); setItems([]); } finally { setBusy(false); }
  }

  async function add(it: Item) {
    setImporting(it.id); setErr(null);
    try {
      const a = await api<Asset>(`/projects/${projectId}/stock/import`, { method: "POST", body: { provider: it.provider, kind: it.kind, id: it.id } });
      reload();
      for (let i = 0; i < 180; i++) {
        const x = await api<Asset>(`/media/${a.id}`);
        if (x.status === "ready") { onImported(x); reload(); return; }
        if (x.status === "failed") throw new Error(x.status_detail || "Import failed");
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw new Error("Still downloading — it will appear in Media when ready");
    } catch (x) { setErr((x as Error).message); } finally { setImporting(null); }
  }

  if (keys && !keys.pexels && !keys.pixabay) return (
    <div className="bin-list stock-tab" style={{ paddingTop: 10 }}>
      <div className="stock-empty"><KeyRound size={18} />
        <b>Free stock library — needs a free key</b>
        <span>Add <code>PEXELS_API_KEY</code> (pexels.com/api) or <code>PIXABAY_API_KEY</code> (pixabay.com/api/docs) to the server's environment settings. Both are free; no card needed.</span>
      </div>
    </div>);

  const has = (p: "pexels" | "pixabay") => !keys || keys[p];
  return (
    <div className="bin-list stock-tab">
      <form className="stock-search" onSubmit={search}>
        <Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search free stock (e.g. beach, city night)" aria-label="Search stock" maxLength={100} />
        <button className="btn sm" disabled={busy || !q.trim()}>{busy ? <Loader2 size={13} className="spin" /> : "Search"}</button>
      </form>
      <div className="row" style={{ gap: 4, margin: "6px 0" }}>
        <button className={`chip ${kind === "video" ? "on" : ""}`} onClick={() => setKind("video")}><Film size={11} /> Videos</button>
        <button className={`chip ${kind === "photo" ? "on" : ""}`} onClick={() => setKind("photo")}><ImageIcon size={11} /> Photos</button>
        <span style={{ flex: 1 }} />
        <button className={`chip ${provider === "pexels" ? "on" : ""}`} disabled={!has("pexels")} onClick={() => setProvider("pexels")}>Pexels</button>
        <button className={`chip ${provider === "pixabay" ? "on" : ""}`} disabled={!has("pixabay")} onClick={() => setProvider("pixabay")}>Pixabay</button>
      </div>
      {err && <div className="dim" role="alert" style={{ fontSize: 11, color: "#fca5a5", marginBottom: 6 }}>{err}</div>}
      <div className="stock-grid">
        {items.map((it) => (
          <div key={`${it.provider}-${it.id}`} className="stock-card">
            <div className="stock-thumb">
              {it.thumb && <img src={it.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />}
              {it.duration ? <span className="badge" style={{ position: "absolute", bottom: 3, right: 3, fontSize: 9 }}>{it.duration}s</span> : null}
              <button className="stock-add" disabled={readOnly || !!importing} onClick={() => add(it)} aria-label={`Add ${it.kind} by ${it.author ?? "unknown"}`}>
                {importing === it.id ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
              </button>
            </div>
            <a className="stock-by ellipsis" href={it.page_url ?? undefined} target="_blank" rel="noreferrer noopener">{it.author ?? it.provider} <ExternalLink size={9} /></a>
          </div>))}
      </div>
      {attr && <div className="dim" style={{ fontSize: 10, marginTop: 6 }}>{attr}. Free to use; credit the creator when you can.</div>}
    </div>);
}
