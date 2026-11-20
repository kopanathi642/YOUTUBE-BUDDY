// Effects, styles, animations and text styles (Resolve / Premiere / CapCut): pick them in the UI, check the preview
// draws them, they survive a reload, and the server exports the timeline with them (real FFmpeg render).
// Usage: BASE=http://localhost:8000 EMAIL=... PASSWORD=... PROJECT=<id> OUT=<dir> node e2e/effects.mjs
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
  catch (e) { fail++; console.log("FAIL ", name, "—", e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/effects-fail-${pass + fail}.png` }); }
};
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
const fxTab = async () => { await page.locator('[data-track="v1"] .clip').first().click(); await page.click(".ed-insp [role=tab]:has-text('Effects')"); };
const filterOfFirst = () => page.evaluate(() => getComputedStyle(document.querySelector(".stage .clipwrap")).filter);

await step("Style 'Noir' puts B&W + vignette on the clip and the preview draws them", async () => {
  await fxTab();
  await page.click(".fx-styles button:has-text('Noir')"); await page.waitForTimeout(300);
  const names = await page.locator(".fx-row .fx-name").allInnerTexts();
  if (!(names.includes("Black & White") && names.includes("Vignette"))) throw new Error("effects list: " + names.join(","));
  if (!(await filterOfFirst()).includes("url(\"#e-")) throw new Error("preview has no effects filter: " + await filterOfFirst());
  if (!(await page.locator(".stage .fx-over").count())) throw new Error("vignette overlay missing");
});

await step("Add Sepia from the menu, change its strength, remove Vignette", async () => {
  await page.selectOption(".fx-add", "sepia"); await page.waitForTimeout(200);
  const slider = page.locator('input[aria-label="Sepia strength"]'); await slider.fill("0.4"); await page.waitForTimeout(200);
  const val = await page.locator(".fx-row:has-text('Sepia') .fx-val").innerText(); if (val !== "40%") throw new Error("value shows " + val);
  await page.click('button[aria-label="Remove Vignette"]'); await page.waitForTimeout(200);
  if (await page.locator(".fx-row:has-text('Vignette')").count()) throw new Error("vignette still there");
});

await step("Cinema Bars + Film Grain draw overlays in the preview", async () => {
  await page.selectOption(".fx-add", "letterbox"); await page.selectOption(".fx-add", "grain"); await page.waitForTimeout(300);
  if (!(await page.locator(".stage .fx-over .fx-grain").count())) throw new Error("no grain overlay");
});

await step("CapCut animation 'Zoom in' + 'Slide to left' add keyframes", async () => {
  await page.click(".anim-row:has-text('In') button:has-text('Zoom in')");
  await page.click(".anim-row:has-text('Out') button:has-text('Slide to left')"); await page.waitForTimeout(200);
  await page.click(".ed-insp [role=tab]:has-text('Inspector')");
  const note = await page.locator(".kf-note").first().innerText();
  if (!/scale/.test(note) || !/opacity/.test(note) || !/x/.test(note)) throw new Error("animated: " + note);
});

await step("Text style 'Bold Outline' on a new title", async () => {
  await page.click(".ed-insp [role=tab]:has-text('Text')");
  await page.click("button:has-text('Add title at playhead')"); await page.waitForSelector(".clip.title");
  await page.click(".ed-insp [role=tab]:has-text('Text')");
  await page.click(".look-list button:has-text('Bold Outline')"); await page.waitForTimeout(300);
  const stroke = await page.evaluate(() => getComputedStyle(document.querySelector(".stage .title-layer")).webkitTextStrokeWidth);
  if (!stroke || stroke === "0px") throw new Error("no outline in preview");
});

await step("Effects survive reload, and the server exports the timeline with them", async () => {
  await page.waitForTimeout(3000); await page.reload(); await page.waitForSelector(".pr-tl .clip"); await page.waitForTimeout(1000);
  if (!(await filterOfFirst()).includes("url(\"#e-")) throw new Error("effects lost after reload");
  const r = await page.evaluate(async (pid) => {
    const H = { "x-requested-with": "creator-universe", "content-type": "application/json" };
    const p = await (await fetch(`/api/v1/projects/${pid}`, { credentials: "include", headers: H })).json();
    const seq = p.sequences[0];
    const doc = await (await fetch(`/api/v1/sequences/${seq.id}`, { credentials: "include", headers: H })).json();
    const c = doc.timeline.tracks.find((t) => t.id === "v1").clips[0];
    const res = await fetch(`/api/v1/sequences/${seq.id}/exports`, { method: "POST", credentials: "include", headers: H, body: JSON.stringify({ preset: "draft", idempotency_key: crypto.randomUUID() }) });
    return { effects: c.effects, status: res.status, body: await res.json() };
  }, PROJECT);
  const types = (r.effects ?? []).map((e) => e.type).sort().join(",");
  if (types !== "bw,grain,letterbox,sepia") throw new Error("saved effects: " + types);
  if (r.status !== 201) throw new Error("export refused: " + JSON.stringify(r.body));
  const jobId = r.body.job?.id ?? r.body.job_id;
  for (let i = 0; i < 120; i++) {
    const st = await page.evaluate(async (pid) => (await (await fetch(`/api/v1/projects/${pid}/exports`, { credentials: "include", headers: { "x-requested-with": "creator-universe" } })).json())[0], PROJECT);
    const s = st.job?.status ?? st.status;
    if (s === "succeeded") return;
    if (s === "failed") throw new Error("render failed: " + JSON.stringify(st.job?.error ?? st));
    await page.waitForTimeout(2000);
  }
  throw new Error("render still running after 4 min " + jobId);
});

await page.click(".ed-insp [role=tab]:has-text('Effects')").catch(() => {});
await page.screenshot({ path: `${OUT}/effects-final.png` });
console.log(`\n${pass}/${pass + fail} steps passed`, errors.length ? "\npage errors: " + errors.join(" | ") : "");
await b.close();
process.exit(fail ? 1 : 0);
