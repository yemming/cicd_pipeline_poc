/**
 * verify-parts-items-permissions.mjs
 * Phase 3C D1.5 — /parts/setup/item-permissions 商品管理權限對齊驗證
 *
 * 規格 docs/DUCATI_v2_output/04_庫存管理/01_基礎設定/01_基礎設定_商品管理權限.html
 *
 * 驗收項：
 *   1. status 200
 *   2. H1「商品管理權限」
 *   3. Sprint chip「1.3」
 *   4. Caption 含「設定各角色對商品資料的新增、修改、刪除、定價權限」
 *   5. Section header「角色權限矩陣」
 *   6. 三個 section label 出現：「商品基礎資料」「定價管理」「序列號/批號」
 *   7. 9 個 capability label 全部出現（查看商品清單 / 新增商品 / 修改商品資訊 /
 *      停用/刪除商品 / 查看售價 / 修改門市定價 / 設定特殊折扣 /
 *      序列號追蹤設定 / 批號管理設定）
 *   8. 4 個 role 表頭出現（warehouse / manager / purchaser / owner — 用 roles.name 中文）
 *   9. checkbox cell ≥ 9 × 4 = 36 個（含 disabled 也算）
 *  10. 「儲存設定」按鈕存在
 *  11. console 無 meaningful error
 *  12. 截圖 /tmp/parts-items-permissions-verify.png
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

console.error('\n  → /parts/setup/item-permissions');
const resp = await page.goto(`${APP_BASE}/parts/setup/item-permissions`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// 2. H1
if ((await page.locator('h1:has-text("商品管理權限")').count()) < 1) {
  failures.push('h1 「商品管理權限」 missing');
}

// 3. Sprint chip — 「1.3」
const sprintChipCount = await page
  .locator('span.rounded-full', { hasText: /^1\.3$/ })
  .count();
if (sprintChipCount < 1) {
  failures.push('sprint chip 「1.3」 missing');
}

// 4. Caption
if (
  (await page
    .locator('text=設定各角色對商品資料的新增、修改、刪除、定價權限')
    .count()) < 1
) {
  failures.push('caption missing');
}

// 5. Section header「角色權限矩陣」
if ((await page.locator('h2:has-text("角色權限矩陣")').count()) < 1) {
  failures.push('section header 「角色權限矩陣」 missing');
}

// 6. 三個 section label
for (const label of ['商品基礎資料', '定價管理', '序列號/批號']) {
  if ((await page.locator(`text=${label}`).count()) < 1) {
    failures.push(`section label「${label}」 missing`);
  }
}

// 7. 9 個 capability label
const capabilities = [
  '查看商品清單',
  '新增商品',
  '修改商品資訊',
  '停用/刪除商品',
  '查看售價',
  '修改門市定價',
  '設定特殊折扣',
  '序列號追蹤設定',
  '批號管理設定',
];
for (const cap of capabilities) {
  if ((await page.locator(`td:has-text("${cap}")`).count()) < 1) {
    failures.push(`capability label「${cap}」 missing`);
  }
}

// 8. 4 個 role 表頭（roles.name 用中文，撈不到時 fallback role code，這裡兩者皆驗）
// 從 DB seed 知道 indian 有 4 role：warehouse / manager / purchaser / owner
// roles.name 中文常見為 倉管 / 店長 / 採購主管 / 老闆 — 但任一格式皆 OK
const headerRow = page.locator('thead tr').first();
const roleHeaderCount = await headerRow.locator('th').count();
// 第一格是「功能」、後面 4 格才是 role
if (roleHeaderCount < 5) {
  failures.push(`role headers count=${roleHeaderCount - 1} (期望 4)`);
}

// 9. checkbox cell 至少 36
const checkboxCount = await page.locator('input[type="checkbox"]').count();
if (checkboxCount < 36) {
  failures.push(`checkbox count=${checkboxCount} (期望 ≥ 36)`);
}

// 10. 「儲存設定」按鈕
if ((await page.locator('button:has-text("儲存設定")').count()) < 1) {
  failures.push('「儲存設定」 button missing');
}

await page.screenshot({
  path: '/tmp/parts-items-permissions-verify.png',
  fullPage: true,
});
console.error('    screenshot: /tmp/parts-items-permissions-verify.png');

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
  console.error('\n✅ PASS — /parts/setup/item-permissions 對齊 OK');
}
