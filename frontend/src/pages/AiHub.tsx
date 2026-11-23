import { CSSProperties, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Search, KeyRound, CheckCircle2, Lock, ArrowRight,
  Sparkles, Grid3x3, Rows3, Video, Mic, Wand2,
  Languages, Image as ImageIcon, PenLine, Film, HelpCircle,
  Smartphone, Compass,
} from "lucide-react";
import { api } from "../api";
import { useAuth } from "../App";
import { ENGINE_LABEL, Generation, Tool, useCatalogue } from "../ai/core";
import { STUDIO_META } from "../ai/studios";
import { Thumb } from "../ai/controls";
import { Frame } from "./AiTool";
import "../ai/ai.css";

/* ── Status Dot ── */
function StateDot({ t }: { t: Tool }) {
  if (t.status.state === "ready") {
    if (t.status.gpu_offline) {
      return (
        <span className="badge-pill key" title={t.status.notice}>
          <CheckCircle2 size={11} style={{ marginRight: 3, verticalAlign: "middle" }} />
          GPU offline
        </span>
      );
    }
    return (
      <span className="badge-pill ready" title={t.status.detail}>
        <CheckCircle2 size={11} style={{ marginRight: 3, verticalAlign: "middle" }} />
        Ready
      </span>
    );
  }
  if (t.status.state === "needs_key") {
    return (
      <span className="badge-pill key" title={`Needs ${t.status.needs.join(", ")}`}>
        <KeyRound size={11} style={{ marginRight: 3, verticalAlign: "middle" }} />
        Needs Key
      </span>
    );
  }
  return (
    <span className="badge-pill key" title={t.status.detail}>
      <Lock size={11} style={{ marginRight: 3, verticalAlign: "middle" }} />
      Coming Soon
    </span>
  );
}

/* ── Creator Category Definitions ── */
type CategoryId = "all" | "popular" | "video" | "voice" | "magic" | "captions" | "images" | "scripts";

const CATEGORIES: { id: CategoryId; label: string; icon: any }[] = [
  { id: "popular", label: "🔥 Most Popular", icon: Sparkles },
  { id: "all", label: "🌟 All Tools", icon: Grid3x3 },
  { id: "video", label: "🎬 Video & Shorts", icon: Video },
  { id: "voice", label: "🎙️ Voice & Audio", icon: Mic },
  { id: "magic", label: "✂️ Magic Video Edit", icon: Wand2 },
  { id: "captions", label: "🌐 Captions & Dubbing", icon: Languages },
  { id: "images", label: "🎨 Thumbnails & Art", icon: ImageIcon },
  { id: "scripts", label: "✍️ Scripts & Strategy", icon: PenLine },
];

/* ── Quick Search Filter Pills ── */
const QUICK_SEARCH_TAGS = [
  "Captions", "Remove Background", "Text to Voice", "Make Shorts",
  "Cut Silences", "Dubbing", "Upscale 4K", "Thumbnail", "Viral Hook",
];

/* ── Flow / How-it-works helper for tools ── */
function getToolFlow(t: Tool): string {
  const hasVideo = t.params.some(p => p.type === "media" && p.accept?.includes("video"));
  const hasAudio = t.params.some(p => p.type === "media" && p.accept?.includes("audio"));
  const hasImg = t.params.some(p => p.type === "media" && p.accept?.includes("image"));
  const hasPrompt = t.params.some(p => p.type === "prompt" || p.type === "text" || p.type === "longtext");

  let inText = "Input";
  if (hasVideo) inText = "📹 Video";
  else if (hasAudio) inText = "🎙️ Audio";
  else if (hasImg) inText = "🖼️ Image";
  else if (hasPrompt) inText = "✍️ Prompt";

  let outText = "Result";
  if (t.output === "video") outText = "🎬 1080p Video";
  else if (t.output === "audio") outText = "🔊 Audio Track";
  else if (t.output === "image") outText = "🖼️ HD Image";
  else if (t.output === "text" || t.id === "101" || t.id === "103") outText = "📄 Subtitles";

  return `${inText} ➔ ${outText}`;
}

