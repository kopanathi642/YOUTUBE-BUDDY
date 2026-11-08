import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Youtube } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../App";
import type { YtStatus } from "./YouTubeCard";

let cached: Promise<YtStatus | null> | null = null;
/** One /youtube/status call per page load, shared by every top bar. */
export function ytStatus(fresh = false): Promise<YtStatus | null> {
  if (!cached || fresh) cached = api<YtStatus>("/youtube/status").catch(() => null);
  return cached;
}

/** The YouTube button next to the profile name: "Connect channel" or the connected channel's name. Hidden until the server has YouTube set up (admins still see it, to finish set-up). */
export default function ChannelButton() {
  const { me } = useAuth();
  const [s, setS] = useState<YtStatus | null>(null);
  useEffect(() => { ytStatus().then(setS); }, []);
  if (!me || !s || (!s.configured && !me.is_platform_admin)) return null;
  const label = s.connected ? (s.channel_title || "My channel") : "Connect channel";
  return (
    <Link to="/channel" className={`btn ghost yt-chan ${s.connected ? "on" : ""}`} title={s.connected ? `Channel insights for ${label}` : "Connect your YouTube channel to get insights and next-video estimates"}
      aria-label={s.connected ? `Channel insights: ${label}` : "Connect YouTube channel"}>
      <Youtube size={18} color="#ff3b3b" aria-hidden /><span className="hide-m ellipsis" style={{ maxWidth: 130 }}>{label}</span>
    </Link>
  );
}
