#!/usr/bin/env node
// Smoke test for /parts/warranty/ro-link (與 RO 工單串接設定 11.5)
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[ro-link-smoke]", ...m);

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
    const resp = await page.goto(`${BASE}/parts/warranty/ro-link`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load /ro-link",
        reason: `status=${status} url=${finalUrl}`,
      });
      await browser.close();
      report(results);
      return;
    }
    results.push({ ok: true, step: "load /ro-link", status });
  }

  // 2) h1 = 與 RO 工單串接設定
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("RO 工單串接")
        ? { ok: true, step: "h1 = 與 RO 工單串接設定" }
        : { ok: false, step: "h1 check", reason: `h1="${h1}"` },
    );
  }

  // 3) sprint chip 11.5
  {
    const chip = await page.locator('span:has-text("11.5")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip 11.5" }
        : { ok: false, step: "sprint chip 11.5", reason: "not found" },
    );
  }

  // 4) 左卡 — 串接系統設定 + DMS 連線狀態
  {
    const left = await page.locator('text=串接系統設定').first().count();
    const status = await page.locator('text=/已連線/').first().count();
    results.push(
      left > 0 && status > 0
        ? { ok: true, step: "left card 串接系統設定 + DMS 連線狀態" }
        : {
            ok: false,
            step: "left card",
            reason: `left=${left} status=${status}`,
          },
    );
  }

  // 5) 5 個 sync_* checkbox labels
  {
    const labels = [
      "RO 工單號",
      "車輛序列號",
      "保固類型",
      "技師 ID",
      "估價明細",
    ];
    let found = 0;
    for (const l of labels) {
      const c = await page.locator(`text=${l}`).first().count();
      if (c > 0) found++;
    }
    results.push(
      found === labels.length
        ? { ok: true, step: "5 sync field labels" }
        : { ok: false, step: "sync field labels", reason: `found=${found}/5` },
    );
  }

  // 6) 同步頻率 select 預設 = realtime
  {
    const selects = page.locator("select");
    const count = await selects.count();
    let freqSelect = null;
    for (let i = 0; i < count; i++) {
      const s = selects.nth(i);
      const val = await s.inputValue().catch(() => "");
      if (["realtime", "poll5", "poll60"].includes(val)) {
        freqSelect = s;
        break;
      }
    }
    results.push(
      freqSelect
        ? { ok: true, step: "sync_frequency select rendered" }
        : { ok: false, step: "sync_frequency select", reason: "not found" },
    );
  }

  // 7) 右卡 — 保固觸發規則 + 3 條條件
  {
    const right = await page.locator('text=保固觸發規則').first().count();
    const cond1 = await page.locator('text=條件 1').first().count();
    const cond2 = await page.locator('text=條件 2').first().count();
    const cond3 = await page.locator('text=條件 3').first().count();
    results.push(
      right > 0 && cond1 > 0 && cond2 > 0 && cond3 > 0
        ? { ok: true, step: "right card 保固觸發規則 + 3 conditions" }
        : {
            ok: false,
            step: "right card",
            reason: `r=${right} c1=${cond1} c2=${cond2} c3=${cond3}`,
          },
    );
  }

  // 8) 不符合保固時的處理 select
  {
    const fallback = await page.locator('text=不符合保固').first().count();
    results.push(
      fallback > 0
        ? { ok: true, step: "fallback_action label" }
        : { ok: false, step: "fallback label", reason: "not found" },
    );
  }

  // 9) 保固到期告警 number input
  {
    const num = await page.locator('input[type="number"]').first().count();
    const alert = await page.locator('text=保固到期').first().count();
    results.push(
      num > 0 && alert > 0
        ? { ok: true, step: "expiry_alert_days input" }
        : {
            ok: false,
            step: "expiry alert input",
            reason: `num=${num} label=${alert}`,
          },
    );
  }

  // 10) 儲存設定 button 預設 disabled（dirty=false）
  {
    const save = page.locator('button:has-text("儲存設定")').first();
    const disabled = await save.isDisabled().catch(() => true);
    results.push(
      disabled
        ? { ok: true, step: "儲存設定 button initial disabled (dirty=false)" }
        : {
            ok: false,
            step: "儲存設定 default state",
            reason: "expected disabled but enabled",
          },
    );
  }

  // 11) DataGrid 渲染 seed 列（RO-2026-2287 / 2341 / 2402 等）
  {
    const seed = await page
      .locator(
        'text=/RO-2026-2287|RO-2026-2341|RO-2026-2402|RO-2026-2410|RO-2026-2415/',
      )
      .first()
      .count();
    results.push(
      seed > 0
        ? { ok: true, step: "DataGrid seed row rendered" }
        : { ok: false, step: "seed row", reason: "no seed row visible" },
    );
  }

  // 12) 表格 header 含 RO 工單號 + 串接狀態 + 操作
  {
    const ro = await page.locator('text=RO 工單號').first().count();
    const sync = await page.locator('text=串接狀態').first().count();
    const op = await page.locator('text=操作').first().count();
    results.push(
      ro > 0 && sync > 0 && op > 0
        ? { ok: true, step: "DataGrid headers present" }
        : {
            ok: false,
            step: "DataGrid headers",
            reason: `ro=${ro} sync=${sync} op=${op}`,
          },
    );
  }

  // 13) pending 行有「手動驗證」綠色按鈕
  {
    const verify = await page.locator('button:has-text("手動驗證")').first().count();
    results.push(
      verify > 0
        ? { ok: true, step: "手動驗證 button on pending row" }
        : { ok: false, step: "verify button", reason: "not found" },
    );
  }

  // 14) 測試連線 button → 點擊後 banner 顯示「DMS 連線正常」
  {
    const btn = page.locator('button:has-text("測試連線")').first();
    if ((await btn.count()) > 0) {
      await btn.click();
      // 等 banner
      const ok = await page
        .locator('text=/DMS 連線正常|延遲/')
        .first()
        .waitFor({ state: "visible", timeout: 6000 })
        .then(() => true)
        .catch(() => false);
      results.push(
        ok
          ? { ok: true, step: "測試連線 → banner shows 連線正常" }
          : {
              ok: false,
              step: "測試連線 banner",
              reason: "banner not visible within 6s",
            },
      );
      // 等 banner 消失
      await page.waitForTimeout(2400);
    } else {
      results.push({
        ok: false,
        step: "測試連線",
        reason: "button not found",
      });
    }
  }

  // 15) 改 expiry_alert_days → 儲存設定 button enabled，點儲存 → banner 顯示「已儲存」
  {
    const num = page.locator('input[type="number"]').first();
    if ((await num.count()) > 0) {
      const curRaw = await num.inputValue().catch(() => "30");
      const cur = Math.floor(Number(curRaw) || 30);
      const next = cur === 45 ? 30 : 45;
      await num.fill(String(next));
      // 觸發 React onChange
      await num.blur();
      await page.waitForTimeout(150);
      const save = page.locator('button:has-text("儲存設定")').first();
      const disabled = await save.isDisabled().catch(() => true);
      if (disabled) {
        results.push({
          ok: false,
          step: "儲存設定 after edit",
          reason: "still disabled after expiry edit",
        });
      } else {
        await save.click();
        const ok = await page
          .locator('text=/已儲存串接設定/')
          .first()
          .waitFor({ state: "visible", timeout: 8000 })
          .then(() => true)
          .catch(() => false);
        results.push(
          ok
            ? { ok: true, step: "儲存設定 → banner 已儲存" }
            : {
                ok: false,
                step: "儲存設定 banner",
                reason: "banner not visible within 8s",
              },
        );
        // restore
        await page.waitForTimeout(2400);
        const num2 = page.locator('input[type="number"]').first();
        await num2.fill(String(cur));
        await num2.blur();
        await page.waitForTimeout(150);
        const save2 = page.locator('button:has-text("儲存設定")').first();
        if (!(await save2.isDisabled().catch(() => true))) {
          await save2.click();
          await page
            .locator('text=/已儲存串接設定/')
            .first()
            .waitFor({ state: "visible", timeout: 8000 })
            .catch(() => {});
          await page.waitForTimeout(2400);
        }
      }
    } else {
      results.push({
        ok: false,
        step: "儲存設定 edit",
        reason: "number input not found",
      });
    }
  }

  // 16) 無 console error
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
        ? `[ro-link-smoke] ✓ ${r.step}`
        : `[ro-link-smoke] ✗ ${r.step} — ${r.reason || JSON.stringify(r)}`,
    );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
