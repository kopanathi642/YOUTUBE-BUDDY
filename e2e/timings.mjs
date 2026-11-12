// Speed report: how long each page takes to become usable and how long each import takes from drop to usable.
// Run:  BASE=http://localhost:8000 MEDIA=/path/to/media node e2e/timings.mjs   (prints a table + JSON)
// MEDIA: Vlog_Intro.mp4 (720p H.264), Drone_Shot.mp4 (1080p), Music_BGM.wav, Subscribe_Badge.png, optional Big_4K.mp4
import { createRequire } from "module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright");

const B = process.env.BASE ?? "http://localhost:8000", M = process.env.MEDIA;
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const rows = [];
const ms = (t0) => Math.round(performance.now() - t0);

async function timePage(name, url, ready) {
  const t0 = performance.now();
  await page.goto(B + url);
  await page.waitForSelector(ready, { timeout: 60000 });
  const total = ms(t0);
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return n ? { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd) } : {}; });
  rows.push({ what: `Page: ${name}`, ms: total, detail: `first byte ${nav.ttfb ?? "?"} ms · HTML ready ${nav.dcl ?? "?"} ms` });
}

await timePage("Landing", "/", "text=Shoot once.");
await page.goto(B + "/signup");
await page.fill("#n", "Speed Bot"); await page.fill("#e", `speed${Date.now()}@example.com`); await page.fill("#p", "speed-password-123");
let t0 = performance.now();
await page.click("button:has-text('Create account')"); await page.waitForURL("**/universes"); await page.waitForSelector(".portal");
rows.push({ what: "Sign up → universes", ms: ms(t0) });
await timePage("Editor home", "/editor", ".stat b");
await timePage("AI Generator", "/ai-generator", ".aiw");
await timePage("Growth", "/growth", "h1, h2");
await timePage("Projects", "/projects", "button:has-text('New project')");

await page.goto(B + "/home"); await page.click("button:has-text('New project')"); await page.fill("#np-name", "Speed Project");
t0 = performance.now();
await page.click("button:has-text('Create & open editor')"); await page.waitForURL("**/edit/**"); await page.waitForSelector(".ed2");
rows.push({ what: "New project → editor open", ms: ms(t0) });
const projectUrl = page.url();

const files = ["Subscribe_Badge.png", "Music_BGM.wav", "Vlog_Intro.mp4", "Drone_Shot.mp4", "Big_4K.mp4"].filter((f) => fs.existsSync(`${M}/${f}`));
for (const f of files) {
  const size = fs.statSync(`${M}/${f}`).size;
  t0 = performance.now();
  await page.setInputFiles("input[type=file]", `${M}/${f}`);
  await page.waitForSelector(".bin-upload", { timeout: 10000 });
  const firstPaint = await page.waitForSelector(".bin-upload .up-thumb", { timeout: 10000 }).then(() => ms(t0)).catch(() => null);
  await page.waitForSelector(".bin-upload", { state: "detached", timeout: 600000 });
  const uploaded = ms(t0);
  await page.waitForFunction((name) => [...document.querySelectorAll(".bin-item")].some((e) => e.textContent.includes(name) && e.classList.contains("ready")), f, { timeout: 600000, polling: 250 });
  const usable = ms(t0);
  rows.push({ what: `Import ${f} (${(size / 1e6).toFixed(1)} MB)`, ms: usable, detail: `preview card ${firstPaint ?? "—"} ms · uploaded ${uploaded} ms · usable ${usable} ms` });
}
t0 = performance.now();
await page.goto(projectUrl); await page.waitForSelector(".bin-item.ready");
rows.push({ what: "Reopen project with media", ms: ms(t0) });
await page.click(".bin-item.ready .bin-add");
t0 = performance.now();
await page.waitForSelector(".clip", { timeout: 10000 });
rows.push({ what: "Add clip to timeline", ms: ms(t0) });

for (const r of rows) console.log(`${String(r.ms).padStart(7)} ms  ${r.what}${r.detail ? `  (${r.detail})` : ""}`);
console.log("JSON " + JSON.stringify(rows));
await browser.close();
