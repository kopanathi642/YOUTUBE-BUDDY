import { Link } from "react-router-dom";
import { Play, Wand2, Film, Captions, Smartphone, Sparkles, BarChart3, Wrench } from "lucide-react";
import { useAuth } from "../App";

/** Public "About" page: what youtubebuddy.com is and every service, in plain words. Search engines read the same text. */
const SERVICES = [
  { icon: Wand2, name: "AI Auto Editor", text: "Upload your clips and describe the video. It picks the best shots, cuts to the music or keeps every sentence whole, grades the colour, checks the result and renders it. Revise in plain words.", to: "/ai-generator" },
  { icon: Film, name: "Online video editor", text: "A Premiere-style timeline in your browser: trim, ripple, slip, transitions, 28 effects, titles, colour, keyframes and audio mixing. No install, no GPU needed.", to: "/editor" },
  { icon: Captions, name: "Auto captions and dubbing", text: "Subtitles in Indian languages and dubbing into Hindi, Telugu, Tamil and more, from the same project.", to: "/editor" },
  { icon: Smartphone, name: "Shorts maker", text: "Turn a long video into vertical Shorts and Reels with captions and framing that follows the speaker.", to: "/editor" },
  { icon: Sparkles, name: "AI Generator", text: "121 AI tools for scripts, titles, thumbnails, voice, music, images and video — each one says plainly what it needs.", to: "/ai-generator" },
  { icon: BarChart3, name: "Channel analysis", text: "Paste your channel link: best upload day and time, title words that work, and a range for your next video's views.", to: "/tools/youtube-channel-audit" },
  { icon: Wrench, name: "Free YouTube tools", text: "Money calculator in rupees, monetization checker, keyword research in 9 Indian languages, hashtags, thumbnail downloader and link makers. No sign-up.", to: "/tools" },
];

export default function About() {
  const { me } = useAuth();
  return (
    <div className="ft">
      <header className="ft-top">
        <Link to="/" className="ft-brand"><span className="ft-logo"><Play size={13} fill="#fff" strokeWidth={0} /></span>YouTube Buddy</Link>
        <nav className="ft-nav"><Link to="/tools">Free tools</Link>{me ? <Link to="/universes" className="btn sm primary">Open app</Link>
          : <><Link to="/signin">Sign in</Link><Link to="/signup" className="btn sm primary">Start free</Link></>}</nav>
      </header>
      <main className="ft-main">
        <h1 className="ft-h1">About YouTube Buddy</h1>
        <p className="ft-lead">YouTube Buddy (youtubebuddy.com) is a video editor and AI studio for creators, made in India. Edit in your browser,
          let the AI auto editor make the first cut, add captions and Hindi dubbing, make Shorts, and see what works on your channel.
          Free to start, pay by UPI.</p>
        <section className="ft-group"><h2>What you can do</h2>
          <div className="ft-grid">{SERVICES.map(({ icon: I, name, text, to }) => (
            <Link key={name} to={to} className="ft-card"><I size={18} aria-hidden /><b>{name}</b><span>{text}</span></Link>))}</div>
        </section>
        <section className="ft-group"><h2>How we work</h2>
          <ul className="ft-list">
            <li>Everything you see works today. A tool that needs a paid service says so instead of pretending.</li>
            <li>Your videos stay yours. We don't train AI on your uploads.</li>
            <li>Most tools run on our own servers, no GPU or install needed on your side.</li>
          </ul>
        </section>
        <section className="ft-cta card">
          <div><b>Try it free.</b><span className="dim"> Start with a free tool, or open the editor.</span></div>
          <Link to="/signup" className="btn primary">Create a free account</Link>
        </section>
      </main>
      <footer className="ft-foot">
        <span>© {new Date().getFullYear()} YouTube Buddy</span><Link to="/about">About</Link><Link to="/tools">Free YouTube tools</Link>
        <Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><span className="dim">Not affiliated with YouTube or Google.</span>
      </footer>
    </div>
  );
}
