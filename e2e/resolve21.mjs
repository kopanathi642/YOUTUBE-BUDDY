// Resolve 21.1-style additions (presets, clip durations, marker export, exact search, chained commands).\n// Resolve-style edit features: markers, smart Trim tool (roll / ripple / slip / slide), the 7 edit types on the
// program monitor, Dynamic Zoom, and the Premiere-style timeline chrome (tools, zoom bar, meters).
// Usage: BASE=http://localhost:8000 EMAIL=... PASSWORD=... PROJECT=<id with clips on V1> OUT=<dir> node e2e/resolve.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright");

const { BASE = "http://localhost:8000", EMAIL, PASSWORD = "audit-password-123", PROJECT, OUT = "." } = process.env;
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let pass = 0, fail = 0;
const step = async (name, fn) => {
  try { await fn(); pass++; console.log("PASS ", name); }
  catch (e) { fail++; console.log("FAIL ", name, "—", e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/resolve-fail-${pass + fail}.png` }); }
};
const clips = (track) => page.evaluate((t) => [...document.querySelectorAll(`[data-track="${t}"] .clip`)].map((e) => {
  const r = e.getBoundingClientRect(); return { label: e.getAttribute("aria-label"), x: r.x, w: r.width, y: r.y, h: r.height, id: e.dataset.clip };
}).sort((a, b) => a.x - b.x), track);
const undo = () => page.keyboard.press("Control+z");

await page.goto(BASE + "/signin"); await page.fill("#e", EMAIL); await page.fill("#p", PASSWORD); await page.keyboard.press("Enter");
await page.waitForURL("**/universes");
// Reset the project's timeline to a known state: V1 = first 6 s of two videos back to back, A2 = one music file.
await page.goto(`${BASE}/universes`);
const resetOk = await page.evaluate(async (pid) => {
  const H = { "x-requested-with": "creator-universe", "content-type": "application/json" };
  const p = await (await fetch(`/api/v1/projects/${pid}`, { credentials: "include", headers: H })).json();
  const seq = p.sequences[0];
  const doc = await (await fetch(`/api/v1/sequences/${seq.id}`, { credentials: "include", headers: H })).json();
  const media = await (await fetch(`/api/v1/projects/${pid}/media`, { credentials: "include", headers: H })).json();
  const vids = media.filter((m) => m.kind === "video" && m.status === "ready" && m.duration_s >= 7);
  const aud = media.find((m) => m.kind === "audio" && m.status === "ready" && m.duration_s >= 2);
  if (vids.length < 2 || !aud) return "need 2 ready videos (7 s+) and 1 audio file";
  const fps = doc.timeline.fps, T = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
  const c = (id, asset, start, inF, out) => ({ id, asset_id: asset, start, in: inF, out, volume: 1, fade_in: 0, fade_out: 0, transform: T });
  const tr = (id, kind, name, clips) => ({ id, kind, name, muted: false, hidden: false, locked: false, clips });
  const tl = { ...doc.timeline, markers: [], tracks: [
    tr("v2", "video", "Titles / Graphics", []),
    tr("v1", "video", "Video", [c("ca", vids[0].id, 0, 0, 6 * fps), c("cb", vids[1].id, 6 * fps, 0, 6 * fps)]),
    tr("a1", "audio", "Voice", []),
    tr("a2", "audio", "Music (BGM)", [c("cm", aud.id, 0, 0, Math.floor(aud.duration_s * fps))]),
  ] };
  const r = await fetch(`/api/v1/sequences/${seq.id}`, { method: "PUT", credentials: "include", headers: H, body: JSON.stringify({ base_version: doc.version, timeline: tl }) });
  return r.ok ? "ok" : `PUT ${r.status} ${await r.text()}`;
}, PROJECT);
if (resetOk !== "ok") { console.log("FAIL  reset timeline —", resetOk); process.exit(1); }
await page.goto(`${BASE}/edit/${PROJECT}`); await page.waitForSelector(".pr-tl .clip"); await page.waitForTimeout(1500);
await page.locator(".tl-scroll").evaluate((e) => (e.scrollLeft = 0));
const ruler = await page.locator(".tl-ruler").boundingBox();
const playheadAt = async (px) => { await page.mouse.click(ruler.x + px, ruler.y + 35); await page.waitForTimeout(150); };
const tc = () => page.locator(".pr-tc").innerText();

await step("Clip durations show on timeline clips", async () => {
  const d = await page.locator('[data-track="v1"] .clip .pr-cdur').first().innerText();
  if (!/^\d+:\d\d$/.test(d)) throw new Error("duration text: " + d);   // 6 s clip at 30 fps -> 6:00
});

await step("Inspector presets: save the effects of one clip, apply them to another", async () => {
  await page.locator('[data-track="v1"] .clip').first().click();
  await page.click(".ed-insp [role=tab]:has-text('Effects')");
  await page.click(".fx-styles button:has-text('Noir')"); await page.waitForTimeout(200);
  const bar = page.locator(".preset-bar").first();
  await bar.locator("button:has-text('Save as preset')").click();
  await bar.locator("input").fill("My Noir"); await bar.locator("button:has-text('Save')").click();
  await page.locator('[data-track="v1"] .clip').nth(1).click();
  await page.click(".ed-insp [role=tab]:has-text('Effects')");
  const opt = await page.locator(".preset-bar select option", { hasText: "My Noir" }).getAttribute("value");
  await page.locator(".preset-bar select").first().selectOption(opt); await page.waitForTimeout(200);
  const names = await page.locator(".fx-row .fx-name").allInnerTexts();
  if (!names.includes("Black & White")) throw new Error("preset not applied: " + names.join(","));
});

await step("Export markers: CSV download with every marker", async () => {
  const r = await page.locator(".tl-ruler").boundingBox();
  for (const x of [60, 160]) { await page.mouse.click(r.x + x, r.y + 35); await page.keyboard.press("m"); }
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[aria-label='Export markers']")]);
  const fs = await import("fs");
  const txt = fs.readFileSync(await dl.path(), "utf8");
  const rows = txt.trim().split(/\r?\n/);
  if (rows.length !== 3 || !rows[1].includes("Marker")) throw new Error("csv: " + txt);
  for (const p of page.context().pages()) if (p !== page) await p.close();
});

await step("Exact search with quotes, and a chained command in Find AI", async () => {
  await page.keyboard.press("Escape");
  await page.click(".find-box input"); await page.fill(".find-box input", '"Cinematic look"');
  const n = await page.locator(".find-row").count(); if (n !== 1) throw new Error(`exact search gave ${n} results`);
  await page.fill(".find-box input", "remove silences and balance audio");
  const first = await page.locator(".find-row").first().innerText();
  if (!/Do all: Remove silences → Balance audio levels/.test(first)) throw new Error("command row: " + first);
  await page.keyboard.press("Enter"); await page.waitForTimeout(2500);
  const toasts = await page.evaluate(() => document.body.innerText);
  if (!/silence|Nothing to change|levels/i.test(toasts)) throw new Error("no sign the steps ran");
});

console.log(`\n${pass}/${pass + fail} steps passed`, errors.length ? "\npage errors: " + errors.join(" | ") : "");
await b.close();
process.exit(fail ? 1 : 0);
