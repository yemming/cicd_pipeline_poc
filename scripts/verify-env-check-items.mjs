#!/usr/bin/env node
/**
 * Smoke-test for /parts/aftersales/management/env-check-items
 * - 200 + 標題、警告 banner
 * - 8 列 row 顯示（從 business_rules seed 而來）
 * - 「+ 新增項目」按鈕 + modal
 */
import { chromium } from 'playwright';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE = path.join(__dirname, '.pw-state.json');
const SHOTS = path.join(__dirname, '..', 'tmp', 'verify-env-check-items');
fs.mkdirSync(SHOTS, { recursive: true });

const BASE = process.env.APP_BASE_URL || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    storageState: fs.existsSync(STATE) ? STATE : undefined,
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  const result = { steps: [], errors };

  try {
    const resp = await page.goto(
      `${BASE}/parts/aftersales/management/env-check-items`,
      { waitUntil: 'networkidle' },
    );
    result.steps.push({ status: resp.status(), final_url: page.url() });
    if (resp.status() !== 200) throw new Error(`HTTP ${resp.status()}`);

    await page.waitForSelector('h1:has-text("環檢項目設定")', { timeout: 8000 });
    await page.screenshot({ path: path.join(SHOTS, '01-list.png'), fullPage: true });

    // 警告 banner
    const banner = await page.locator('text=項目代碼一經使用即不建議修改').first().isVisible();
    result.steps.push({ warning_banner: banner });

    // 共 N 項顯示
    const summary = await page.locator('text=/共\\s*\\d+\\s*項/').first().textContent();
    result.steps.push({ summary });

    // 表格 row 數
    const rowCount = await page.locator('tbody tr').count();
    result.steps.push({ table_rows: rowCount });

    // 新增 button
    const addVisible = await page.locator('button:has-text("新增項目")').first().isVisible();
    result.steps.push({ add_btn: addVisible });

    // 「儲存變更」按鈕初始 disabled（dirty=false）
    const saveBtn = page.locator('button:has-text("儲存變更")').first();
    const saveDisabled = await saveBtn.isDisabled();
    result.steps.push({ save_btn_disabled_initially: saveDisabled });

    // 點 + 新增項目 → modal
    if (addVisible) {
      await page.locator('button:has-text("新增項目")').first().click();
      await page.waitForSelector('header:has-text("新增環檢項目")', { timeout: 4000 });
      await page.screenshot({ path: path.join(SHOTS, '02-add-modal.png'), fullPage: true });
      result.steps.push({ add_modal_open: true });
      await page.locator('button:has-text("取消")').first().click();
      await page.waitForTimeout(200);
    }

    result.ok = errors.length === 0 && rowCount >= 8;
  } catch (e) {
    result.ok = false;
    result.fatal = String(e.message || e);
    try {
      await page.screenshot({ path: path.join(SHOTS, '99-error.png'), fullPage: true });
    } catch {}
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
})();