/* ── Modern Tool Card ── */
function ModernToolCard({ t }: { t: Tool }) {
  const m = STUDIO_META[t.studio] ?? STUDIO_META.video;
  const Icon = m.icon;
  const flow = getToolFlow(t);

  return (
    <Link
      to={`/ai-generator/tool/${t.id}`}
      className="tool-card-pro"
      style={{ "--s1": m.c1, "--s2": m.c2 } as CSSProperties}
    >
      <div className="tool-card-top">
        <div
          className="tool-card-icon"
          style={{ background: `linear-gradient(135deg, ${m.c1}, ${m.c2})` }}
        >
          <Icon size={22} color="#fff" />
        </div>
        <div className="tool-card-badges">
          <StateDot t={t} />
          {t.timeline && (
            <span className="badge-pill output" title="Can be placed directly onto the editor timeline">
              <Film size={10} style={{ marginRight: 3, verticalAlign: "middle" }} />
              Timeline
            </span>
          )}
        </div>
      </div>

      <div>
        <h3 className="tool-card-name">{t.name}</h3>
        <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700 }}>
          {STUDIO_META[t.studio] ? t.studio : "Tool"} #{t.id}
        </span>
      </div>

      <p className="tool-card-desc">{t.summary}</p>

      <div className="tool-card-flow" title="How this tool works: required input to output">
        <span>How it works:</span>
        <b>{flow}</b>
      </div>

      <div className="tool-card-cta">
        <span>Open Tool</span>
        <ArrowRight size={14} />
      </div>
    </Link>
  );
}

