#!/usr/bin/env node
// Smoke test for /parts/alerts/rules (告警類型與規則)
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[alerts-rules-smoke]", ...m);

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

  // 1) load /parts/alerts/rules
  {
    const resp = await page.goto(`${BASE}/parts/alerts/rules`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load /rules",
        reason: `status=${status} url=${finalUrl}`,
      });
      await browser.close();
      report(results);
      return;
    }
    results.push({ ok: true, step: "load /rules", status });
  }

  // 2) h1 = 告警類型與規則
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("告警類型與規則")
        ? { ok: true, step: "h1 = 告警類型與規則" }
        : { ok: false, step: "h1 check", reason: `h1="${h1}"` },
    );
  }

  // 3) sprint chip 10.2
  {
    const chip = await page.locator('span:has-text("10.2")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip 10.2" }
        : { ok: false, step: "sprint chip 10.2", reason: "not found" },
    );
  }

  // 4) filter labels — 代碼 / 名稱搜尋、優先度、色調、啟用狀態
  {
    const expected = ["代碼 / 名稱搜尋", "優先度", "色調", "啟用狀態"];
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

  // 5) DataGrid headers — 代碼 / 名稱 / 描述 / 優先度 / 色調 / 通道
  {
    const expected = ["代碼", "名稱", "描述", "優先度", "色調", "通道"];
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

  // 6) total caption 「共 N 筆告警規則」
  {
    const caption = await page
      .locator('text=/共\\s+\\d+\\s+筆告警規則/')
      .first()
      .count();
    results.push(
      caption > 0
        ? { ok: true, step: "total caption present" }
        : { ok: false, step: "total caption", reason: "not found" },
    );
  }

  // 7) 新增按鈕（＋ 新增規則）
  {
    const addBtn = await page.locator('a:has-text("＋ 新增規則")').count();
    results.push(
      addBtn > 0
        ? { ok: true, step: "新增規則 link present" }
        : { ok: false, step: "新增規則 link", reason: "missing" },
    );
  }

  // 8) DataGrid 有 indian demo rows
  {
    const codeLinks = page.locator('a.font-mono[href^="/parts/alerts/rules/"]');
    const linkCount = await codeLinks.count();
    results.push(
      linkCount > 0
        ? { ok: true, step: "DataGrid has indian demo rows", count: linkCount }
        : { ok: false, step: "DataGrid rows", reason: "no code links found" },
    );

    if (linkCount > 0) {
      // 9) 抓 href 後 goto
      const firstHref = await codeLinks.first().getAttribute("href");
      if (firstHref) {
        await page.goto(`${BASE}${firstHref}`, {
          waitUntil: "domcontentloaded",
          timeout: NAV_TIMEOUT,
        });
      }
      const u = page.url();
      results.push(
        /\/parts\/alerts\/rules\/[0-9a-f-]{36}/.test(u)
          ? { ok: true, step: "navigate to detail page", url: u }
          : { ok: false, step: "navigate to detail", reason: `url=${u}` },
      );

      // 10) detail page renders: 修改 button + 區段 header（基本資料 / 嚴重度與視覺 / 通知通道）
      const modify = await page.locator('button:has-text("修改")').count();
      const sec1 = await page.locator('text=▼ 基本資料').count();
      const sec2 = await page.locator('text=▼ 嚴重度與視覺').count();
      const sec3 = await page.locator('text=▼ 通知通道').count();
      results.push(
        modify > 0 && sec1 > 0 && sec2 > 0 && sec3 > 0
          ? { ok: true, step: "detail page renders sections + CRUD pill" }
          : {
              ok: false,
              step: "detail page check",
              reason: `modify=${modify} sec1=${sec1} sec2=${sec2} sec3=${sec3}`,
            },
      );
    } else {
      results.push({ ok: false, step: "navigate to detail", reason: "no rows to click" });
      results.push({ ok: false, step: "detail page check", reason: "skipped (no rows)" });
    }
  }

  // 11) 無 console error
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
        ? `[alerts-rules-smoke] ✓ ${r.step}`
        : `[alerts-rules-smoke] ✗ ${r.step} — ${r.reason || JSON.stringify(r)}`,
    );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
