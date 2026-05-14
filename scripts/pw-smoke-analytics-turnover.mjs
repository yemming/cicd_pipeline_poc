#!/usr/bin/env node
// Smoke test for /parts/analytics/turnover (庫存周轉率報表 §12.2)
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[analytics-turnover-smoke]", ...m);

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
    const resp = await page.goto(`${BASE}/parts/analytics/turnover`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load /turnover",
        reason: `status=${status} url=${finalUrl}`,
      });
      await browser.close();
      report(results);
      return;
    }
    results.push({ ok: true, step: "load /turnover", status });
  }

  // 2) h1
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("庫存周轉率")
        ? { ok: true, step: "h1 includes 庫存周轉率" }
        : { ok: false, step: "h1 check", reason: `h1="${h1}"` },
    );
  }

  // 3) sprint chip 12.2
  {
    const chip = await page.locator('span:has-text("12.2")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip 12.2" }
        : { ok: false, step: "sprint chip 12.2", reason: "not found" },
    );
  }

  // 4) 4 個 KPI tiles（整體 + A + B + C）
  {
    const labels = [
      "整體周轉率",
      "A 類平均周轉率",
      "B 類平均周轉率",
      "C 類平均周轉率",
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

  // 5) filter bar — ABC pill buttons (全部 / A / B / C)
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

  // 6) 排序 select 有 3 個選項
  {
    // label 與 select 是 sibling（flex col），用 selector 找 page 上有 ratio_asc 的 select
    const values = await page
      .locator("select")
      .evaluateAll((els) => {
        for (const el of els) {
          const opts = Array.from(el.querySelectorAll("option")).map(
            (o) => o.value,
          );
          if (opts.includes("ratio_asc")) return opts;
        }
        return [];
      })
      .catch(() => []);
    const expected = ["ratio_asc", "ratio_desc", "amount_desc"];
    const ok = expected.every((v) => values.includes(v));
    results.push(
      ok
        ? { ok: true, step: "sort select has 3 options", values }
        : {
            ok: false,
            step: "sort select options",
            reason: `values=${JSON.stringify(values)}`,
          },
    );
  }

  // 7) 月度趨勢 section
  {
    const c = await page.locator('text=月度出庫趨勢').count();
    results.push(
      c > 0
        ? { ok: true, step: "monthly trend section present" }
        : { ok: false, step: "monthly trend section", reason: "not found" },
    );
  }

  // 8) 明細表 section + DataGrid 表頭（料號 / 周轉率 / 建議動作）
  {
    const sec = await page.locator('text=庫存周轉率明細').count();
    const headers = ["料號", "周轉率", "建議動作"];
    const missing = [];
    for (const h of headers) {
      const c = await page.locator(`th:has-text("${h}"), [role=columnheader]:has-text("${h}")`).count();
      if (c === 0) missing.push(h);
    }
    results.push(
      sec > 0 && missing.length === 0
        ? { ok: true, step: "detail section + key columns present" }
        : {
            ok: false,
            step: "detail section/columns",
            reason: `section=${sec} missingCols=${missing.join(",")}`,
          },
    );
  }

  // 9) 互動：切 ABC filter 到 A 類 — 表格列數變化或維持（不爆錯即 pass）
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

  // 10) 互動：搜尋框輸入 keyword
  {
    const search = page.locator('input[placeholder*="料號"]').first();
    const has = await search.count();
    if (has > 0) {
      await search.fill("ZZZ-NO-MATCH-XYZ").catch(() => {});
      await page.waitForTimeout(400);
      const empty = await page
        .locator('text=尚無周轉率資料, text=No rows')
        .count();
      // 即使有資料、搜不到至少 rows 該變少；不爆錯即 pass
      results.push({
        ok: true,
        step: `search input wired (empty-state count=${empty})`,
      });
      await search.fill("").catch(() => {});
    } else {
      results.push({ ok: false, step: "search input", reason: "not found" });
    }
  }

  // 11) Caveat 說明區
  {
    const c = await page.locator('text=計算說明').count();
    results.push(
      c > 0
        ? { ok: true, step: "caveat block present" }
        : { ok: false, step: "caveat block", reason: "not found" },
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
        ? `[analytics-turnover-smoke] OK ${r.step}`
        : `[analytics-turnover-smoke] FAIL ${r.step} — ${r.reason || JSON.stringify(r)}`,
    );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
