#!/usr/bin/env node
// Smoke test for /parts/count/adjustments (盤點差異調整)
// Read-only：load list / filter labels / DataGrid headers / caption / detail navigation
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[count-adjustments-smoke]", ...m);

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

  // 1) load /parts/count/adjustments
  {
    const resp = await page.goto(`${BASE}/parts/count/adjustments`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load /adjustments",
        reason: `status=${status} url=${finalUrl}`,
      });
      await browser.close();
      report(results);
      return;
    }
    results.push({ ok: true, step: "load /adjustments", status });
  }

  // 2) h1 = 盤點差異調整
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("盤點差異調整")
        ? { ok: true, step: "h1 = 盤點差異調整" }
        : { ok: false, step: "h1 check", reason: `h1="${h1}"` },
    );
  }

  // 3) sprint chip 8.3
  {
    const chip = await page.locator('header span:has-text("8.3")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip 8.3" }
        : { ok: false, step: "sprint chip 8.3", reason: "not found" },
    );
  }

  // 4) filter labels：單號關鍵字 / 倉庫 / 狀態 / 差異
  {
    const labels = ["單號關鍵字", "倉庫", "狀態", "差異"];
    const missing = [];
    for (const l of labels) {
      const c = await page.locator(`label:has-text("${l}")`).count();
      if (c === 0) missing.push(l);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "filter labels present", labels: labels.join("/") }
        : {
            ok: false,
            step: "filter labels",
            reason: `missing: ${missing.join(", ")}`,
          },
    );
  }

  // 5) 查詢 / 重置 buttons
  {
    const q = await page.locator('button:has-text("查詢")').count();
    const r = await page.locator('button:has-text("重置")').count();
    results.push(
      q > 0 && r > 0
        ? { ok: true, step: "查詢 / 重置 buttons present" }
        : { ok: false, step: "filter buttons", reason: `query=${q} reset=${r}` },
    );
  }

  // 6) DataGrid headers：盤點單號 / 差異筆數 / 差異金額 / 狀態
  {
    const expected = ["盤點單號", "差異筆數", "差異金額", "狀態"];
    const missing = [];
    for (const h of expected) {
      const c = await page.locator(`th:has-text("${h}")`).count();
      if (c === 0) missing.push(h);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "DataGrid headers present" }
        : {
            ok: false,
            step: "DataGrid headers",
            reason: `missing: ${missing.join(", ")}`,
          },
    );
  }

  // 7) caption「共 N 筆差異盤點」
  {
    const cap = await page.locator('text=/共\\s*\\d+\\s*筆差異盤點/').count();
    results.push(
      cap > 0
        ? { ok: true, step: "total caption present" }
        : { ok: false, step: "total caption", reason: "not found" },
    );
  }

  // 8) list → detail navigation（用 goto 避開 client click 不穩定）
  let detailReached = false;
  let firstHref = "";
  {
    const firstLink = page
      .locator('a[href^="/parts/count/adjustments/"]')
      .filter({ hasNotText: "＋" })
      .first();
    const n = await firstLink.count();
    if (n === 0) {
      results.push({
        ok: true,
        step: "no rows to navigate (acceptable for read-only smoke)",
      });
    } else {
      firstHref = (await firstLink.getAttribute("href")) ?? "";
      if (!/\/parts\/count\/adjustments\/[0-9a-f-]{36}/.test(firstHref)) {
        results.push({
          ok: false,
          step: "row href is uuid path",
          reason: `firstHref=${firstHref}`,
        });
      } else {
        try {
          await page.goto(`${BASE}${firstHref}`, {
            waitUntil: "commit",
            timeout: NAV_TIMEOUT,
          });
          await page.locator("h1").first().waitFor({ state: "attached", timeout: 30_000 });
          const u = page.url();
          detailReached = /\/parts\/count\/adjustments\/[0-9a-f-]{36}/.test(u);
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
      }
    }
  }

  // 9) detail page: h1 含內容 + 麵包屑（reuse sessions detail view）
  if (detailReached) {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    const backBtn = await page
      .locator('button:has-text("返回列表"), a:has-text("返回列表")')
      .count();
    const okH1 = h1.length > 0;
    const okBack = backBtn > 0;
    results.push(
      okH1 && okBack
        ? { ok: true, step: "detail renders h1 + 返回列表", h1: h1.slice(0, 40) }
        : { ok: false, step: "detail page check", reason: `h1="${h1}" 返回列表=${backBtn}` },
    );
  } else {
    results.push({
      ok: true,
      step: "skip detail check (no row or detail unreached)",
    });
  }

  // 10) no console errors
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
  for (const r of results) {
    console.error(
      r.ok
        ? `[count-adjustments-smoke] ✓ ${r.step}`
        : `[count-adjustments-smoke] ✗ ${r.step} — ${r.reason || JSON.stringify(r)}`,
    );
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
