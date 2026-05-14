#!/usr/bin/env node
// Smoke test for /parts/operations/adjust (庫存調整作業)
// - 確認頁面 load 沒 error
// - 確認標題、type filter 限縮、新增按鈕指向預填 manual 的 exception 頁
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[adjust-smoke]", ...m);

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

  // 1) /parts/operations/adjust load
  {
    const resp = await page.goto(`${BASE}/parts/operations/adjust`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({ ok: false, step: "load /adjust", reason: `status=${status} url=${finalUrl}` });
    } else {
      results.push({ ok: true, step: "load /adjust", status });
    }
  }

  // 2) Page header title 是「庫存調整作業」、不是「例外出入庫」
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    if (h1.includes("庫存調整作業")) {
      results.push({ ok: true, step: "title = 庫存調整作業", h1 });
    } else {
      results.push({ ok: false, step: "title check", reason: `h1="${h1}"` });
    }
  }

  // 3) sprint chip = 7.2
  {
    const chip = await page.locator('span:has-text("7.2")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip 7.2 present" }
        : { ok: false, step: "sprint chip 7.2", reason: "not found" },
    );
  }

  // 4) Type select 限縮：只有「全部 / 手動調整 / 損耗報廢」3 個選項
  {
    const typeOptions = await page
      .locator('label:has-text("類型") + select option')
      .evaluateAll((els) => els.map((e) => e.textContent?.trim()).filter(Boolean));
    const expected = ["全部", "手動調整", "損耗報廢"];
    const matches =
      typeOptions.length === expected.length &&
      expected.every((label) => typeOptions.includes(label));
    if (matches) {
      results.push({ ok: true, step: "type filter scope", options: typeOptions });
    } else {
      results.push({
        ok: false,
        step: "type filter scope",
        reason: `got ${JSON.stringify(typeOptions)} expected ${JSON.stringify(expected)}`,
      });
    }
  }

  // 5) 「+ 新增」按鈕 href = /parts/operations/exceptions/new?type=manual
  {
    const href = await page
      .locator('a:has-text("新增調整單")')
      .first()
      .getAttribute("href")
      .catch(() => null);
    if (href && href.includes("/parts/operations/exceptions/new") && href.includes("type=manual")) {
      results.push({ ok: true, step: "+ 新增 href", href });
    } else {
      results.push({ ok: false, step: "+ 新增 href", reason: `href="${href}"` });
    }
  }

  // 6) 列表上若有 row、列尾「詳細」連結應指向 /parts/operations/exceptions/[id]
  {
    const detailHrefs = await page
      .locator('a:has-text("詳細")')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")).filter(Boolean));
    if (detailHrefs.length === 0) {
      results.push({ ok: true, step: "row 詳細 href (empty list)", note: "no rows to verify" });
    } else {
      const allMatch = detailHrefs.every((h) =>
        /^\/parts\/operations\/exceptions\/[0-9a-f-]{36}$/.test(h),
      );
      results.push(
        allMatch
          ? { ok: true, step: "row 詳細 href points to exceptions detail", count: detailHrefs.length }
          : { ok: false, step: "row 詳細 href", reason: `bad hrefs ${detailHrefs.slice(0, 3)}` },
      );
    }
  }

  // 7) 篩選互動：選「損耗報廢」按查詢 → URL 帶 type=damage、basePath 仍為 adjust
  {
    const sel = page.locator('label:has-text("類型") + select');
    await sel.selectOption("damage");
    // 確保 React state 同步（onChange 已 fire）
    await page.waitForFunction(() => {
      const s = document.querySelector('label + select');
      return s && s.value === "damage";
    }, undefined, { timeout: 5_000 }).catch(() => {});
    await page.locator('button:has-text("查詢")').click();
    await page
      .waitForURL((target) => new URL(target).searchParams.get("type") === "damage", {
        timeout: 30_000,
      })
      .catch(() => {});
    const u = new URL(page.url());
    if (
      u.pathname === "/parts/operations/adjust" &&
      u.searchParams.get("type") === "damage"
    ) {
      results.push({ ok: true, step: "filter round-trip → ?type=damage", url: u.toString() });
    } else {
      results.push({ ok: false, step: "filter round-trip", reason: `url=${u.toString()}` });
    }
  }

  // 8) 重置 → URL 回到 /parts/operations/adjust（無 query）
  {
    await page.locator('button:has-text("重置")').click();
    await page.waitForURL((target) => {
      const x = new URL(target);
      return x.pathname === "/parts/operations/adjust" && [...x.searchParams.keys()].length === 0;
    }, { timeout: 30_000 }).catch(() => {});
    const u = new URL(page.url());
    if (u.pathname === "/parts/operations/adjust" && [...u.searchParams.keys()].length === 0) {
      results.push({ ok: true, step: "reset filters" });
    } else {
      results.push({ ok: false, step: "reset filters", reason: `url=${u.toString()}` });
    }
  }

  // 9) /parts/operations/exceptions/new?type=manual 預填 manual type
  {
    const resp = await page.goto(`${BASE}/parts/operations/exceptions/new?type=manual`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    if (status >= 400 || page.url().includes("/login")) {
      results.push({ ok: false, step: "new?type=manual load", reason: `status=${status}` });
    } else {
      const selected = await page
        .locator('label:has-text("調整類型"), label:has-text("類型")')
        .first()
        .locator("+ select")
        .evaluate((el) => el.value)
        .catch(() => "");
      if (selected === "manual") {
        results.push({ ok: true, step: "new?type=manual preselects manual" });
      } else {
        // form 不一定把 type 放在「類型」下；做更寬鬆的 fallback：找 page 內首個有 manual option 的 select
        const found = await page.evaluate(() => {
          const selects = Array.from(document.querySelectorAll("select"));
          return selects.find((s) => s.value === "manual") ? "manual" : null;
        });
        if (found === "manual") {
          results.push({ ok: true, step: "new?type=manual preselects manual (fallback selector)" });
        } else {
          results.push({
            ok: false,
            step: "new?type=manual preselects manual",
            reason: `got select.value="${selected}"`,
          });
        }
      }
    }
  }

  // 10) 確認舊 dead code adjust-form 沒被引用（grep）
  // 由 build / tsc 階段檢查、smoke 不必驗

  // console errors
  if (consoleErrors.length > 0) {
    results.push({ ok: false, step: "browser console errors", errors: consoleErrors });
  } else {
    results.push({ ok: true, step: "no browser console errors" });
  }

  await browser.close();
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
  for (const r of results) log(r.ok ? `✓ ${r.step}` : `✗ ${r.step} — ${r.reason || JSON.stringify(r)}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
