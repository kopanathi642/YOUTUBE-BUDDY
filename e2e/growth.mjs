// Growth pages audit: every tab, the full idea -> blueprint -> produce -> review -> approve flow, and calendar drag and drop.
// Run against a server whose YT_FEED_URL points at a feed (the real YouTube feed or a local fake):
//   BASE=http://localhost:8000 OUT=/tmp/shots node e2e/growth.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright");

const B = process.env.BASE ?? "http://localhost:8000", OUT = process.env.OUT ?? "/tmp";
const results = [], problems = [];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
let phase = "start";
page.on("pageerror", (e) => problems.push(`[${phase}] page error: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|status of 40[19]/.test(m.text())) problems.push(`[${phase}] console: ${m.text()}`); });
page.on("response", (r) => { const u = r.url(); if (u.includes("/api/v1/") && r.status() >= 400 && !(r.status() === 401 && u.endsWith("/auth/me")) && !(r.status() === 409 && u.endsWith("/growth/coach")))
  problems.push(`[${phase}] HTTP ${r.status()} ${r.request().method()} ${u.replace(B, "")}`); });
page.on("dialog", (d) => d.accept().catch(() => {}));
const shot = (n) => page.screenshot({ path: `${OUT}/growth-${n}.png`, fullPage: true });
async function step(name, fn) {
  phase = name; const before = problems.length;
  try { await fn(); results.push([problems.length > before ? "WARN" : "PASS", name]); }
  catch (e) { results.push(["FAIL", `${name} — ${String(e.message).split("\n")[0].slice(0, 200)}`]); await page.screenshot({ path: `${OUT}/growth-fail-${results.length}.png` }).catch(() => {}); }
}
const tab = async (label) => { await page.click(`.gr-tab:has-text("${label}")`); await page.waitForTimeout(300); };

await step("Sign up and open Growth", async () => {
  await page.goto(B + "/signup"); await page.fill("#n", "Growth Bot"); await page.fill("#e", `growth${Date.now()}@example.com`); await page.fill("#p", "growth-password-123");
  await page.click("button:has-text('Create account')"); await page.waitForURL("**/universes");
  await page.goto(B + "/growth"); await page.waitForSelector("text=Start with your channel"); await shot("0-empty");
});
await step("Set my channel and see overview numbers", async () => {
  await page.fill(".gr-add input", "UC" + "o".repeat(22)); await page.click("button:has-text('Set my channel')");
  await page.waitForSelector(".gr-row >> text=/day/"); await shot("1-overview");
});
await step("Competitor research: track a channel", async () => {
  await tab("Competitor research"); await page.fill(".gr-add input", "https://www.youtube.com/channel/UC" + "c".repeat(22));
  await page.click("button:has-text('Track')"); await page.waitForFunction(() => document.querySelectorAll(".gr-card h3").length >= 3); await shot("2-competitors");
});
await step("Next video: transparent scores and add to plan", async () => {
  await tab("Next video"); await page.waitForSelector(".gr-rec"); await page.waitForSelector(".gr-part >> text=Fits your channel");
  await shot("3-next"); await page.locator(".gr-titles .btn").first().click(); await page.waitForSelector(".toast >> text=Added to your plan");
});
await step("Coach explains what it needs (no AI key here)", async () => {
  await tab("Growth coach"); await page.fill(".gr-add input", "What should I post this week?"); await page.click("button:has-text('Ask')");
  await page.waitForSelector("[role=alert] >> text=AI key"); await shot("4-coach");
});
await step("Content intelligence renders", async () => { await tab("Content intelligence"); await page.waitForSelector(".gr-vbar"); await shot("5-intel"); });
await step("Publishing studio: blueprint, write, produce, approve", async () => {
  await tab("Publishing studio"); await page.locator(".gr-card-i").first().click();
  await page.click("button:has-text('Create blueprint')"); await page.waitForSelector(".gr-scene");
  const n = await page.locator(".gr-scene textarea").count();
  for (let i = 0; i < n; i++) await page.locator(".gr-scene textarea").nth(i).fill(`This is what I say in part ${i + 1}. Short and clear.`);
  await page.fill(".gr-f:has-text('Hook') input", "Goa for under five thousand rupees.");
  await shot("6-blueprint");
  await page.click("button:has-text('Produce video')"); await page.waitForSelector(".toast >> text=Producing");
  await page.waitForSelector("button:has-text('Approve')", { timeout: 120000 }); await shot("7-review");
  await page.click("button:has-text('Approve')"); await page.waitForSelector("text=Publish to YouTube");
  await page.click(".gr-editor a:has-text('Open in editor')"); await page.waitForURL("**/edit/**"); await page.waitForSelector(".clip", { timeout: 30000 });
  const clips = await page.locator(".clip").count(); if (clips < 6) throw new Error(`only ${clips} clips in the produced timeline`);
  await shot("8-editor"); await page.goto(B + "/growth?tab=publish"); await page.waitForSelector(".gr-board");
});
await step("Calendar: drag a video onto a day", async () => {
  await tab("Content calendar"); const chip = page.locator(".gr-unsched .gr-chip").first(); await chip.waitFor();
  const target = page.locator(".gr-cal-d:not(.out)").nth(20);
  await chip.dragTo(target); await page.waitForSelector(".gr-cal-d .gr-chip"); await shot("9-calendar");
});
await step("Automation: switch mode and run a cycle", async () => {
  await tab("Automation center"); await page.click(".gr-mode:has-text('Semi-automatic')"); await page.waitForSelector(".gr-mode.on:has-text('Semi-automatic')");
  await page.click("button:has-text('Run now')"); await page.waitForSelector(".toast >> text=Cycle started"); await page.waitForTimeout(3500); await shot("10-automation");
});
await step("Performance and strategy library", async () => {
  await tab("Performance"); await page.waitForSelector("text=Publishing studio appear here");
  await tab("Strategy library"); await page.waitForSelector("text=Honest expectations"); await shot("11-library");
});
await step("Mobile width: no horizontal page scroll", async () => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(B + "/growth"); await page.waitForSelector(".gr-tabs");
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (over > 2) throw new Error(`page scrolls sideways by ${over}px`);
  await shot("12-mobile");
});

await browser.close();
for (const [s, n] of results) console.log(`${s}  ${n}`);
if (problems.length) console.log("\nProblems:\n" + [...new Set(problems)].join("\n"));
console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
