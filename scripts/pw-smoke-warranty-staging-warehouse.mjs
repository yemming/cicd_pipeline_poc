#!/usr/bin/env node
// Smoke test for /parts/warranty/staging-warehouse (保固暫存倉設定)
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[staging-warehouse-smoke]", ...m);

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

  // 1) Load page
  {
    const resp = await page.goto(`${BASE}/parts/warranty/staging-warehouse`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load /staging-warehouse",
        reason: `status=${status} url=${finalUrl}`,
      });
      await browser.close();
      report(results);
      return;
    }
    results.push({ ok: true, step: "load /staging-warehouse", status });
  }

  // 2) h1 = 暫存倉設定
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("暫存倉設定")
        ? { ok: true, step: "h1 = 暫存倉設定" }
        : { ok: false, step: "h1 check", reason: `h1="${h1}"` },
    );
  }

  // 3) sprint chip 11.3
  {
    const chip = await page.locator('span:has-text("11.3")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip 11.3" }
        : { ok: false, step: "sprint chip 11.3", reason: "not found" },
    );
  }

  // 4) Section headers — 暫存倉列表 + 規則設定
  {
    const expected = ["暫存倉列表", "暫存倉規則設定"];
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

  // 5) 庫存隔離設定 4 個 checkbox
  {
    const labels = [
      "暫存倉庫存不計入門店可售庫存",
      "不參與缺貨告警計算",
      "不參與定期盤點作業",
      "允許臨時借調至主倉",
    ];
    let found = 0;
    for (const l of labels) {
      const c = await page.locator(`label:has-text("${l}")`).count();
      if (c > 0) found++;
    }
    results.push(
      found === labels.length
        ? { ok: true, step: "4 isolation checkboxes present" }
        : { ok: false, step: "isolation checkboxes", reason: `found=${found}/${labels.length}` },
    );
  }

  // 6) 超期告警 2 個 number input
  {
    const numInputs = await page.locator('input[type="number"]').count();
    results.push(
      numInputs >= 2
        ? { ok: true, step: "alert day inputs present", count: numInputs }
        : { ok: false, step: "alert day inputs", reason: `count=${numInputs}` },
    );
  }

  // 7) 成本計算方式 select 2 options
  {
    const opts = await page
      .locator('select option:has-text("暫不計算成本"), select option:has-text("移入時按進貨成本")')
      .count();
    results.push(
      opts >= 2
        ? { ok: true, step: "cost calc method options present" }
        : { ok: false, step: "cost calc options", reason: `count=${opts}` },
    );
  }

  // 8) ＋ 新增暫存倉 button
  {
    const btn = await page.locator('button:has-text("新增暫存倉")').count();
    results.push(
      btn > 0
        ? { ok: true, step: "+ 新增暫存倉 button present" }
        : { ok: false, step: "+ create button", reason: "not found" },
    );
  }

  // 9) 存放明細區塊 header
  {
    const c = await page.locator('h2:has-text("目前存放明細")').count();
    results.push(
      c > 0
        ? { ok: true, step: "items section header present" }
        : { ok: false, step: "items header", reason: "not found" },
    );
  }

  // 10) Toggle 一個規則 checkbox → 等 router.refresh 後仍 visible（rules round-trip）
  {
    const cb = page
      .locator('label:has-text("允許臨時借調至主倉")')
      .locator('input[type="checkbox"]')
      .first();
    if ((await cb.count()) === 0) {
      results.push({ ok: false, step: "toggle rule round-trip", reason: "checkbox not found" });
    } else {
      const before = await cb.isChecked();
      await cb.click();
      // 等 banner（樂觀 toast）出現
      await page
        .locator('div:has-text("✓ 已儲存")')
        .first()
        .waitFor({ state: "visible", timeout: 8000 })
        .catch(() => {});
      // 等 banner 收掉 + refresh 完
      await page.waitForTimeout(2500);
      const after = await cb.isChecked();
      // toggle 回原狀（cleanup）
      await cb.click();
      await page.waitForTimeout(2500);
      results.push(
        after !== before
          ? { ok: true, step: "toggle rule round-trip", before, after }
          : {
              ok: false,
              step: "toggle rule round-trip",
              reason: `state unchanged before=${before} after=${after}`,
            },
      );
    }
  }

  // 11) 點 ＋ 新增暫存倉 → Modal 彈出（code / name input 出現）
  {
    await page.locator('button:has-text("新增暫存倉")').first().click();
    await page.waitForTimeout(400);
    const codeInput = await page
      .locator('input[placeholder="WH-WARRANTY-TPE"]')
      .count();
    const nameInput = await page
      .locator('input[placeholder="台北直營-保固暫存倉"]')
      .count();
    results.push(
      codeInput > 0 && nameInput > 0
        ? { ok: true, step: "create modal opens" }
        : {
            ok: false,
            step: "create modal",
            reason: `codeInput=${codeInput} nameInput=${nameInput}`,
          },
    );
    // 關掉 modal（取消）
    const cancelBtn = page.locator('button:has-text("取消")').first();
    if ((await cancelBtn.count()) > 0) await cancelBtn.click();
    await page.waitForTimeout(200);
  }

  // 12) 無 console error
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
        ? `[staging-warehouse-smoke] ✓ ${r.step}`
        : `[staging-warehouse-smoke] ✗ ${r.step} — ${r.reason || JSON.stringify(r)}`,
    );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
