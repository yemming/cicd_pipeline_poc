#!/usr/bin/env node
// Smoke test for /parts/warranty/used-parts (保固索賠舊件管理 11.4)
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[used-parts-smoke]", ...m);

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
    const resp = await page.goto(`${BASE}/parts/warranty/used-parts`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load /used-parts",
        reason: `status=${status} url=${finalUrl}`,
      });
      await browser.close();
      report(results);
      return;
    }
    results.push({ ok: true, step: "load /used-parts", status });
  }

  // 2) h1 = 保固索賠舊件管理
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("保固索賠舊件管理")
        ? { ok: true, step: "h1 = 保固索賠舊件管理" }
        : { ok: false, step: "h1 check", reason: `h1="${h1}"` },
    );
  }

  // 3) sprint chip 11.4
  {
    const chip = await page.locator('span:has-text("11.4")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip 11.4" }
        : { ok: false, step: "sprint chip 11.4", reason: "not found" },
    );
  }

  // 4) 5 顆 StatCard labels（已逾期 / 即將到期 / 保管中 / 已寄回 / 已銷毀 之類）
  {
    const expected = ["已逾期"];
    let found = 0;
    for (const l of expected) {
      const c = await page.locator(`text=${l}`).first().count();
      if (c > 0) found++;
    }
    results.push(
      found === expected.length
        ? { ok: true, step: "stat cards present" }
        : { ok: false, step: "stat cards", reason: `found=${found}/${expected.length}` },
    );
  }

  // 5) Filter bar — WC- / RO- placeholders + 關鍵字
  {
    const wc = await page.locator('input[placeholder="WC-"]').count();
    const ro = await page.locator('input[placeholder="RO-"]').count();
    const kw = await page.locator('input[placeholder="關鍵字"]').count();
    results.push(
      wc > 0 && ro > 0 && kw > 0
        ? { ok: true, step: "filter inputs present" }
        : {
            ok: false,
            step: "filter inputs",
            reason: `wc=${wc} ro=${ro} kw=${kw}`,
          },
    );
  }

  // 6) ＋ 新增入庫 button
  {
    const btn = await page.locator('button:has-text("新增入庫")').count();
    results.push(
      btn > 0
        ? { ok: true, step: "+ 新增入庫 button present" }
        : { ok: false, step: "+ create button", reason: "not found" },
    );
  }

  // 7) Toolbar — 共 N 筆保固舊件
  {
    const t = await page
      .locator('text=/共.*筆保固舊件/')
      .first()
      .count();
    results.push(
      t > 0
        ? { ok: true, step: "toolbar count present" }
        : { ok: false, step: "toolbar count", reason: "not found" },
    );
  }

  // 8) 批次操作按鈕 — 標記寄回 / 標記銷毀
  {
    const ret = await page.locator('button:has-text("標記寄回")').count();
    const des = await page.locator('button:has-text("標記銷毀")').count();
    results.push(
      ret > 0 && des > 0
        ? { ok: true, step: "batch action buttons present" }
        : { ok: false, step: "batch buttons", reason: `ret=${ret} des=${des}` },
    );
  }

  // 9) DataGrid 渲染至少 1 列 seed 資料（WC- prefix）
  {
    const seedRow = await page
      .locator('text=/WC-20260214-001|WC-20260301-002|WC-20260401-003/')
      .first()
      .count();
    results.push(
      seedRow > 0
        ? { ok: true, step: "seed row rendered in DataGrid" }
        : { ok: false, step: "seed row", reason: "no seed row visible" },
    );
  }

  // 10) 點 ＋ 新增入庫 → Modal 開啟（標題 = 保固舊件入庫登記）
  {
    await page.locator('button:has-text("新增入庫")').first().click();
    // 等 modal 標題出現（非阻塞，最多 5s）
    await page
      .locator('text=保固舊件入庫登記')
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => {});
    const modalTitle = await page
      .locator('text=保固舊件入庫登記')
      .first()
      .count();
    const dateInputs = await page.locator('input[type="date"]').count();
    results.push(
      modalTitle > 0 && dateInputs > 0
        ? { ok: true, step: "register modal opens" }
        : {
            ok: false,
            step: "register modal",
            reason: `title=${modalTitle} dateInputs=${dateInputs}`,
          },
    );
    // 關 modal
    const cancelBtn = page.locator('button:has-text("取消")').first();
    if ((await cancelBtn.count()) > 0) await cancelBtn.click();
    await page.waitForTimeout(300);
  }

  // 11) Pagination footer (totalCount 大於 0 → 應有 footer 顯示)
  // 寬鬆檢查：headers/page-related 文字（共 N 筆 already counted in #7）
  {
    // 點任一列開 side panel — 用 row click 或 chip 區
    const firstRow = page.locator('text=WC-20260214-001').first();
    if ((await firstRow.count()) > 0) {
      await firstRow.click();
      await page.waitForTimeout(400);
      // side panel 開啟後應出現「舊件資訊」section
      const panel = await page.locator('text=舊件資訊').first().count();
      results.push(
        panel > 0
          ? { ok: true, step: "side panel opens with row info" }
          : { ok: false, step: "side panel", reason: "舊件資訊 not visible" },
      );
    } else {
      results.push({
        ok: false,
        step: "side panel",
        reason: "seed row not clickable",
      });
    }
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
        ? `[used-parts-smoke] ✓ ${r.step}`
        : `[used-parts-smoke] ✗ ${r.step} — ${r.reason || JSON.stringify(r)}`,
    );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
