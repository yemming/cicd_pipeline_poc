#!/usr/bin/env node
// Smoke test for /parts/aftersales/management/discounts（崗位折扣審批）
// - HTTP 200、h1、雙卡渲染、5 列 seed、儲存 button、審批流 select 有值
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP_DIR = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[aftersales-discounts-smoke]", ...m);

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

  const resp = await page.goto(`${BASE}/parts/aftersales/management/discounts`, {
    waitUntil: "domcontentloaded",
    timeout: NAV_TIMEOUT,
  });
  const status = resp?.status() ?? 0;
  results.push(status === 200 ? "✓ HTTP 200" : `✗ HTTP ${status}`);
  await page.waitForTimeout(1200);

  const h1 = await page.locator("h1").first().textContent();
  results.push(h1?.includes("崗位折扣審批") ? "✓ h1 對得上" : `✗ h1=${h1}`);

  const cardLeft = await page.getByRole("heading", { name: /崗位折扣權限設定/ }).count();
  const cardRight = await page.getByRole("heading", { name: /審批流設定/ }).count();
  results.push(cardLeft >= 1 && cardRight >= 1 ? "✓ 雙卡 header 都在" : `✗ left=${cardLeft} right=${cardRight}`);

  // 5 條 indian seed → 至少 5 列（含 thead）
  const tableRows = await page.locator("table tbody tr").count();
  results.push(tableRows >= 5 ? `✓ 折扣權限列數 ${tableRows} 列 (>=5 seed)` : `✗ 列數只有 ${tableRows}`);

  // 看到 SA 文字（role_label）
  const saCell = await page.locator("text=售後接待").count();
  results.push(saCell >= 1 ? "✓ 看到 SA 列" : "✗ 沒看到 SA 列");

  // 「儲存」/「提交審批流設定」button 在
  const saveBtn = await page.getByRole("button", { name: /^儲存$/ }).count();
  const wfSubmit = await page.getByRole("button", { name: /提交審批流設定/ }).count();
  results.push(saveBtn >= 1 && wfSubmit >= 1 ? "✓ 兩顆 save button 在" : `✗ save=${saveBtn} wf=${wfSubmit}`);

  // 審批流 select 有預設值（4 個 select）
  const wfSelects = await page.locator("section:nth-of-type(2) select").count();
  results.push(wfSelects >= 4 ? `✓ 審批流 4 個 select 都在 (${wfSelects})` : `✗ select 只有 ${wfSelects}`);

  // PctInput 數量（5 列 × 3 欄 = 15 個 text input；加 5 個 approver select = 5 個 select）
  const pctInputs = await page.locator("table input[type='text']").count();
  results.push(pctInputs >= 15 ? `✓ 折扣 input ${pctInputs} 個 (>=15)` : `✗ input 只有 ${pctInputs}`);

  await page.screenshot({
    path: path.join(TMP_DIR, "aftersales-discounts.png"),
    fullPage: true,
  });
  results.push(`✓ 截圖 → tmp/aftersales-discounts.png`);

  log("\n" + results.join("\n"));
  if (consoleErrors.length > 0) {
    log("\nConsole errors:");
    consoleErrors.forEach((e) => log("  " + e));
  }

  const failed = results.filter((r) => r.startsWith("✗"));
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  log("FATAL", e);
  process.exit(2);
});
