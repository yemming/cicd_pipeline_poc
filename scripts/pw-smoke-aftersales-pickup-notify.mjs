#!/usr/bin/env node
// Smoke test for /parts/aftersales/settings/pickup-notify （取車通知設定）
// - 頁面載入 200 + 不被踢回 /login
// - H1 / 範本欄位 / 預設管道 checkbox 存在
// - 修改 LINE 範本 + 切換 channel → 儲存 → banner 出現 → reload 後值持久化
// - cleanup：把值還原回 default
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[aftersales-pickup-notify-smoke]", ...m);

const DEFAULT_LINE = `親愛的 {車主姓名} 您好，
您的 {車型} ({車牌}) 維修作業已完成，
請您方便時前來取車。

DUCATI 台北直營店 敬上`;

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json — run scripts/pw-login.mjs first");
    process.exit(2);
  }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1440, height: 900 },
  });
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: "indian" }),
      url: BASE,
    },
  ]);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
  });

  const results = [];
  const stamp = String(Date.now()).slice(-6);
  const testLine = `${DEFAULT_LINE}\n[smoke-${stamp}]`;

  try {
    // 1) 載入
    {
      const resp = await page.goto(
        `${BASE}/parts/aftersales/settings/pickup-notify`,
        { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT },
      );
      const status = resp?.status() ?? 0;
      const u = page.url();
      if (status >= 400 || u.includes("/login")) {
        results.push({ ok: false, step: "load", reason: `status=${status} url=${u}` });
      } else {
        results.push({ ok: true, step: "load", status });
      }
    }

    // 2) H1
    {
      const h1 = await page.locator("h1").first().innerText().catch(() => "");
      results.push(
        h1.includes("取車通知設定")
          ? { ok: true, step: "h1" }
          : { ok: false, step: "h1", reason: `h1="${h1}"` },
      );
    }

    // 3) textareas exist
    {
      const ta = await page.locator("textarea").count();
      results.push(
        ta >= 2
          ? { ok: true, step: "textareas", count: ta }
          : { ok: false, step: "textareas", reason: `count=${ta}` },
      );
    }

    // 4) Save 按鈕
    {
      const btn = page.getByRole("button", { name: /儲存範本|儲存中/ });
      const visible = await btn.isVisible().catch(() => false);
      results.push(
        visible
          ? { ok: true, step: "save-btn-visible" }
          : { ok: false, step: "save-btn-visible", reason: "not visible" },
      );
    }

    // 5) 改 LINE 範本 + toggle SMS channel + 儲存
    {
      const lineTa = page.locator("textarea").first();
      await lineTa.fill(testLine);

      // SMS checkbox label 點擊（accent-color label）
      const smsLabel = page.locator("label:has-text('簡訊')").filter({ hasText: "📱" });
      await smsLabel.locator("input[type=checkbox]").check().catch(() => null);

      const saveBtn = page.getByRole("button", { name: /儲存範本/ });
      await saveBtn.click();
      // 等 banner
      await page
        .locator("text=已儲存通知設定")
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
      results.push({ ok: true, step: "save-success-banner" });
    }

    // 6) reload 後值持久化
    {
      await page.reload({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      const v = await page.locator("textarea").first().inputValue();
      results.push(
        v.includes(`[smoke-${stamp}]`)
          ? { ok: true, step: "persisted" }
          : { ok: false, step: "persisted", reason: `value missing marker (len=${v.length})` },
      );
    }

    // 7) cleanup — 還原（先 focus 再 fill，給 React state 一個 tick 才click save）
    {
      const ta = page.locator("textarea").first();
      await ta.click();
      await ta.fill(DEFAULT_LINE);
      // 等到「尚有未儲存的變更」字樣出現，代表 dirty state 已 propagate
      await page
        .locator("text=尚有未儲存的變更")
        .first()
        .waitFor({ state: "visible", timeout: 5_000 })
        .catch(() => null);
      await page.getByRole("button", { name: /儲存範本/ }).click();
      await page
        .locator("text=已儲存通知設定")
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
      results.push({ ok: true, step: "cleanup-restore" });
    }
  } catch (err) {
    results.push({ ok: false, step: "exception", reason: String(err?.message ?? err) });
  } finally {
    const allOk = results.every((r) => r.ok);
    const out = {
      ok: allOk,
      results,
      consoleErrors: consoleErrors.slice(0, 10),
    };
    console.log(JSON.stringify(out, null, 2));
    await browser.close();
    process.exit(allOk ? 0 : 1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
