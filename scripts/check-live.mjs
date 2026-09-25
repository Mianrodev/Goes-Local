#!/usr/bin/env node
// Compares wrangler.toml with what is actually configured on each live Worker, so a
// deploy can never silently drop a binding, cron, domain or setting.
// Usage: node scripts/check-live.mjs [orlando|miami ...]   (default: every env in wrangler.toml)
// Needs CLOUDFLARE_API_TOKEN. Exits 1 on any mismatch.
import { readFileSync } from "node:fs";
import { parse } from "smol-toml";

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "024a5f4e0646920e7c4557bda6ed2075";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
if (!TOKEN) { console.error("CLOUDFLARE_API_TOKEN is not set."); process.exit(2); }

const cfg = parse(readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8"));
const envs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(cfg.env || {});

async function api(path) {
  const r = await fetch("https://api.cloudflare.com/client/v4" + path, { headers: { Authorization: "Bearer " + TOKEN } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new Error(`${path} -> HTTP ${r.status} ${JSON.stringify(j.errors || j).slice(0, 300)}`);
  return j.result;
}
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

let bad = 0;
for (const name of envs) {
  const e = cfg.env[name];
  if (!e) { console.error(`No [env.${name}] in wrangler.toml`); bad++; continue; }
  const script = e.name;
  const problems = [], notes = [];
  const want = (label, live, file) => { if (JSON.stringify(live) !== JSON.stringify(file)) problems.push(`${label}: live=${JSON.stringify(live)} toml=${JSON.stringify(file)}`); };

  const s = await api(`/accounts/${ACCOUNT}/workers/scripts/${script}/settings`);
  want("compatibility_date", s.compatibility_date, e.compatibility_date ?? cfg.compatibility_date);
  const liveFlags = s.compatibility_flags || [], fileFlags = e.compatibility_flags ?? cfg.compatibility_flags ?? [];
  if (!same(liveFlags, fileFlags)) problems.push(`compatibility_flags: live=${JSON.stringify(liveFlags)} toml=${JSON.stringify(fileFlags)}`);
  want("observability.enabled", !!(s.observability && s.observability.enabled), !!(e.observability && e.observability.enabled));

  const b = s.bindings || [];
  const d1 = b.filter(x => x.type === "d1").map(x => ({ binding: x.name, id: x.id || x.database_id }));
  const kv = b.filter(x => x.type === "kv_namespace").map(x => ({ binding: x.name, id: x.namespace_id }));
  want("d1_databases", d1, (e.d1_databases || []).map(x => ({ binding: x.binding, id: x.database_id })));
  want("kv_namespaces", kv, (e.kv_namespaces || []).map(x => ({ binding: x.binding, id: x.id })));
  const vars = b.filter(x => x.type === "plain_text" || x.type === "json").map(x => x.name);
  const secrets = b.filter(x => x.type === "secret_text").map(x => x.name);
  const other = b.filter(x => !["d1", "kv_namespace", "plain_text", "json", "secret_text"].includes(x.type));
  if (other.length) problems.push(`bindings wrangler.toml doesn't describe: ${other.map(x => x.type + ":" + x.name).join(", ")}`);
  if (vars.length && cfg.keep_vars !== true) problems.push("live Worker has Variables but keep_vars is not true — deploy would delete them");
  notes.push(`variables (${vars.length}): ${vars.sort().join(", ")}`);
  notes.push(`secrets (${secrets.length}): ${secrets.sort().join(", ")}`);

  const sch = await api(`/accounts/${ACCOUNT}/workers/scripts/${script}/schedules`);
  const liveCrons = (sch.schedules || []).map(x => x.cron);
  const fileCrons = (e.triggers && e.triggers.crons) || [];
  if (!same(liveCrons, fileCrons)) problems.push(`crons: live=${JSON.stringify(liveCrons)} toml=${JSON.stringify(fileCrons)}`);

  const sub = await api(`/accounts/${ACCOUNT}/workers/scripts/${script}/subdomain`);
  want("workers_dev", !!sub.enabled, e.workers_dev ?? cfg.workers_dev ?? true);
  want("preview_urls", !!sub.previews_enabled, e.preview_urls ?? cfg.preview_urls ?? !!(e.workers_dev ?? true));

  const routes = e.routes || [];
  const doms = (await api(`/accounts/${ACCOUNT}/workers/domains?service=${script}`)).map(x => x.hostname);
  const fileDoms = routes.filter(r => r.custom_domain).map(r => r.pattern);
  if (!same(doms, fileDoms)) problems.push(`custom domains: live=${JSON.stringify(doms)} toml=${JSON.stringify(fileDoms)}`);

  const fileRoutes = routes.filter(r => !r.custom_domain).map(r => r.pattern);
  const zones = [...new Set([...doms, ...routes.map(r => r.zone_name || r.pattern)].map(h => h.replace(/\/.*$/, "").replace(/^\*\.?/, "").split(".").slice(-2).join(".")))];
  const liveRoutes = [];
  for (const z of zones) {
    try {
      const zr = await api(`/zones?name=${z}`);
      if (!zr.length) continue;
      for (const r of await api(`/zones/${zr[0].id}/workers/routes`)) if (r.script === script) liveRoutes.push(r.pattern);
    } catch (err) { notes.push(`could not read zone routes for ${z} (token may lack Zone read): ${err.message}`); }
  }
  if (!same(liveRoutes, fileRoutes)) problems.push(`zone routes: live=${JSON.stringify(liveRoutes)} toml=${JSON.stringify(fileRoutes)}`);

  console.log(`\n== ${name} (${script}) ==`);
  for (const n of notes) console.log("  · " + n);
  if (problems.length) { bad++; for (const p of problems) console.log("  ✗ " + p); }
  else console.log("  ✓ wrangler.toml matches live");
}
process.exit(bad ? 1 : 0);