/* ── Main AI Hub ── */
export function AiHub() {
  const { cat, err } = useCatalogue();
  const { workspace } = useAuth();
  const [q, setQ] = useState("");
  const [catTab, setCatTab] = useState<CategoryId>("popular");
  const [whereOpen, setWhereOpen] = useState(false);
  const [recent, setRecent] = useState<Generation[]>([]);

  useEffect(() => {
    if (workspace) {
      api<Generation[]>(`/workspaces/${workspace.id}/generations?limit=8`)
        .then(setRecent)
        .catch(() => {});
    }
  }, [workspace]);

  // Essential / Popular tool IDs
  const popularIds = useMemo(() => new Set([
    "023", "103", "101", "104", "112", "041", "026", "093", "052", "051", "011", "081", "001"
  ]), []);

  // Filtered tools list
  const filteredTools = useMemo(() => {
    if (!cat) return [];
    let list = cat.tools;

    // Search query takes precedence if entered
    if (q.trim()) {
      const query = q.trim().toLowerCase();
      return list.filter(t =>
        `${t.id} ${t.name} ${t.summary} ${t.slug} ${t.studio}`.toLowerCase().includes(query)
      );
    }

    // Category filtering
    if (catTab === "popular") {
      const popList = list.filter(t => popularIds.has(t.id));
      return popList.length > 0 ? popList : list.slice(0, 12);
    }
    if (catTab === "video") {
      return list.filter(t => ["video", "animation", "videointel"].includes(t.studio) || t.output === "video");
    }
    if (catTab === "voice") {
      return list.filter(t => ["audio"].includes(t.studio) || t.id === "041" || t.id === "042" || t.id === "043");
    }
    if (catTab === "magic") {
      return list.filter(t => ["transform"].includes(t.studio) || t.id === "023" || t.id === "093" || t.id === "026" || t.id === "091");
    }
    if (catTab === "captions") {
      return list.filter(t => ["localize"].includes(t.studio) || t.id === "101" || t.id === "102" || t.id === "103" || t.id === "104");
    }
    if (catTab === "images") {
      return list.filter(t => ["image", "imageedit"].includes(t.studio) || t.output === "image");
    }
    if (catTab === "scripts") {
      return list.filter(t => ["writing", "creator"].includes(t.studio));
    }
    return list; // "all"
  }, [cat, q, catTab, popularIds]);

  return (
    <Frame>
      <div className="hub-redesign">
        {/* ── 1. Hero Header ── */}
        <header className="ai-hero-header">
          <div className="ai-hero-badge">
            <Sparkles size={14} />
            AI Creator Studio · All Tools in One Place
          </div>
          <h1>What do you want to create today?</h1>
          <p>
            Choose any AI tool below to generate video, clone voices, add subtitles, or edit footage.
            Everything is ready to use in your browser.
          </p>
        </header>

        {/* ── 2. "How to use" 3-Step Banner ── */}
        <div className="ai-steps-card">
          <div className="ai-steps-header">
            <span className="ai-steps-title">
              <Compass size={17} color="#38bdf8" />
              How to use any AI tool (in 3 easy steps)
            </span>
            <button
              type="button"
              className="btn sm"
              style={{ fontSize: 12, padding: "5px 12px" }}
              onClick={() => setWhereOpen(!whereOpen)}
            >
              <HelpCircle size={13} style={{ marginRight: 5, verticalAlign: "middle" }} />
              {whereOpen ? "Hide 'Where is What?' Guide" : "Where is what? Quick Map"}
            </button>
          </div>

          <div className="ai-steps-row">
            <div className="ai-step-item">
              <span className="ai-step-num">1</span>
              <div className="ai-step-text">
                <b>Pick a Tool</b>
                <span>Click any tool card below (e.g. Auto Captions, Voice, Shorts, or Silences).</span>
              </div>
            </div>

            <div className="ai-step-item">
              <span className="ai-step-num">2</span>
              <div className="ai-step-text">
                <b>Upload or Type</b>
                <span>On the left panel, upload your source video/audio or type your script prompt.</span>
              </div>
            </div>

            <div className="ai-step-item">
              <span className="ai-step-num">3</span>
              <div className="ai-step-text">
                <b>Generate & Export</b>
                <span>Click the Run button. Your result previews on the right — send directly to the editor timeline!</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. "Where is What?" Cheat Sheet / Visual Map ── */}
        {whereOpen && (
          <div className="where-drawer">
            <div className="where-summary" onClick={() => setWhereOpen(false)}>
              <span>🗺️ Creator Map — Exactly where every tool lives</span>
              <small>Click to collapse</small>
            </div>
            <div className="where-grid">
              <div className="where-cat-box">
                <span className="where-cat-title"><Languages size={15} color="#38bdf8" /> Captions & Subtitles</span>
                <div className="where-cat-items">
                  <Link to="/ai-generator/tool/103"><span>Auto Captions on Video</span> <small>Tool #103</small></Link>
                  <Link to="/ai-generator/tool/101"><span>Speech to Transcript</span> <small>Tool #101</small></Link>
                  <Link to="/ai-generator/tool/104"><span>AI Voice Dubbing (Hindi/Eng)</span> <small>Tool #104</small></Link>
                  <Link to="/ai-generator/tool/102"><span>Translate 13+ Languages</span> <small>Tool #102</small></Link>
                </div>
              </div>

              <div className="where-cat-box">
                <span className="where-cat-title"><Wand2 size={15} color="#a78bfa" /> Clean & Fix Video</span>
                <div className="where-cat-items">
                  <Link to="/ai-generator/tool/023"><span>Remove Background</span> <small>Tool #023</small></Link>
                  <Link to="/ai-generator/tool/093"><span>Cut Quiet Silences</span> <small>Tool #093</small></Link>
                  <Link to="/ai-generator/tool/026"><span>Make Video Sharper (4K)</span> <small>Tool #026</small></Link>
                  <Link to="/ai-generator/tool/091"><span>Auto Reframe to 9:16</span> <small>Tool #091</small></Link>
                </div>
              </div>

              <div className="where-cat-box">
                <span className="where-cat-title"><Mic size={15} color="#f472b6" /> Voice & Audio</span>
                <div className="where-cat-items">
                  <Link to="/ai-generator/tool/041"><span>Text to Speech (Natural Voice)</span> <small>Tool #041</small></Link>
                  <Link to="/ai-generator/tool/043"><span>Clean Audio / Noise Removal</span> <small>Tool #043</small></Link>
                  <Link to="/ai-generator/tool/045"><span>Generate Background Music</span> <small>Tool #045</small></Link>
                </div>
              </div>

              <div className="where-cat-box">
                <span className="where-cat-title"><Smartphone size={15} color="#fbbf24" /> Shorts & Video</span>
                <div className="where-cat-items">
                  <Link to="/ai-generator/tool/112"><span>Auto Shorts from Long Video</span> <small>Tool #112</small></Link>
                  <Link to="/ai-generator/tool/001"><span>AI Video Scene Generator</span> <small>Tool #001</small></Link>
                  <Link to="/ai-generator/tool/005"><span>Storyboard Film Maker</span> <small>Tool #005</small></Link>
                </div>
              </div>

              <div className="where-cat-box">
                <span className="where-cat-title"><ImageIcon size={15} color="#34d399" /> Thumbnails & Art</span>
                <div className="where-cat-items">
                  <Link to="/ai-generator/tool/081"><span>YouTube Thumbnail Studio</span> <small>Tool #081</small></Link>
                  <Link to="/ai-generator/tool/011"><span>AI Image Generator</span> <small>Tool #011</small></Link>
                  <Link to="/ai-generator/tool/083"><span>Remove Objects / Inpaint</span> <small>Tool #083</small></Link>
                </div>
              </div>

              <div className="where-cat-box">
                <span className="where-cat-title"><PenLine size={15} color="#c084fc" /> Scripts & Hooks</span>
                <div className="where-cat-items">
                  <Link to="/ai-generator/tool/051"><span>YouTube Video Scriptwriter</span> <small>Tool #051</small></Link>
                  <Link to="/ai-generator/tool/052"><span>Viral 15-Second Hook</span> <small>Tool #052</small></Link>
                  <Link to="/ai-generator/tool/071"><span>Title & SEO Tags</span> <small>Tool #071</small></Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 4. Search Bar & Quick Filters ── */}
        <div className="search-section">
          <div className="hub-search">
            <Search size={18} />
            <input
              type="search"
              placeholder="Search by what you want to do (e.g. captions, remove silence, shorts, hindi voice)..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search tools"
            />
            {q && (
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => setQ("")}
                style={{ padding: "4px 8px", fontSize: 12 }}
              >
                Clear
              </button>
            )}
          </div>

          <div className="search-pills">
            <span className="search-pill-label">Quick Suggestions:</span>
            {QUICK_SEARCH_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className="search-pill-btn"
                onClick={() => setQ(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* ── 5. Category Navigation Tabs ── */}
        {!q.trim() && (
          <div className="cat-tabs-scroll" role="tablist" aria-label="Tool Categories">
            {CATEGORIES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={catTab === id}
                className={`cat-tab-btn${catTab === id ? " active" : ""}`}
                onClick={() => setCatTab(id)}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── 6. Tool Cards Grid ── */}
        {err ? (
          <div className="error-box" role="alert">{err}</div>
        ) : !cat ? (
          <div className="ws-loading"><span className="spinner" /> Loading tools…</div>
        ) : filteredTools.length > 0 ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8" }}>
                {q.trim() ? `Search Results (${filteredTools.length})` : `${CATEGORIES.find(c => c.id === catTab)?.label} (${filteredTools.length} tools)`}
              </span>
              <Link to="/ai-generator/explore" className="btn sm" style={{ fontSize: 12 }}>
                <Rows3 size={13} style={{ marginRight: 4 }} />
                Detailed Explorer View
              </Link>
            </div>
            <div className="modern-tools-grid">
              {filteredTools.map((t) => (
                <ModernToolCard key={t.id} t={t} />
              ))}
            </div>
          </div>
        ) : (
          <div className="card empty" role="status" style={{ padding: 40, textAlign: "center" }}>
            <Search size={32} style={{ margin: "0 auto 12px", color: "#64748b" }} />
            <b>No tools match “{q}”</b>
            <p style={{ color: "#94a3b8", fontSize: 14, margin: "8px 0 16px" }}>
              Try searching with simpler terms like "voice", "caption", "shorts", or "background".
            </p>
            <button type="button" className="btn" onClick={() => setQ("")}>
              Show All Tools
            </button>
          </div>
        )}

        {/* ── 7. Studios Directory Deck ── */}
        {!q.trim() && cat && (
          <section style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: 18, margin: 0, fontWeight: 700, color: "#f1f5f9" }}>Browse by Dedicated Studio</h2>
                <span style={{ fontSize: 13, color: "#94a3b8" }}>Explore the complete 12 specialized creator environments</span>
              </div>
            </div>
            <div className="studio-directory">
              {cat.studios.map((s) => {
                const Icon = STUDIO_META[s.id]?.icon ?? Video;
                const toolsInStudio = cat.tools.filter(t => t.studio === s.id);
                return (
                  <Link key={s.id} to={`/ai-generator/studio/${s.id}`}>
                    <Icon size={20} color="#38bdf8" />
                    <div>
                      <b>{s.name}</b>
                      <small>{toolsInStudio.length} tools available · {s.tagline}</small>
                    </div>
                    <ArrowRight size={15} />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── 8. Recent Generations ── */}
        {recent.length > 0 && (
          <section style={{ marginTop: 8 }}>
            <h2 style={{ fontSize: 18, margin: "0 0 14px", fontWeight: 700, color: "#f1f5f9" }}>Your Recent Generations</h2>
            <div className="recent">
              {recent.slice(0, 6).map((g) => (
                <Link key={g.id} to={`/ai-generator/tool/${g.tool_id}`} className="recent-item">
                  <Thumb a={g.outputs[0]} size={120} />
                  <b className="ellipsis">{g.tool_name}</b>
                  <span className="dim small">v{g.version} · {g.status}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </Frame>
  );
}

/* ── /ai-generator/studio/:sid — Studio Launch Deck ── */
export function AiStudio() {
  const { sid = "video" } = useParams();
  const { cat } = useCatalogue();
  const s = cat?.studios.find((x) => x.id === sid);
  const m = STUDIO_META[sid] ?? STUDIO_META.video;
  const I = m.icon;
  const ts = cat?.tools.filter((t) => t.studio === sid) ?? [];

  return (
    <Frame studio={sid}>
      <div className={`studio-front motif-${m.motif}`} style={{ "--s1": m.c1, "--s2": m.c2 } as CSSProperties}>
        <div className="sf-hero">
          <span className="sc-art big" aria-hidden="true"><i /><i /><i /></span>
          <I size={30} />
          <div>
            <span className="sf-code">Studio {s?.code}</span>
            <h1>{s?.name}</h1>
            <p>{s?.tagline}</p>
          </div>
        </div>

        {/* Quick Instructions */}
        <div style={{
          display: "flex", gap: 12, alignItems: "center",
          padding: "12px 18px", borderRadius: 12,
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          margin: "0 24px 18px", fontSize: 13, color: "#cbd5e1"
        }}>
          <Sparkles size={16} color="#38bdf8" />
          <span>Click any tool below to launch its workspace. Outputs can be sent straight to your video editor timeline.</span>
        </div>

        <div className="modern-tools-grid" style={{ padding: "0 24px 32px" }}>
          {ts.map((t) => (
            <ModernToolCard key={t.id} t={t} />
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* ── /ai-generator/explore — Full Table/Cards Explorer ── */
export function AiExplorer() {
  const { cat } = useCatalogue();
  const [params, setParams] = useSearchParams();
  const studio = params.get("studio") ?? "";
  const engine = params.get("engine") ?? "";
  const [q, setQ] = useState("");
  const [grid, setGrid] = useState(true);

  const list = (cat?.tools ?? []).filter((t) =>
    (!studio || t.studio === studio) &&
    (!engine || t.engine === engine) &&
    (!q || `${t.id} ${t.name} ${t.summary}`.toLowerCase().includes(q.toLowerCase()))
  );

  const setF = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    setParams(p, { replace: true });
  };

  return (
    <Frame>
      <div className="explorer">
        <div className="hub-head">
          <div>
            <h1>Tool Explorer</h1>
            <p className="muted">{list.length} of {cat?.tools.length ?? 0} available tools</p>
          </div>
          <button type="button" className="btn sm" onClick={() => setGrid(!grid)}>
            {grid ? <Rows3 size={13} /> : <Grid3x3 size={13} />}
            {grid ? "Table View" : "Cards View"}
          </button>
        </div>

        <div className="ex-filters">
          <div className="hub-search sm">
            <Search size={14} />
            <input placeholder="Filter by name, ID or description" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter tools" />
          </div>
          <select className="input sm" value={studio} onChange={(e) => setF("studio", e.target.value)} aria-label="Studio">
            <option value="">All studios</option>
            {cat?.studios.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
          </select>
          <select className="input sm" value={engine} onChange={(e) => setF("engine", e.target.value)} aria-label="Engine">
            <option value="">Any engine</option>
            {Object.entries(ENGINE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>

        {grid ? (
          <div className="modern-tools-grid">
            {list.map((t) => <ModernToolCard key={t.id} t={t} />)}
          </div>
        ) : (
          <div className="ex-scroll">
            <table className="ex-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tool</th>
                  <th>Studio</th>
                  <th>Engine</th>
                  <th>Output</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">#{t.id}</td>
                    <td>
                      <Link to={`/ai-generator/tool/${t.id}`}>
                        <b>{t.name}</b>
                      </Link>
                      <small className="dim">{t.summary}</small>
                    </td>
                    <td>{cat?.studios.find((s) => s.id === t.studio)?.name}</td>
                    <td className="small">{ENGINE_LABEL[t.engine]}</td>
                    <td className="small">{t.output}{t.timeline ? " · timeline" : ""}</td>
                    <td><StateDot t={t} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Frame>
  );
}
