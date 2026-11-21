// Every page of the site, signed out and signed in, at desktop and phone widths.
// For each page: it renders real content (not blank / not the error page), no uncaught JS errors, no console errors,
// no failed API calls (4xx/5xx other than ones the page is expected to make), no horizontal scrolling, and every
// internal link on the page points to a route that exists.
//   BASE=http://localhost:8000 OUT=/tmp/shots node e2e/pages.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright");
const B = process.env.BASE ?? "http://localhost:8000", OUT = process.env.OUT ?? "/tmp";

const PUBLIC = ["/", "/signin", "/signup", "/privacy", "/terms", "/home"];
const PRIVATE = ["/universes", "/editor", "/editor/projects", "/ai-generator", "/ai-generator/explore", "/library", "/channel",
  "/growth", "/settings", "/super", "/projects"];
const ROUTES = [...PUBLIC, ...PRIVATE, "/ai-generator/tool/", "/ai-generator/studio/", "/edit/", "/shorts/", "/ai-creation/"];
// API calls a page may legitimately get a 4xx from (e.g. "am I signed in?" while signed out)
const EXPECTED_4XX = [/\/auth\/me$/, /\/youtube\/insights/];

const b = await chromium.launch();
const results = [];
let pass = 0, fail = 0;

async function visit(ctx, path, label, width) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
  const errs = [], bad = [];
  page.on("pageerror", (e) => errs.push("JS: " + e.message.slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(m.text())) errs.push("console: " + m.text().slice(0, 160)); });
  page.on("response", (r) => {
    const u = r.url();
    if (!u.startsWith(B)) return;
    if (r.status() >= 500 || (r.status() >= 400 && u.includes("/api/") && !EXPECTED_4XX.some((x) => x.test(u.split("?")[0]))))
      bad.push(`${r.status()} ${u.replace(B, "").slice(0, 90)}`);
  });
  const problems = [];
  try {
    await page.goto(B + path, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(800);
    const info = await page.evaluate(() => {
      const t = document.body.innerText.trim();
      const over = document.documentElement.scrollWidth - window.innerWidth;
      const links = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => h && h.startsWith("/") && !h.startsWith("/api/"));
      const h1 = document.querySelector("h1,h2")?.innerText?.trim() ?? "";
      return { len: t.length, over, links: [...new Set(links)], h1, notFound: /page not found|404/i.test(t.slice(0, 400)), url: location.pathname };
    });
    if (info.len < 40) problems.push(`almost empty page (${info.len} chars)`);
    if (info.notFound && path !== "/nope") problems.push("shows 'not found'");
    if (info.over > 2) problems.push(`horizontal scroll ${info.over}px`);
    const deadLinks = info.links.filter((h) => !ROUTES.some((r) => h.split(/[?#]/)[0] === r || (r.endsWith("/") && h.startsWith(r) && h.length > r.length)) && h !== "/nope");
    if (deadLinks.length) problems.push("links to unknown routes: " + deadLinks.join(", "));
    problems.push(...errs, ...bad.map((x) => "API " + x));
    await page.screenshot({ path: `${OUT}/page-${label}-${width}${path.replace(/\W+/g, "_")}.png` });
    results.push({ path, label, width, h1: info.h1.slice(0, 40), landed: info.url, problems });
  } catch (e) {
    problems.push("load failed: " + e.message.split("\n")[0]);
    results.push({ path, label, width, problems });
  }
  if (problems.length) { fail++; console.log(`FAIL  [${label} ${width}] ${path} — ${problems.join(" | ")}`); }
  else { pass++; console.log(`PASS  [${label} ${width}] ${path}`); }
  await page.close();
}

// signed out
const anon = await b.newContext();
for (const w of [1440, 390]) for (const p of PUBLIC) await visit(anon, p, "out", w);
// signed-out visit to a private page must send you to sign in, not crash
{
  const page = await anon.newPage();
  await page.goto(B + "/library", { waitUntil: "networkidle" });
  const ok = /\/signin/.test(page.url());
  console.log(`${ok ? "PASS" : "FAIL"}  [out] /library sends signed-out visitors to /signin (${page.url().replace(B, "")})`);
  ok ? pass++ : fail++;
  await page.close();
}
// signed in (fresh account)
const ctx = await b.newContext();
{
  const page = await ctx.newPage();
  const email = `pages${Date.now()}@example.com`;
  await page.goto(B + "/signup");
  await page.fill("#n", "Pages Bot"); await page.fill("#e", email); await page.fill("#p", "pages-password-123");
  await page.keyboard.press("Enter");
  await page.waitForURL("**/universes", { timeout: 20000 });
  await page.close();
}
for (const w of [1440, 390]) for (const p of [...PRIVATE, ...PUBLIC.filter((x) => x !== "/signin" && x !== "/signup")]) await visit(ctx, p, "in", w);
// unknown address shows a friendly page, not a blank screen
await visit(ctx, "/nope", "in", 1440);

console.log(`\n${pass}/${pass + fail} page checks passed`);
await b.close();
process.exit(fail ? 1 : 0);
