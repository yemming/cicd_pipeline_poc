#!/usr/bin/env node
/**
 * Smoke：ERP 薄底層
 *
 * 1) 4 個既有 accounting page + 新建 vehicle-models 三頁能 200 + 不被踢 /login
 * 2) 不對 engine 做直接 DB 驗證（那要 Node + supabase client + service key、跑 server action 比較簡單）
 *    → 本 smoke 只驗 page 可達；engine end-to-end 留給 server action 整合測試或手測
 *
 * Usage:
 *   node scripts/pw-smoke-accounting.mjs
 *   SMOKE_NAV_TIMEOUT_MS=90000 node scripts/pw-smoke-accounting.mjs
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);
const SERVER_ERROR_PATTERNS = ["Application error", "Internal Server Error", "PGRST"];

const log = (...m) => console.error("[accounting-smoke]", ...m);

// 1. 既有 accounting 頁面
const ACCOUNTING_PAGES = [
  "/admin/accounting/coa",
  "/admin/accounting/dimensions",
  "/admin/accounting/journal-entries",
  "/admin/accounting/netsuite-mapping",
];

// 2. 新建 vehicle-models 模組（薄底層 SOP Step 8）
const VEHICLE_MODELS_PAGES = [
  "/admin/master-data/vehicle-models",
  "/admin/master-data/vehicle-models?status=active",
  "/admin/master-data/vehicle-models/new",
];

async function checkOnce(page, urlPath, opts = {}) {
  const resp = await page.goto(`${BASE}${urlPath}`, {
    waitUntil: "domcontentloaded",
    timeout: NAV_TIMEOUT,
  });
  const status = resp?.status() ?? 0;
  const finalUrl = page.url();
  if (status >= 400) return { ok: false, urlPath, reason: `status=${status}` };
  if (finalUrl.includes("/login")) {
    return { ok: false, urlPath, reason: "redirected to /login（storageState 失效或 admin 權限不足）" };
  }
  const body = await page.locator("body").innerText().catch(() => "");
  for (const pat of SERVER_ERROR_PATTERNS) {
    if (body.includes(pat)) return { ok: false, urlPath, reason: `body contains "${pat}"` };
  }
  // 額外可選驗證
  if (opts.expectContains) {
    for (const needle of opts.expectContains) {
      if (!body.includes(needle)) {
        return { ok: false, urlPath, reason: `body missing expected "${needle}"` };
      }
    }
  }
  return { ok: true, urlPath, status };
}

async function check(page, urlPath, opts) {
  try {
    return await checkOnce(page, urlPath, opts);
  } catch (e) {
    if ((e?.message || "").includes("Timeout")) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        return await checkOnce(page, urlPath, opts);
      } catch (e2) {
        return { ok: false, urlPath, reason: `timeout x2: ${e2.message}` };
      }
    }
    return { ok: false, urlPath, reason: e?.message || String(e) };
  }
}

async function checkDetailFromList(page, listPath, detailPattern) {
  // 從 list 抓第一筆 detail href、確保 detail page 也通
  try {
    const resp = await page.goto(`${BASE}${listPath}`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    if (!resp || resp.status() >= 400) return { ok: false, urlPath: listPath, reason: "list 未加載" };
    const hrefs = await page.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    const firstDetail = hrefs.find((h) => h && detailPattern.test(h));
    if (!firstDetail) {
      return { ok: true, urlPath: `${listPath} (skip detail)`, skipped: true, reason: "list 上找不到 detail 連結" };
    }
    return await check(page, firstDetail);
  } catch (e) {
    return { ok: false, urlPath: listPath, reason: `detail-from list 失敗：${e.message}` };
  }
}

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json — 先跑 `node scripts/pw-login.mjs --ensure` 重建");
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: STATE_FILE });
  const page = await ctx.newPage();
  const results = [];

  // 1. accounting 既有頁面
  for (const u of ACCOUNTING_PAGES) {
    const r = await check(page, u);
    log(r.ok ? `✓ ${u}` : `✗ ${u} — ${r.reason}`);
    results.push(r);
  }

  // 2. vehicle-models 新建頁面
  // list page 預期含「車型主檔」標題
  results.push(
    await (async () => {
      const r = await check(page, VEHICLE_MODELS_PAGES[0], { expectContains: ["車型主檔"] });
      log(r.ok ? `✓ ${VEHICLE_MODELS_PAGES[0]}` : `✗ ${VEHICLE_MODELS_PAGES[0]} — ${r.reason}`);
      return r;
    })(),
  );
  for (const u of VEHICLE_MODELS_PAGES.slice(1)) {
    const r = await check(page, u);
    log(r.ok ? `✓ ${u}` : `✗ ${u} — ${r.reason}`);
    results.push(r);
  }
  // detail page：從 list 抓第一筆 vehicle-models/<uuid>
  {
    const r = await checkDetailFromList(
      page,
      "/admin/master-data/vehicle-models",
      /^\/admin\/master-data\/vehicle-models\/[0-9a-f-]{36}$/,
    );
    log(r.ok ? (r.skipped ? `⊘ detail (skipped) — ${r.reason}` : `✓ detail-from list → ${r.urlPath}`) : `✗ detail — ${r.reason}`);
    results.push(r);
  }

  await browser.close();

  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.ok && !r.skipped);
  const passed = results.filter((r) => r.ok && !r.skipped).length;

  console.log(
    JSON.stringify(
      {
        total: results.length,
        passed,
        failed: failed.length,
        skipped,
        details: results,
      },
      null,
      2,
    ),
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
