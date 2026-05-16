#!/usr/bin/env node
/**
 * Smoke-test for /parts/aftersales/management/permissions (職級權限對照)
 * - 200 + h1 "職級權限對照"
 * - 表格 / 矩陣
 */
import { chromium } from 'playwright';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE = path.join(__dirname, '.pw-state.json');
const SHOTS = path.join(__dirname, '..', 'tmp', 'verify-permissions');
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
    const resp = await page.goto(`${BASE}/parts/aftersales/management/permissions`, { waitUntil: 'networkidle' });
    result.steps.push({ status: resp.status(), final_url: page.url() });
    if (resp.status() !== 200) throw new Error(`HTTP ${resp.status()}`);

    await page.waitForSelector('h1:has-text("職級權限對照")', { timeout: 8000 });
    await page.screenshot({ path: path.join(SHOTS, '01-list.png'), fullPage: true });

    const tableCount = await page.locator('table').count();
    result.steps.push({ table_count: tableCount });

    const tableRows = await page.locator('table tbody tr').count();
    result.steps.push({ table_rows: tableRows });

    const roleHits =
      (await page.locator('text=技師').count()) +
      (await page.locator('text=主管').count()) +
      (await page.locator('text=管理員').count()) +
      (await page.locator('text=服務顧問').count());
    result.steps.push({ role_label_hits: roleHits });

    const permHits =
      (await page.locator('text=檢視').count()) +
      (await page.locator('text=新增').count()) +
      (await page.locator('text=編輯').count()) +
      (await page.locator('text=刪除').count());
    result.steps.push({ perm_label_hits: permHits });

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
