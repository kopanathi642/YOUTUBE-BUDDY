// Resolve-style edit features: markers, smart Trim tool (roll / ripple / slip / slide), the 7 edit types on the
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

await step("Premiere chrome: tools panel, timecode header, zoom bar, audio meters", async () => {
  for (const s of [".tl-tools [aria-label='Selection tool']", ".tl-tools [aria-label='Trim tool']", ".tl-tools [aria-label='Razor tool']", ".tl-tools [aria-label='Hand tool']",
    ".pr-tc", ".tl-corner [aria-label='Snapping']", ".pr-zbar .pr-zthumb", ".pr-meters[role=meter]"]) if (!(await page.locator(s).count())) throw new Error("missing " + s);
  await playheadAt(60); const lvl = +(await page.locator(".pr-meters").getAttribute("aria-valuenow"));
  if (!(lvl > -60)) throw new Error("meter shows no level over audio: " + lvl);
});

await step("Zoom bar handle zooms, middle drag scrolls", async () => {
  const th = await page.locator(".pr-zthumb").boundingBox();
  const r = page.locator(".pr-zh.r"); const rb = await r.boundingBox();
  const w0 = (await clips("v1"))[0].w;
  await page.mouse.move(rb.x + 5, rb.y + 5); await page.mouse.down(); await page.mouse.move(rb.x - th.width * 0.4, rb.y + 5, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(300);
  const w1 = (await clips("v1"))[0].w;
  if (!(w1 > w0 * 1.2)) throw new Error(`handle did not zoom in (${w0} → ${w1})`);
  await page.click("[aria-label='Zoom to fit']"); await page.waitForTimeout(300);
});

await step("Markers: M adds, ruler flag jumps, double-click removes, saved with the edit", async () => {
  await page.click("[aria-label='Zoom to fit']"); await page.locator(".tl-scroll").evaluate((e) => (e.scrollLeft = 0)); await page.waitForTimeout(200);
  await playheadAt(120); const at = await tc();
  await page.keyboard.press("m"); await page.waitForSelector(".pr-marker");
  await playheadAt(20);
  await page.locator(".pr-marker").first().click(); await page.waitForTimeout(150);
  if ((await tc()) !== at) throw new Error(`jump went to ${await tc()} not ${at}`);
  await page.waitForTimeout(2500); await page.reload(); await page.waitForSelector(".pr-tl .clip");
  if (!(await page.locator(".pr-marker").count())) throw new Error("marker lost after reload");
  await page.locator(".pr-marker").first().dblclick(); await page.waitForTimeout(200);
  if (await page.locator(".pr-marker").count()) throw new Error("double-click did not remove");
});

await page.click("[aria-label='Zoom to fit']"); await page.waitForTimeout(300);
await step("Trim tool: hover shows Roll / Ripple / Slip / Slide; roll, ripple, slip and slide all edit correctly", async () => {
  await page.keyboard.press("t");
  const hint = async (x, y) => { await page.mouse.move(x, y); await page.waitForTimeout(80); return page.locator(".pr-trimhint").innerText(); };
  const [a, bb] = await clips("v1"); if (!bb || Math.abs(a.x + a.w - bb.x) > 2) throw new Error("need two touching clips on V1");
  for (const [x, y, want] of [[a.x + a.w - 3, a.y + a.h / 2, "Roll"], [a.x + a.w / 2, a.y + 8, "Slip"], [a.x + a.w / 2, a.y + a.h - 8, "Slide"], [bb.x + bb.w - 3, bb.y + bb.h / 2, "Ripple"]])
    if ((await hint(x, y)) !== want) throw new Error(`hover at ${want} spot says ${await hint(x, y)}`);
  const drag = async (x, y, dx) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(200); };
  // roll the cut 40 px right: clip 1 longer (its source is 8 s, only 6 s used), clip 2 shorter, total the same
  const total0 = bb.x + bb.w - a.x;
  await drag(a.x + a.w - 3, a.y + a.h / 2, 40);
  let [r1, r2] = await clips("v1");
  if (!(r1.w > a.w + 30)) throw new Error(`roll did not lengthen clip 1 (${a.w} → ${r1.w})`);
  if (Math.abs((r2.x + r2.w - r1.x) - total0) > 2) throw new Error("roll changed the total length");
  await undo(); await page.waitForTimeout(200);
  // ripple the end of clip 2 left by 50 px: it gets shorter, nothing else moves
  await drag(bb.x + bb.w - 3, bb.y + bb.h / 2, -50);
  [r1, r2] = await clips("v1"); if (!(r2.w < bb.w - 40)) throw new Error("ripple end did nothing");
  await undo(); await page.waitForTimeout(200);
  // slip clip 1 (6 of 8 s used): same place and length
  await drag(a.x + a.w / 2, a.y + 8, -30);
  [r1] = await clips("v1"); if (Math.abs(r1.x - a.x) > 1 || Math.abs(r1.w - a.w) > 1) throw new Error("slip moved or resized the clip");
  await undo(); await page.waitForTimeout(200);
  // slide clip 2 left by 30 px: clip 1 gets shorter, clip 2 keeps its length
  await drag(bb.x + bb.w / 2, bb.y + bb.h - 8, -30);
  [r1, r2] = await clips("v1");
  if (!(r1.w < a.w - 20) || Math.abs(r2.w - bb.w) > 1 || Math.abs(r1.x + r1.w - r2.x) > 2) throw new Error(`slide wrong (${a.w}/${bb.w} → ${r1.w}/${r2.w})`);
  await undo(); await page.keyboard.press("v");
});

