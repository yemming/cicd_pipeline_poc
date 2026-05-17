// CRM02A 銷售電訪問卷設定 v2 驗收
import { chromium } from 'playwright';

const EMAIL = 'yemming.yu@gmail.com';
const PASSWORD = 'yemming.yu@gmail.com';
const BASE = 'http://localhost:3001';
const TARGET = `${BASE}/crm/sales/survey-templates`;

const consoleMsgs = [];
const pageErrors = [];

function log(...a) { console.log('[verify]', ...a); }

async function ensureLoggedIn(page) {
  if (page.url().includes('/login')) {
    log('redirected to /login, filling form');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForLoadState('networkidle').catch(() => {});
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  page.on('console', (msg) => {
    const t = msg.type();
    const text = msg.text();
    if (t === 'error' || t === 'warning') {
      consoleMsgs.push(`[${t}] ${text}`);
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  try {
    log('goto list', TARGET);
    await page.goto(TARGET, { waitUntil: 'networkidle' });
    await ensureLoggedIn(page);
    if (!page.url().includes('/crm/sales/survey-templates')) {
      await page.goto(TARGET, { waitUntil: 'networkidle' });
    }
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800);

    // 1. list fullPage
    await page.screenshot({ path: '/tmp/crm02a-list.png', fullPage: true });
    log('saved crm02a-list.png');

    // 2. KPI 近照 — 找 4 個 KPI 卡所在 row
    const kpiRow = page.locator('main').locator('div').filter({
      hasText: /問卷總數|啟用中|草稿|本月修改/,
    }).first();
    try {
      const headerArea = page.locator('main > *').first();
      // 嘗試抓第一個含 KPI 文字的容器，但實際 KPI 通常在某個 grid 內
      // fallback：直接抓 main 上半部
      const main = page.locator('main').first();
      const bbox = await main.boundingBox();
      if (bbox) {
        await page.screenshot({
          path: '/tmp/crm02a-kpi.png',
          clip: { x: bbox.x, y: bbox.y, width: bbox.width, height: Math.min(280, bbox.height) },
        });
        log('saved crm02a-kpi.png (top region)');
      }
    } catch (e) {
      log('KPI shot fallback failed:', e.message);
    }

    // 3. 問卷卡片 grid 近照 — 抓 main 中段
    try {
      const main = page.locator('main').first();
      const bbox = await main.boundingBox();
      if (bbox) {
        await page.screenshot({
          path: '/tmp/crm02a-cards.png',
          clip: { x: bbox.x, y: Math.min(bbox.y + 280, bbox.y + bbox.height - 100), width: bbox.width, height: Math.min(500, bbox.height - 280) },
        });
        log('saved crm02a-cards.png');
      }
    } catch (e) {
      log('cards shot failed:', e.message);
    }

    // 4. 新增問卷 modal
    log('click + 新增問卷');
    const newBtn = page.getByRole('button', { name: /\+\s*新增問卷|新增問卷/ }).first();
    const newBtnCount = await newBtn.count();
    log('new button count:', newBtnCount);
    if (newBtnCount > 0) {
      await newBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: '/tmp/crm02a-new-modal.png', fullPage: true });
      log('saved crm02a-new-modal.png');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } else {
      log('WARN: 找不到 + 新增問卷 按鈕');
      await page.screenshot({ path: '/tmp/crm02a-new-modal.png', fullPage: true });
    }

    // 5/6. 詳情頁 — 取第一張卡的連結
    log('find first survey card link');
    // 詳情連結通常是 /crm/sales/survey-templates/<uuid>
    const detailLinks = await page.$$eval('a[href*="/crm/sales/survey-templates/"]', (as) =>
      as.map((a) => a.getAttribute('href')).filter((h) => h && h.split('/').length > 4)
    );
    log('detail links found:', detailLinks.length, detailLinks.slice(0, 3));
    const detailHref = detailLinks.find((h) => !!h && !h.endsWith('/survey-templates') && !h.endsWith('/survey-templates/'));

    if (detailHref) {
      const url = detailHref.startsWith('http') ? detailHref : `${BASE}${detailHref}`;
      log('goto detail', url);
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      await page.screenshot({ path: '/tmp/crm02a-detail.png', fullPage: true });
      log('saved crm02a-detail.png');

      // 新增題目 modal
      const addQBtn = page.getByRole('button', { name: /\+\s*新增題目|新增題目/ }).first();
      const addQCount = await addQBtn.count();
      log('+ 新增題目 button count:', addQCount);
      if (addQCount > 0) {
        await addQBtn.click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: '/tmp/crm02a-add-question.png', fullPage: true });
        log('saved crm02a-add-question.png');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } else {
        log('WARN: 找不到 + 新增題目 按鈕');
        await page.screenshot({ path: '/tmp/crm02a-add-question.png', fullPage: true });
      }

      // 版本記錄 modal
      const versionBtn = page.getByRole('button', { name: /版本記錄/ }).first();
      const verCount = await versionBtn.count();
      log('版本記錄 button count:', verCount);
      if (verCount > 0) {
        await versionBtn.click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: '/tmp/crm02a-versions.png', fullPage: true });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      // 檢查拖曳元素
      const dndHandles = await page.locator('[aria-roledescription="sortable"], [data-dnd-kit-sortable], button[aria-describedby*="DndDescribedBy"]').count();
      log('dnd-kit handles count:', dndHandles);
    } else {
      log('WARN: 找不到 detail link，無詳情頁可截');
    }

    // 結構檢查
    log('--- 結構檢查 ---');
    await page.goto(TARGET, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const kpiTexts = ['問卷總數', '啟用中', '草稿', '本月修改'];
    for (const t of kpiTexts) {
      const c = await page.getByText(t, { exact: false }).count();
      log(`KPI "${t}":`, c);
    }
    const cardCount = await page.locator('a[href*="/crm/sales/survey-templates/"]').count();
    log('問卷卡片連結數:', cardCount);

  } catch (e) {
    log('ERROR:', e.message);
    pageErrors.push(`script:${e.message}`);
  } finally {
    log('--- console errors/warnings ---');
    consoleMsgs.forEach((m) => log(m));
    log('--- page errors ---');
    pageErrors.forEach((m) => log(m));
    log('total console err/warn:', consoleMsgs.length, 'page errors:', pageErrors.length);
    await browser.close();
  }
})();
