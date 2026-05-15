#!/usr/bin/env node
/**
 * Smoke-test for /parts/aftersales/checkout (08_結帳收款.html spec-to-feature)
 * - GET list page → 200, 看到「結帳收款」標題、「+ 新增結帳」button
 * - 若有結帳單 → 點進 detail 看 wizard 4-step
 * - 若沒有結帳單但有候選 RO → 開 modal 建立一張
 * - 截圖 list + detail
 */
import { chromium } from 'playwright';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE = path.join(__dirname, '.pw-state.json');
const SHOTS = path.join(__dirname, '..', 'tmp', 'verify-checkout');
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
    // 1. List
    const listResp = await page.goto(`${BASE}/parts/aftersales/checkout`, { waitUntil: 'networkidle' });
    result.steps.push({ list_status: listResp.status(), final_url: page.url() });
    if (listResp.status() !== 200) throw new Error(`list HTTP ${listResp.status()}`);

    await page.waitForSelector('h1:has-text("結帳收款")', { timeout: 8000 });
    await page.screenshot({ path: path.join(SHOTS, '01-list.png'), fullPage: true });

    const addBtnVisible = await page.locator('button:has-text("＋ 新增結帳")').isVisible();
    result.steps.push({ add_button_visible: addBtnVisible });

    // 2. 看是否有 row, 沒有就嘗試新增
    const rowLinks = await page.locator('a[href^="/parts/aftersales/checkout/"]').all();
    let detailHref = null;
    if (rowLinks.length > 0) {
      detailHref = await rowLinks[0].getAttribute('href');
      result.steps.push({ existing_rows: rowLinks.length, first_href: detailHref });
    } else {
      result.steps.push({ existing_rows: 0, action: 'try_create_via_modal' });
      // open modal
      const addBtn = page.locator('button:has-text("＋ 新增結帳")');
      const disabled = await addBtn.isDisabled();
      result.steps.push({ add_btn_disabled: disabled });
      if (!disabled) {
        await addBtn.click();
        await page.waitForSelector('h2:has-text("從工單建立結帳收款")', { timeout: 4000 });
        await page.screenshot({ path: path.join(SHOTS, '02-create-modal.png'), fullPage: true });
        const candidateCount = await page.locator('select option').count();
        result.steps.push({ candidate_options: candidateCount });
        // submit (建立並開啟)
        await page.locator('button:has-text("建立並開啟")').click();
        await page.waitForURL(/\/parts\/aftersales\/checkout\/[0-9a-f-]+/, { timeout: 8000 });
        detailHref = new URL(page.url()).pathname;
        result.steps.push({ created_detail_href: detailHref });
      }
    }

    // 3. Detail
    if (detailHref) {
      const detailResp = await page.goto(`${BASE}${detailHref}`, { waitUntil: 'networkidle' });
      result.steps.push({ detail_status: detailResp.status() });
      await page.waitForSelector('text=結帳編號', { timeout: 8000 });
      // 4-step nav 應該存在
      const stepLabels = ['費用確認', '車主二簽', '收款方式・發票', 'RO 關單'];
      const stepFound = [];
      for (const s of stepLabels) {
        const v = await page.locator(`button:has-text("${s}")`).first().isVisible();
        stepFound.push({ label: s, visible: v });
      }
      result.steps.push({ step_nav: stepFound });
      await page.screenshot({ path: path.join(SHOTS, '03-detail-step1.png'), fullPage: true });

      // 切到 step 2
      await page.locator('button:has-text("車主二簽")').first().click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, '04-detail-step2.png'), fullPage: true });

      // 切到 step 3
      await page.locator('button:has-text("收款方式")').first().click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, '05-detail-step3.png'), fullPage: true });

      // 切到 step 4
      await page.locator('button:has-text("RO 關單")').first().click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, '06-detail-step4.png'), fullPage: true });
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