await step("Edit overlay: all 7 edit types work from the program monitor", async () => {
  const media = page.locator(".ed-bin [draggable=true]").filter({ hasText: /Vlog|Talk/ }).first();   // a video (Fit to Fill refuses stills)
  if (!(await media.count())) throw new Error("no draggable media in the bin");
  for (const kind of ["Insert", "Place on Top", "Append at End", "Overwrite", "Replace", "Fit to Fill", "Ripple Overwrite"]) {
    const n0 = JSON.stringify(await clips("v1")) + JSON.stringify(await clips("v2")) + (await page.locator(".clip").count());
    await playheadAt(80);
    await media.dragTo(page.locator(".viewer-box"), { targetPosition: { x: 40, y: 40 } }).catch(() => {});
    await page.waitForSelector(".eo.on .eo-tile", { timeout: 3000 }).catch(() => {});
    if (!(await page.locator(".eo.on").count())) { // playwright's dragTo ends the drag; do it by hand for the overlay
      await media.hover(); await page.mouse.down(); const vb = await page.locator(".viewer-box").boundingBox();
      await page.mouse.move(vb.x + 40, vb.y + 40, { steps: 6 }); await page.waitForSelector(".eo.on .eo-tile", { timeout: 3000 });
      const t = await page.locator(".eo-tile").filter({ has: page.locator("b", { hasText: new RegExp(`^${kind}$`) }) }).boundingBox(); await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 6 }); await page.mouse.up();
    }
    await page.waitForTimeout(400);
    const n1 = JSON.stringify(await clips("v1")) + JSON.stringify(await clips("v2")) + (await page.locator(".clip").count());
    if (n1 === n0) throw new Error(`${kind} did not change the timeline`);
    await undo(); await page.waitForTimeout(200);
  }
});

await step("Dynamic Zoom: Push in adds scale keyframes across the clip", async () => {
  await page.keyboard.press("v");
  await page.locator('[data-track="v1"] .clip').first().click();
  await page.click(".ed-insp [role=tab]:has-text('Inspector')").catch(() => {});
  await page.click(".dz-row button:has-text('Push in')"); await page.waitForTimeout(200);
  const txt = await page.locator(".kf-note").first().innerText();
  if (!/scale/i.test(txt)) throw new Error("no scale animation: " + txt);
});

await page.screenshot({ path: `${OUT}/resolve-final.png` });
console.log(`\n${pass}/${pass + fail} steps passed`, errors.length ? "\npage errors: " + errors.join(" | ") : "");
await b.close();
process.exit(fail ? 1 : 0);
