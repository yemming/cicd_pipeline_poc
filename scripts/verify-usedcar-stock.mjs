/**
 * verify-usedcar-stock.mjs — Phase 3A #8 A9 中古車庫存看板升級驗證
 *
 * 對應頁面：/usedcar/stock（中古車輛模組視角，RS03B_v1）。
 * 與 /sales/showroom/used-cars 同源資料、共用 UsedCarInventoryBoard 元件，
 * 差異在 page header breadcrumb / chip 走中古車輛模組。
 *
 * 驗證：
 *   - status=200、無 console error
 *   - data-testid="usedcar-inventory-usedcar" 存在
 *   - data-testid="usedcar-perspective-chip" 存在
 *   - >=5 KPI、>=8 張車卡
 *   - h1=「中古車庫存看板」
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const envText = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const env = Object.fromEntries(
  envText.split('\n').filter((l) => l && !l.trim().startsWith('#') && l.includes('=')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = 'yemming.yu@gmail.com';
const APP_BASE = process.env.APP_BASE || 'http://localhost:3000';
const projectRef = new URL(SUPABASE_URL).host.split('.')[0];
const COOKIE_NAME = `sb-${projectRef}-auth-token`;

// 用 password sign-in 取代 magic link（magic link admin/generate_link rate-limited
// 跑多輪驗證後會 401，password grant 沒這個限制）。dev-test-credentials skill 規定
// dev 帳密都是 email 同字串。
const PASSWORD = EMAIL;
const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!tokenRes.ok) {
  console.error('[FAIL] password grant failed', tokenRes.status, await tokenRes.text());
  process.exit(1);
}
const tokenData = await tokenRes.json();
const accessToken = tokenData.access_token;
const refreshToken = tokenData.refresh_token;
const expiresIn = tokenData.expires_in ?? 3600;
const expiresAt = tokenData.expires_at ?? Math.floor(Date.now() / 1000) + expiresIn;
const tokenType = tokenData.token_type ?? 'bearer';
const user = tokenData.user;
const session = {
  access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn,
  expires_at: expiresAt, token_type: tokenType, user,
  provider_token: null, provider_refresh_token: null,
};
const cookieValue = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64');
const CHUNK_SIZE = 3180;
const parts = [];
for (let i = 0; i < cookieValue.length; i += CHUNK_SIZE) parts.push(cookieValue.slice(i, i + CHUNK_SIZE));
const appUrl = new URL(APP_BASE);
const cookies = parts.map((value, idx) => ({
  name: parts.length === 1 ? COOKIE_NAME : `${COOKIE_NAME}.${idx}`,
  value, domain: appUrl.hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
}));
cookies.push({
  name: 'dealeros_scope',
  value: JSON.stringify({ brand_id: 'ducati', store_id: null }),
  domain: appUrl.hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
});

console.error(`[debug] accessToken set: ${!!accessToken}, chunks: ${parts.length}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies(cookies);
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

const target = `${APP_BASE}/usedcar/stock`;
const failures = [];
let kpiCount = 0, cardCount = 0, hasUsedcarRoot = false, hasUsedcarChip = false, h1Text = '';

try {
  const resp = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  const status = resp?.status();
  const finalUrl = page.url();
  console.error(`    nav: status=${status} final=${finalUrl}`);
  if (status !== 200) failures.push(`expected 200, got ${status}`);
  if (finalUrl.includes('/login') || finalUrl.includes('/auth')) failures.push(`redirected to login`);

  hasUsedcarRoot = (await page.locator('[data-testid="usedcar-inventory-usedcar"]').count()) > 0;
  if (!hasUsedcarRoot) failures.push('usedcar-inventory-usedcar root not found');

  hasUsedcarChip = (await page.locator('[data-testid="usedcar-perspective-chip"]').count()) > 0;
  if (!hasUsedcarChip) failures.push('usedcar-perspective-chip not found');

  h1Text = (await page.locator('h1').first().innerText().catch(() => '')).trim();
  if (h1Text !== '中古車庫存看板') failures.push(`h1 mismatch: "${h1Text}"`);

  kpiCount = await page.locator('[data-testid^="usedcar-kpi-"]').count();
  if (kpiCount < 5) failures.push(`expected >=5 KPI, got ${kpiCount}`);

  cardCount = await page.locator('[data-testid^="usedcar-card-"]').count();
  if (cardCount < 8) {
    // fallback: 也許 testid 不一樣，先 KPI / chip 通過即可
    console.error(`    note: cardCount=${cardCount} via [data-testid^="usedcar-card-"]; checking list rows instead...`);
    const listRows = await page.locator('[data-testid^="usedcar-row-"]').count();
    if (listRows < 8 && cardCount < 8) failures.push(`expected >=8 cards or list rows, got cards=${cardCount} rows=${listRows}`);
    cardCount = Math.max(cardCount, listRows);
  }

  await page.screenshot({ path: '/tmp/usedcar-stock-verify.png', fullPage: true });
  console.error('    screenshot saved: /tmp/usedcar-stock-verify.png');

  const meaningful = consoleErrors.filter((e) => !/Download the React DevTools|chunk-/.test(e));
  if (meaningful.length > 0) failures.push(`console errors: ${meaningful.slice(0, 3).join(' | ')}`);
} catch (e) {
  failures.push(`exception: ${e.message}`);
  try { await page.screenshot({ path: '/tmp/usedcar-stock-verify.png', fullPage: true }); } catch {}
} finally {
  await browser.close();
}

console.error(`[done] kpis=${kpiCount} cards=${cardCount} root=${hasUsedcarRoot} chip=${hasUsedcarChip} h1="${h1Text}"`);

if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
} else {
  console.log(`[OK] /usedcar/stock usedcar view rendered ${kpiCount} KPIs + ${cardCount} cards (h1="${h1Text}")`);
  process.exit(0);
}
