#!/usr/bin/env node
// After a deploy: sign in to the city's admin, run /admin/migrate, then read /debug and
// confirm the live VERSION matches worker.js and D1/KV are bound.
// Usage: node scripts/migrate-verify.mjs <orlando|miami> <expected-version> [--no-migrate]
// Needs ADMIN_LOGIN_KEY (same key on every city).
import { readFileSync } from "node:fs";
import { parse } from "smol-toml";
import { createHash } from "node:crypto";

const [city, expected] = process.argv.slice(2);
const doMigrate = !process.argv.includes("--no-migrate");
const KEY = process.env.ADMIN_LOGIN_KEY;
if (!city || !expected) { console.error("usage: migrate-verify.mjs <city> <version> [--no-migrate]"); process.exit(2); }
if (!KEY) { console.error("ADMIN_LOGIN_KEY is not set."); process.exit(2); }

const CHECK = createHash("sha256").update("gl-check:" + KEY).digest("hex").slice(0, 32);
const cfg = parse(readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8"));
const route = (cfg.env[city].routes || []).find(r => r.custom_domain) || cfg.env[city].routes[0];
const base = "https://" + route.pattern.replace(/\/.*$/, "");

const login = await fetch(base + "/admin/login", {
  method: "POST", redirect: "manual", headers: { "x-gl-check": CHECK },
  body: new URLSearchParams({ as: "admin", key: KEY })
});
const cookie = (login.headers.getSetCookie?.() || [login.headers.get("set-cookie") || ""]).map(c => c.split(";")[0]).find(c => c.startsWith("gl_adm="));
if (login.status !== 302 || !cookie) { console.error(`✗ ${city}: admin login failed (HTTP ${login.status})`); process.exit(1); }
const get = async p => {
  const r = await fetch(base + p + (p.includes("?") ? "&" : "?") + "t=" + Date.now(), { headers: { cookie, "cache-control": "no-cache", "x-gl-check": CHECK }, redirect: "manual" });
  return { status: r.status, text: await r.text() };
};

let bad = 0;
if (doMigrate) {
  const m = await get("/admin/migrate");
  if (m.status === 200 && m.text.startsWith("Migration OK")) console.log(`✓ ${city}: migration OK`);
  else { console.error(`✗ ${city}: migration failed (HTTP ${m.status}): ${m.text.slice(0, 400)}`); bad++; }
}

const d = await get("/debug");
const line = k => (d.text.match(new RegExp("^" + k + ": ?(.*)$", "m")) || [])[1];
const checks = [
  ["VERSION", line("VERSION") === expected, line("VERSION")],
  ["D1", line("D1") === "found", line("D1")],
  ["KV", line("KV") === "found", line("KV")],
  ["no D1 error", !/D1 ERROR/.test(d.text), (d.text.match(/D1 ERROR.*/) || [""])[0]]
];
for (const [k, ok, v] of checks) { console.log(`${ok ? "✓" : "✗"} ${city}: ${k} = ${v}`); if (!ok) bad++; }
for (const k of ["GA", "Listings", "Categories", "Last sync"]) console.log(`  ${city}: ${k}: ${line(k) ?? "?"}`);
process.exit(bad ? 1 : 0);
