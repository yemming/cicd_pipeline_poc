#!/usr/bin/env node
// Smoke test for /parts/operations/balance (商品庫存查詢)
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[balance-smoke]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json — run scripts/pw-login.mjs first");
    process.exit(2);
  }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: STATE_FILE });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
  });

  const results = [];

  // 1) load /parts/operations/balance
  {
    const resp = await page.goto(`${BASE}/parts/operations/balance`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load /balance",
        reason: `status=${status} url=${finalUrl}`,
      });
      await browser.close();
      report(results);
      return;
    }
    results.push({ ok: true, step: "load /balance", status });
  }

  // 2) h1 = 商品庫存查詢
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("商品庫存查詢")
        ? { ok: true, step: "h1 = 商品庫存查詢" }
        : { ok: false, step: "h1 check", reason: `h1="${h1}"` },
    );
  }

  // 3) sprint chip 7.0
  {
    const chip = await page.locator('span:has-text("7.0")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip 7.0" }
        : { ok: false, step: "sprint chip 7.0", reason: "not found" },
    );
  }

  // 4) filter labels — 商品搜尋 / 倉庫 / 管控等級 / 狀態
  {
    const expected = ["商品搜尋", "倉庫", "管控等級", "狀態"];
    const missing = [];
    for (const label of expected) {
      const c = await page.locator(`label:has-text("${label}")`).count();
      if (c === 0) missing.push(label);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "filter labels present" }
        : { ok: false, step: "filter labels", reason: `missing: ${missing.join(",")}` },
    );
  }

  // 5) DataGrid headers — 料號 / 品名 / 管控 / 倉庫 / 數量 / 狀態組成
  {
    const expected = ["料號", "品名", "管控", "倉庫", "數量", "狀態組成"];
    const missing = [];
    for (const h of expected) {
      const c = await page.locator(`th:has-text("${h}")`).count();
      if (c === 0) missing.push(h);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "DataGrid headers present" }
        : { ok: false, step: "DataGrid headers", reason: `missing: ${missing.join(",")}` },
    );
  }

  // 6) KPI cards — 不重複料號（本頁）/ 本頁總件數 / 符合條件總筆數
  {
    const expected = ["不重複料號（本頁）", "本頁總件數", "符合條件總筆數"];
    const missing = [];
    for (const t of expected) {
      const c = await page.locator(`text=${t}`).count();
      if (c === 0) missing.push(t);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "KPI cards present" }
        : { ok: false, step: "KPI cards", reason: `missing: ${missing.join(",")}` },
    );
  }

  // 7) 序列號查詢 button present
  {
    const c = await page.locator('button:has-text("序列號查詢")').count();
    results.push(
      c > 0
        ? { ok: true, step: "序列號查詢 button present" }
        : { ok: false, step: "序列號查詢 button", reason: "missing" },
    );
  }

  // 8) DataGrid has indian demo rows — at least 1 item code link
  {
    const codeLinks = page.locator('a.font-mono[href^="/parts/setup/items/"]');
    const linkCount = await codeLinks.count();
    results.push(
      linkCount > 0
        ? { ok: true, step: "DataGrid has rows", count: linkCount }
        : { ok: false, step: "DataGrid rows", reason: "no item code links found" },
    );
  }

  // 9) filter interaction — include_zero=1 navigates and keeps the page
  {
    const resp = await page.goto(`${BASE}/parts/operations/balance?include_zero=1`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      status < 400 && h1.includes("商品庫存查詢")
        ? { ok: true, step: "include_zero=1 query renders" }
        : { ok: false, step: "include_zero=1 query", reason: `status=${status} h1="${h1}"` },
    );
  }

  // 10) no browser console errors
  if (consoleErrors.length > 0) {
    results.push({ ok: false, step: "browser console errors", errors: consoleErrors });
  } else {
    results.push({ ok: true, step: "no browser console errors" });
  }

  await browser.close();
  report(results);
}

function report(results) {
  const failed = results.filter((r) => !r.ok);
  console.log(
    JSON.stringify(
      {
        total: results.length,
        passed: results.length - failed.length,
        failed: failed.length,
        details: results,
      },
      null,
      2,
    ),
  );
  for (const r of results)
    console.error(
      r.ok
        ? `[balance-smoke] ✓ ${r.step}`
        : `[balance-smoke] ✗ ${r.step} — ${r.reason ?? JSON.stringify(r.errors ?? {})}`,
    );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
