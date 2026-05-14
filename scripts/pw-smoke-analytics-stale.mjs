#!/usr/bin/env node
// Smoke test for /parts/analytics/stale (呆滯庫存分析 §12.3)
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[analytics-stale-smoke]", ...m);

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

  // 1) load page
  {
    const resp = await page.goto(`${BASE}/parts/analytics/stale`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load /stale",
        reason: `status=${status} url=${finalUrl}`,
      });
      await browser.close();
      report(results);
      return;
    }
    results.push({ ok: true, step: "load /stale", status });
  }

  // 2) h1 contains 呆滯庫存佔比
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("呆滯庫存")
        ? { ok: true, step: "h1 includes 呆滯庫存" }
        : { ok: false, step: "h1 check", reason: `h1="${h1}"` },
    );
  }

  // 3) sprint chip §12.3
  {
    const chip = await page.locator('span:has-text("12.3")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip 12.3" }
        : { ok: false, step: "sprint chip 12.3", reason: "not found" },
    );
  }

  // 4) 4 KPI tiles
  {
    const labels = [
      "呆滯庫存金額",
      "呆滯料號數",
      "嚴重滯銷（180 天+）",
      "本月新增呆滯",
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

  // 5) 兩張圖表卡 — 呆滯天數分佈 + 呆滯原因分析
  {
    const a = await page.locator('text=呆滯天數分佈').count();
    const b = await page.locator('text=呆滯原因分析').count();
    results.push(
      a > 0 && b > 0
        ? { ok: true, step: "bucket + reason cards present" }
        : {
            ok: false,
            step: "bucket/reason cards",
            reason: `bucket=${a} reason=${b}`,
          },
    );
  }

  // 6) bucket 標籤 3 段
  {
    const labels = ["90–180 天", "180–365 天", "365 天以上"];
    const missing = [];
    for (const k of labels) {
      const c = await page.locator(`text=${k}`).count();
      if (c === 0) missing.push(k);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "3 bucket labels present" }
        : { ok: false, step: "bucket labels", reason: `missing: ${missing.join(",")}` },
    );
  }

  // 7) Filter Bar — 呆滯天數 select 有 4 個選項
  {
    const values = await page
      .locator("select")
      .evaluateAll((els) => {
        for (const el of els) {
          const opts = Array.from(el.querySelectorAll("option")).map(
            (o) => o.value,
          );
          if (opts.includes("b90_180")) return opts;
        }
        return [];
      })
      .catch(() => []);
    const expected = ["all", "b90_180", "b180_365", "b365_plus"];
    const ok = expected.every((v) => values.includes(v));
    results.push(
      ok
        ? { ok: true, step: "bucket select has 4 options", values }
        : {
            ok: false,
            step: "bucket select options",
            reason: `values=${JSON.stringify(values)}`,
          },
    );
  }

  // 8) ABC pill buttons (全部 / A 類 / B 類 / C 類)
  {
    const labels = ["A 類", "B 類", "C 類"];
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

  // 9) 原因 select 有 5 個值
  {
    const values = await page
      .locator("select")
      .evaluateAll((els) => {
        for (const el of els) {
          const opts = Array.from(el.querySelectorAll("option")).map(
            (o) => o.value,
          );
          if (opts.includes("discontinued")) return opts;
        }
        return [];
      })
      .catch(() => []);
    const expected = ["all", "discontinued", "overstock", "rev_change", "other"];
    const ok = expected.every((v) => values.includes(v));
    results.push(
      ok
        ? { ok: true, step: "reason select has 5 options" }
        : {
            ok: false,
            step: "reason select options",
            reason: `values=${JSON.stringify(values)}`,
          },
    );
  }

  // 10) Detail section + DataGrid 表頭
  {
    const sec = await page.locator('text=呆滯庫存明細').count();
    const headers = ["料號", "品名", "庫存量", "呆滯天數", "呆滯原因", "建議處置"];
    const missing = [];
    for (const h of headers) {
      const c = await page
        .locator(`th:has-text("${h}"), [role=columnheader]:has-text("${h}")`)
        .count();
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

  // 11) 互動：搜尋框 (filter row)
  {
    const search = page.locator('input[placeholder*="料號"]').first();
    const has = await search.count();
    if (has > 0) {
      await search.fill("ZZZ-NO-MATCH-XYZ").catch(() => {});
      await page.waitForTimeout(400);
      results.push({ ok: true, step: "search input wired" });
      await search.fill("").catch(() => {});
    } else {
      results.push({ ok: false, step: "search input", reason: "not found" });
    }
  }

  // 12) 互動：切 bucket filter 到 b180_365
  {
    const select = page
      .locator("select")
      .filter({ has: page.locator('option[value="b90_180"]') })
      .first();
    if ((await select.count()) > 0) {
      const before = await page.locator("table tbody tr").count();
      await select.selectOption("b180_365").catch(() => {});
      await page.waitForTimeout(400);
      const after = await page.locator("table tbody tr").count();
      results.push({
        ok: true,
        step: `bucket filter b180_365: rows ${before} → ${after}`,
      });
      await select.selectOption("all").catch(() => {});
    } else {
      results.push({ ok: false, step: "bucket select interact", reason: "not found" });
    }
  }

  // 13) Caveat 說明區
  {
    const c = await page.locator('text=計算說明').count();
    results.push(
      c > 0
        ? { ok: true, step: "caveat block present" }
        : { ok: false, step: "caveat block", reason: "not found" },
    );
  }

  // 14) no console errors
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
        ? `[analytics-stale-smoke] OK ${r.step}`
        : `[analytics-stale-smoke] FAIL ${r.step} — ${r.reason || JSON.stringify(r)}`,
    );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
