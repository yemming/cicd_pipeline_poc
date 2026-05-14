#!/usr/bin/env node
// Smoke test for /parts/count/sessions (盤點作業)
// Read-only smoke：list load / h1 / sprint chip 8.2 / filter labels /
// DataGrid headers / total caption / 啟動盤點 link / list→detail nav /
// detail load / 無 console error
//
// 不建立 / 修改任何盤點資料 — sessions 啟動會拍 stock_items snapshot，
// 不應該被 smoke 污染。CRUD round-trip 留給手測。
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[count-sessions-smoke]", ...m);

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

  // 1) /parts/count/sessions load
  {
    const resp = await page.goto(`${BASE}/parts/count/sessions`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load /sessions",
        reason: `status=${status} url=${finalUrl}`,
      });
      await browser.close();
      report(results);
      return;
    }
    results.push({ ok: true, step: "load /sessions", status });
  }

  // 2) h1 = 盤點作業
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("盤點作業")
        ? { ok: true, step: "h1 = 盤點作業" }
        : { ok: false, step: "h1 check", reason: `h1="${h1}"` },
    );
  }

  // 3) sprint chip 8.2
  {
    const chip = await page.locator('span:has-text("8.2")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip 8.2" }
        : { ok: false, step: "sprint chip 8.2", reason: "not found" },
    );
  }

  // 4) filter bar labels：單號關鍵字 / 倉庫 / 狀態
  {
    const missing = [];
    for (const label of ["單號關鍵字", "倉庫", "狀態"]) {
      const n = await page.locator(`label:has-text("${label}")`).count();
      if (n === 0) missing.push(label);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "filter labels 單號關鍵字/倉庫/狀態" }
        : { ok: false, step: "filter labels", reason: `missing=${missing.join(",")}` },
    );
  }

  // 5) [查詢][重置][＋ 啟動盤點] CTA 在 filter bar
  {
    const q = await page.locator('button:has-text("查詢")').count();
    const r = await page.locator('button:has-text("重置")').count();
    const a = await page.locator('a:has-text("＋ 啟動盤點"), button:has-text("＋ 啟動盤點")').count();
    results.push(
      q > 0 && r > 0 && a > 0
        ? { ok: true, step: "filter CTAs 查詢/重置/＋啟動盤點" }
        : { ok: false, step: "filter CTAs", reason: `查詢=${q} 重置=${r} 啟動=${a}` },
    );
  }

  // 6) total caption「共 N 場盤點」
  {
    const cap = await page.locator('text=/共\\s+\\d+\\s+場盤點/').count();
    results.push(
      cap > 0
        ? { ok: true, step: "total caption 共 N 場盤點" }
        : { ok: false, step: "total caption", reason: "not found" },
    );
  }

  // 7) DataGrid headers：盤點單號 / 倉庫 / 盤點日期 / 狀態
  {
    const missing = [];
    for (const h of ["盤點單號", "盤點日期", "狀態", "差異筆數"]) {
      const n = await page.locator(`th:has-text("${h}")`).count();
      if (n === 0) missing.push(h);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "DataGrid headers 盤點單號/盤點日期/狀態/差異筆數" }
        : { ok: false, step: "DataGrid headers", reason: `missing=${missing.join(",")}` },
    );
  }

  // 8) 取得第一筆 row 的 ct_no link（沒有就跳過 detail 導航測試）
  let firstHref = "";
  let firstText = "";
  {
    const firstLink = page
      .locator('a[href^="/parts/count/sessions/"]')
      .filter({ hasNotText: "＋" })
      .first();
    const n = await firstLink.count();
    if (n > 0) {
      firstHref = (await firstLink.getAttribute("href")) ?? "";
      firstText = await firstLink.innerText().catch(() => "");
      results.push({
        ok: true,
        step: "first row ct_no link present",
        href: firstHref,
        ct_no: firstText.slice(0, 20),
      });
    } else {
      results.push({
        ok: false,
        step: "first row ct_no link",
        reason: "no rows — Indian brand 沒任何 inventory_counts",
      });
    }
  }

  // 9) list → detail 跳轉（uuid 路徑）— 用 commit waitUntil 避開 hydration 重的頁
  let detailReached = false;
  if (firstHref && /\/parts\/count\/sessions\/[0-9a-f-]{36}/.test(firstHref)) {
    try {
      await page.goto(`${BASE}${firstHref}`, {
        waitUntil: "commit",
        timeout: NAV_TIMEOUT,
      });
      // 等 main 內容上場（h1 出現即可）
      await page.locator("h1").first().waitFor({ state: "attached", timeout: 30_000 });
      const u = page.url();
      detailReached = /\/parts\/count\/sessions\/[0-9a-f-]{36}/.test(u);
      results.push(
        detailReached
          ? { ok: true, step: "navigate list → detail", url: u }
          : { ok: false, step: "navigate list → detail", reason: `url=${u}` },
      );
    } catch (err) {
      results.push({
        ok: false,
        step: "navigate list → detail",
        reason: `goto failed: ${err.message?.slice(0, 200)}`,
      });
    }
  } else {
    results.push({
      ok: false,
      step: "navigate list → detail",
      reason: `firstHref=${firstHref} 不是 uuid 路徑`,
    });
  }

  // 10) detail page：h1 有內容 + 麵包屑「盤點作業」連結 + 至少一顆 CRUD pill
  if (detailReached) {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    const crumb = await page.locator('a:has-text("盤點作業")').count();
    const backBtn = await page
      .locator('button:has-text("返回列表"), a:has-text("返回列表")')
      .count();
    const okH1 = h1.length > 0;
    const okCrumb = crumb > 0;
    const okBack = backBtn > 0;
    results.push(
      okH1 && okCrumb && okBack
        ? { ok: true, step: "detail renders h1 + breadcrumb + 返回列表", h1 }
        : {
            ok: false,
            step: "detail page check",
            reason: `h1="${h1}" crumb=${crumb} 返回列表=${backBtn}`,
          },
    );
  } else {
    results.push({ ok: false, step: "detail page check", reason: "detail not reached" });
  }

  // 11) detail page：▼ 進度與差異 / 盤點明細 / 基本資料 section header
  if (detailReached) {
    const n = await page
      .locator('text=/▼.*(進度與差異|盤點明細|基本資料)/')
      .count();
    results.push(
      n > 0
        ? { ok: true, step: "detail has ▼ section headers" }
        : { ok: false, step: "detail section headers", reason: "no ▼ section found" },
    );
  } else {
    results.push({ ok: false, step: "detail section headers", reason: "detail not reached" });
  }

  // 12) console errors
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
        ? `[count-sessions-smoke] ✓ ${r.step}`
        : `[count-sessions-smoke] ✗ ${r.step} — ${r.reason || JSON.stringify(r)}`,
    );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
