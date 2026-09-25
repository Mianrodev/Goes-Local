#!/usr/bin/env node
// Opens a city's real site in headless Chromium: homepage, categories, search, one
// listing page, pricing, blog, and the admin login. Reports status codes, page
// headings, JS errors and 5xx responses, and saves screenshots.
// Usage: node scripts/browse-check.mjs <orlando|miami> [out-dir]
// Needs ADMIN_LOGIN_KEY. Uses the global playwright install and /opt/pw-browsers/chromium.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { parse } from "smol-toml";

const require = createRequire(import.meta.url);
const { chromium } = require(execSync("npm root -g").toString().trim() + "/playwright");
const [city, outDir = "/tmp/browse-check"] = process.argv.slice(2);
const cfg = parse(readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8"));
const base = "https://" + cfg.env[city].routes.find(r => r.custom_domain).pattern;
mkdirSync(outDir, { recursive: true });

// The sandbox's egress proxy re-signs TLS with its own CA; trust exactly that CA.
const args = [];
try {
  const spki = execSync("openssl x509 -in /root/.ccr/agent-proxy-ca.crt -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64").toString().trim();
  args.push("--ignore-certificate-errors-spki-list=" + spki);
} catch {}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
const page = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errors = [], out = [];
page.on("pageerror", e => errors.push("JS: " + e.message));
page.on("response", r => { if (r.status() >= 500 && r.url().startsWith(base)) errors.push(r.status() + " " + r.url()); });

async function go(path, shot) {
  const r = await page.goto(base + path, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1200);
  const h1 = (await page.locator("h1").first().textContent().catch(() => "")) || "";
  out.push(`${r.status()} ${path}  "${h1.trim().slice(0, 70)}"`);
  if (shot) await page.screenshot({ path: `${outDir}/${city}-${shot}.png` });
}

await go("/", "home");
const biz = await page.locator("a").evaluateAll((as, base) => as.map(a => a.href).find(h => h.startsWith(base) && /^\/[a-z0-9-]+\/[a-z0-9-]+$/.test(new URL(h).pathname) && !/^\/(blog|news|neighbourhood|admin|manage)\//.test(new URL(h).pathname)), base);
await go("/categories");
await go("/search?q=plumber");
if (biz) await go(new URL(biz).pathname, "listing"); else out.push("(no listing link found on homepage)");
await go("/pricing");
await go("/blog");
if (process.env.ADMIN_LOGIN_KEY) {
  await page.goto(base + "/admin/login");
  await page.selectOption("#arole", "admin");
  await page.fill("#ak", process.env.ADMIN_LOGIN_KEY);
  await Promise.all([page.waitForNavigation(), page.click("button.btn-p")]);
  out.push("admin login -> " + new URL(page.url()).pathname);
  await page.screenshot({ path: `${outDir}/${city}-admin.png` });
}
console.log(out.join("\n"));
console.log(errors.length ? "✗ ERRORS:\n" + errors.join("\n") : "✓ no JS errors or 5xx");
await b.close();
process.exit(errors.length ? 1 : 0);
