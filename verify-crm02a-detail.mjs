import { chromium } from 'playwright';

const EMAIL = 'yemming.yu@gmail.com';
const PASSWORD = 'yemming.yu@gmail.com';
const BASE = 'http://localhost:3001';
const DETAIL_ID = '0d59967a-02f2-47b8-a21c-df7dfcda0235'; // Indian, 新車交車後 7 日滿意度, 4 questions
const DETAIL_URL = `${BASE}/crm/sales/survey-templates/${DETAIL_ID}`;
const LIST_URL = `${BASE}/crm/sales/survey-templates`;

const consoleMsgs = [];
const pageErrors = [];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { const t = m.type(); if (t==='error'||t==='warning') consoleMsgs.push(`[${t}] ${m.text()}`); });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  console.log('[v2] goto list first to login');
  await page.goto(LIST_URL, { waitUntil: 'networkidle' });
  if (page.url().includes('/login')) {
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }).catch(()=>{}),
      page.click('button[type="submit"]'),
    ]);
  }
  await page.waitForTimeout(500);

  console.log('[v2] goto detail (Indian brand id):', DETAIL_URL);
  await page.goto(DETAIL_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  console.log('[v2] final url:', page.url());

  await page.screenshot({ path: '/tmp/crm02a-detail.png', fullPage: true });
  console.log('[v2] saved crm02a-detail.png');

  // bodyText preview
  const bodyText = (await page.locator('main').first().innerText().catch(() => '')).slice(0, 400);
  console.log('[v2] main text preview:', bodyText.replace(/\s+/g, ' '));

  // Try add-question
  const addQBtn = page.getByRole('button', { name: /\+\s*新增題目|新增題目/ }).first();
  const cnt = await addQBtn.count();
  console.log('[v2] + 新增題目 count:', cnt);
  if (cnt > 0) {
    try {
      await addQBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: '/tmp/crm02a-add-question.png', fullPage: true });
      console.log('[v2] saved crm02a-add-question.png');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } catch (e) { console.log('[v2] add-question click failed:', e.message); }
  }

  // 版本記錄
  const verBtn = page.getByRole('button', { name: /版本記錄/ }).first();
  const vc = await verBtn.count();
  console.log('[v2] 版本記錄 count:', vc);
  if (vc > 0) {
    try {
      await verBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: '/tmp/crm02a-versions.png', fullPage: true });
      console.log('[v2] saved crm02a-versions.png');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } catch (e) { console.log('[v2] version click failed:', e.message); }
  }

  // dnd handles
  const dnd = await page.locator('[aria-roledescription="sortable"]').count();
  const dndBtn = await page.locator('button[aria-describedby*="DndDescribedBy"]').count();
  console.log('[v2] dnd-kit sortable count:', dnd, 'dnd buttons:', dndBtn);

  console.log('[v2] --- console err/warn ---');
  consoleMsgs.forEach((m) => console.log(m));
  console.log('[v2] --- page errors ---');
  pageErrors.forEach((m) => console.log(m));
  console.log('[v2] totals:', consoleMsgs.length, pageErrors.length);

  await browser.close();
})();
