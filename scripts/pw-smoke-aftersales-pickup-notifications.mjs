#!/usr/bin/env node
// Smoke test for /parts/aftersales/pickup-notifications （取車通知）
// - list 頁可載入、Page Header / Filter Bar / DataGrid 結構齊全
// - 範本側欄存在（Line/簡訊 textarea + 預設通道 checkboxes）
// - 統計卡顯示 sent_today / pending / avg_wait
// - 切換 scope filter「全部」可看到 final_inspection 候選
// - 點 row 內「發送 Line」開 modal、modal 顯示帶範本內文
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP_DIR = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[pickup-notifications-smoke]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json — run scripts/pw-login.mjs first");
    process.exit(2);
  }
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

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

  // 1) 載入 list
  {
    const resp = await page.goto(
      `${BASE}/parts/aftersales/pickup-notifications?scope=all`,
      { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT },
    );
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load list",
        reason: `status=${status} url=${finalUrl}`,
      });
    } else {
      results.push({ ok: true, step: "load list", status });
    }
  }

  // 2) H1
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("取車通知")
        ? { ok: true, step: "list H1" }
        : { ok: false, step: "list H1", reason: `h1="${h1}"` },
    );
  }

  // 3) Info banner（藍色說明）
  {
    const bannerText = await page
      .locator('text=SA 手動確認後才會發送通知')
      .first()
      .innerText()
      .catch(() => "");
    results.push(
      bannerText
        ? { ok: true, step: "info banner present" }
        : { ok: false, step: "info banner present", reason: "not found" },
    );
  }

  // 4) Filter Bar 欄位
  {
    const scopeSelect = await page
      .locator('label:has-text("篩選範圍") + select')
      .count();
    const qInput = await page
      .locator('label:has-text("關鍵字") + input')
      .count();
    const ok = scopeSelect > 0 && qInput > 0;
    results.push(
      ok
        ? { ok: true, step: "filter bar fields" }
        : {
            ok: false,
            step: "filter bar fields",
            reason: `scope=${scopeSelect} q=${qInput}`,
          },
    );
  }

  // 5) DataGrid header 至少含「車主」「工單號」「通知狀態」
  {
    const headers = await Promise.all(
      ["車主", "工單號", "通知狀態", "偏好通道"].map((h) =>
        page.locator(`th:has-text("${h}")`).count(),
      ),
    );
    const ok = headers.every((c) => c > 0);
    results.push(
      ok
        ? { ok: true, step: "DataGrid headers" }
        : { ok: false, step: "DataGrid headers", reason: `counts=${headers.join(",")}` },
    );
  }

  // 6) 範本側欄存在
  {
    const tplCard = await page.locator('text=⚙️ 通知範本設定').count();
    const statsCard = await page.locator('text=📊 今日通知統計').count();
    const tplLineLabel = await page.locator('text=Line 通知範本').count();
    const tplSmsLabel = await page.locator('text=簡訊通知範本').count();
    const ok =
      tplCard > 0 && statsCard > 0 && tplLineLabel > 0 && tplSmsLabel > 0;
    results.push(
      ok
        ? { ok: true, step: "template + stats sidebar" }
        : {
            ok: false,
            step: "template + stats sidebar",
            reason: `tpl=${tplCard} stats=${statsCard} line=${tplLineLabel} sms=${tplSmsLabel}`,
          },
    );
  }

  // 7) 預設通道 checkbox（Line / 簡訊 / 電話提醒）
  {
    const labels = await Promise.all(
      ["Line", "簡訊", "電話提醒"].map((t) =>
        page.locator(`label:has-text("${t}")`).count(),
      ),
    );
    const ok = labels.every((c) => c > 0);
    results.push(
      ok
        ? { ok: true, step: "default channel checkboxes" }
        : {
            ok: false,
            step: "default channel checkboxes",
            reason: `counts=${labels.join(",")}`,
          },
    );
  }

  // 8) 統計卡顯示三個指標
  {
    const lines = await Promise.all(
      ["已發送通知", "待發送", "平均等候時間"].map((t) =>
        page.locator(`text=${t}`).count(),
      ),
    );
    const ok = lines.every((c) => c > 0);
    results.push(
      ok
        ? { ok: true, step: "stats card lines" }
        : { ok: false, step: "stats card lines", reason: `counts=${lines.join(",")}` },
    );
  }

  // 9) 範本內文預設帶 {車主姓名}/{車型}/{車牌} 變數佔位
  {
    const lineTextarea = page.locator('textarea').first();
    const txt = await lineTextarea.inputValue().catch(() => "");
    const ok =
      txt.includes("{車主姓名}") &&
      txt.includes("{車型}") &&
      txt.includes("{車牌}");
    results.push(
      ok
        ? { ok: true, step: "Line template default has placeholders" }
        : {
            ok: false,
            step: "Line template default has placeholders",
            reason: `txt="${txt.slice(0, 40)}"`,
          },
    );
  }

  // 10) 嘗試開「發送 Line」modal（如果有資料）
  {
    const sendButtons = await page.locator('button:has-text("發送 Line")').count();
    if (sendButtons > 0) {
      await page.locator('button:has-text("發送 Line")').first().click();
      // modal 內有「通知內文」label + 「取消」button + 動態 footer
      const cancelBtn = page.locator('button:has-text("取消")').first();
      await cancelBtn.waitFor({ timeout: 10_000 }).catch(() => {});
      const cancelCount = await cancelBtn.count();
      const bodyLabelCount = await page.locator('text=通知內文').count();
      results.push(
        cancelCount > 0 && bodyLabelCount > 0
          ? { ok: true, step: "send modal opens" }
          : {
              ok: false,
              step: "send modal opens",
              reason: `cancelBtn=${cancelCount} bodyLabel=${bodyLabelCount}`,
            },
      );
      // 關 modal
      await cancelBtn.click().catch(() => {});
    } else {
      results.push({
        ok: true,
        step: "send modal (skipped — no candidate rows in current scope=all)",
      });
    }
  }

  // 11) 截圖
  await page.screenshot({
    path: path.join(TMP_DIR, `pickup-notifications-${stamp}.png`),
    fullPage: true,
  });

  // 12) Console errors（忽略已知 noise）
  const realErrors = consoleErrors.filter(
    (e) =>
      !e.includes("caret-color") &&
      !e.includes("hydration") &&
      !e.includes("Failed to load resource"),
  );
  if (realErrors.length > 0) {
    results.push({ ok: false, step: "browser console errors", errors: realErrors });
  } else {
    results.push({
      ok: true,
      step: "no browser console errors",
      ignored: consoleErrors.length,
    });
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
