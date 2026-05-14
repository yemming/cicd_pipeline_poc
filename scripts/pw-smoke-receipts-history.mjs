#!/usr/bin/env node
// Smoke test for /parts/operations/receipts-history (入庫查詢)
// - 確認頁面 load 沒 error / hydration mismatch
// - 確認 Page Header / Sprint chip / Filter bar / DataGrid 結構
// - 確認 type filter round-trip 與重置
// - 確認 row 的「檢視」連到對應 detail（依 type）
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);
const PAGE_PATH = "/parts/operations/receipts-history";

const log = (...m) => console.error("[receipts-history-smoke]", ...m);

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

  // 1) page load
  {
    const resp = await page.goto(`${BASE}${PAGE_PATH}`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({ ok: false, step: "load page", reason: `status=${status} url=${finalUrl}` });
    } else {
      results.push({ ok: true, step: "load page", status });
    }
  }

  // 2) H1 = 入庫查詢 + sprint chip 7.5
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("入庫查詢")
        ? { ok: true, step: "H1 = 入庫查詢", h1 }
        : { ok: false, step: "H1 check", reason: `h1="${h1}"` },
    );
    const chip = await page.locator('span:has-text("7.5")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip 7.5 present" }
        : { ok: false, step: "sprint chip 7.5", reason: "not found" },
    );
  }

  // 3) Filter bar 包含 類型 / 狀態 / 入庫單號 / 起始日 / 結束日 + 查詢 + 重置
  {
    const expected = ["類型", "狀態", "入庫單號", "起始日", "結束日"];
    const missing = [];
    for (const label of expected) {
      const c = await page.locator(`label:has-text("${label}")`).first().count();
      if (c === 0) missing.push(label);
    }
    if (missing.length === 0) {
      results.push({ ok: true, step: "filter labels", labels: expected });
    } else {
      results.push({ ok: false, step: "filter labels", reason: `missing ${missing.join(",")}` });
    }
    const qBtn = await page.locator('button:has-text("查詢")').count();
    const rBtn = await page.locator('button:has-text("重置")').count();
    results.push(
      qBtn > 0 && rBtn > 0
        ? { ok: true, step: "查詢/重置 buttons present" }
        : { ok: false, step: "查詢/重置 buttons", reason: `q=${qBtn} r=${rBtn}` },
    );
  }

  // 4) DataGrid table rendered（表頭至少要有「入庫單號」、「類型」、「狀態」）
  {
    const headers = await page
      .locator("table thead th")
      .evaluateAll((els) => els.map((e) => e.textContent?.trim()).filter(Boolean));
    const need = ["入庫單號", "類型", "狀態"];
    const has = need.filter((n) => headers.some((h) => h?.includes(n)));
    results.push(
      has.length === need.length
        ? { ok: true, step: "DataGrid headers", headers }
        : { ok: false, step: "DataGrid headers", reason: `headers=${JSON.stringify(headers)}` },
    );
  }

  // 5) 共 N 筆 caption 存在
  {
    const c = await page.locator('text=/共.*筆入庫紀錄/').count();
    results.push(
      c > 0
        ? { ok: true, step: "total count caption" }
        : { ok: false, step: "total count caption", reason: "not found" },
    );
  }

  // 6) row「檢視」link 指向 /parts/receipt/{po-grn|transfer-in|internal-sale|return-in}/{uuid}
  {
    const detailHrefs = await page
      .locator('a:has-text("檢視")')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")).filter(Boolean));
    if (detailHrefs.length === 0) {
      results.push({ ok: true, step: "row 檢視 href (no rows / not shown)", note: "no link to verify" });
    } else {
      const re =
        /^\/parts\/receipt\/(po-grn|transfer-in|internal-sale|return-in)\/[0-9a-f-]{36}$/;
      const bad = detailHrefs.filter((h) => !re.test(h));
      if (bad.length === 0) {
        results.push({
          ok: true,
          step: "row 檢視 href points to receipt detail",
          count: detailHrefs.length,
        });
      } else {
        results.push({
          ok: false,
          step: "row 檢視 href",
          reason: `bad ${bad.slice(0, 3).join(",")}`,
        });
      }
    }
  }

  // 7) type filter round-trip → ?type=purchase
  {
    const sel = page.locator('label:has-text("類型") + select');
    await sel.selectOption("purchase");
    await page.locator('button:has-text("查詢")').click();
    await page
      .waitForURL((target) => new URL(target).searchParams.get("type") === "purchase", {
        timeout: 30_000,
      })
      .catch(() => {});
    const u = new URL(page.url());
    if (u.pathname === PAGE_PATH && u.searchParams.get("type") === "purchase") {
      results.push({ ok: true, step: "filter round-trip → ?type=purchase" });
    } else {
      results.push({ ok: false, step: "filter round-trip", reason: `url=${u.toString()}` });
    }
  }

  // 8) 重置 → URL 回到 PAGE_PATH 無 query
  {
    await page.locator('button:has-text("重置")').click();
    await page
      .waitForURL((target) => {
        const x = new URL(target);
        return x.pathname === PAGE_PATH && [...x.searchParams.keys()].length === 0;
      }, { timeout: 30_000 })
      .catch(() => {});
    const u = new URL(page.url());
    if (u.pathname === PAGE_PATH && [...u.searchParams.keys()].length === 0) {
      results.push({ ok: true, step: "reset filters" });
    } else {
      results.push({ ok: false, step: "reset filters", reason: `url=${u.toString()}` });
    }
  }

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
  for (const r of results)
    log(r.ok ? `✓ ${r.step}` : `✗ ${r.step} — ${r.reason || JSON.stringify(r)}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
