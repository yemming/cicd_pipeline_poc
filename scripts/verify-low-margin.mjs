#!/usr/bin/env node
/**
 * BDN #19 verify — RS03B 中古車庫存看板低毛利警示
 *
 * 驗證：
 * - U012 / U013（毛利 ≤5%）卡片 amber 底 + 紅 chip「⚠️ 低毛利」
 * - U001 等正常車仍白底、無警示 chip
 * - List 視圖 row 同樣加 amber 底 + chip
 *
 * Usage: node scripts/verify-low-margin.mjs
 * Output: tmp/bdn19-*.png 截圖 + console JSON 結果
 */

import { chromium } from 'playwright';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(__dirname, '.pw-state.json');
const TMP = path.join(ROOT, 'tmp');
const APP_BASE = process.env.APP_BASE_URL || 'http://localhost:3000';

const log = (...m) => console.error('[bdn19]', ...m);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = { ok: true, checks: [] };

  try {
    const ctx = await browser.newContext({
      storageState: STATE_FILE,
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();

    log('goto used-cars');
    await page.goto(`${APP_BASE}/sales/showroom/used-cars`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // ── Card view 截圖 ─────────────────────────────
    await page.waitForSelector('[data-testid="usedcar-card-grid"]', { timeout: 10000 });
    const cardPath = path.join(TMP, 'bdn19-card-view.png');
    await page.screenshot({ path: cardPath, fullPage: true });
    log('card view screenshot →', cardPath);

    // 驗 U012 / U013 是 low-margin
    for (const id of ['U012', 'U013']) {
      const card = page.locator(`[data-testid="usedcar-card-${id}"]`);
      const isLow = await card.getAttribute('data-low-margin');
      const chip = await page.locator(`[data-testid="chip-low-margin-${id}"]`).count();
      results.checks.push({
        id,
        view: 'card',
        expected: { dataLow: 'true', chip: 1 },
        actual: { dataLow: isLow, chip },
        pass: isLow === 'true' && chip === 1,
      });
    }
    // 驗 U001 (高毛利) 沒有警示
    {
      const card = page.locator(`[data-testid="usedcar-card-U001"]`);
      const isLow = await card.getAttribute('data-low-margin');
      const chip = await page.locator(`[data-testid="chip-low-margin-U001"]`).count();
      results.checks.push({
        id: 'U001',
        view: 'card',
        expected: { dataLow: 'false', chip: 0 },
        actual: { dataLow: isLow, chip },
        pass: isLow === 'false' && chip === 0,
      });
    }

    // 截單張 U012 卡片
    const u012Card = page.locator(`[data-testid="usedcar-card-U012"]`);
    if ((await u012Card.count()) > 0) {
      await u012Card.scrollIntoViewIfNeeded();
      await u012Card.screenshot({ path: path.join(TMP, 'bdn19-u012-card.png') });
      log('U012 card close-up →', path.join(TMP, 'bdn19-u012-card.png'));
    }

    // ── List view 截圖 ─────────────────────────────
    log('switch to list view');
    await page.locator('[data-testid="view-toggle-list"]').click();
    await page.waitForSelector('[data-testid="usedcar-list-view"]', { timeout: 5000 });
    const listPath = path.join(TMP, 'bdn19-list-view.png');
    await page.screenshot({ path: listPath, fullPage: true });
    log('list view screenshot →', listPath);

    for (const id of ['U012', 'U013']) {
      const row = page.locator(`[data-testid="usedcar-row-${id}"]`);
      const isLow = await row.getAttribute('data-low-margin');
      const chip = await page.locator(`[data-testid="row-chip-low-margin-${id}"]`).count();
      results.checks.push({
        id,
        view: 'list',
        expected: { dataLow: 'true', chip: 1 },
        actual: { dataLow: isLow, chip },
        pass: isLow === 'true' && chip === 1,
      });
    }
    {
      const row = page.locator(`[data-testid="usedcar-row-U001"]`);
      const isLow = await row.getAttribute('data-low-margin');
      const chip = await page.locator(`[data-testid="row-chip-low-margin-U001"]`).count();
      results.checks.push({
        id: 'U001',
        view: 'list',
        expected: { dataLow: 'false', chip: 0 },
        actual: { dataLow: isLow, chip },
        pass: isLow === 'false' && chip === 0,
      });
    }

    results.ok = results.checks.every((c) => c.pass);
    console.log(JSON.stringify(results, null, 2));
    process.exit(results.ok ? 0 : 1);
  } catch (err) {
    log('FAILED:', err?.stack || err);
    console.log(JSON.stringify({ ok: false, error: String(err?.message || err) }));
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
