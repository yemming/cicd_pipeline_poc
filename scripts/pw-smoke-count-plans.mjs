#!/usr/bin/env node
// Smoke test for /parts/count/plans (盤點計畫)
// - 頁面 load 無 error
// - h1 / sprint chip / filter bar / DataGrid 出現
// - 新增計畫 modal 開關 + create round-trip DB
// - detail page 可開且 view→edit→save round-trip
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[count-plans-smoke]", ...m);

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

  // 1) /parts/count/plans load
  {
    const resp = await page.goto(`${BASE}/parts/count/plans`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({ ok: false, step: "load /plans", reason: `status=${status} url=${finalUrl}` });
      await browser.close();
      report(results);
      return;
    }
    results.push({ ok: true, step: "load /plans", status });
  }

  // 2) h1 = 盤點計畫
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("盤點計畫")
        ? { ok: true, step: "h1 = 盤點計畫" }
        : { ok: false, step: "h1 check", reason: `h1="${h1}"` },
    );
  }

  // 3) sprint chip 8.1
  {
    const chip = await page.locator('span:has-text("8.1")').first().count();
    results.push(
      chip > 0
        ? { ok: true, step: "sprint chip 8.1" }
        : { ok: false, step: "sprint chip 8.1", reason: "not found" },
    );
  }

  // 4) filter bar 出現 + 新增按鈕存在
  {
    const addBtn = await page.locator('button:has-text("＋ 新增計畫")').count();
    results.push(
      addBtn > 0
        ? { ok: true, step: "新增計畫 button present" }
        : { ok: false, step: "新增計畫 button", reason: "missing" },
    );
  }

  // 5) DataGrid 列出 demo rows（至少 1 筆 indian 計畫）
  {
    const rowText = await page.locator("table tbody tr").first().innerText().catch(() => "");
    results.push(
      rowText.length > 0
        ? { ok: true, step: "DataGrid has rows", sample: rowText.slice(0, 60) }
        : { ok: false, step: "DataGrid rows", reason: "no rows" },
    );
  }

  // 6) 打開 create modal、輸入名稱、建立 → banner ✓ 已建立
  const stampName = `smoke-plan-${Date.now()}`;
  {
    await page.locator('button:has-text("＋ 新增計畫")').click();
    const modal = page.locator('div.fixed.inset-0:has(h2:has-text("新增盤點計畫"))');
    await modal.waitFor({ state: "visible", timeout: 5_000 });

    // 名稱 input — modal 內第一個 input（placeholder 認準）
    await modal.locator('input[placeholder*="信義主倉"]').first().fill(stampName);

    await page.locator('button:has-text("建立計畫")').click();
    await page
      .waitForSelector(`text=✓ 已建立`, { timeout: 15_000 })
      .catch(() => {});
    const bannerOk = await page.locator("text=✓ 已建立").count();
    results.push(
      bannerOk > 0
        ? { ok: true, step: "create plan via modal", plan_name: stampName }
        : { ok: false, step: "create plan via modal", reason: "no success banner" },
    );
  }

  // 7) refresh list、看到剛建的 row（等 router.refresh 完成）
  {
    await page
      .waitForSelector(`a:has-text("${stampName}")`, { timeout: 10_000 })
      .catch(() => {});
    const newRow = await page.locator(`a:has-text("${stampName}")`).count();
    results.push(
      newRow > 0
        ? { ok: true, step: "new plan visible in list" }
        : { ok: false, step: "new plan in list", reason: "row not found after create" },
    );
  }

  // 8) 點 row 的計畫名稱 → 進 detail page
  {
    await page.locator(`a:has-text("${stampName}")`).first().click();
    await page.waitForURL(/\/parts\/count\/plans\/[0-9a-f-]{36}/, { timeout: 10_000 }).catch(() => {});
    const u = page.url();
    results.push(
      /\/parts\/count\/plans\/[0-9a-f-]{36}/.test(u)
        ? { ok: true, step: "navigate to detail page", url: u }
        : { ok: false, step: "navigate to detail", reason: `url=${u}` },
    );
  }

  // 9) detail page: h1 含計畫名 + CRUD pill 看得到
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    const modifyBtn = await page.locator('button:has-text("修改")').count();
    const okH1 = h1.includes(stampName);
    const okBtn = modifyBtn > 0;
    results.push(
      okH1 && okBtn
        ? { ok: true, step: "detail page renders title + CRUD pills" }
        : { ok: false, step: "detail page check", reason: `h1="${h1}" modifyBtn=${modifyBtn}` },
    );
  }

  // 10) 點修改 → 進 edit mode → 改 notes → 儲存 → banner ✓ 已儲存
  {
    await page.locator('button:has-text("修改")').click();
    await page.waitForSelector('span:has-text("編輯模式")', { timeout: 5_000 }).catch(() => {});

    const notesArea = page.locator("textarea").first();
    await notesArea.fill("smoke edit note");

    await page.locator('button:has-text("儲存變更")').click();
    await page.waitForSelector("text=✓ 已儲存", { timeout: 15_000 }).catch(() => {});
    const ok = await page.locator("text=✓ 已儲存").count();
    results.push(
      ok > 0
        ? { ok: true, step: "edit save round-trip" }
        : { ok: false, step: "edit save", reason: "no success banner" },
    );
  }

  // 11) 回 list、刪除 smoke row（清理 demo 資料）
  {
    // dialog handler 必須在 click 之前註冊
    page.on("dialog", (d) => d.accept().catch(() => {}));
    await page.goto(`${BASE}/parts/count/plans`, { waitUntil: "domcontentloaded" });
    await page
      .waitForSelector(`a:has-text("${stampName}")`, { timeout: 10_000 })
      .catch(() => {});
    const row = page.locator(`tr:has(a:has-text("${stampName}"))`);
    await row.locator('button:has-text("刪除")').click();
    // 驗 row 從 DOM 消失（router.refresh 後 list 重抓）
    await page
      .waitForFunction(
        (name) => !document.body.innerText.includes(name),
        stampName,
        { timeout: 15_000 },
      )
      .catch(() => {});
    const gone = (await page.locator(`a:has-text("${stampName}")`).count()) === 0;
    results.push(
      gone
        ? { ok: true, step: "delete smoke row" }
        : { ok: false, step: "delete smoke row", reason: "row still visible" },
    );
  }

  // 12) console errors
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
  for (const r of results) console.error(r.ok ? `[count-plans-smoke] ✓ ${r.step}` : `[count-plans-smoke] ✗ ${r.step} — ${r.reason || JSON.stringify(r)}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
