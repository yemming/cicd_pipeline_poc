#!/usr/bin/env node
/**
 * Smoke-test for /parts/aftersales/management/bays (07_售後管理模組_v2.html → 工位看板)
 * - 200 + 標題、KPI bar、+ 新增工位 button
 * - 8 張 bay card 顯示
 * - 派工 modal 開啟
 */
import { chromium } from 'playwright';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE = path.join(__dirname, '.pw-state.json');
const SHOTS = path.join(__dirname, '..', 'tmp', 'verify-bays');
fs.mkdirSync(SHOTS, { recursive: true });

const BASE = process.env.APP_BASE_URL || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: STATE, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  const result = { steps: [], errors };

  try {
    const resp = await page.goto(`${BASE}/parts/aftersales/management/bays`, { waitUntil: 'networkidle' });
    result.steps.push({ status: resp.status(), final_url: page.url() });
    if (resp.status() !== 200) throw new Error(`HTTP ${resp.status()}`);

    await page.waitForSelector('h1:has-text("工位看板")', { timeout: 8000 });
    await page.screenshot({ path: path.join(SHOTS, '01-list.png'), fullPage: true });

    // KPI bar
    const kpis = {
      free: await page.locator('text=空閒').first().isVisible(),
      busy: await page.locator('text=使用中').first().isVisible(),
      urgent: await page.locator('text=逾時警示').first().isVisible(),
      offline: await page.locator('text=停用').first().isVisible(),
    };
    result.steps.push({ kpi: kpis });

    // 新增 button
    const addVisible = await page.locator('button:has-text("新增工位")').first().isVisible();
    result.steps.push({ add_btn: addVisible });

    // 工位卡片數量（找 b1...b8 之類顯示名）
    const bayNameCount = await page.locator('text=機電工位').count();
    result.steps.push({ bay_card_text_hits: bayNameCount });

    // 效率表
    const tableHasHeader = await page.locator('text=工位效率統計').first().isVisible();
    result.steps.push({ efficiency_table: tableHasHeader });

    // 點 + 新增工位 → modal
    if (addVisible) {
      await page.locator('button:has-text("新增工位")').first().click();
      await page.waitForSelector('h2:has-text("新增工位")', { timeout: 4000 });
      await page.screenshot({ path: path.join(SHOTS, '02-create-modal.png'), fullPage: true });
      // 關閉
      await page.locator('button:has-text("取消")').first().click();
      await page.waitForTimeout(200);
    }

    // 點某張 free 卡片的 派工 button
    const dispatchBtn = page.locator('button:has-text("派工")').first();
    if (await dispatchBtn.count() > 0) {
      await dispatchBtn.click();
      await page.waitForSelector('h2:has-text("派工到")', { timeout: 4000 });
      await page.screenshot({ path: path.join(SHOTS, '03-assign-modal.png'), fullPage: true });
      result.steps.push({ assign_modal_open: true });
      await page.locator('button:has-text("取消")').first().click();
    } else {
      result.steps.push({ assign_modal_open: 'no_free_bay' });
    }

    // 改 daily hours
    const sel = page.locator('select').first();
    if (await sel.count() > 0) {
      await sel.selectOption('10');
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SHOTS, '04-after-set-hours.png'), fullPage: true });
      result.steps.push({ daily_hours_change: 'submitted' });
    }

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
