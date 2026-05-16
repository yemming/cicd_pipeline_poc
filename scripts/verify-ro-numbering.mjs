#!/usr/bin/env node
/**
 * Smoke-test for /parts/aftersales/management/ro-numbering (工單編號規則)
 * - 200 + h1 "工單編號規則"
 * - 表格存在（P1 / P2 雙表或 inline edit 表）
 * - 警告提示區
 */
import { chromium } from 'playwright';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE = path.join(__dirname, '.pw-state.json');
const SHOTS = path.join(__dirname, '..', 'tmp', 'verify-ro-numbering');
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
    const resp = await page.goto(`${BASE}/parts/aftersales/management/ro-numbering`, { waitUntil: 'networkidle' });
    result.steps.push({ status: resp.status(), final_url: page.url() });
    if (resp.status() !== 200) throw new Error(`HTTP ${resp.status()}`);

    await page.waitForSelector('h1:has-text("工單編號規則")', { timeout: 8000 });
    await page.screenshot({ path: path.join(SHOTS, '01-list.png'), fullPage: true });

    const tableCount = await page.locator('table').count();
    result.steps.push({ table_count: tableCount });

    const tableRows = await page.locator('table tbody tr').count();
    result.steps.push({ table_rows: tableRows });

    const warnHit =
      (await page.locator('text=前綴碼').count()) +
      (await page.locator('text=重要').count());
    result.steps.push({ warning_block_hits: warnHit });

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
