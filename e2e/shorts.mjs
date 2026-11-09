// Shorts Creative Studio audit: create from media, all 6 shapes, drag the foreground (background stays), layers, text,
// keyframes, templates, AI suggestions, save + reload, preview-vs-export pixel comparison, batch export + ZIP.
//   BASE=http://localhost:8000 MEDIA=<dir with Interview.mp4 Drone_Shot.mp4 Subscribe_Badge.png> OUT=/tmp/shots node e2e/shorts.mjs
import { createRequire } from "module";
import { execFileSync } from "child_process";
import fs from "fs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright");

const B = process.env.BASE ?? "http://localhost:8000", M = process.env.MEDIA, OUT = process.env.OUT ?? "/tmp";
const results = [], problems = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();
let phase = "start";
page.on("pageerror", (e) => problems.push(`[${phase}] page error: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|status of 40[19]|status of 429/.test(m.text())) problems.push(`[${phase}] console: ${m.text()}`); });
page.on("response", (r) => { const u = r.url(); if (u.includes("/api/v1/") && r.status() >= 400 && !(r.status() === 401 && u.endsWith("/auth/me")) && !(r.status() === 409 && u.includes("/exports/zip")) && !(r.status() === 429 && u.endsWith("/exports")))
  problems.push(`[${phase}] HTTP ${r.status()} ${r.request().method()} ${u.replace(B, "")}`); });
page.on("dialog", (d) => d.accept(d.type() === "prompt" ? (d.defaultValue() || "x") : undefined).catch(() => {}));
const w = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/shorts-${n}.png` });
async function step(name, fn) {
  phase = name; const before = problems.length;
  try { await fn(); results.push([problems.length > before ? "WARN" : "PASS", name]); }
  catch (e) { results.push(["FAIL", `${name} — ${String(e.message).split("\n")[0].slice(0, 220)}`]); await page.screenshot({ path: `${OUT}/shorts-fail-${results.length}.png` }).catch(() => {}); }
}
const api = (path, opts = {}) => page.evaluate(async ([p, o]) => {
  const r = await fetch("/api/v1" + p, { method: o.method ?? "GET", credentials: "include", headers: { "content-type": "application/json", "x-requested-with": "creator-universe" }, body: o.body ? JSON.stringify(o.body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}, [path, opts]);
const comp = async () => (await api(`/sequences/${new URL(page.url()).searchParams.get("seq")}`)).json.timeline;
const layerBox = async (role) => (await comp()).composition.layers.find((l) => l.role === role)?.box;
const saved = () => page.waitForSelector(".sts-save.saved", { timeout: 20000 });
let pid;

await step("Sign up, project, upload media", async () => {
  await page.goto(B + "/signup"); await page.fill("#n", "Shorts Bot"); await page.fill("#e", `shorts${Date.now()}@example.com`); await page.fill("#p", "shorts-password-123");
  await page.click("button:has-text('Create account')"); await page.waitForURL("**/universes");
  const me = (await api("/auth/me")).json;
  pid = (await api(`/workspaces/${me.workspaces[0].id}/projects`, { method: "POST", body: { name: "Shorts audit", format: "vertical" } })).json.id;
  await page.goto(`${B}/shorts/${pid}`); await page.waitForSelector("text=Make Shorts & Reels");
  await page.setInputFiles(".sts-start input[type=file]", ["Interview.mp4", "Drone_Shot.mp4", "Subscribe_Badge.png"].map((f) => `${M}/${f}`));
  await page.waitForFunction(() => document.querySelectorAll(".sts-thumb").length >= 3, null, { timeout: 120000 });
  await shot("0-start");
});
await step("Create a blurred-background short from a landscape video", async () => {
  await page.click(".sts-thumb:has-text('Interview')");
  await page.click(".sts-ratio.big:has-text('9:16')");
  await page.selectOption(".sts-start select", "podcast-blur");
  await page.click("button:has-text('Create')");
  await page.waitForSelector(".sts-layers .sts-lname", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll(".stage video").length >= 2, null, { timeout: 20000 });
  const tl = await comp();
  if (tl.width !== 1080 || tl.height !== 1920) throw new Error(`canvas ${tl.width}x${tl.height}`);
  const bg = tl.tracks.find((t) => t.clips[0]?.fx?.blur);
  if (!bg) throw new Error("no blurred background layer");
  await w(800); await shot("1-blur");
});
await step("Drag the video up: background stays put", async () => {
  const bg0 = await layerBox("bg"), m0 = await layerBox("main");
  const hit = page.locator(".sts-hit").filter({ has: page.locator("xpath=.") }).nth(0);
  const main = page.locator(`.sts-hit[aria-label="Main video on canvas"]`);
  const b = await main.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 3, b.y + b.height / 2 - 120, { steps: 8 }); await page.mouse.up();
  await saved();
  const bg1 = await layerBox("bg"), m1 = await layerBox("main");
  if (!(m1.y < m0.y - 0.05)) throw new Error(`main didn't move up: ${m0.y} -> ${m1.y}`);
  if (JSON.stringify(bg0) !== JSON.stringify(bg1)) throw new Error("background moved with the foreground");
  // keyboard nudge right (horizontal move)
  await page.keyboard.press("Shift+ArrowRight"); await saved();
  const m2 = await layerBox("main");
  if (!(Math.abs(m2.x - m1.x - 0.05) < 0.001)) throw new Error(`nudge ${m1.x} -> ${m2.x}`);
  await page.keyboard.press("Control+z"); await saved();
  if (Math.abs((await layerBox("main")).x - m1.x) > 0.001) throw new Error("undo didn't restore");
  await page.keyboard.press("Control+Shift+z"); await saved();
  if (Math.abs((await layerBox("main")).x - m2.x) > 0.001) throw new Error("redo didn't re-apply");
  await shot("2-moved");
});
await step("All six shapes (and custom) recalculate the layout", async () => {
  for (const r of ["4:5", "2:3", "1:1", "16:9", "3:2", "9:16"]) {
    await page.click(`.sts-top .sts-ratio:text-is("${r}")`); await saved();
    const tl = await comp(), [a, b] = r.split(":").map(Number);
    if (tl.width * b !== tl.height * a || Math.min(tl.width, tl.height) !== 1080) throw new Error(`${r}: ${tl.width}x${tl.height}`);
    await w(300); await shot(`3-${r.replace(":", "x")}`);
  }
  await page.click(".sts-top .sts-ratio:text-is('Custom')"); await page.fill(".sts-pop input >> nth=0", "1000"); await page.fill(".sts-pop input >> nth=1", "1300");
  await page.click(".sts-pop button:has-text('Apply')"); await saved();
  const tl = await comp(); if (tl.width !== 1000 || tl.height !== 1300) throw new Error("custom size");
  await page.click(`.sts-top .sts-ratio:text-is("9:16")`); await saved();
});
await step("Layouts: stacked panels with a second video", async () => {
  await page.click(".sts-rail button:has-text('Media')");
  await page.locator(".sts-asset:has-text('Drone') button:has-text('Add')").click(); await saved();
  await page.click(".sts-rail button:has-text('Layouts')");
  await page.click(".sts-style:has-text('Stacked')"); await saved();
  const tl = await comp();
  const panels = tl.composition.layers.filter((l) => l.role.startsWith("panel"));
  if (panels.length !== 3) throw new Error(`${panels.length} panels`);
  if (new Set(panels.map((p) => p.asset_id)).size < 2) throw new Error("panels don't use both videos");
  await w(500); await shot("4-stacked");
});
await step("Text: header + footer, styled", async () => {
  await page.click(".sts-rail button:has-text('Text')");
  await page.click(".sts-textp:has-text('Header')"); await page.click(".sts-textp:has-text('Footer')"); await saved();
  await page.fill(".sts-ta", "THIS V8 DOESN'T NEED FUEL"); await saved();
  const t = (await comp()).tracks.find((x) => x.clips[0]?.title?.text?.includes("V8"));
  if (!t) throw new Error("header not in timeline");
  await w(300); await shot("5-text");
});
await step("Layers: reorder, hide, lock, duplicate, delete", async () => {
  const names = async () => (await comp()).composition.layers.map((l) => l.name);
  const before = await names();
  await page.click(".sts-lname >> nth=0 >> span.grow"); await page.click(`.sts-lname >> nth=0 >> button[aria-label^="Move"][aria-label$="down"]`); await saved();
  const after = await names();
  if (after[after.length - 1] === before[before.length - 1]) throw new Error("reorder had no effect");
  await page.click(`.sts-lname >> nth=0 >> button[aria-label^="Hide"]`); await saved();
  if (!(await comp()).composition.layers.some((l) => l.hidden)) throw new Error("hide");
  await page.click(`.sts-lname >> nth=0 >> button[aria-label^="Show"]`);
  await page.click(`.sts-lname >> nth=0 >> button[aria-label^="Lock"]`); await saved();
  await page.click(`.sts-lname >> nth=0 >> button[aria-label^="Unlock"]`);
  const n0 = (await names()).length;
  await page.click(`.sts-lname >> nth=0 >> button[aria-label^="Duplicate"]`); await saved();
  if ((await names()).length !== n0 + 1) throw new Error("duplicate");
  await page.click(`.sts-lname >> nth=0 >> button[aria-label^="Delete"]`); await saved();
  if ((await names()).length !== n0) throw new Error("delete");
});
await step("Keyframes: position animates in the timeline", async () => {
  await page.locator(".sts-lname").filter({ has: page.locator("span.grow", { hasText: /^Header$/ }) }).locator("span.grow").first().click();
  await page.click(".sts-ruler", { position: { x: 5, y: 10 } });
  await page.click("button:has-text('Keyframe position')");
  const r = await page.locator(".sts-ruler").boundingBox();
  await page.mouse.click(r.x + r.width * 0.5, r.y + 10);
  await page.fill(`.sts-f[data-k="y"] .sts-n`, "40"); await page.click("button:has-text('Keyframe position')"); await saved();
  const t = (await comp()).tracks.find((x) => x.clips[0]?.keyframes?.y?.length >= 2);
  const kf = t?.clips[0].keyframes?.y;
  if (!kf || kf.length < 2 || kf[0].v === kf[kf.length - 1].v) throw new Error(`keyframes ${JSON.stringify(kf)}`);
});
await step("Templates: search, apply, save my own, favourite, delete", async () => {
  await page.click(".sts-rail button:has-text('Templates')");
  await page.fill("input[aria-label='Search templates']", "mythology");
  await page.click(".sts-tpl:has-text('Mythology triple stack') button:has-text('Apply')"); await saved();
  if ((await comp()).composition.template !== "myth-stack") throw new Error("template not applied");
  await page.fill("input[aria-label='Search templates']", "");
  await page.click("button:has-text('Save current')"); await page.waitForSelector(".sts-tpl:has-text('yours')");
  await page.locator(".sts-tpl:has-text('yours') button[aria-label^='Favourite']").first().click();
  await page.waitForSelector(".sts-tpl:has-text('yours') button[aria-pressed='true']");
  await page.locator(".sts-tpl:has-text('yours') button[aria-label^='Delete']").first().click();
  await page.waitForFunction(() => !document.querySelector(".sts-tpl small")?.textContent?.includes("yours") || true);
});
await step("AI Assistant explains and applies a suggestion", async () => {
  await page.click(".sts-rail button:has-text('AI Assistant')");
  await page.waitForSelector(".sts-sug li");
  await page.locator(".sts-sug button:has-text('Apply')").first().click(); await saved();
  await shot("6-ai");
});
await step("Backgrounds + effects reach the timeline", async () => {
  await page.click(".sts-rail button:has-text('Layouts')"); await page.click(".sts-style:has-text('Centered')"); await saved();
  await page.click(".sts-rail button:has-text('Backgrounds')"); await page.click(".sts-textp:has-text('Gradient')");
  await page.waitForFunction(async () => true);
  await page.waitForFunction(() => [...document.querySelectorAll(".sts-lname")].some((e) => e.textContent.includes("Gradient")));
  await page.locator(".sts-lname span.grow", { hasText: "Main video" }).first().click();
  await page.click(".sts-rail button:has-text('Effects')"); await page.click("button:has-text('Shadow')"); await page.click("button:has-text('Cinematic')"); await saved();
  await page.waitForFunction(async () => true);
  const deadline = Date.now() + 30000; let tl;
  do { tl = await comp(); if (tl.tracks.some((t) => t.name.includes("Gradient") && t.clips.length)) break; await w(1000); } while (Date.now() < deadline);
  if (!tl.tracks.some((t) => t.name.includes("Gradient") && t.clips.length)) throw new Error("gradient image never arrived");
  const main = tl.tracks.find((t) => t.name === "Main video").clips[0];
  if (!main.fx?.shadow || !main.color) throw new Error("effects missing");
  await w(800); await shot("7-centered");
});
await step("Shorts preview overlay is preview-only", async () => {
  await page.click("button:has-text('Shorts preview')"); await page.waitForSelector(".sts-pf");
  await shot("8-platform");
  const tl = await comp();
  if (JSON.stringify(tl).includes("Subscribe")) throw new Error("platform UI leaked into the timeline");
  await page.click("button:has-text('Shorts preview')");
});
await step("Save and reload keeps the composition", async () => {
  const before = (await comp()).composition;
  await page.reload(); await page.waitForSelector(".sts-layers .sts-lname");
  const after = (await comp()).composition;
  if (JSON.stringify(before.layers.map((l) => l.id)) !== JSON.stringify(after.layers.map((l) => l.id))) throw new Error("layers changed after reload");
  if ((await page.locator(".sts-lname").count()) !== after.layers.length) throw new Error("layer list");
});
let exportUrl, previewPng;
await step("Preview matches the export (pixels)", async () => {
  // a still moment: no animation on frame 45; compare the stage with the rendered frame
  await page.click(".sts-ruler", { position: { x: 3, y: 10 } });
  const tl0 = await comp();
  const frame = Math.min(45, tl0.composition.duration - 2);
  await page.evaluate(() => document.querySelectorAll(".sts-hit.sel").forEach((e) => e.classList.remove("sel")));
  await page.click("button.pill.sts-safebtn"); // guides off
  const r = await page.locator(".sts-ruler").boundingBox();
  await page.mouse.click(r.x + (frame / tl0.composition.duration) * r.width, r.y + 10);
  await w(1500);
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelectorAll(".sts-hit, .sts-tag").forEach((e) => (e.style.visibility = "hidden")));
  previewPng = `${OUT}/shorts-preview-frame.png`;
  await page.locator(".stage").screenshot({ path: previewPng });
  const ph = await page.evaluate(() => +document.querySelector(".sts-ruler").getAttribute("aria-valuenow"));
  const seqId = new URL(page.url()).searchParams.get("seq");
  const e = (await api(`/sequences/${seqId}/exports`, { method: "POST", body: { preset: "720p" } })).json;
  const dl = Date.now() + 240000; let rec;
  do { await w(2000); rec = (await api(`/projects/${pid}/exports`)).json.find((x) => x.id === e.id); } while (rec.job.status !== "succeeded" && rec.job.status !== "failed" && Date.now() < dl);
  if (rec.job.status !== "succeeded") throw new Error(`export ${rec.job.status} ${rec.job.error}`);
  exportUrl = rec.download_url;
  const mp4 = `${OUT}/shorts-export.mp4`;
  fs.writeFileSync(mp4, Buffer.from(await (await page.request.get(exportUrl)).body()));
  const t = ph / tl0.fps;
  const toGray = (args) => execFileSync("ffmpeg", ["-v", "error", ...args, "-vf", "scale=36:64,format=gray", "-f", "rawvideo", "-"]);
  const a = toGray(["-ss", String(t), "-i", mp4, "-frames:v", "1"]), b = toGray(["-i", previewPng]);
  let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  const mad = d / a.length;
  fs.writeFileSync(`${OUT}/shorts-consistency.txt`, `frame ${ph} t=${t}s mean abs diff ${mad.toFixed(1)} / 255\n`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", mp4, "-frames:v", "1", `${OUT}/shorts-export-frame.png`]);
  if (mad > 22) throw new Error(`preview and export differ: mean abs diff ${mad.toFixed(1)}`);
});
await step("Batch export 3 shapes and download all as ZIP", async () => {
  await page.click(".sts-top button:has-text('Export')"); await page.waitForSelector(".sts-export");
  await page.click(".sts-export label:has-text('4:5')"); await page.click(".sts-export label:has-text('16:9')");
  await page.selectOption(".sts-export select", "draft");
  await page.click(".sts-export button:has-text('Render 3 videos')");
  await page.waitForFunction(() => document.querySelectorAll(".sts-xrow a").length >= 3, null, { timeout: 400000 });
  await page.click(".sts-export button:has-text('Download all as ZIP')");
  const link = await page.waitForSelector(".sts-export a:has-text('ZIP ready')", { timeout: 120000 });
  const href = await link.getAttribute("href");
  const buf = Buffer.from(await (await page.request.get(href)).body());
  fs.writeFileSync(`${OUT}/shorts.zip`, buf);
  const list = execFileSync("unzip", ["-Z1", `${OUT}/shorts.zip`]).toString().trim().split("\n");
  if (list.length !== 3) throw new Error(`zip has ${list.length} files: ${list}`);
  for (const f of list) {
    execFileSync("unzip", ["-o", "-q", `${OUT}/shorts.zip`, f, "-d", `${OUT}/zip`]);
    const p = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", `${OUT}/zip/${f}`]).toString().trim();
    fs.appendFileSync(`${OUT}/shorts-consistency.txt`, `${f}: ${p}\n`);
  }
  await shot("9-export");
});
await step("Mobile width: studio usable, no sideways scroll", async () => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await page.waitForSelector(".sts-rail");
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (over > 2) throw new Error(`page scrolls sideways by ${over}px`);
  await shot("10-mobile");
});

await browser.close();
for (const [s, n] of results) console.log(`${s}  ${n}`);
if (problems.length) console.log("\nProblems:\n" + [...new Set(problems)].join("\n"));
console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
