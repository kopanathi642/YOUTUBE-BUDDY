import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Eye, Users, Radio, MousePointerClick, RefreshCw } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../App";

type Row = { name: string; views: number; visitors: number };
type StatsData = {
  days: number; today: { views: number; visitors: number }; online_now: number;
  total: { views: number; visitors: number; views_per_visitor: number };
  series: { day: string; views: number; visitors: number }[];
  pages: Row[]; sources: Row[]; referrers: Row[]; countries: Row[]; devices: Row[]; browsers: Row[];
  signed_in_share: number; privacy: string;
};
const RANGES: [number, string][] = [[1, "Today"], [7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "Year"]];
const n = (x: number) => x.toLocaleString("en-IN");
const flag = (cc: string) => cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "🌐";
const COUNTRY: Record<string, string> = { IN: "India", US: "United States", GB: "United Kingdom", AE: "UAE", SG: "Singapore", CA: "Canada", AU: "Australia",
  DE: "Germany", NP: "Nepal", BD: "Bangladesh", LK: "Sri Lanka", PK: "Pakistan", SA: "Saudi Arabia", MY: "Malaysia", ID: "Indonesia", PH: "Philippines" };

/** WordPress-style traffic page. Only the admin accounts can open it (the server answers "not found" to anyone else). */
export default function Stats() {
  const { me } = useAuth();
  const [days, setDays] = useState(30);
  const [d, setD] = useState<StatsData | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => { setBusy(true); setErr(""); api<StatsData>(`/admin/stats?days=${days}`).then(setD).catch((e) => setErr((e as Error).message)).finally(() => setBusy(false)); };
  useEffect(() => { if (me?.is_platform_admin) load(); }, [days, me?.is_platform_admin]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!me?.is_platform_admin) return; const t = setInterval(load, 60000); return () => clearInterval(t); }, [days, me?.is_platform_admin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me?.is_platform_admin) return <main className="page"><h2>Page not found</h2><Link className="btn" to="/universes">Go to universes</Link></main>;
  return (
    <main className="page stats-page">
      <div className="row stats-head">
        <Link to="/settings" className="btn icon ghost" aria-label="Back"><ArrowLeft size={16} /></Link>
        <h1>Website stats</h1>
        <div className="stats-ranges" role="tablist" aria-label="Period">
          {RANGES.map(([k, l]) => <button key={k} role="tab" aria-selected={days === k} className={`chip ${days === k ? "on" : ""}`} onClick={() => setDays(k)}>{l}</button>)}
        </div>
        <button className="btn sm ghost" onClick={load} disabled={busy} aria-label="Refresh"><RefreshCw size={14} className={busy ? "spin" : ""} />Refresh</button>
      </div>
      {err && <p className="ft-err" role="alert">{err}</p>}
      {!d ? <p className="dim">Loading…</p> : <>
        <div className="stats-kpis">
          <Kpi icon={Eye} label={days === 1 ? "Views today" : "Views"} value={n(d.total.views)} />
          <Kpi icon={Users} label={days === 1 ? "Visitors today" : "Visitors"} value={n(d.total.visitors)} />
          <Kpi icon={MousePointerClick} label="Views per visitor" value={String(d.total.views_per_visitor)} />
          <Kpi icon={Radio} label="Online now (5 min)" value={n(d.online_now)} live />
        </div>
        {days > 1 && <section className="card stats-card"><h2>Views and visitors per day</h2><Chart series={d.series} /></section>}
        <div className="stats-grid">
          <List title="Top pages" rows={d.pages} label={(r) => r.name} empty="No page views yet" />
          <List title="Where visitors came from" rows={d.sources} label={(r) => r.name} empty="No visits yet" />
          <List title="Countries" rows={d.countries} label={(r) => r.name === "Unknown" ? "🌐 Unknown" : `${flag(r.name)} ${COUNTRY[r.name] ?? r.name}`} empty="No visits yet" />
          <List title="Devices" rows={d.devices} label={(r) => r.name[0].toUpperCase() + r.name.slice(1)} empty="No visits yet" />
          <List title="Browsers" rows={d.browsers} label={(r) => r.name} empty="No visits yet" />
          <List title="Referring websites" rows={d.referrers} label={(r) => r.name} empty="No referring sites yet" />
        </div>
        <p className="dim small">{d.signed_in_share}% of views were by signed-in users. Visitors are counted once per day (like WordPress). {d.privacy} Updates every minute.</p>
      </>}
    </main>
  );
}

function Kpi({ icon: I, label, value, live }: { icon: typeof Eye; label: string; value: string; live?: boolean }) {
  return <div className="card stats-kpi"><span className="dim">{live && <span className="stats-dot" aria-hidden />}<I size={14} aria-hidden /> {label}</span><b>{value}</b></div>;
}

function List({ title, rows, label, empty }: { title: string; rows: Row[]; label: (r: Row) => string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  return <section className="card stats-card"><h2>{title}</h2>
    {rows.length === 0 ? <p className="dim small">{empty}</p> :
      <table className="stats-t"><thead><tr><th></th><th>Views</th><th>Visitors</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.name}><td><div className="stats-bar" style={{ width: `${(100 * r.views) / max}%` }} /><span>{label(r)}</span></td>
          <td>{n(r.views)}</td><td>{n(r.visitors)}</td></tr>)}</tbody></table>}
  </section>;
}

function Chart({ series }: { series: StatsData["series"] }) {
  const W = 900, H = 220, P = 28;
  const max = Math.max(1, ...series.map((s) => s.views));
  const bw = (W - P) / series.length;
  const pts = useMemo(() => series.map((s, i) => `${P + i * bw + bw / 2},${H - 20 - (s.visitors / max) * (H - 40)}`).join(" "), [series, bw, max]);
  const [hover, setHover] = useState<number | null>(null);
  const h = hover != null ? series[hover] : null;
  return <div className="stats-chart">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Views (bars) and visitors (line) per day" onMouseLeave={() => setHover(null)}>
      {[0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={P} x2={W} y1={H - 20 - f * (H - 40)} y2={H - 20 - f * (H - 40)} className="grid" />
        <text x={0} y={H - 16 - f * (H - 40)} className="axis">{Math.round(max * f)}</text></g>)}
      {series.map((s, i) => <rect key={s.day} x={P + i * bw + bw * 0.15} width={bw * 0.7} y={H - 20 - (s.views / max) * (H - 40)} height={(s.views / max) * (H - 40)}
        className={`bar ${hover === i ? "on" : ""}`} onMouseEnter={() => setHover(i)} />)}
      <polyline points={pts} className="line" />
      {series.map((s, i) => (series.length <= 31 && (i % Math.ceil(series.length / 8) === 0 || i === series.length - 1)) &&
        <text key={s.day} x={P + i * bw + bw / 2} y={H - 4} className="axis" textAnchor="middle">{s.day.slice(5)}</text>)}
    </svg>
    <div className="stats-legend"><span><i className="sw bar" />Views</span><span><i className="sw line" />Visitors</span>
      {h && <b>{h.day}: {n(h.views)} views · {n(h.visitors)} visitors</b>}</div>
  </div>;
}
