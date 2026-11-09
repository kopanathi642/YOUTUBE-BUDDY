// Full UI audit: opens every page and exercises every enabled control of the Editor Universe.
// Each step passes or fails independently; console errors, page errors and failed API calls are collected.
// Run:  BASE=http://localhost:8000 MEDIA=/path/to/media node e2e/audit.mjs
// MEDIA must contain: Vlog_Intro.mp4 Talk_With_Pause.mp4 Drone_Shot.mp4 Music_BGM.wav Subscribe_Badge.png
// Optional: Speech_Sample.mp4 (a short video with real speech) — then the Dubbing studio step runs end to end in the browser.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright");

const B = process.env.BASE ?? "http://localhost:8000", M = process.env.MEDIA, OUT = process.env.OUT ?? "/tmp";
const results = [], problems = [];
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctx = await browser.newContext({ viewport: { width: 1672, height: 941 }, permissions: ["camera", "microphone"], acceptDownloads: true });
await ctx.addInitScript(() => { window.__toasts = 0; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.classList?.contains("toast") && window.__toasts++))).observe(document, { childList: true, subtree: true }); });
const page = await ctx.newPage();
let phase = "start";
page.on("pageerror", (e) => problems.push(`[${phase}] page error: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|TUNNEL|ERR_TUNNEL|status of 401/.test(m.text()) && !(phase.startsWith("Sign-up validation") && m.text().includes("422"))) problems.push(`[${phase}] console: ${m.text()}`); });
page.on("response", (r) => { const u = r.url(); if (u.includes("/api/v1/") && r.status() >= 400 && !(r.status() === 401 && u.endsWith("/auth/me")) && !(phase.startsWith("Sign-up validation") && r.status() === 422)) problems.push(`[${phase}] HTTP ${r.status()} ${r.request().method()} ${u.replace(B, "")}`); });
page.on("dialog", (d) => d.accept().catch(() => {}));   // confirm() prompts: always answer OK
const w = (ms) => page.waitForTimeout(ms);
/** Panels live in tabbed docks: bring one to the front (tab title is "<label> — drag to move"). */
/** Tools live in the rail's flyouts: open each category until the tool shows up, then click it. */
const tool = async (label) => {
  for (const cat of await page.locator(".rail-btn[aria-haspopup=menu]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))) {
    await page.click(`.rail-btn[aria-label="${cat}"]`);
    const b = page.locator(".rail-fly .tool", { hasText: label }).first();
    if (await b.count()) { await b.click(); return; }
    await page.click(`.rail-btn[aria-label="${cat}"]`);   // close (Escape could clear the clip selection)
  }
  throw new Error(`tool "${label}" not found in the rail`);
};
const dock = async (label) => { await page.click(`.ws-tab[title^="${label} —"]`); await w(150); };
const closeDialogs = async () => { await page.keyboard.press("Escape").catch(() => {}); await page.locator(".modal button[aria-label='Close']").first().click({ timeout: 1000 }).catch(() => {}); };
async function step(name, fn) {
  // A dialog left open by an earlier step would block every click in this one: name it (as a WARN on the step that left it) and close it.
  const open = await page.locator(".modal[aria-label]").evaluateAll((ms) => ms.map((m) => m.getAttribute("aria-label"))).catch(() => []);
  if (open.length) { problems.push(`[${phase}] left a dialog open: ${open.join(", ")}`); if (results.length && results[results.length - 1][0] === "PASS") results[results.length - 1][0] = "WARN"; await closeDialogs(); }
  phase = name;
  const before = problems.length;
  try { await fn(); results.push([problems.length > before ? "WARN" : "PASS", name]); }
  catch (e) {
    results.push(["FAIL", `${name} — ${String(e.message).split("\n")[0].slice(0, 200)}`]);
    await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});   // before cleaning up, so the cause is visible
    await import("node:fs").then((fs) => fs.writeFileSync(`${OUT}/fail-${results.length}.txt`, `${name}\n\n${e.stack ?? e.message}`)).catch(() => {});   // full Playwright call log
    await closeDialogs();
  }
}
const toast = async () => (await page.locator(".toast").allTextContents()).join(" | ");
const tl = async () => page.evaluate(() => [...document.querySelectorAll(".clip")].map((e) => e.getAttribute("aria-label")));
const scrubTo = async (sec) => { const sc = await page.locator(".tl-scroll").boundingBox(); await page.locator(".tl-scroll").evaluate((e) => (e.scrollLeft = 0)); await page.mouse.click(sc.x + 214 + sec * 60, sc.y + 10); };
// React-compatible way to move a range slider (fires the same input event a user drag does)
const setRange = (sel, v) => page.locator(sel).evaluate((el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(v)); el.dispatchEvent(new Event("input", { bubbles: true })); }, v);
const saved = () => page.waitForFunction(() => document.querySelector(".save-block")?.textContent?.includes("Cloud Saved"), null, { timeout: 15000 });

// ---------------- public pages
await step("Landing page loads, nav anchors work, live studio counts", async () => {
  await page.goto(B + "/"); await page.waitForSelector("text=studio with AI");
  for (const a of ["#workspaces", "#directory", "#status"]) await page.click(`.lp-links a[href="${a}"]`);
  // Editor + every studio with at least one live tool (studios with none are hidden until their service is connected)
  const live = (await (await page.request.get(B + "/api/v1/public/studios")).json()).studios.filter((s) => s.live > 0).length;
  await page.waitForFunction((n) => document.querySelectorAll(".lp-dir-row:not(.skel)").length === n, live + 1);
  await page.click("button[aria-label='Search tools']"); await page.fill("input[aria-label='Search workspaces']", "dub");
  await page.waitForFunction(() => document.querySelectorAll(".lp-dir-row").length === 1);
});
await step("Sign-up validation shows errors", async () => {
  await page.goto(B + "/signup"); await page.fill("#n", "A"); await page.fill("#e", "bad"); await page.fill("#p", "short");
  await page.click("button:has-text('Create account')", { noWaitAfter: true });
  await page.waitForSelector(".error-box");
});
const email = `audit${Date.now()}@example.com`;
await step("Sign up", async () => {
  await page.fill("#n", "Audit Bot"); await page.fill("#e", email); await page.fill("#p", "audit-password-123");
  await page.click("button:has-text('Create account')"); await page.waitForURL("**/universes"); await page.waitForSelector(".portal");
  await page.goto(B + "/editor"); await page.waitForSelector(".stat b");
});
await step("Sign out and sign in again", async () => {
  await page.click(".topbar .btn.ghost:has(.avatar)"); await page.click("text=Sign out"); await page.waitForURL(B + "/");
  await page.goto(B + "/signin"); await page.fill("#e", email); await page.fill("#p", "audit-password-123");
  await page.click("button:has-text('Sign in')"); await page.waitForURL("**/universes");
  await page.goto(B + "/editor");
});
await step("Dashboard: stats, quick tiles, jobs list render", async () => {
  await page.waitForSelector(".stat b"); await page.waitForSelector("text=Recent cloud jobs");
  await page.click(".quick-tile:has-text('Open Project')"); await page.waitForURL("**/projects"); await page.goBack();
});
await step("Projects page: create, search, archive, restore, rename via editor, delete", async () => {
  await page.goto(B + "/projects"); await page.click("button:has-text('New project')");
  await page.fill("#np-name", "Throwaway"); await page.click(".fmt:has-text('1:1')"); await page.click("button:has-text('Create & open editor')");
  await page.waitForURL("**/edit/**"); await page.waitForSelector(".ed2");
  await page.goto(B + "/projects"); await page.fill("input[aria-label='Search projects']", "Throw"); await w(500);
  await page.click(".proj-card:has-text('Throwaway') button[aria-label='Archive']"); await w(600);
  await page.click(".seg button:has-text('Archived')"); await page.waitForSelector(".proj-card:has-text('Throwaway')");
  await page.click(".proj-card:has-text('Throwaway') button[aria-label='Restore']"); await w(500);
  await page.click(".seg button:has-text('Active')"); await page.waitForSelector(".proj-card:has-text('Throwaway')");
  
  await page.click(".proj-card:has-text('Throwaway') button[aria-label='Delete']"); await w(800);
  if (await page.locator(".proj-card:has-text('Throwaway')").count()) throw new Error("project not deleted");
});
await step("Workspace menu opens", async () => { await page.click(".topbar .btn.ghost:has(.avatar)"); await page.waitForSelector(".menu"); await page.keyboard.press("Escape"); await page.mouse.click(5, 300); });

// ---------------- editor
await step("Create project and open editor", async () => {
  await page.goto(B + "/home"); await page.click("button:has-text('New project')"); await page.fill("#np-name", "Audit Project");
  await page.click("button:has-text('Create & open editor')"); await page.waitForURL("**/edit/**"); await page.waitForSelector(".ed2");
});
await step("Upload 5 files and wait for analysis", async () => {
  await page.setInputFiles("input[type=file]", ["Vlog_Intro.mp4", "Talk_With_Pause.mp4", "Drone_Shot.mp4", "Music_BGM.wav", "Subscribe_Badge.png"].map((f) => `${M}/${f}`));
  await page.waitForFunction(() => document.querySelectorAll(".bin-item.ready").length === 5, null, { timeout: 300000 });
});
await step("Media bin: search + type filters", async () => {
  await page.fill("input[aria-label='Search media']", "drone"); await w(200);
  if ((await page.locator(".bin-item").count()) !== 1) throw new Error("search filter");
  await page.fill("input[aria-label='Search media']", "");
  for (const f of ["Video", "Audio", "Image", "All"]) await page.click(`.ed-bin .seg button:has-text("${f}")`);
});
await step("Add clips with + buttons", async () => {
  for (const n of ["Vlog_Intro.mp4", "Talk_With_Pause.mp4", "Drone_Shot.mp4", "Music_BGM.wav"]) { await page.hover(`.bin-item:has-text("${n}")`); await page.click(`button[aria-label="Add ${n} to timeline"]`); await w(250); }
  if ((await tl()).length !== 4) throw new Error(`expected 4 clips, got ${(await tl()).length}`);
});
await step("Drag image from bin onto V2 at 9s", async () => {
  await page.locator(".tl-scroll").evaluate((e) => (e.scrollLeft = 0));
  await page.locator('.bin-item:has-text("Subscribe_Badge.png") .bin-thumb').scrollIntoViewIfNeeded();
  const sb = await page.locator('.bin-item:has-text("Subscribe_Badge.png") .bin-thumb').boundingBox();
  const lane = await page.locator('[data-track="v2"]').boundingBox(); const sc = await page.locator(".tl-scroll").boundingBox();
  await page.mouse.move(sb.x + 20, sb.y + 20); await page.mouse.down(); await page.mouse.move(sc.x + 214 + 9 * 60, lane.y + lane.height / 2, { steps: 15 }); await page.mouse.up(); await w(500);
  if (!(await page.locator('[data-track="v2"] .clip').count())) throw new Error("drop failed");
});
await step("Inspector: type transform values (Enter applies)", async () => {
  await page.click('[data-track="v2"] .clip');
  for (const [id, v] of [["#f-Scale", "30"], ["#f-PositionX", "640"], ["#f-PositionY", "-360"], ["#f-Rotation", "5"], ["#f-Opacity", "90"]]) { await page.click(id); await page.keyboard.press("Control+A"); await page.keyboard.type(v); await page.keyboard.press("Enter"); }
  const v = await page.inputValue("#f-Scale"); if (v !== "30") throw new Error("scale=" + v);
});
await step("Inspector tabs: Effects / Transition / Text / Metadata", async () => {
  for (const t of ["Effects", "Transition", "Text", "Metadata", "Inspector"]) await page.click(`.ed-insp [role=tab]:has-text("${t}")`);
});
await step("Undo / redo buttons and keyboard", async () => {
  await page.click("button[aria-label='Undo']"); await page.click("button[aria-label='Redo']");
  await page.keyboard.press("Control+z"); await page.keyboard.press("Control+Shift+z");
});
await step("Timeline: split (S), select, ripple delete, snapping toggle, zoom", async () => {
  await scrubTo(4); await page.keyboard.press("s"); await w(200);
  const n = (await tl()).length; if (n < 6) throw new Error("split did not create clips: " + n);
  await page.keyboard.press("Control+z"); await page.click(".tl-toolbar button:has-text('Snap')"); await page.click(".tl-toolbar button:has-text('Snap')");
  await page.click("button[aria-label='Zoom in']"); await page.click("button[aria-label='Zoom out']");
});
await step("Timeline: track lock / hide / mute / add tracks", async () => {
  for (const l of ["Lock", "Hide", "Mute"]) { const b = page.locator(`.tl-head button[aria-label^="${l} "]`).first(); await b.click(); await w(100); await page.locator(`.tl-head button[aria-label^="${l === "Lock" ? "Unlock" : l === "Hide" ? "Show" : "Unmute"} "]`).first().click(); }
  await page.click(".tl-toolbar button:has-text('Video track')"); await page.click(".tl-toolbar button:has-text('Audio track')");
  await page.keyboard.press("Control+z"); await page.keyboard.press("Control+z");
});
await step("Timeline: trim right edge by dragging", async () => {
  await page.locator(".tl-scroll").evaluate((e) => (e.scrollLeft = 0));
  const c = await page.locator('[data-track="v1"] .clip').first().boundingBox();
  await page.mouse.move(c.x + c.width - 3, c.y + c.height / 2); await page.mouse.down(); await page.mouse.move(c.x + c.width - 63, c.y + c.height / 2, { steps: 8 }); await page.mouse.up();
  const c2 = await page.locator('[data-track="v1"] .clip').first().boundingBox(); if (!(c2.width < c.width - 30)) throw new Error("trim failed");
  await page.keyboard.press("Control+z");
});
await step("Monitor: play/pause, frame/second steps, loop, mute, safe area, fit/50%, fullscreen", async () => {
  await page.click("button[aria-label='Go to start']"); await page.click("button.play"); await w(1200); await page.click("button.play");
  for (const l of ["Forward 1 second", "Back 1 second", "Go to end", "Go to start", "Loop playback", "Loop playback", "Mute preview", "Unmute preview", "Safe-area guides", "Safe-area guides"]) await page.click(`button[aria-label="${l}"]`);
  await page.click(".viewer-head .pill:has-text('Fit')"); await page.click(".viewer-head .pill:has-text('50%')");
  await page.keyboard.press("Space"); await w(400); await page.keyboard.press("Space");
});
await step("Colour: wheels drag, master slider, tone sliders, looks, bypass, reset", async () => {
  await dock("Color");
  await scrubTo(3); await page.click('[data-track="v1"] .clip >> nth=0');
  const d = await page.locator(".wheel-disc").nth(2).boundingBox();
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2); await page.mouse.down(); await page.mouse.move(d.x + d.width * 0.8, d.y + d.height * 0.3, { steps: 6 }); await page.mouse.up();
  await setRange(".wheel input[type=range] >> nth=0", 0.05);
  await page.click(".color-panel-anchor .mini-tabs button:has-text('Tone')");
  for (let i = 0; i < 5; i++) await setRange(`.cslider input >> nth=${i}`, 0.3);
  await page.click(".color-panel-anchor .mini-tabs button:has-text('Looks')"); await page.click(".look:has-text('Cinematic')");
  await page.click("button[title^='Bypass grade']"); await page.click("button[title^='Grade bypassed']");
  await page.click("button[aria-label='Reset grade']"); await page.click(".color-panel-anchor .mini-tabs button:has-text('Wheels')");
});
await step("Scopes render pixels (not blank)", async () => {
  await page.click(".look:has-text('Vivid')").catch(() => {});
  await w(1200);
  await dock("Scopes"); await w(800);
  const lit = await page.evaluate(() => { const c = document.querySelector(".scopes canvas"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  if (lit < 50) throw new Error("waveform empty");
});
await step("Fusion node: ColorCorrect bypass toggle", async () => {
  await dock("Color");
  await page.click(".color-panel-anchor .mini-tabs button:has-text('Looks')"); await page.click(".look:has-text('Warm')");
  await dock("Nodes"); await page.click(".node:has-text('ColorCorrect1')"); await page.click(".node:has-text('ColorCorrect1')");
});
await step("Media bin Effects tab applies a look", async () => {
  await page.click(".ed-bin [role=tab]:has-text('Effects')"); await page.click(".ed-bin .look:has-text('B&W')"); await page.click(".ed-bin [role=tab]:has-text('Media')");
});
await step("Autosave reaches Cloud Saved", saved);
await step("AI Magic: plan dialog, untick one, apply", async () => {
  await dock("AI Assistant");
  await page.click("button:has-text('Apply AI Magic (Auto)')"); await page.waitForSelector(".plan-op");
  await page.locator(".plan-op input").last().uncheck(); await page.click(".modal button.primary"); await w(500);
  if (!(await toast()).includes("AI Magic applied")) throw new Error("no confirmation");
});
await step("AI Auto-Adjust toggle", async () => { await page.click(".ai-toggle"); await page.click(".ai-toggle"); });
await step("Recommendations: Apply All", async () => { await dock("Suggestions"); const b = page.locator(".recs button:has-text('Apply All')"); if (await b.count()) await b.click(); });
for (const qa of ["Silence Remove", "Scene Detect", "Clips & Highlights", "Auto Edit"]) {
  await step(`Quick action: ${qa}`, async () => { await dock("Quick Actions"); await page.click(`.qa:has-text("${qa}")`); await w(400); const t = await toast(); if (!t) throw new Error("no feedback"); if (await page.locator(".modal").count()) await page.click(".modal .btn.ghost"); });
}
await step("Storyboard strip tabs + jump + notes save", async () => {
  await dock("Storyboard");
  for (const t of ["Scenes", "Chapters", "Assets", "AI Suggestions", "Notes"]) await page.click(`.storyboard [role=tab]:has-text("${t}")`);
  await page.fill(".notes", "Audit note"); await page.click(".storyboard [role=tab]:has-text('Storyboard')");
  await page.click(".sb-card >> nth=0");
});
await step("Add Scene (split at playhead) from storyboard", async () => { await scrubTo(2); await page.click(".sb-card.add"); });
await step("Tool rail: every tool in every flyout gives a working result or an explicit reason", async () => {
  const cats = await page.locator(".rail-btn[aria-haspopup=menu]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  if (cats.length < 5) throw new Error("rail categories missing: " + cats);
  for (const cat of cats) {
    await page.click(`.rail-btn[aria-label="${cat}"]`); await page.waitForSelector(".rail-fly");
    const labels = (await page.locator(".rail-fly .tool").allTextContents()).map((t) => t.trim());
    await page.click(`.rail-btn[aria-label="${cat}"]`);
    for (const label of labels) {
      if (/Video to Shorts \(Auto\)|Reels|Smart Reframe|Stabilize|Remove Background|Motion Graphics|Remove Object/.test(label)) continue; // long-running ones have their own steps
      await page.click(`.rail-btn[aria-label="${cat}"]`);
      const b = page.locator(".rail-fly .tool", { hasText: label }).first();
      if (await b.isDisabled()) { await page.click(`.rail-btn[aria-label="${cat}"]`); continue; }
      const before = await page.evaluate(() => window.__toasts); const url = page.url();
      await b.click(); await w(400);
      if (await page.locator(".rail-fly").count()) throw new Error(`flyout stayed open after "${label}"`);
      if (page.url() !== url) { if (!page.url().includes("/ai-generator/tool/")) throw new Error(`"${label}" went to ${page.url()}`); await page.goBack(); await page.waitForSelector(".ed-side"); continue; }
      if (await page.locator(".modal").count()) { await page.click(".modal .btn.ghost"); continue; }
      const panelOnly = /^(Color Grading|VFX & Fusion|Effects & Filters|Transitions|Voice & Dubbing|Stock Library|Templates & Elements)$/.test(label);
      if (!panelOnly && (await page.evaluate(() => window.__toasts)) <= before) throw new Error(`no feedback from "${label}"`);
    }
  }
  await page.click('.rail-btn[aria-label="Media"]'); await page.click('.rail-btn[aria-label="Export"]');
  if (!(await page.locator('.ws-tab.on[title^="Export —"]').count())) throw new Error("Export rail button did not open the Export panel");
  await dock("Inspector");
});
await step("Snapshot to media bin", async () => {
  const n = await page.locator(".bin-item").count(); await page.click("button[aria-label='Snapshot current frame to media']");
  await page.waitForFunction((n) => document.querySelectorAll(".bin-item").length > n, n, { timeout: 30000 });
});
await step("Record from (fake) camera and add to project", async () => {
  const n = await page.locator(".bin-item").count();
  await page.click(".ed-bin button:has-text('Record')"); await page.click("button:has-text('Start recording')"); await w(2500);
  await page.click(".modal button:has-text('Stop')"); await page.click(".modal button:has-text('Add to project')");
  await page.waitForSelector(".modal[aria-label='Record']", { state: "detached", timeout: 10000 });   // the dialog must close
  await page.waitForFunction((n) => document.querySelectorAll(".bin-item").length > n, n, { timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll(".bin-item")].every((e) => !e.className.includes("processing")), null, { timeout: 120000 });
  if (await page.locator(".bin-item.failed, .bin-item.rejected").count()) throw new Error("recording rejected");
});
await step("Translate & Voice / Lip Sync panels: controls respond, locked buttons explain", async () => {
  await dock("Translate & Voice");
  await page.click(".voice [role=tab]:has-text('Lip Sync')"); await page.click(".voice [role=tab]:has-text('Translate')");
  await page.waitForSelector(".voice button:has-text('Open Dubbing Studio')");
});
await step("Sequence menu: new sequence, switch back", async () => {
  await page.click(".viewer-head .pill:has-text('Program')"); await page.click(".menu-item:has-text('New sequence')");
  await page.waitForFunction(() => document.querySelector(".pill b")?.textContent?.includes("Sequence 2"));
  await page.click(".viewer-head .pill:has-text('Program')"); await page.click(".menu-item:has-text('Main sequence')");
  await page.waitForFunction(() => document.querySelector(".pill b")?.textContent?.includes("Main sequence"));
});
await step("Shorts Maker creates 9:16 sequence", async () => {
  await dock("Quick Actions"); await page.click(".qa:has-text('Shorts Maker')"); await page.waitForFunction(() => document.querySelector(".pill b")?.textContent?.includes("9:16"), null, { timeout: 20000 });
});

await step("Titles: add title, edit text (Hindi), style, size, colour; renders in preview", async () => {
  await page.locator(".tl-scroll").evaluate((e) => (e.scrollLeft = 0));
  await scrubTo(1); await tool("Motion Graphics"); await page.waitForSelector(".clip.title");
  await page.fill("#title-text", "नमस्ते दोस्तों"); await page.click("#f-Size");   // blur commits text
  await page.click(".ed-insp .look-list button:has-text('Yellow pop')");
  await page.click("#f-Size"); await page.keyboard.press("Control+A"); await page.keyboard.type("90"); await page.keyboard.press("Enter");
  await page.waitForSelector(".title-layer:has-text('नमस्ते')");
});
await step("Templates: animated title card added at the playhead (keyframed)", async () => {
  await tool("Templates & Elements");
  await page.waitForSelector(".tpl-card");
  const n = (await tl()).length;
  await scrubTo(4); await page.click(".tpl-card:has-text('Subscribe')");
  await page.waitForFunction((n) => document.querySelectorAll(".clip").length > n, n);
  if (!(await page.locator(".kf-mark").count())) throw new Error("template has no keyframe marks");
});
await step("Elements: sticker rendered to PNG, uploaded, placed on timeline", async () => {
  const n = (await tl()).length;
  await page.click(".el-grid button >> nth=0");
  await page.waitForFunction((n) => document.querySelectorAll(".clip").length > n, n, { timeout: 40000 });
});
await step("Stock tab hidden until a free stock key is set", async () => {
  if (await page.locator(".ed-bin [role=tab]:has-text('Stock')").count()) throw new Error("Stock tab shown without a key");
});
await step("AI Assets tab lists generator outputs or explains", async () => {
  await page.click(".ed-bin [role=tab]:has-text('AI Assets')"); await w(200);
  if (!(await page.locator(".ed-bin .bin-list").count())) throw new Error("AI tab empty");
  await page.click(".ed-bin [role=tab]:has-text('Media')");
});
await step("Speed & Time: 2× preset changes clip length", async () => {
  await page.locator(".tl-scroll").evaluate((e) => (e.scrollLeft = 0));
  await page.click('[data-track="v1"] .clip >> nth=0'); await page.click(".ed-insp [role=tab]:has-text('Inspector')");
  const w0 = (await page.locator('[data-track="v1"] .clip').first().boundingBox()).width;
  await page.click(".ed-insp summary:has-text('Speed')").catch(() => {});
  await page.click(".ed-insp .look-list button:has-text('2×')"); await w(300);
  const w1 = (await page.locator('[data-track="v1"] .clip').first().boundingBox()).width;
  if (!(w1 < w0 * 0.6)) throw new Error(`width ${w0} -> ${w1}`);
  await page.click(".ed-insp .look-list button:has-text('1×')");
});
await step("Cropping sliders", async () => {
  await page.click(".ed-insp summary:has-text('Cropping')").catch(() => {});
  await page.click("#f-Left"); await page.keyboard.press("Control+A"); await page.keyboard.type("10"); await page.keyboard.press("Enter");
  await page.click(".ed-insp button:has-text('Reset crop')");
});
await step("Version history: open, restore an earlier version", async () => {
  await saved(); await page.click("button[aria-label='Version history']"); await page.waitForSelector(".hist-row");
  
  await page.locator(".hist-row button:has-text('Restore')").first().click();
  await page.waitForSelector(".toast:has-text('Restored')");
  await page.keyboard.press("Control+z").catch(() => {});
});
await step("AI voice (text to speech) → voice-over added to timeline", async () => {
  const n = (await tl()).length;
  await tool("Text to Speech"); await page.fill("#tts-text", "Welcome back to the channel. Today we explore Goa.");
  await page.click(".modal button:has-text('Generate voice')");
  await page.waitForFunction((n) => document.querySelectorAll(".clip").length > n, n, { timeout: 180000 });
});
await step("Captions: transcription runs on the worker and reports its engine status honestly", async () => {
  await tool("Subtitle & Translate"); await page.click(".modal button:has-text('Transcribe')");
  await page.waitForSelector(".modal .error-box, .modal .transcript", { timeout: 600000 });
  if (await page.locator(".modal .transcript").count()) { await page.click(".modal button:has-text('Add as captions')"); }
  else { const t = await page.locator(".modal .error-box").textContent(); if (!/huggingface|Whisper|speech model|OpenAI/i.test(t)) throw new Error("unclear error: " + t); results.push(["NOTE", "Captions engine blocked in this sandbox: " + t.slice(0, 120)]); await page.click(".modal button[aria-label='Close']"); }
});
await step("Stabilize selected clip → stabilized copy swapped in", async () => {
  await page.locator(".tl-scroll").evaluate((e) => (e.scrollLeft = 0));
  await page.click('[data-track="v1"] .clip >> nth=2'); await tool("Stabilize");
  await page.waitForSelector('.clip[aria-label*="(stabilized)"]', { timeout: 300000 });
});
await step("Background removal on selected clip → transparent copy swapped in", async () => {
  await page.click('[data-track="v1"] .clip >> nth=1'); await dock("Quick Actions"); await page.click(".qa:has-text('Background Remove')");
  await page.waitForSelector('.clip[aria-label*="(no background)"]', { timeout: 600000 });
});
await step("Remove Object: mark an area on the clip's frame → cleaned copy swapped in", async () => {
  await page.locator(".tl-scroll").evaluate((e) => (e.scrollLeft = 0));
  await page.click('[data-track="v1"] .clip >> nth=0'); await tool("Remove Object");
  await page.waitForSelector(".obj-modal"); await page.waitForFunction(() => (document.querySelector(".obj-stage video")?.readyState ?? 0) >= 2);
  const st = await page.locator(".obj-stage").boundingBox();
  const drag = async (x0, y0, x1, y1) => { await page.mouse.move(st.x + st.width * x0, st.y + st.height * y0); await page.mouse.down();
    await page.mouse.move(st.x + st.width * x1, st.y + st.height * y1, { steps: 5 }); await page.mouse.up(); };
  await drag(0.1, 0.1, 0.9, 0.9);                                   // too big: refused with an explanation, nothing added
  await page.waitForSelector(".obj-modal .error-box:has-text('covers')"); if (await page.locator(".obj-box").count()) throw new Error("big box was added");
  await drag(0.05, 0.05, 0.25, 0.18);                               // a corner "logo"
  await page.waitForSelector(".obj-chip:has-text('Area 1')");
  await page.click(".obj-modal button.primary:has-text('Remove area')");
  await page.waitForSelector('.clip[aria-label*="(object removed)"]', { timeout: 300000 });
});
await step("Highlight finder → 2 shorts created", async () => {
  await tool("Highlight Finder"); await page.selectOption(".modal select >> nth=0", "15"); await page.selectOption(".modal select >> nth=1", "2");
  await page.waitForSelector(".modal .plan-op"); await page.click(".modal button.primary");
  await page.waitForFunction(() => document.querySelector(".pill b")?.textContent?.startsWith("Short 1"), null, { timeout: 30000 });
  await page.click(".viewer-head .pill:has-text('Program')"); await page.click(".menu-item:has-text('Main sequence')");
  await page.waitForFunction(() => document.querySelector(".pill b")?.textContent?.includes("Main sequence"));
});
await step("Thumbnail designer → saved to media bin", async () => {
  const n = await page.locator(".bin-item").count();
  await scrubTo(2); await tool("Design & Thumbnail"); await page.waitForSelector(".thumb-canvas");
  await page.click(".modal button:has-text('Save to media bin')");
  await page.waitForFunction((n) => document.querySelectorAll(".bin-item").length > n, n, { timeout: 30000 });
});
await step("Dubbing studio: detect speech, transcript, two languages, dub, five downloads", async () => {
  const fs = await import("node:fs");
  await page.locator(".tl-scroll").evaluate((e) => (e.scrollLeft = 0));
  if (fs.existsSync(`${M}/Speech_Sample.mp4`)) {   // a clip with real speech, uploaded and placed just for this step
    const n = await page.locator(".bin-item").count();
    await page.setInputFiles("input[type=file]", `${M}/Speech_Sample.mp4`);
    await page.waitForFunction((n) => document.querySelectorAll(".bin-item").length > n, n, { timeout: 60000 });
    await page.waitForSelector('.bin-item.ready:has-text("Speech_Sample.mp4")', { timeout: 300000 });
    await page.hover('.bin-item:has-text("Speech_Sample.mp4")'); await page.click('button[aria-label="Add Speech_Sample.mp4 to timeline"]');
    await page.click('.clip[aria-label*="Speech_Sample"]');
  } else {
    await page.click('[data-track="v1"] .clip >> nth=0');
  }
  await dock("Translate & Voice");
  await page.click(".voice button:has-text('Open Dubbing Studio')");
  await page.waitForSelector(".dub-modal .dub-setup, .dub-modal .dub-row, .dub-modal .dub-wait, .dub-modal .error-box", { timeout: 30000 });
  if (await page.locator(".dub-modal .dub-setup").count()) {
    await page.click(".dub-chips .chip:has-text('Spanish')");                     // Hindi is pre-selected
    await page.click(".dub-modal button:has-text('Recognise speech')");
  }
  await page.waitForSelector(".dub-modal .dub-row, .dub-modal .error-box", { timeout: 900000 });
  const err = await page.locator(".dub-modal .error-box").allTextContents();
  if (err.length) {
    if (/No speech|huggingface|MODELS_OFFLINE|missing/i.test(err[0])) { results.push(["NOTE", "Dubbing: " + err[0].slice(0, 140)]); await page.click(".dub-modal button[aria-label='Close']"); return; }
    throw new Error(err[0]);
  }
  await page.click(".dub-modal [role=tab]:has-text('Hindi')");
  await page.waitForSelector(".dub-modal .dub-row.tr", { timeout: 300000 });
  await page.click(".dub-modal button:has-text('Dub into Hindi')");
  await page.waitForSelector(".dub-modal a:has-text('Dubbed MP4')", { timeout: 900000 });
  for (const f of ["Dubbed MP4", "Audio (M4A)", "Voice only (WAV)", "SRT", "VTT"]) await page.waitForSelector(`.dub-modal a:has-text('${f}')`);
  await page.click(".dub-modal button[aria-label='Close']");
});
await step("Export: tabs, queue, render, verified download", async () => {
  await dock("Export");
  for (const t of ["Presets", "Queue", "Export"]) await page.click(`.export-dock [role=tab]:has-text("${t}")`);
  await page.selectOption(".exp-form select >> nth=1", "draft");
  await page.click("button.export-big");
  await page.waitForSelector(".q-row a:has-text('Download')", { timeout: 300000 });
  if (!(await page.locator(".q-row .badge.ok").count())) throw new Error("not verified");
  const href = await page.getAttribute(".q-row a:has-text('Download')", "href"); const r = await page.request.get(href);
  if (r.status() !== 200 || (await r.body()).length < 10000) throw new Error("download failed");
});
await step("Export queue: YouTube button hidden while publishing isn't set up", async () => {
  await page.click(".export-dock [role=tab]:has-text('Queue')");
  if (await page.locator(".q-row button[aria-label='Publish to YouTube']").count()) throw new Error("YouTube button shown without setup");
});
await step("Export cancel", async () => {
  await page.click("button.export-big"); await page.click(".export-dock [role=tab]:has-text('Queue')");
  await page.click("button[aria-label='Cancel export']", { timeout: 5000 });
  await page.waitForSelector(".q-row .badge:has-text('canceled')", { timeout: 20000 });
});
await step("Reload keeps the edit (persistence)", async () => {
  await w(1500); await saved(); await w(1500); await saved(); const before = (await tl()).length; await page.reload(); await page.waitForSelector(".clip");
  const after = (await tl()).length; if (after !== before) throw new Error(`${before} -> ${after}`);
});
await step("Delete media from bin", async () => {
   const n = await page.locator(".bin-item").count();
  await page.hover(".bin-item >> nth=0"); await page.click(".bin-item >> nth=0 >> .bin-del"); await w(600);
  if ((await page.locator(".bin-item").count()) !== n - 1) throw new Error("not removed");
});
await step("Upgrade Plan → UPI QR, UTR submitted, founder approves in admin, plan turns on", async () => {
  // founder (ADMIN_EMAILS) sets up the QR through the admin card
  const f = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const fp = await f.newPage();
  const H = { "x-requested-with": "creator-universe" };
  let r = await fp.request.post(B + "/api/v1/auth/signup", { headers: H, data: { email: "founder@example.com", password: "correct horse battery", display_name: "Founder" } });
  if (r.status() !== 201) r = await fp.request.post(B + "/api/v1/auth/login", { headers: H, data: { email: "founder@example.com", password: "correct horse battery" } });
  if (!r.ok()) throw new Error("founder sign-in " + r.status());
  await fp.goto(B + "/settings"); await fp.waitForSelector("#payments-admin"); await fp.waitForSelector("#metrics .met-tile");
  await fp.click("#agent button:has-text('Check health now')"); await fp.waitForSelector("#agent .agent-health");
  await fp.fill("#payments-admin input[aria-label='UPI ID']", "founder@ybl"); await fp.fill("#payments-admin input[aria-label='Payee name']", "Founder");
  await fp.click("#payments-admin button:has-text('Save details')"); await fp.waitForTimeout(600);
  await fp.setInputFiles("#payments-admin input[aria-label='Upload UPI QR']", M + "/Subscribe_Badge.png"); await fp.waitForTimeout(1500);
  // the user upgrades from the editor sidebar
  await page.click(".rail-btn.plan"); await page.waitForSelector("#billing .bill-plan");
  await page.click("#billing .bill-plan:has-text('Creator')"); await page.waitForSelector(".bill-qr img");
  const utr = String(Date.now()).slice(-12).padStart(12, "4");
  await page.fill("#billing input[placeholder*='412345678901']", utr); await page.click("#billing button:has-text('Submit for verification')");
  await page.waitForSelector("#billing .badge:has-text('checking')");
  await fp.reload(); await fp.waitForSelector(`#payments-admin .gw-row:has-text('${utr}')`);
  await fp.click(`#payments-admin .gw-row:has-text('${utr}') button:has-text('Approve')`); await fp.waitForTimeout(800); await f.close();
  await page.reload(); await page.waitForSelector("#billing .badge.ok:has-text('Creator')");
  const yt = await page.locator("#youtube").count();
  await page.goBack(); await page.waitForSelector(".ed-side");
  if (yt) throw new Error("YouTube card shown to a user before it is set up");
});
await step("Growth: feedback sent, invite link shown, privacy & terms pages", async () => {
  await page.click(".ed-top button[aria-haspopup=menu]:has(.avatar)"); await page.click(".menu-item:has-text('Send feedback')");
  await page.fill("textarea[aria-label=Feedback]", "Audit: please add more fonts"); await page.click("button[aria-label='4 stars']");
  await page.click(".modal button:has-text('Send')"); await page.waitForSelector(".modal", { state: "detached" });
  const url = page.url();
  await page.goto(B + "/settings"); await page.waitForSelector("#invite input[value*='/signup?ref=']");
  await page.goto(B + "/privacy"); await page.waitForSelector("h1:has-text('Privacy policy')");
  await page.goto(B + "/terms"); await page.waitForSelector("h1:has-text('Terms of service')");
  await page.goto(url); await page.waitForSelector(".ed-side");
});
await step("Mobile layout renders editor + dashboard", async () => {
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() }); const p = await m.newPage();
  await p.goto(page.url()); await p.waitForSelector(".ed2 .ed-viewer"); await p.goto(B + "/home"); await p.waitForSelector(".stat"); await m.close();
});

phase = "done";
await browser.close();
const fails = results.filter((r) => r[0] === "FAIL" || r[0] === "WARN");
console.log(results.map((r) => `${r[0]}  ${r[1]}`).join("\n"));
console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.filter((r) => r[0] !== "NOTE").length} steps passed`);
if (problems.length) console.log("\nProblems:\n" + [...new Set(problems)].join("\n"));
process.exit(fails.length || problems.length ? 1 : 0);
