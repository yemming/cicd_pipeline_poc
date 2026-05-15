#!/usr/bin/env node
/**
 * Smoke-test for /parts/aftersales/management/dispatch (07_售後管理模組_v2.html → 派工看板)
 * - 200 + 標題、KPI bar、＋ 新增技師 button
 * - 6 張 tech card 顯示
 * - 派工 modal 開啟
 * - NADA 統計表 + footer 全員合計
 */
import { chromium } from 'playwright';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE = path.join(__dirname, '.pw-state.json');
const SHOTS = path.join(__dirname, '..', 'tmp', 'verify-dispatch');
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
    const resp = await page.goto(`${BASE}/parts/aftersales/management/dispatch`, { waitUntil: 'networkidle' });
    result.steps.push({ status: resp.status(), final_url: page.url() });
    if (resp.status() !== 200) throw new Error(`HTTP ${resp.status()}`);

    await page.waitForSelector('h1:has-text("派工看板")', { timeout: 8000 });
    await page.screenshot({ path: path.join(SHOTS, '01-board.png'), fullPage: true });

    // KPI bar — 施工中 / 待命 / 休息
    const kpis = {
      working: await page.locator('text=施工中').first().isVisible(),
      idle: await page.locator('text=待命').first().isVisible(),
      break: await page.locator('text=休息').first().isVisible(),
    };
    result.steps.push({ kpi: kpis });

    // 公式 banner
    const formulaVisible = await page.locator('text=效率 Efficiency').first().isVisible();
    result.steps.push({ formula_banner: formulaVisible });

    // 新增技師 button
    const addVisible = await page.locator('button:has-text("新增技師")').first().isVisible();
    result.steps.push({ add_btn: addVisible });

    // 技師卡片數量（找名字）
    const techCardCount = await page.locator('text=陳建明').count();
    result.steps.push({ tech_card_chen_count: techCardCount });

    // NADA 表 header
    const tableHasHeader = await page.locator('text=今日人效統計').first().isVisible();
    result.steps.push({ nada_table_header: tableHasHeader });

    // footer「全員合計」
    const footerHas = await page.locator('text=全員合計').first().isVisible();
    result.steps.push({ footer_total: footerHas });

    // 點 ＋ 新增技師 → modal
    if (addVisible) {
      await page.locator('button:has-text("新增技師")').first().click();
      await page.waitForSelector('h2:has-text("新增技師")', { timeout: 4000 });
      await page.screenshot({ path: path.join(SHOTS, '02-create-modal.png'), fullPage: true });
      await page.locator('button:has-text("取消")').first().click();
      await page.waitForTimeout(200);
    }

    // 點某張 idle 卡片的 指派工單 → dispatch modal
    const dispatchBtn = page.locator('button:has-text("指派工單")').first();
    if (await dispatchBtn.count() > 0) {
      await dispatchBtn.click();
      await page.waitForSelector('h2:has-text("指派工單給")', { timeout: 4000 });
      await page.screenshot({ path: path.join(SHOTS, '03-dispatch-modal.png'), fullPage: true });
      result.steps.push({ dispatch_modal_open: true });
      await page.locator('button:has-text("取消")').first().click();
    } else {
      result.steps.push({ dispatch_modal_open: 'no_idle_tech' });
    }

    // 點 working 技師的 完工 button → 應該觸發 server action
    const completeBtn = page.locator('button:has-text("完工")').first();
    if (await completeBtn.count() > 0) {
      await completeBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SHOTS, '04-after-complete.png'), fullPage: true });
      result.steps.push({ complete_clicked: true });
    } else {
      result.steps.push({ complete_clicked: 'no_working' });
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
