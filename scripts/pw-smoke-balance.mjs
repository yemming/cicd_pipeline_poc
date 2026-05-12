#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);
const SERVER_ERROR_PATTERNS = ["Application error", "Internal Server Error", "PGRST"];
const FLAT = [
  "/parts/operations/balance",
  "/parts/operations/balance?q=test",
  "/parts/operations/balance?control=A",
  "/parts/operations/balance?include_zero=1",
];
const log = (...m) => console.error("[smoke]", ...m);

async function checkOnce(page, urlPath) {
  const resp = await page.goto(`${BASE}${urlPath}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
  const status = resp?.status() ?? 0;
  const finalUrl = page.url();
  if (status >= 400) return { ok: false, urlPath, reason: `status=${status}` };
  if (finalUrl.includes("/login")) return { ok: false, urlPath, reason: "redirected to /login" };
  const body = await page.locator("body").innerText().catch(() => "");
  for (const pat of SERVER_ERROR_PATTERNS) {
    if (body.includes(pat)) return { ok: false, urlPath, reason: `body contains "${pat}"` };
  }
  return { ok: true, urlPath, status };
}
async function check(page, urlPath) {
  try { return await checkOnce(page, urlPath); }
  catch (e) {
    if ((e?.message || "").includes("Timeout")) {
      await new Promise((r) => setTimeout(r, 2000));
      try { return await checkOnce(page, urlPath); }
      catch (e2) { return { ok: false, urlPath, reason: `timeout x2: ${e2.message}` }; }
    }
    return { ok: false, urlPath, reason: e?.message || String(e) };
  }
}

async function main() {
  if (!fs.existsSync(STATE_FILE)) { log("missing .pw-state.json"); process.exit(2); }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: STATE_FILE });
  const page = await ctx.newPage();
  const results = [];
  for (const u of FLAT) {
    const r = await check(page, u);
    log(r.ok ? `✓ ${u}` : `✗ ${u} — ${r.reason}`);
    results.push(r);
  }
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, details: results }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
