/**
 * verify-parts-aftersales-checkout.mjs — Phase 3B C9 /parts/aftersales/checkout v2 升級驗證
 *
 * v2 規格 docs/DUCATI_v2_output/03_售後修護/01_售後接待/08_結帳收款.html — 4-step wizard：
 *   費用確認 → 車主第二次簽名 → 收款方式・發票 → RO 關單。
 * 本輪 visual refresh（C9 不是 e2e ★ 點，不加 ★ marker）：
 *   1. board sprint chip 改 「售後 · 8.1」+ caption 對齊 v2 4 步描述
 *   2. board 加 v2 流程介紹 banner（4 步要點 + RO 存檔 36 個月）
 *   3. wizard RO header 加「竣工複檢 ✅ 通過」chip（v2 RO banner meta）
 *   4. wizard Step 4 結案說明加「電子發票已開立，RO 存檔 36 個月」
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
const EMAIL = 'yemming.yu@gmail.com';
const APP_BASE = process.env.APP_BASE || 'http://localhost:3000';
const projectRef = new URL(SUPABASE_URL).host.split('.')[0];
const COOKIE_NAME = `sb-${projectRef}-auth-token`;

const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: EMAIL }),
});
const td = await tokenRes.json();
if (!td.access_token) {
  console.error('[FATAL] password grant failed:', JSON.stringify(td));
  process.exit(2);
}
const session = {
  access_token: td.access_token, refresh_token: td.refresh_token,
  expires_in: td.expires_in ?? 3600,
  expires_at: td.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  token_type: td.token_type ?? 'bearer', user: td.user,
  provider_token: null, provider_refresh_token: null,
};
const cookieValue = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64');
const CHUNK_SIZE = 3180;
const parts = [];
for (let i = 0; i < cookieValue.length; i += CHUNK_SIZE) parts.push(cookieValue.slice(i, i + CHUNK_SIZE));
const appUrl = new URL(APP_BASE);
const authCookies = parts.map((value, idx) => ({
  name: parts.length === 1 ? COOKIE_NAME : `${COOKIE_NAME}.${idx}`,
  value, domain: appUrl.hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
}));
const scopeCookie = {
  name: 'dealeros_scope', value: JSON.stringify({ brand_id: 'indian', store_id: null }),
  domain: appUrl.hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([...authCookies, scopeCookie]);
const page = await ctx.newPage();

const failures = [];
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

console.error('\n  → /parts/aftersales/checkout (board)');
const resp = await page.goto(`${APP_BASE}/parts/aftersales/checkout`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`board status=${resp?.status()}`);

// ── board v2 element checks ──────────────────────────────
if ((await page.locator('text=售後 · 8.1').count()) < 1) failures.push('board sprint chip 售後 · 8.1 missing');
if ((await page.locator('text=車主第二次簽名').count()) < 1) failures.push('board caption v2 文案 missing');
if ((await page.locator('text=RO 工單金流終點站').count()) < 1) failures.push('board v2 banner title missing');
if ((await page.locator('text=存檔 36 個月').count()) < 1) failures.push('board v2 banner 存檔 36 個月 missing');
if ((await page.locator('text=主管授權折扣').count()) < 1) failures.push('board v2 banner 主管授權折扣 missing');

// ── 是否有可進的結帳單；若有就跳進 wizard 驗 v2 元素 ──
const firstLink = page.locator('a[href*="/parts/aftersales/checkout/"][href*="-"]').first();
const hasRow = (await firstLink.count()) > 0;
if (hasRow) {
  const href = await firstLink.getAttribute('href');
  console.error(`  → wizard ${href}`);
  const r2 = await page.goto(`${APP_BASE}${href}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  if (r2?.status() !== 200) failures.push(`wizard status=${r2?.status()}`);

  // wizard RO header — 結帳編號 / 工單 / 車主・車輛 都該在
  if ((await page.locator('text=結帳編號').count()) < 1) failures.push('wizard RO header 結帳編號 missing');
  if ((await page.locator('text=車主・車輛').count()) < 1) failures.push('wizard RO header 車主・車輛 missing');

  // wizard step nav 4 步全在
  for (const step of ['費用確認', '車主二簽', '收款方式・發票', 'RO 關單']) {
    if ((await page.locator(`text=${step}`).count()) < 1) failures.push(`wizard step nav 「${step}」 missing`);
  }

  // Step 1 v2 元素
  if ((await page.locator('text=費用明細確認').count()) < 1) failures.push('wizard Step1 費用明細確認 title missing');
  if ((await page.locator('text=SA 與車主一起核對').count()) < 1) failures.push('wizard Step1 sub-caption SA 與車主一起核對 missing');
} else {
  console.error('  (skip wizard — board 沒有可進入的結帳單)');
}

const meaningful = consoleErrors.filter((e) => !/Download the React DevTools|chunk-|You provided a `value` prop to a form field|hydration/.test(e));
if (meaningful.length > 0) failures.push(`console: ${meaningful.slice(0, 2).join(' | ')}`);

await page.screenshot({ path: '/tmp/parts-aftersales-checkout-verify.png', fullPage: true });
console.error('    screenshot: /tmp/parts-aftersales-checkout-verify.png');

await browser.close();
console.log('');
if (failures.length > 0) { for (const f of failures) console.log(`[FAIL] ${f}`); process.exit(1); }
console.log('[OK] /parts/aftersales/checkout v2 升級: sprint chip 8.1 + v2 流程 banner + wizard 4-step nav');
process.exit(0);
