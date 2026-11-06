import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, LogIn, ShieldCheck, Search, LayoutTemplate, CheckCircle2, Loader2, PauseCircle } from "lucide-react";
import { api } from "../api";
import type { Tool, Generation, Studio } from "./core";
import { Control, Ctx } from "./controls";

export type GNode = { id: string; tool_id: string; params: Record<string, any>; note?: string; ui?: { x: number; y: number } };
export type GEdge = { from: string; to: string; input: string };
export type Graph = { nodes: GNode[]; edges: GEdge[] };

const W = 210, H = 86;
const uid = () => Math.random().toString(36).slice(2, 7);

function layout(g: Graph): Graph {
  if (g.nodes.every((n) => n.ui)) return g;
  const depth: Record<string, number> = {};
  const d = (id: string, seen = new Set<string>()): number => {
    if (depth[id] != null) return depth[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    const ins = g.edges.filter((e) => e.to === id);
    return (depth[id] = ins.length ? 1 + Math.max(...ins.map((e) => d(e.from, seen))) : 0);
  };
  g.nodes.forEach((n) => d(n.id));
  const col: Record<number, number> = {};
  return { ...g, nodes: g.nodes.map((n) => { const c = depth[n.id]; const r = (col[c] = (col[c] ?? -1) + 1); return { ...n, ui: n.ui ?? { x: 30 + c * (W + 70), y: 30 + r * (H + 40) } }; }) };
}

export function inputsOf(t?: Tool): string[] {
  if (!t) return ["video"];
  const ks = t.params.filter((p) => ["media", "media_multi"].includes(p.type) || ["prompt", "text", "brief", "script"].includes(p.key)).map((p) => p.key);
  return ks.length ? ks : ["video"];
}

export default function NodeCanvas({ graph, onChange, tools, studios, gen, c }: {
  graph: Graph; onChange: (g: Graph) => void; tools: Tool[]; studios: Studio[]; gen: Generation | null; c: Ctx;
}) {
  const g = useMemo(() => layout(graph), [graph]);
  useEffect(() => { if (graph.nodes.some((n) => !n.ui)) onChange(g); }, [graph]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(tools.map((t) => [t.id, t])), [tools]);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [wire, setWire] = useState<{ from: string; x: number; y: number } | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  useEffect(() => { api<any[]>("/ai/workflow-templates").then(setTemplates).catch(() => {}); }, []);

  const pt = (e: { clientX: number; clientY: number }) => { const b = area.current!.getBoundingClientRect(); return { x: e.clientX - b.left + area.current!.scrollLeft, y: e.clientY - b.top + area.current!.scrollTop }; };
  const setNode = (id: string, f: (n: GNode) => GNode) => onChange({ ...g, nodes: g.nodes.map((n) => (n.id === id ? f(n) : n)) });
  const add = (tool_id: string) => {
    const t = byId.get(tool_id);
    const params: Record<string, any> = {};
    t?.params.forEach((p) => { if (p.default !== undefined && !["media", "media_multi"].includes(p.type)) params[p.key] = p.default; });
    const n: GNode = { id: `${tool_id === "input" ? "in" : tool_id === "approval" ? "ok" : "n"}${uid()}`, tool_id, params, ui: { x: 40 + (g.nodes.length % 4) * 60, y: 40 + g.nodes.length * 26 } };
    onChange({ ...g, nodes: [...g.nodes, n] });
    setSel(n.id);
  };
  const del = (id: string) => { onChange({ nodes: g.nodes.filter((n) => n.id !== id), edges: g.edges.filter((e) => e.from !== id && e.to !== id) }); setSel(null); };
  const connect = (from: string, to: string) => {
    if (from === to || g.edges.some((e) => e.from === from && e.to === to)) return;
    const tt = byId.get(g.nodes.find((n) => n.id === to)?.tool_id ?? "");
    const ft = byId.get(g.nodes.find((n) => n.id === from)?.tool_id ?? "");
    const ins = to.startsWith("ok") ? ["video"] : inputsOf(tt);
    const textish = ft && (ft.output === "doc");
    const input = (textish && ins.find((k) => ["text", "prompt", "brief", "script"].includes(k))) || ins.find((k) => !["text", "prompt", "brief", "script"].includes(k)) || ins[0];
    onChange({ ...g, edges: [...g.edges, { from, to, input }] });
  };

  const state = gen?.result?.state;
  const nodeState = (id: string) => (state?.results?.[id] ? "done" : state?.waiting === id ? "waiting" : gen && ["queued", "running"].includes(gen.status) ? "pending" : "");
  const selNode = g.nodes.find((n) => n.id === sel);
  const selTool = selNode ? byId.get(selNode.tool_id) : undefined;
  const nodeCtx: Ctx | null = selNode && selTool ? { ...c, tool: selTool, v: selNode.params, set: (k, x) => setNode(selNode.id, (n) => ({ ...n, params: { ...n.params, [k]: x } })) } : null;
  const list = tools.filter((t) => t.output !== "workflow" && (!q || `${t.id} ${t.name} ${t.summary}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="nodes">
      <aside className="nodes-pal" aria-label="Tool palette">
        <div className="row" style={{ gap: 6 }}><Search size={14} className="dim" /><input className="input sm" placeholder="Find a tool" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a tool" /></div>
        <div className="pal-fixed">
          <button type="button" className="pal-item io" onClick={() => add("input")}><LogIn size={14} />Input file</button>
          <button type="button" className="pal-item gate" onClick={() => add("approval")}><ShieldCheck size={14} />Approval gate</button>
        </div>
        <div className="pal-list">{studios.map((s) => { const ts = list.filter((t) => t.studio === s.id); return ts.length ? (
          <div key={s.id}><div className="pal-h">{s.code} · {s.name}</div>
            {ts.map((t) => <button type="button" key={t.id} className={`pal-item ${t.status.state}`} onClick={() => add(t.id)} title={t.status.state === "ready" ? t.summary : t.status.needs.join(", ") || t.status.detail}>
              <span className="pal-id">{t.id}</span>{t.name}{t.status.state !== "ready" && <span className="pal-lock">key</span>}</button>)}</div>) : null; })}</div>
        {templates.length > 0 && <div className="pal-tpl"><div className="pal-h"><LayoutTemplate size={12} /> Templates</div>
          {templates.map((t) => <button type="button" key={t.id} className="pal-item" onClick={() => onChange(layout({ nodes: t.nodes.map((n: GNode) => ({ ...n, ui: undefined })), edges: t.edges }))}>{t.name}</button>)}</div>}
      </aside>

      <div className="nodes-area" ref={area} onPointerMove={(e) => {
        if (drag.current) { const p = pt(e); setNode(drag.current.id, (n) => ({ ...n, ui: { x: Math.max(0, p.x - drag.current!.dx), y: Math.max(0, p.y - drag.current!.dy) } })); }
        if (wire) setWire({ ...wire, ...pt(e) });
      }} onPointerUp={() => { drag.current = null; setWire(null); }} onPointerLeave={() => { drag.current = null; }}>
        <svg className="nodes-wires" width="2400" height="1400" aria-hidden="true">
          {g.edges.map((e, i) => { const a = g.nodes.find((n) => n.id === e.from)?.ui, b = g.nodes.find((n) => n.id === e.to)?.ui; if (!a || !b) return null;
            const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2;
            return <g key={i}><path d={`M${x1} ${y1} C${x1 + 60} ${y1} ${x2 - 60} ${y2} ${x2} ${y2}`} className={`wire ${nodeState(e.from) === "done" ? "live" : ""}`} />
              <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} className="wire-l">{e.input}</text></g>; })}
          {wire && (() => { const a = g.nodes.find((n) => n.id === wire.from)?.ui; return a ? <path d={`M${a.x + W} ${a.y + H / 2} L${wire.x} ${wire.y}`} className="wire draft" /> : null; })()}
        </svg>
        {g.nodes.map((n) => { const t = byId.get(n.tool_id); const st = nodeState(n.id); const kind = n.tool_id === "input" ? "io" : n.tool_id === "approval" ? "gate" : t?.studio ?? "";
          return (
            <div key={n.id} className={`node ${kind} ${sel === n.id ? "sel" : ""} ${st}`} style={{ left: n.ui!.x, top: n.ui!.y, width: W, height: H }}
              onPointerDown={(e) => { if ((e.target as HTMLElement).closest(".port,.node-x")) return; setSel(n.id); const p = pt(e); drag.current = { id: n.id, dx: p.x - n.ui!.x, dy: p.y - n.ui!.y }; }}
              onPointerUp={() => { if (wire && wire.from !== n.id) connect(wire.from, n.id); }}>
              <span className="port in" title="input" />
              <div className="node-h"><span className="node-id">{n.tool_id === "input" ? "IN" : n.tool_id === "approval" ? "GATE" : n.tool_id}</span>
                <b className="ellipsis">{n.tool_id === "input" ? "Input file" : n.tool_id === "approval" ? "Approval gate" : t?.name ?? n.tool_id}</b>
                {st === "done" && <CheckCircle2 size={14} className="ok" />}{st === "waiting" && <PauseCircle size={14} className="warn" />}{st === "pending" && <Loader2 size={14} className="spin" />}</div>
              <div className="node-n dim ellipsis">{n.note || t?.summary || (n.tool_id === "approval" ? "Waits for your OK before continuing" : "The file you run this workflow on")}</div>
              {t && t.status.state !== "ready" && <div className="node-lock">needs {t.status.needs[0]?.split(" ")[0] ?? "setup"}</div>}
              <button type="button" className="node-x" aria-label="Delete node" onClick={() => del(n.id)}><Trash2 size={12} /></button>
              <span className="port out" title="drag to connect" onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).releasePointerCapture?.(e.pointerId); setWire({ from: n.id, ...pt(e) }); }} />
            </div>); })}
        {!g.nodes.length && <div className="nodes-empty"><Plus size={22} /><b>Add tools from the palette</b><span className="dim">Drag from a node's right port to another node to connect them.</span></div>}
      </div>

      <aside className="nodes-insp" aria-label="Node inspector">
        {!selNode && <div className="dim">Select a node to configure it. Every node runs the real tool on its own engine; locked nodes need their key first.</div>}
        {selNode && <>
          <div className="insp-h"><b>{selTool?.name ?? (selNode.tool_id === "input" ? "Input file" : "Approval gate")}</b><button type="button" className="btn sm ghost" onClick={() => del(selNode.id)}><Trash2 size={13} /></button></div>
          <label className="label">Note</label><input className="input sm" value={selNode.note ?? ""} onChange={(e) => setNode(selNode.id, (n) => ({ ...n, note: e.target.value }))} />
          {g.edges.filter((e) => e.to === selNode.id).map((e, i) => <div key={i} className="insp-edge"><span className="dim">from {g.nodes.find((n) => n.id === e.from)?.tool_id} →</span>
            <select className="input sm" value={e.input} onChange={(ev) => onChange({ ...g, edges: g.edges.map((x) => (x === e ? { ...x, input: ev.target.value } : x)) })}>
              {inputsOf(selTool).map((k) => <option key={k}>{k}</option>)}</select>
            <button type="button" className="btn sm ghost" aria-label="Remove connection" onClick={() => onChange({ ...g, edges: g.edges.filter((x) => x !== e) })}><Trash2 size={12} /></button></div>)}
          {nodeCtx && <div className="insp-params">{selTool!.params.filter((p) => !["media", "media_multi", "nodes", "mask", "shots"].includes(p.type) && !g.edges.some((e) => e.to === selNode.id && e.input === p.key))
            .map((p) => <Control key={p.key} p={p} c={nodeCtx} compact />)}</div>}
          {state?.results?.[selNode.id]?.assets?.length > 0 && <div className="dim small">Produced {state.results[selNode.id].assets.length} file(s) — see the shared library.</div>}
        </>}
      </aside>
    </div>
  );
}
