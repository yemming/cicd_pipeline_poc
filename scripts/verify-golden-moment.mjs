#!/usr/bin/env node
/**
 * BDN #17 · RS01 黃金時刻 30 分倒數驗證
 *
 * 流程：
 *  1) 登入態進 /sales/reception/handcard
 *  2) 截圖初始狀態（無 banner）
 *  3) 點「✓ 標記試駕結束」→ 截圖 active banner「⚡ 黃金時刻剩 30 分鐘」
 *  4) 用 page.clock 假裝時間流逝（30 分後）→ 截圖 expired banner
 *  5) 全程不踢 /login、tsc/lint 已先過
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 60_000);

const log = (...m) => console.error("[bdn17]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json");
    process.exit(2);
  }
  fs.mkdirSync(TMP, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1440, height: 900 },
  });
  const host = new URL(BASE).host.split(":")[0];
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: "indian", store_id: null }),
      domain: host,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  const page = await ctx.newPage();

  const target = `${BASE}/sales/reception/handcard`;
  const resp = await page.goto(target, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
  const status = resp?.status() ?? 0;
  const finalUrl = page.url();
  log("status", status, "url", finalUrl);
  if (status >= 400 || finalUrl.includes("/login")) {
    log("✗ 載入失敗");
    await browser.close();
    process.exit(1);
  }
  await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT });

  const failures = [];

  // 1) 初始：無 banner
  const initialActive = await page.locator('[data-testid="golden-moment-active"]').count();
  const initialExpired = await page.locator('[data-testid="golden-moment-expired"]').count();
  if (initialActive !== 0 || initialExpired !== 0) {
    failures.push(`initial state should have no banner (active=${initialActive} expired=${initialExpired})`);
  }
  // 滾動到 Step 5 段
  const triggerBtn = page.locator('[data-testid="handcard-mark-test-ride-end"]');
  await triggerBtn.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(TMP, "bdn17-01-initial.png"), fullPage: false });
  log("📸 01 initial");

  // 2) 點「標記試駕結束」
  const triggerExists = await triggerBtn.count();
  if (triggerExists === 0) {
    failures.push("missing handcard-mark-test-ride-end button");
  } else {
    await triggerBtn.click();
    await page.waitForTimeout(300);
  }

  // 3) Active banner 應該出現「黃金時刻剩 30 分鐘」
  const activeBanner = page.locator('[data-testid="golden-moment-active"]');
  await activeBanner.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  const activeCount = await activeBanner.count();
  if (activeCount === 0) {
    failures.push("active banner should appear after clicking trigger");
  } else {
    const txt = await activeBanner.innerText();
    log("active banner text:", txt.replace(/\n/g, " | "));
    if (!/黃金時刻剩\s*30\s*分鐘/.test(txt)) {
      failures.push(`active banner text mismatch: ${txt}`);
    }
  }
  await page.screenshot({ path: path.join(TMP, "bdn17-02-active.png"), fullPage: false });
  log("📸 02 active");

  // 4) 模擬時間經過 — 直接從前端 React state 改 testRideEndAt 不容易，
  //    改用最簡方式：頁面上加 client-side override → 透過 evaluate 直接重設 button
  //    這裡 alt approach：重新 navigate 但帶上 query string 不可行（state 在 React 內）
  //    使用 page.clock.install + fastForward 模擬 setInterval tick
  //    由於 install 必須在 navigate 前，這邊改新開頁面、install clock、再 navigate
  await browser.close();

  const browser2 = await chromium.launch({ headless: true });
  const ctx2 = await browser2.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1440, height: 900 },
  });
  await ctx2.addCookies([
    {
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: "indian", store_id: null }),
      domain: host,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  const page2 = await ctx2.newPage();
  // 把虛擬時鐘固定在已知時間
  const baseTime = new Date("2026-05-16T10:00:00+08:00");
  await page2.clock.install({ time: baseTime });
  await page2.goto(target, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
  await page2.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT });

  // 點觸發、剛好設成現在（baseTime）
  const trigger2 = page2.locator('[data-testid="handcard-mark-test-ride-end"]');
  await trigger2.scrollIntoViewIfNeeded();
  await trigger2.click();
  await page2.waitForTimeout(200);

  // 確認 active
  const active2Txt = await page2.locator('[data-testid="golden-moment-active"]').innerText().catch(() => "");
  log("[clock] active immediately:", active2Txt.replace(/\n/g, " | "));
  if (!/黃金時刻剩\s*30\s*分鐘/.test(active2Txt)) {
    failures.push(`[clock] active banner mismatch: ${active2Txt}`);
  }

  // 快轉 15 分鐘
  await page2.clock.fastForward(15 * 60 * 1000);
  await page2.waitForTimeout(200);
  const active15 = await page2.locator('[data-testid="golden-moment-active"]').innerText().catch(() => "");
  log("[clock] +15min:", active15.replace(/\n/g, " | "));
  if (!/黃金時刻剩\s*15\s*分鐘/.test(active15)) {
    failures.push(`[clock] +15min banner mismatch: ${active15}`);
  }
  await page2.screenshot({ path: path.join(TMP, "bdn17-03-active-15min-left.png"), fullPage: false });
  log("📸 03 active +15min");

  // 快轉到超過 30 分鐘（再 +20 分 → 共 35 分）
  await page2.clock.fastForward(20 * 60 * 1000);
  await page2.waitForTimeout(200);
  const expiredCount = await page2.locator('[data-testid="golden-moment-expired"]').count();
  if (expiredCount === 0) {
    failures.push("expired banner should appear after 30 minutes");
  } else {
    const expiredTxt = await page2.locator('[data-testid="golden-moment-expired"]').innerText();
    log("[clock] +35min expired:", expiredTxt.replace(/\n/g, " | "));
    if (!/黃金時刻已過/.test(expiredTxt)) {
      failures.push(`expired banner text mismatch: ${expiredTxt}`);
    }
  }
  await page2.screenshot({ path: path.join(TMP, "bdn17-04-expired.png"), fullPage: false });
  log("📸 04 expired");

  await browser2.close();

  if (failures.length > 0) {
    log("✗ FAIL:");
    for (const f of failures) log("  -", f);
    process.exit(1);
  }
  log("✓ ALL PASS");
}

main().catch((err) => {
  console.error("[bdn17] crash:", err);
  process.exit(1);
});
