#!/usr/bin/env node
/**
 * Smoke-test for /parts/aftersales/settings/pickup-notify (取車通知設定)
 * - 200 + h1 "取車通知設定"
 * - LINE / SMS 範本表單
 */
import { chromium } from 'playwright';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE = path.join(__dirname, '.pw-state.json');
const SHOTS = path.join(__dirname, '..', 'tmp', 'verify-settings-pickup-notify');
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
    const resp = await page.goto(`${BASE}/parts/aftersales/settings/pickup-notify`, { waitUntil: 'networkidle' });
    result.steps.push({ status: resp.status(), final_url: page.url() });
    if (resp.status() !== 200) throw new Error(`HTTP ${resp.status()}`);

    await page.waitForSelector('h1:has-text("取車通知設定")', { timeout: 8000 });
    await page.screenshot({ path: path.join(SHOTS, '01-form.png'), fullPage: true });

    const channelHits =
      (await page.locator('text=LINE').count()) +
      (await page.locator('text=SMS').count()) +
      (await page.locator('text=簡訊').count());
    result.steps.push({ channel_hits: channelHits });

    const templateHits =
      (await page.locator('text=範本').count()) +
      (await page.locator('textarea').count());
    result.steps.push({ template_hits: templateHits });

    const saveBtn =
      (await page.locator('button:has-text("儲存")').count()) +
      (await page.locator('button:has-text("保存")').count());
    result.steps.push({ save_btn_hits: saveBtn });

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
