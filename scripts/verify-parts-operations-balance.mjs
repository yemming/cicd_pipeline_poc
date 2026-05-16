/**
 * verify-parts-operations-balance.mjs
 * Phase 3C D5.1 — /parts/operations/balance 商品庫存查詢 v2 對齊驗證
 *
 * 規格 docs/DUCATI_v2_output/04_庫存管理/05_庫存作業/07_庫存管理_商品庫存查詢_v2.html
 *
 * 驗收項：
 *   1. status 200
 *   2. H1「商品庫存查詢」
 *   3. Sprint chip「庫存 · 7.1」
 *   4. ★6 marker chip
 *   5. Caption「即時庫存 · 帳面庫存 vs 可用庫存 · 告警整合」
 *   6. ★6 banner 顯示「跨模組」字樣
 *   7. 三個 cross-link href 都存在：
 *      /sales/showroom/stock · /inventory/vehicles · /usedcar/stock
 *   8. 告警快覽區塊標題「⚡ 庫存告警快覽（10.4）」
 *   9. 5 個告警 KPI label 全到位（缺料告警 / 低庫存預警 / 工單待料 / 超儲警示 / 呆滯料）
 *  10. 既有 DataGrid 仍然渲染（檢查表頭「料號」）
 *  11. console 無 meaningful error
 *  12. 截圖 /tmp/parts-operations-balance-verify.png
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const envText = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter((l) => l && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
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
  access_token: td.access_token,
  refresh_token: td.refresh_token,
  expires_in: td.expires_in ?? 3600,
  expires_at: td.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  token_type: td.token_type ?? 'bearer',
  user: td.user,
  provider_token: null,
  provider_refresh_token: null,
};
const cookieValue = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64');
const CHUNK_SIZE = 3180;
const parts = [];
for (let i = 0; i < cookieValue.length; i += CHUNK_SIZE) parts.push(cookieValue.slice(i, i + CHUNK_SIZE));
const appUrl = new URL(APP_BASE);
const authCookies = parts.map((value, idx) => ({
  name: parts.length === 1 ? COOKIE_NAME : `${COOKIE_NAME}.${idx}`,
  value,
  domain: appUrl.hostname,
  path: '/',
  httpOnly: false,
  secure: false,
  sameSite: 'Lax',
}));
const scopeCookie = {
  name: 'dealeros_scope',
  value: JSON.stringify({ brand_id: 'indian', store_id: null }),
  domain: appUrl.hostname,
  path: '/',
  httpOnly: false,
  secure: false,
  sameSite: 'Lax',
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([...authCookies, scopeCookie]);
const page = await ctx.newPage();

const failures = [];
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

console.error('\n  → /parts/operations/balance');
const resp = await page.goto(`${APP_BASE}/parts/operations/balance`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// 2. H1
if ((await page.locator('h1:has-text("商品庫存查詢")').count()) < 1) {
  failures.push('h1 「商品庫存查詢」 missing');
}

// 3. Sprint chip
if ((await page.locator('text=庫存 · 7.1').first().count()) < 1) {
  failures.push('sprint chip 「庫存 · 7.1」 missing');
}

// 4. ★6 marker
if ((await page.locator('text=★6').first().count()) < 1) {
  failures.push('★6 marker chip missing');
}

// 5. Caption
if (
  (await page
    .locator('text=即時庫存 · 帳面庫存 vs 可用庫存 · 告警整合')
    .count()) < 1
) {
  failures.push('caption missing');
}

// 6. cross-module banner
if ((await page.locator('text=跨模組').first().count()) < 1) {
  failures.push('★6 banner 「跨模組」 missing');
}

// 7. cross-link hrefs
const crossHrefs = [
  '/sales/showroom/stock',
  '/inventory/vehicles',
  '/usedcar/stock',
];
for (const href of crossHrefs) {
  if ((await page.locator(`a[href="${href}"]`).count()) < 1) {
    failures.push(`cross-link href="${href}" missing`);
  }
}

// 8. 告警快覽區塊標題
if ((await page.locator('text=庫存告警快覽（10.4）').count()) < 1) {
  failures.push('alert dashboard section title missing');
}

// 9. 5 個告警 KPI label
const alertLabels = ['缺料告警', '低庫存預警', '工單待料', '超儲警示', '呆滯料'];
for (const label of alertLabels) {
  if ((await page.locator(`text=${label}`).count()) < 1) {
    failures.push(`alert KPI "${label}" missing`);
  }
}

// 10. DataGrid 仍渲染（料號 header）
if ((await page.locator('text=料號').first().count()) < 1) {
  failures.push('DataGrid 表頭「料號」 missing');
}

await page.screenshot({
  path: '/tmp/parts-operations-balance-verify.png',
  fullPage: true,
});
console.error('    screenshot: /tmp/parts-operations-balance-verify.png');

// 11. console errors
const meaningful = consoleErrors.filter(
  (e) =>
    !/Download the React DevTools|chunk-|You provided a `value` prop to a form field|hydration|Failed to load resource/.test(
      e,
    ),
);
if (meaningful.length > 0) {
  failures.push(`console errors: ${meaningful.length}`);
  for (const e of meaningful.slice(0, 5)) console.error('    err:', e);
}

await browser.close();

if (failures.length > 0) {
  console.error('\n❌ FAIL');
  for (const f of failures) console.error('  -', f);
  process.exit(1);
} else {
  console.error('\n✅ PASS — 商品庫存查詢 v2 對齊 OK');
}
