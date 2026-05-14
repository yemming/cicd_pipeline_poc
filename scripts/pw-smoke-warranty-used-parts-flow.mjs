#!/usr/bin/env node
// Smoke test for /parts/warranty/used-parts-flow (舊件出入庫邏輯設定)
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[used-parts-flow-smoke]", ...m);

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

  // 1) Load /parts/warranty/used-parts-flow
  {
    const resp = await page.goto(`${BASE}/parts/warranty/used-parts-flow`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load /used-parts-flow",
        reason: `status=${status} url=${finalUrl}`,
      });
      await browser.close();
      report(results);
      return;
    }
    results.push({ ok: true, step: "load /used-parts-flow", status });
  }

  // 2) h1 = 舊件出入庫邏輯設定
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("舊件出入庫邏輯設定")
        ? { ok: true, step: "h1 = 舊件出入庫邏輯設定" }
        : { ok: false, step: "h1 check", reason: `h1="${h1}"` },
    );
  }

  // 3) sprint chip 11.2
  {
    const chip = await page.locator('span:has-text("11.2")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip 11.2" }
        : { ok: false, step: "sprint chip 11.2", reason: "not found" },
    );
  }

  // 4) 三大 section header — 入庫 / 出庫 / 在途追蹤
  {
    const expected = ["舊件入庫邏輯設定", "舊件出庫邏輯設定", "舊件在途狀態查詢"];
    const missing = [];
    for (const h of expected) {
      const c = await page.locator(`h2:has-text("${h}")`).count();
      if (c === 0) missing.push(h);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "section headers present" }
        : { ok: false, step: "section headers", reason: `missing: ${missing.join(",")}` },
    );
  }

  // 5) 5 個 trigger checkbox 存在
  {
    const triggers = [
      "trigger-trigger_auto_reserve",
      "trigger-trigger_scan_inbound",
      "trigger-trigger_manual_no_serial",
      "trigger-trigger_require_photo",
      "trigger-trigger_auto_barcode",
    ];
    const missing = [];
    for (const t of triggers) {
      const c = await page.locator(`[data-testid="${t}"]`).count();
      if (c === 0) missing.push(t);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "all 5 trigger checkboxes present" }
        : { ok: false, step: "trigger checkboxes", reason: `missing: ${missing.join(",")}` },
    );
  }

  // 6) inbound_warehouse select
  {
    const c = await page.locator('[data-testid="inbound-warehouse"]').count();
    results.push(
      c > 0
        ? { ok: true, step: "inbound warehouse select present" }
        : { ok: false, step: "inbound warehouse select", reason: "missing" },
    );
  }

  // 7) 出庫自動化兩個 checkbox
  {
    const a = await page.locator('[data-testid="auto-update-claim"]').count();
    const b = await page.locator('[data-testid="auto-link-cost-recovery"]').count();
    results.push(
      a > 0 && b > 0
        ? { ok: true, step: "outbound automation checkboxes present" }
        : {
            ok: false,
            step: "outbound automation",
            reason: `auto-update-claim=${a} auto-link-cost-recovery=${b}`,
          },
    );
  }

  // 8) Toggle trigger_require_photo + 等 banner
  {
    const cb = page.locator('[data-testid="trigger-trigger_require_photo"]');
    const before = await cb.isChecked();
    await cb.click();
    await page
      .locator('[data-testid="used-parts-flow-banner"]')
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() => {});
    const banner = await page
      .locator('[data-testid="used-parts-flow-banner"]')
      .innerText()
      .catch(() => "");
    // 回復到原狀（避免污染 seed）
    await page.waitForTimeout(800);
    const cb2 = page.locator('[data-testid="trigger-trigger_require_photo"]');
    const after = await cb2.isChecked();
    if (after !== before) {
      await cb2.click();
      await page.waitForTimeout(800);
    }
    results.push(
      banner.includes("已儲存")
        ? { ok: true, step: "toggle trigger + banner round-trip" }
        : {
            ok: false,
            step: "toggle trigger",
            reason: `banner="${banner}"`,
          },
    );
  }

  // 9) ＋ 新增舊件 按鈕
  {
    const c = await page.locator('[data-testid="item-create-open"]').count();
    results.push(
      c > 0
        ? { ok: true, step: "add item button present" }
        : { ok: false, step: "add item button", reason: "missing" },
    );
  }

  // 10) 點 ＋ 新增舊件 → modal 彈出 → 建立 → 驗 banner + row 出現
  let smokeBarcode = null;
  {
    await page.locator('[data-testid="item-create-open"]').click();
    await page.waitForTimeout(300);
    const barcodeInput = await page
      .locator('[data-testid="item-form-barcode"]')
      .count();
    if (barcodeInput === 0) {
      results.push({ ok: false, step: "item modal", reason: "barcode input not found" });
    } else {
      results.push({ ok: true, step: "item modal opens" });

      const rand = Math.floor(Math.random() * 9000) + 1000;
      smokeBarcode = `WR-SMOKE-${rand}`;
      const smokeName = `smoke 舊件 ${rand}`;
      await page.locator('[data-testid="item-form-barcode"]').fill(smokeBarcode);
      await page.locator('[data-testid="item-form-name"]').fill(smokeName);
      await page.locator('[data-testid="item-form-damage"]').selectOption("moderate");
      await page.locator('[data-testid="item-form-submit"]').click();

      await page
        .locator('[data-testid="used-parts-flow-banner"]')
        .waitFor({ state: "visible", timeout: 8000 })
        .catch(() => {});
      const banner = await page
        .locator('[data-testid="used-parts-flow-banner"]')
        .innerText()
        .catch(() => "");

      await page
        .locator(`td:has-text("${smokeBarcode}")`)
        .first()
        .waitFor({ state: "visible", timeout: 10000 })
        .catch(() => {});
      const rowVisible = await page
        .locator(`td:has-text("${smokeBarcode}")`)
        .count();
      // Banner 可能被上一次 toggle 的 "已儲存設定" 蓋住；row 出現才是 server-write 確認
      results.push(
        rowVisible > 0
          ? { ok: true, step: "create item round-trip", banner }
          : {
              ok: false,
              step: "create item",
              reason: `banner="${banner}" rowVisible=${rowVisible}`,
            },
      );
    }
  }

  // 11) 找到剛建的 row → 點核准 → 驗 status chip 改變
  if (smokeBarcode) {
    const row = page.locator(`tr:has(td:has-text("${smokeBarcode}"))`).first();
    const approveBtn = row.locator('button:has-text("核准")').first();
    const approveCount = await approveBtn.count();
    if (approveCount > 0) {
      await approveBtn.click();
      await page
        .locator(`tr:has(td:has-text("${smokeBarcode}")) span:has-text("核准-待寄回")`)
        .first()
        .waitFor({ state: "visible", timeout: 10000 })
        .catch(() => {});
      const labelCount = await page
        .locator(`tr:has(td:has-text("${smokeBarcode}")) span:has-text("核准-待寄回")`)
        .count();
      results.push(
        labelCount > 0
          ? { ok: true, step: "approve action updates status" }
          : { ok: false, step: "approve action", reason: "status label not updated" },
      );
    } else {
      results.push({ ok: false, step: "approve action", reason: "approve button not found" });
    }
  }

  // 12) Cleanup — 刪除 smoke item
  if (smokeBarcode) {
    page.once("dialog", (d) => d.accept());
    const row = page.locator(`tr:has(td:has-text("${smokeBarcode}"))`).first();
    const deleteBtn = row.locator('button:has-text("刪除")').first();
    if ((await deleteBtn.count()) > 0) {
      await deleteBtn.click();
      await page
        .locator(`td:has-text("${smokeBarcode}")`)
        .first()
        .waitFor({ state: "detached", timeout: 10000 })
        .catch(() => {});
      const stillThere = await page
        .locator(`td:has-text("${smokeBarcode}")`)
        .count();
      results.push(
        stillThere === 0
          ? { ok: true, step: "cleanup: delete smoke item" }
          : {
              ok: false,
              step: "cleanup",
              reason: `row still visible (count=${stillThere})`,
            },
      );
    } else {
      results.push({ ok: false, step: "cleanup", reason: "delete button not found" });
    }
  }

  // 13) 無 console error
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
        ? `[used-parts-flow-smoke] ✓ ${r.step}`
        : `[used-parts-flow-smoke] ✗ ${r.step} — ${r.reason || JSON.stringify(r)}`,
    );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
