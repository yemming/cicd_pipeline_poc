#!/usr/bin/env node
// Smoke test for /parts/analytics/abc-structure (ABC 結構圖 §12.5)
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[abc-structure-smoke]", ...m);

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
    const resp = await page.goto(`${BASE}/parts/analytics/abc-structure`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load /abc-structure",
        reason: `status=${status} url=${finalUrl}`,
      });
      await browser.close();
      report(results);
      return;
    }
    results.push({ ok: true, step: "load /abc-structure", status });
  }

  // 2) H1
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("ABC 結構圖")
        ? { ok: true, step: "h1 includes ABC 結構圖" }
        : { ok: false, step: "h1 check", reason: `h1="${h1}"` },
    );
  }

  // 3) Sprint chip §12.5
  {
    const chip = await page.locator('span:has-text("§12.5")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip §12.5 present" }
        : { ok: false, step: "sprint chip §12.5", reason: "not found" },
    );
  }

  // 4) 3 KPI tiles (A/B/C)
  {
    const labels = [
      "A 類 · 料號數 / 銷售額佔比",
      "B 類 · 料號數 / 銷售額佔比",
      "C 類 · 料號數 / 銷售額佔比",
    ];
    const missing = [];
    for (const k of labels) {
      const c = await page.locator(`text=${k}`).count();
      if (c === 0) missing.push(k);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "3 KPI tiles (A/B/C) present" }
        : { ok: false, step: "KPI tiles", reason: `missing: ${missing.join(",")}` },
    );
  }

  // 5) Pareto card header
  {
    const c = await page
      .locator('text=帕雷托曲線（料號累計 % vs 銷售額累計 %）')
      .count();
    results.push(
      c > 0
        ? { ok: true, step: "pareto card header present" }
        : { ok: false, step: "pareto card", reason: "header not found" },
    );
  }

  // 6) Donut card header
  {
    const c = await page
      .locator('text=銷售額結構（A / B / C 金額佔比）')
      .count();
    results.push(
      c > 0
        ? { ok: true, step: "donut card header present" }
        : { ok: false, step: "donut card", reason: "header not found" },
    );
  }

  // 7) Period compare card
  {
    const c = await page.locator('text=ABC 結構：本期 vs 上次重跑').count();
    results.push(
      c > 0
        ? { ok: true, step: "period compare card present" }
        : { ok: false, step: "period compare card", reason: "header not found" },
    );
  }

  // 8) Changes card header
  {
    const c = await page.locator('text=本次分類變動記錄').count();
    results.push(
      c > 0
        ? { ok: true, step: "changes card present" }
        : { ok: false, step: "changes card", reason: "header not found" },
    );
  }

  // 9) Footer pills to sibling analytics pages
  {
    const hrefs = [
      "/parts/analytics/turnover",
      "/parts/analytics/stale",
      "/parts/analytics/abc-settings",
      "/parts/analytics/abc",
    ];
    const missing = [];
    for (const h of hrefs) {
      const c = await page.locator(`a[href="${h}"]`).count();
      if (c === 0) missing.push(h);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "4 footer navigation pills present" }
        : { ok: false, step: "footer pills", reason: `missing: ${missing.join(",")}` },
    );
  }

  // 10) SVG pareto curve rendered (or graceful empty state)
  {
    const svg = await page.locator("svg").count();
    const empty = await page
      .locator('text=尚無 ABC 分類資料')
      .count();
    results.push(
      svg > 0 || empty > 0
        ? { ok: true, step: `pareto svg=${svg} or graceful-empty=${empty}` }
        : { ok: false, step: "pareto svg/empty", reason: "neither svg nor empty state" },
    );
  }

  // 11) navigate to sibling via footer pill
  {
    const link = page.locator('a[href="/parts/analytics/abc-settings"]').first();
    await Promise.all([
      page.waitForURL(/\/parts\/analytics\/abc-settings/, { timeout: NAV_TIMEOUT }).catch(() => {}),
      link.click().catch(() => {}),
    ]);
    await page.waitForTimeout(800);
    const u = page.url();
    results.push(
      u.includes("/parts/analytics/abc-settings")
        ? { ok: true, step: "footer pill nav → abc-settings" }
        : { ok: false, step: "footer nav", reason: `url=${u}` },
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
        ? `[abc-structure-smoke] OK ${r.step}`
        : `[abc-structure-smoke] FAIL ${r.step} — ${r.reason || JSON.stringify(r)}`,
    );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
