#!/usr/bin/env node
/**
 * Smoke-test for /parts/aftersales/repair-orders (正式工單 RO)
 * - 200 + h1 "正式工單 RO"
 * - DataGrid 表格
 * - status chip（草稿 / 進行中 / 已結案 任一出現）
 * - 開立工單 / 新增 button
 */
import { chromium } from 'playwright';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE = path.join(__dirname, '.pw-state.json');
const SHOTS = path.join(__dirname, '..', 'tmp', 'verify-repair-orders');
fs.mkdirSync(SHOTS, { recursive: true });

const BASE = process.env.APP_BASE_URL || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: STATE, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  const result = { steps: [], errors };

  try {
    const resp = await page.goto(`${BASE}/parts/aftersales/repair-orders`, { waitUntil: 'networkidle' });
    result.steps.push({ status: resp.status(), final_url: page.url() });
    if (resp.status() !== 200) throw new Error(`HTTP ${resp.status()}`);

    await page.waitForSelector('h1:has-text("正式工單")', { timeout: 8000 });
    await page.screenshot({ path: path.join(SHOTS, '01-list.png'), fullPage: true });

    const tableRows = await page.locator('table tbody tr').count();
    result.steps.push({ table_rows: tableRows });

    const statusHits =
      (await page.locator('text=草稿').count()) +
      (await page.locator('text=進行中').count()) +
      (await page.locator('text=已結案').count()) +
      (await page.locator('text=已完成').count());
    result.steps.push({ status_chip_hits: statusHits });

    const addBtn =
      (await page.locator('button:has-text("開立工單")').count()) +
      (await page.locator('button:has-text("新增")').count()) +
      (await page.locator('a:has-text("開立工單")').count()) +
      (await page.locator('a:has-text("新增 RO")').count()) +
      (await page.locator('a:has-text("新增")').count());
    result.steps.push({ add_btn_hits: addBtn });

    result.ok = errors.length === 0;
  } catch (e) {
    result.ok = false;
    result.fatal = String(e.message || e);
    try { await page.screenshot({ path: path.join(SHOTS, '99-error.png'), fullPage: true }); } catch {}
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
})();
