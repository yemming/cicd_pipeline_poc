/**
 * verify-parts-setup-serial-tracking.mjs
 * Phase 3C D1.16 — /parts/setup/serial-tracking 序列號追蹤設定對齊驗證
 *
 * 規格 docs/DUCATI_v2_output/04_庫存管理/01_基礎設定/03_基礎設定_序列號追蹤.html
 *
 * 驗收項：
 *   1. status 200
 *   2. H1「序列號 / 批號追蹤設定」
 *   3. Sprint chip「庫存 · 3.5」
 *   4. Caption「設定哪些備件需要序列號追蹤・追蹤規則與查詢」
 *   5. 兩張卡片：「追蹤規則設定」+「序列號查詢」
 *   6. 序列號查詢「查詢」按鈕存在
 *   7. 至少 3 row 規則卡（A/B/C 三類）
 *   8. console 無 meaningful error
 *   9. 截圖 /tmp/parts-setup-serial-tracking-verify.png
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

console.error('\n  → /parts/setup/serial-tracking');
const resp = await page.goto(`${APP_BASE}/parts/setup/serial-tracking`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// 2. H1
if ((await page.locator('h1:has-text("序列號 / 批號追蹤設定")').count()) < 1) {
  failures.push('h1 「序列號 / 批號追蹤設定」 missing');
}

// 3. Sprint chip
if ((await page.locator('text=庫存 · 3.5').first().count()) < 1) {
  failures.push('sprint chip 「庫存 · 3.5」 missing');
}

// 4. Caption
if (
  (await page.locator('text=設定哪些備件需要序列號追蹤・追蹤規則與查詢').count()) < 1
) {
  failures.push('caption missing');
}

// 5. 兩張卡片標題
if ((await page.locator('text=追蹤規則設定').count()) < 1) {
  failures.push('card「追蹤規則設定」 missing');
}
if ((await page.locator('text=序列號查詢').count()) < 1) {
  failures.push('card「序列號查詢」 missing');
}

// 6. 查詢按鈕
if ((await page.locator('button:has-text("查詢")').count()) < 1) {
  failures.push('查詢 button missing');
}

// 7. A/B/C 三類規則 row（至少出現 3 個 checkbox）
const checkboxCount = await page.locator('input[type="checkbox"]').count();
if (checkboxCount < 3) {
  failures.push(`rule rows < 3 (checkbox count=${checkboxCount})`);
}

await page.screenshot({
  path: '/tmp/parts-setup-serial-tracking-verify.png',
  fullPage: true,
});
console.error('    screenshot: /tmp/parts-setup-serial-tracking-verify.png');

// 8. console errors
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
  console.error('\n✅ PASS — /parts/setup/serial-tracking 對齊 OK');
}
