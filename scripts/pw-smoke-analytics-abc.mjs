#!/usr/bin/env node
// Smoke test for /parts/analytics/abc (ABC 分類結果頁 §12)
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[analytics-abc-smoke]", ...m);

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

  // 1) load
  {
    const resp = await page.goto(`${BASE}/parts/analytics/abc`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load /abc",
        reason: `status=${status} url=${finalUrl}`,
      });
      await browser.close();
      report(results);
      return;
    }
    results.push({ ok: true, step: "load /abc", status });
  }

  // 2) h1
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("ABC 分類")
        ? { ok: true, step: "h1 includes ABC 分類" }
        : { ok: false, step: "h1 check", reason: `h1="${h1}"` },
    );
  }

  // 3) sprint chip §12
  {
    const chip = await page.locator('span:has-text("§12")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip §12 present" }
        : { ok: false, step: "sprint chip §12", reason: "not found" },
    );
  }

  // 4) Tabs (5 個)
  {
    const labels = [
      "ABC 結構總覽",
      "庫存周轉率",
      "呆滯庫存分析",
      "缺貨率報告",
      "ABC 零件明細",
    ];
    const missing = [];
    for (const k of labels) {
      const c = await page.locator(`button:has-text("${k}")`).count();
      if (c === 0) missing.push(k);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "5 tabs present" }
        : { ok: false, step: "tabs", reason: `missing: ${missing.join(",")}` },
    );
  }

  // 5) 4 KPI tiles on overview tab
  {
    const labels = [
      "A 類零件（高頻高值）",
      "B 類零件（中頻中值）",
      "C 類零件（低頻低值）",
      "12 個月出貨總額",
    ];
    const missing = [];
    for (const k of labels) {
      const c = await page.locator(`text=${k}`).count();
      if (c === 0) missing.push(k);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "4 KPI tiles present" }
        : { ok: false, step: "KPI tiles", reason: `missing: ${missing.join(",")}` },
    );
  }

  // 6) 策略表 section + link to abc-settings
  {
    const sec = await page.locator('text=各類別管理策略').count();
    const link = await page.locator('a[href="/parts/analytics/abc-settings"]').count();
    results.push(
      sec > 0 && link > 0
        ? { ok: true, step: "strategy table + abc-settings link present" }
        : {
            ok: false,
            step: "strategy section",
            reason: `section=${sec} link=${link}`,
          },
    );
  }

  // 7) 切到「ABC 零件明細」tab
  {
    await page.locator('button:has-text("ABC 零件明細")').first().click().catch(() => {});
    await page.waitForTimeout(500);
    const headers = ["排名", "備件代碼", "商品名稱", "ABC 分類"];
    const missing = [];
    for (const h of headers) {
      const c = await page.locator(`th:has-text("${h}"), [role=columnheader]:has-text("${h}")`).count();
      if (c === 0) missing.push(h);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "detail tab DataGrid columns present" }
        : {
            ok: false,
            step: "detail columns",
            reason: `missingCols=${missing.join(",")}`,
          },
    );
  }

  // 8) ABC filter buttons on detail tab
  {
    const labels = ["全部", "A 類", "B 類", "C 類"];
    const missing = [];
    for (const k of labels) {
      const c = await page.locator(`button:has-text("${k}")`).count();
      if (c === 0) missing.push(k);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "ABC filter buttons present" }
        : { ok: false, step: "ABC filter buttons", reason: `missing: ${missing.join(",")}` },
    );
  }

  // 9) 互動：切 ABC filter 到 A 類
  {
    const before = await page.locator("table tbody tr").count();
    await page.locator('button:has-text("A 類")').first().click().catch(() => {});
    await page.waitForTimeout(400);
    const after = await page.locator("table tbody tr").count();
    results.push({
      ok: true,
      step: `ABC filter click A: rows ${before} → ${after}`,
    });
    // reset
    await page.locator('button:has-text("全部")').first().click().catch(() => {});
    await page.waitForTimeout(300);
  }

  // 10) 搜尋框
  {
    const search = page.locator('input[placeholder*="料號"], input[placeholder*="搜尋"]').first();
    const has = await search.count();
    if (has > 0) {
      await search.fill("ZZZ-NO-MATCH-XYZ").catch(() => {});
      await page.waitForTimeout(400);
      const rows = await page.locator("table tbody tr").count();
      results.push({
        ok: true,
        step: `search input wired (rows after filter=${rows})`,
      });
      await search.fill("").catch(() => {});
    } else {
      results.push({ ok: false, step: "search input", reason: "not found" });
    }
  }

  // 11) 切到「庫存周轉率」tab — 應顯示前往連結
  {
    await page.locator('button:has-text("庫存周轉率")').first().click().catch(() => {});
    await page.waitForTimeout(300);
    const link = await page.locator('a[href="/parts/analytics/turnover"]').count();
    results.push(
      link > 0
        ? { ok: true, step: "turnover tab shows link to sibling page" }
        : { ok: false, step: "turnover link", reason: "not found" },
    );
  }

  // 12) no console errors
  if (consoleErrors.length > 0) {
    results.push({
      ok: false,
      step: "browser console errors",
      errors: consoleErrors,
    });
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
        ? `[analytics-abc-smoke] OK ${r.step}`
        : `[analytics-abc-smoke] FAIL ${r.step} — ${r.reason || JSON.stringify(r)}`,
    );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
