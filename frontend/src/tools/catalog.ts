/** Free public YouTube tools (/tools/<slug>). Keep slugs, titles and descriptions in sync with backend/app/seo.py TOOLS (a test checks). */
export type ToolGroup = "Channel" | "Money" | "Search & SEO" | "Links & media";
export type FreeTool = { slug: string; title: string; desc: string; group: ToolGroup; icon: string };

export const FREE_TOOLS: FreeTool[] = [
  { slug: "youtube-channel-audit", title: "Free YouTube Channel Audit", group: "Channel", icon: "activity",
    desc: "Paste your channel link and see what works: best upload day and time, title words that get views, and an estimate for your next video." },
  { slug: "youtube-money-calculator", title: "YouTube Money Calculator (India)", group: "Money", icon: "indian-rupee",
    desc: "Estimate how much a YouTube video or channel can earn in rupees from views, for long videos and Shorts." },
  { slug: "youtube-monetization-checker", title: "YouTube Monetization Checker", group: "Money", icon: "badge-check",
    desc: "Check if your channel meets YouTube Partner Programme rules: 500 or 1,000 subscribers, watch hours or Shorts views." },
  { slug: "youtube-engagement-calculator", title: "YouTube Engagement Rate Calculator", group: "Channel", icon: "heart",
    desc: "Work out the engagement rate of a video or channel from views, likes and comments." },
  { slug: "youtube-watch-time-calculator", title: "YouTube Watch Time Calculator", group: "Money", icon: "clock",
    desc: "Turn views and average view duration into watch hours and see how far you are from 4,000 hours." },
  { slug: "youtube-keyword-research", title: "Free YouTube Keyword Research Tool", group: "Search & SEO", icon: "search",
    desc: "See what people really search on YouTube in India around your topic, from YouTube's own search suggestions." },
  { slug: "youtube-hashtag-generator", title: "YouTube Hashtag Generator", group: "Search & SEO", icon: "hash",
    desc: "Get relevant hashtags for your video or Short from real YouTube search phrases." },
  { slug: "youtube-channel-id-finder", title: "YouTube Channel ID Finder", group: "Channel", icon: "fingerprint",
    desc: "Find the UC… channel ID of any YouTube channel from its link or @handle." },
  { slug: "youtube-channel-video-links", title: "YouTube Channel Video Links Extractor", group: "Channel", icon: "list",
    desc: "Get the links of a channel's latest uploads in one list, ready to copy." },
  { slug: "youtube-rss-feed-generator", title: "YouTube RSS Feed Generator", group: "Links & media", icon: "rss",
    desc: "Get the RSS feed link of any YouTube channel to follow new uploads in a feed reader." },
  { slug: "youtube-thumbnail-downloader", title: "YouTube Thumbnail Downloader", group: "Links & media", icon: "image",
    desc: "Get the full-size thumbnail of any YouTube video in HD, SD and smaller sizes." },
  { slug: "youtube-timestamp-link-generator", title: "YouTube Timestamp Link Generator", group: "Links & media", icon: "timer",
    desc: "Make a YouTube link that starts the video at an exact minute and second." },
  { slug: "youtube-subscribe-link-generator", title: "YouTube Subscribe Link Generator", group: "Links & media", icon: "bell",
    desc: "Make a link that opens your channel with the subscribe pop-up, for bios and descriptions." },
  { slug: "youtube-embed-code-generator", title: "YouTube Embed Code Generator", group: "Links & media", icon: "code",
    desc: "Make the embed code for a YouTube video with start time, autoplay, loop and privacy-enhanced mode." },
];

/** The 11-character video ID from any common YouTube link (watch, youtu.be, shorts, embed, live) or the bare ID. */
export function videoId(s: string): string | null {
  const t = s.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t;
  const m = t.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** "1:02:03", "2:30", "90" → seconds; null if not a time. */
export function parseTime(s: string): number | null {
  const t = s.trim();
  if (!t) return 0;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
  return t.split(":").map(Number).reduce((a, b) => a * 60 + b, 0);
}

/** Hashtags from search phrases: no spaces or symbols, lower case, unique, at most `max` (YouTube ignores all hashtags past 60). */
export function hashtags(phrases: string[], max = 15): string[] {
  const out: string[] = [];
  for (const p of phrases) {
    const tag = "#" + p.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
    if (tag.length > 2 && tag.length <= 40 && !out.includes(tag)) out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

/** Partner Programme tiers (YouTube Help, expanded YPP; India included). */
export function monetization(i: { subs: number; hours: number; shorts: number; uploads: number }) {
  const early = [
    { ok: i.subs >= 500, need: `${Math.max(0, 500 - i.subs).toLocaleString("en-IN")} more subscribers (500 needed)` },
    { ok: i.uploads >= 3, need: `${Math.max(0, 3 - i.uploads)} more public uploads in the last 90 days (3 needed)` },
    { ok: i.hours >= 3000 || i.shorts >= 3_000_000, need: `3,000 watch hours in 12 months (you have ${i.hours.toLocaleString("en-IN")}) or 3M Shorts views in 90 days` },
  ];
  const full = [
    { ok: i.subs >= 1000, need: `${Math.max(0, 1000 - i.subs).toLocaleString("en-IN")} more subscribers (1,000 needed)` },
    { ok: i.hours >= 4000 || i.shorts >= 10_000_000, need: `4,000 watch hours in 12 months (you have ${i.hours.toLocaleString("en-IN")}) or 10M Shorts views in 90 days` },
  ];
  return { early: { ok: early.every((x) => x.ok), missing: early.filter((x) => !x.ok).map((x) => x.need) },
           full: { ok: full.every((x) => x.ok), missing: full.filter((x) => !x.ok).map((x) => x.need) } };
}

/** Estimated earnings range from monthly views and RPM ranges (₹ the creator receives per 1,000 views). */
export function earnings(views: number, shortsPct: number, longRpm: [number, number], shortsRpm: [number, number]) {
  const sv = views * shortsPct / 100, lv = views - sv;
  const lo = (lv * longRpm[0] + sv * shortsRpm[0]) / 1000, hi = (lv * longRpm[1] + sv * shortsRpm[1]) / 1000;
  return { low: Math.round(lo), high: Math.round(hi) };
}
