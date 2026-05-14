#!/usr/bin/env node
// Smoke test for /parts/warranty/cost-recovery (保固索賠費用回收追蹤 11.6)
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[warranty-cost-recovery-smoke]", ...m);

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
    const resp = await page.goto(`${BASE}/parts/warranty/cost-recovery`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load /cost-recovery",
        reason: `status=${status} url=${finalUrl}`,
      });
      await browser.close();
      report(results);
      return;
    }
    results.push({ ok: true, step: "load /cost-recovery", status });
  }

  // 2) h1
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("索賠費用回收追蹤")
        ? { ok: true, step: "h1 = 索賠費用回收追蹤" }
        : { ok: false, step: "h1 check", reason: `h1="${h1}"` },
    );
  }

  // 3) sprint chip 11.6
  {
    const chip = await page.locator('span:has-text("11.6")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip 11.6" }
        : { ok: false, step: "sprint chip 11.6", reason: "not found" },
    );
  }

  // 4) KPI cards (4 個)
  {
    const expected = ["本月待收款", "本月已收款", "審核中金額", "本月拒絕金額"];
    const missing = [];
    for (const k of expected) {
      const c = await page.locator(`text=${k}`).count();
      if (c === 0) missing.push(k);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "KPI cards (4) present" }
        : { ok: false, step: "KPI cards", reason: `missing: ${missing.join(",")}` },
    );
  }

  // 5) filter labels
  {
    const expected = ["狀態", "索賠類型", "期間（預計收款月）", "關鍵字"];
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

  // 6) 查詢 / 重置 buttons
  {
    const query = await page.locator('button:has-text("查詢")').count();
    const reset = await page.locator('button:has-text("重置")').count();
    results.push(
      query > 0 && reset > 0
        ? { ok: true, step: "查詢 + 重置 buttons present" }
        : {
            ok: false,
            step: "filter buttons",
            reason: `查詢=${query} 重置=${reset}`,
          },
    );
  }

  // 7) DataGrid headers
  {
    const expected = [
      "索賠單號",
      "RO 工單",
      "品名",
      "類型",
      "申請金額",
      "核准金額",
      "狀態",
      "預計收款日",
    ];
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

  // 8) Toolbar caption 共 N 筆 · 合計
  {
    const caption = await page.locator('text=/共\\s+\\d+\\s+筆/').first().count();
    const sum = await page.locator('text=合計').count();
    results.push(
      caption > 0 && sum > 0
        ? { ok: true, step: "toolbar caption + 合計 present" }
        : {
            ok: false,
            step: "toolbar caption",
            reason: `caption=${caption} 合計=${sum}`,
          },
    );
  }

  // 9) DataGrid has Indian demo rows (3 件 indian seed)
  {
    const claimCells = await page
      .locator('span.font-mono.font-semibold')
      .count();
    results.push(
      claimCells > 0
        ? { ok: true, step: "DataGrid has rows", count: claimCells }
        : { ok: false, step: "DataGrid rows", reason: "no rows rendered" },
    );
  }

  // 10) 自動化設定 section
  {
    const sec = await page.locator('text=自動化').count();
    const c1 = await page.locator('text=預計收款日前 7 天發送提醒').count();
    const c2 = await page
      .locator('text=超過預計收款日仍未收款，升級告警')
      .count();
    const c3 = await page
      .locator('text=標記「已收款」時，自動沖銷零件暫估成本')
      .count();
    results.push(
      sec > 0 && c1 > 0 && c2 > 0 && c3 > 0
        ? { ok: true, step: "automation config section + checkboxes" }
        : {
            ok: false,
            step: "automation config",
            reason: `sec=${sec} c1=${c1} c2=${c2} c3=${c3}`,
          },
    );
  }

  // 11) filter 互動 — 套用 status=paid，確認列表會變
  {
    await page
      .locator('label:has-text("狀態") + select')
      .selectOption("paid")
      .catch(() => {});
    await page.locator('button:has-text("查詢")').first().click().catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(800);
    const u = page.url();
    results.push(
      u.includes("status=paid")
        ? { ok: true, step: "filter status=paid wires URL" }
        : { ok: false, step: "filter URL wire", reason: `url=${u}` },
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
        ? `[warranty-cost-recovery-smoke] ✓ ${r.step}`
        : `[warranty-cost-recovery-smoke] ✗ ${r.step} — ${r.reason || JSON.stringify(r)}`,
    );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
