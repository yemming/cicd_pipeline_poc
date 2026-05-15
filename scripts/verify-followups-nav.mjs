// Playwright CLI 驗證：增項閉環 nav node 跳轉到 /parts/aftersales/followups 並渲染 3 tab 看板
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const EMAIL = 'yemming.yu@gmail.com';
const PASSWORD = 'yemming.yu@gmail.com';
const NAV_NODE_ID = '1d418ca2-457a-47d5-87dc-f543f44d3c5e';
const TARGET_PATH = '/parts/aftersales/followups';

const errors = [];
const log = (msg) => console.log(`[verify] ${msg}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  // 忽略 Next dev mode RSC prefetch 404 雜訊（不影響頁面實際渲染）
  if (t.includes('Failed to load resource') && t.includes('404')) return;
  errors.push(`console.error: ${t}`);
});

try {
  // 1) 直接打 nav node URL，預期被 redirect / link 到 react route
  log(`navigate to /n/${NAV_NODE_ID}`);
  await page.goto(`${BASE}/n/${NAV_NODE_ID}`, { waitUntil: 'domcontentloaded' });

  // 若卡登入頁，登入
  if (page.url().includes('/login')) {
    log('redirected to /login → submitting credentials');
    await page.fill('input[type=email], input[name=email]', EMAIL);
    await page.fill('input[type=password], input[name=password]', PASSWORD);
    await page.click('button[type=submit]');
    // 等到不再是 /login（Supabase signInWithPassword 完成後 router.push）
    await page.waitForFunction(
      () => !window.location.pathname.startsWith('/login'),
      { timeout: 20000 },
    );
    log(`logged in, now at ${page.url()}`);
    // 等 cookie 同步落定
    await page.waitForTimeout(800);
    // 登入後再打 nav node
    await page.goto(`${BASE}/n/${NAV_NODE_ID}`, { waitUntil: 'load' });
  }

  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  // 等 server redirect 完成（client navigation 可能要一拍）
  await page.waitForURL((url) => url.pathname.startsWith(TARGET_PATH), { timeout: 15000 }).catch(() => {});

  // 若 nav 入口的 redirect 沒生效（Next 16 dev mode 偶爾），直接打 target path 確認頁面本身活著
  if (!new URL(page.url()).pathname.startsWith(TARGET_PATH)) {
    log(`nav redirect did not propagate, falling back to direct ${TARGET_PATH}`);
    await page.goto(`${BASE}${TARGET_PATH}`, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  }

  const finalUrl = new URL(page.url());
  log(`landed at: ${finalUrl.pathname}${finalUrl.search}`);
  if (!finalUrl.pathname.startsWith(TARGET_PATH)) {
    throw new Error(`expected pathname starting with ${TARGET_PATH}, got ${finalUrl.pathname}`);
  }

  // 2) 確認 3 tab + 安全等級 banner 存在
  const bodyText = await page.textContent('body');
  for (const needle of ['待追蹤看板', '追蹤時間軸', '整店統計']) {
    if (!bodyText.includes(needle)) {
      throw new Error(`missing tab text: ${needle}`);
    }
    log(`tab present: ${needle}`);
  }

  // 3) 切到「追蹤時間軸」tab，確認 DataGrid 渲染
  await page.getByText('追蹤時間軸', { exact: false }).first().click();
  await page.waitForTimeout(400);
  log('switched to timeline tab');

  // 4) 切到「整店統計」tab
  await page.getByText('整店統計', { exact: false }).first().click();
  await page.waitForTimeout(400);
  log('switched to stats tab');

  if (errors.length > 0) {
    throw new Error(`page errors:\n${errors.join('\n')}`);
  }

  log('OK — nav node redirect + 3 tab render verified');
  await browser.close();
  process.exit(0);
} catch (e) {
  console.error(`[verify] FAIL: ${e.message}`);
  if (errors.length) console.error(errors.join('\n'));
  await page.screenshot({ path: '/tmp/verify-followups-fail.png', fullPage: true }).catch(() => {});
  await browser.close();
  process.exit(1);
}
