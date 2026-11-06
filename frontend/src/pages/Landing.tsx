import { Link } from "react-router-dom";
import { Film, Orbit, Atom, Upload, Layers, Scissors, Download, Cloud, ShieldCheck, History, Gauge } from "lucide-react";
import { Brand } from "../components/Shell";
import { useAuth } from "../App";

const FEATURES = [
  { icon: Upload, t: "Resumable cloud uploads", d: "Large files upload in parts straight to private storage and resume after a dropped connection." },
  { icon: Layers, t: "Multitrack timeline", d: "Video and audio tracks, trim, split, ripple delete, snapping, opacity, scale, position and rotation." },
  { icon: Cloud, t: "Renders keep going", d: "Exports run on cloud workers, so you can close your laptop while the render finishes." },
  { icon: ShieldCheck, t: "Checked output", d: "Every export is probed after rendering: duration, size, frame rate, codec and decodability." },
  { icon: History, t: "Autosave + history", d: "Every change is versioned. Restore any earlier state of your sequence." },
  { icon: Scissors, t: "Frame-exact editing", d: "All edits are stored in frames, so cuts land exactly where you put them." },
  { icon: Gauge, t: "Smooth proxies", d: "Lightweight proxies are made for playback. Final exports always use your original media." },
  { icon: Download, t: "Export presets", d: "Export at sequence resolution, 720p or a fast draft in H.264 MP4." },
];

export default function Landing() {
  const { me } = useAuth();
  return (
    <div className="land">
      <header className="land-nav">
        <Brand />
        <nav aria-label="Site"><a href="#universes">Universes</a><a href="#features">Features</a><a href="#status">What's live</a></nav>
        <div className="grow" />
        {me ? <Link className="btn primary" to="/universes">Open studio</Link> : <>
          <Link className="btn ghost" to="/signin">Sign in</Link>
          <Link className="btn primary" to="/signup">Get started</Link>
        </>}
      </header>
      <section className="hero">
        <span className="badge info">Early access · Editor Universe</span>
        <h1>Edit videos in the cloud.<br /><span className="grad-text">One studio, three universes.</span></h1>
        <p>Upload footage, cut it on a real multitrack timeline, and render on cloud workers that keep running after you close the tab.</p>
        <div className="row" style={{ justifyContent: "center", gap: 12 }}>
          <Link className="btn primary lg" to={me ? "/universes" : "/signup"}>Start editing</Link>
          <a className="btn lg" href="#status">See what works today</a>
        </div>
      </section>
      <section className="universes" id="universes" aria-label="Universes">
        <div className="card uni-card live">
          <span className="badge ok">Live now</span>
          <h3 className="row" style={{ marginTop: 12 }}><Film size={20} />Editor Universe</h3>
          <p className="muted">Professional editing: media library, multitrack timeline, cloud render and export.</p>
        </div>
        <div className="card uni-card">
          <span className="badge ok">Early access</span>
          <h3 className="row" style={{ marginTop: 12 }}><Orbit size={20} />AI Generator Universe</h3>
          <p className="muted">AI voice, captions, translation, dubbing, background removal and stabilisation. Image/video generation is planned.</p>
        </div>
        <div className="card uni-card">
          <span className="badge ok">Early access</span>
          <h3 className="row" style={{ marginTop: 12 }}><Atom size={20} />Super Universe</h3>
          <p className="muted">Command center: all jobs, engines, team members and projects in one place. Automation and API are planned.</p>
        </div>
      </section>
      <section id="features" className="feat-grid" aria-label="Features">
        {FEATURES.map(({ icon: I, t, d }) => (
          <div key={t} className="card feat"><I size={20} color="#a5b4fc" /><h4 style={{ margin: "10px 0 6px" }}>{t}</h4><p className="muted" style={{ margin: 0, fontSize: 13 }}>{d}</p></div>
        ))}
      </section>
      <section id="status" className="land-shot" style={{ marginBottom: 60 }}>
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ marginTop: 0 }}>What's live, honestly</h3>
          <p className="muted">Live: accounts (email + Google), workspaces and teams, cloud uploads, the multitrack editor with titles, speed, crop, colour grading and scopes, smart silence/scene cuts, autosave with history, cloud MP4 export, AI voice, captions, translation, dubbing, background removal and stabilisation.
            Planned: lip sync, object removal, image/video generation, publishing to YouTube. We mark each one live only when it really works.</p>
        </div>
      </section>
      <footer className="land-foot"><span>© {new Date().getFullYear()} Creator Universe (working name)</span><span>Privacy policy and terms: pending legal review</span></footer>
    </div>
  );
}
