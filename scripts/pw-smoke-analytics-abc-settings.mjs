#!/usr/bin/env node
// Smoke test for /parts/analytics/abc-settings (ABC 分類設定 12.2)
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[analytics-abc-settings-smoke]", ...m);

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
    const resp = await page.goto(`${BASE}/parts/analytics/abc-settings`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load /abc-settings",
        reason: `status=${status} url=${finalUrl}`,
      });
      await browser.close();
      report(results);
      return;
    }
    results.push({ ok: true, step: "load /abc-settings", status });
  }

  // 2) h1
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("ABC 分類設定")
        ? { ok: true, step: "h1 = ABC 分類設定" }
        : { ok: false, step: "h1 check", reason: `h1="${h1}"` },
    );
  }

  // 3) sprint chip 12.2
  {
    const chip = await page.locator('span:has-text("12.2")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip 12.2" }
        : { ok: false, step: "sprint chip 12.2", reason: "not found" },
    );
  }

  // 4) 四個 section header
  {
    const expected = [
      "分類門檻",
      "盤點頻率",
      "安全庫存天數",
      "新品預設",
    ];
    const missing = [];
    for (const k of expected) {
      const c = await page.locator(`text=${k}`).count();
      if (c === 0) missing.push(k);
    }
    results.push(
      missing.length === 0
        ? { ok: true, step: "4 section headers present" }
        : { ok: false, step: "section headers", reason: `missing: ${missing.join(",")}` },
    );
  }

  // 5) threshold inputs (A / B 累計占比)
  {
    const aLabel = await page.locator('text=A 類累計占比').count();
    const bLabel = await page.locator('text=B 類累計占比').count();
    results.push(
      aLabel > 0 && bLabel > 0
        ? { ok: true, step: "threshold A/B labels present" }
        : { ok: false, step: "threshold labels", reason: `A=${aLabel} B=${bLabel}` },
    );
  }

  // 6) recalc_trigger select 對齊 DB CHECK
  {
    const select = page.locator('label:has-text("重算觸發") select').first();
    const options = await select.locator("option").allTextContents().catch(() => []);
    const values = await select.evaluate((el) =>
      Array.from(el.querySelectorAll("option")).map((o) => o.value),
    ).catch(() => []);
    const expected = ["manual", "monthly_first", "quarterly"];
    const valid = expected.every((v) => values.includes(v));
    results.push(
      valid
        ? { ok: true, step: "recalc_trigger options aligned with DB CHECK", values }
        : {
            ok: false,
            step: "recalc_trigger options",
            reason: `values=${JSON.stringify(values)} text=${JSON.stringify(options)}`,
          },
    );
  }

  // 7) 盤點頻率三個 row (A/B/C)
  {
    const countSection = page.locator('section', { has: page.locator('text=盤點頻率') });
    const inputs = await countSection.locator('input[type=number]').count();
    results.push(
      inputs >= 3
        ? { ok: true, step: "盤點頻率 has 3 inputs", count: inputs }
        : { ok: false, step: "盤點頻率 inputs", reason: `count=${inputs}` },
    );
  }

  // 8) 安全庫存三個 row (A/B/C)
  {
    const safetySection = page.locator('section', { has: page.locator('text=安全庫存天數') });
    const inputs = await safetySection.locator('input[type=number]').count();
    results.push(
      inputs >= 3
        ? { ok: true, step: "安全庫存 has 3 inputs", count: inputs }
        : { ok: false, step: "安全庫存 inputs", reason: `count=${inputs}` },
    );
  }

  // 9) 新品預設 — 預設分類 select + 觀察期 input
  {
    const newSection = page.locator('section', { has: page.locator('text=新品預設') });
    const sel = await newSection.locator('select').count();
    const inp = await newSection.locator('input[type=number]').count();
    results.push(
      sel > 0 && inp > 0
        ? { ok: true, step: "新品預設 select + input present" }
        : { ok: false, step: "新品預設", reason: `select=${sel} input=${inp}` },
    );
  }

  // 10) 互動：改 threshold_a_pct → 等 banner ✓ 已儲存
  {
    const aInput = page
      .locator('label:has-text("A 類累計占比") input[type=number]')
      .first();
    const cur = await aInput.inputValue().catch(() => "70");
    const next = String(Number(cur) === 75 ? 70 : 75);
    // 三連發：focus → 全選 → 鍵入新值，確保 React onChange 觸發
    await aInput.click().catch(() => {});
    await aInput.press("ControlOrMeta+a").catch(() => {});
    await aInput.press("Delete").catch(() => {});
    await aInput.pressSequentially(next, { delay: 30 }).catch(() => {});
    await aInput.blur().catch(() => {});
    const banner = page.locator('text=✓ 已儲存').first();
    const seen = await banner.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false);
    results.push(
      seen
        ? { ok: true, step: `mutate threshold_a_pct → ${next} ok, banner shown` }
        : { ok: false, step: "mutate threshold", reason: `no banner after pressSeq ${next}` },
    );
  }
  // banner 自動 2.2s 消失 — 等乾淨再進下一題
  await page.waitForTimeout(2800);

  // 11) 互動：切 recalc_trigger 到 manual → banner
  {
    const sel = page
      .locator('label:has-text("重算觸發") select')
      .first();
    await sel.selectOption("manual").catch(() => {});
    const banner = page.locator('text=✓ 已儲存').first();
    // banner 可能還在前一輪 — 等它消失再等下一輪
    await page.waitForTimeout(2500);
    const seen = await banner.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
    results.push(
      seen
        ? { ok: true, step: "mutate recalc_trigger=manual ok" }
        : { ok: false, step: "mutate recalc_trigger", reason: "no banner" },
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
        ? `[analytics-abc-settings-smoke] OK ${r.step}`
        : `[analytics-abc-settings-smoke] FAIL ${r.step} — ${r.reason || JSON.stringify(r)}`,
    );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
