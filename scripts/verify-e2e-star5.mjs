/**
 * verify-e2e-star5.mjs — Phase 4 ★5 跨模組串接點 e2e 驗證
 *
 * ★5「人車檔案 ↔ CRM 售後客戶基盤」串接點：
 *   - C12 人車檔案（售後接待視角）: /parts/aftersales/customers
 *     （sprint chip "★5"、cross-link banner → /crm/aftersales/customer-base）
 *   - B7 售後客戶基盤（CRM 視角）: /crm/aftersales/customer-base
 *     （sprint chip "★5"、反向 cross-link banner → /parts/aftersales/customers）
 *
 * 共用資料 SSOT：兩頁 server component 都跑
 * `getAftersalesCustomerBaseListPageData` helper、撈同一張 customers/vehicles 主檔；
 * 差別只在「視角文案 + filter + 欄位呈現」。e2e 驗證 read-side「同一筆客戶在兩頁
 * 都看得到」。
 *
 * 驗證劇本：
 *   1. 開 C12 /parts/aftersales/customers — 驗 H1 / ★5 chip / banner / cross-link
 *      到 /crm/aftersales/customer-base、抓第一列客戶姓名 + code 當錨點
 *   2. 開 B7 /crm/aftersales/customer-base — 驗 H1 / ★5 chip / 反向 banner /
 *      cross-link 回 /parts/aftersales/customers、確認上一步抓到的客戶姓名也出現
 *      在這一頁（資料 SSOT 共讀驗證）
 *   3. 兩頁 console error 0
 *   4. 各截一張圖
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
if (!tokenRes.ok) {
  console.error('[FAIL] password grant', tokenRes.status);
  process.exit(1);
}
const td = await tokenRes.json();
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
for (let i = 0; i < cookieValue.length; i += CHUNK_SIZE)
  parts.push(cookieValue.slice(i, i + CHUNK_SIZE));
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([...authCookies, scopeCookie]);
const page = await ctx.newPage();

const failures = [];
const shared = [];
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

// ============================================================
// Step 1 — C12 人車檔案（售後接待視角）
// ============================================================
console.error('\n  → C12: /parts/aftersales/customers');
const r1 = await page.goto(`${APP_BASE}/parts/aftersales/customers`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r1?.status() !== 200) failures.push(`C12 status=${r1?.status()}`);

// H1
const h1C12 = await page.locator('h1').first().innerText().catch(() => '');
if (!h1C12.includes('人車檔案')) failures.push(`C12 h1 missing: "${h1C12}"`);
else shared.push(`C12 h1: "${h1C12}"`);

// Sprint chip "售後 · 9"（既有）+ ★5 marker
if ((await page.locator('text=售後 · 9').count()) < 1) {
  failures.push('C12 sprint chip "售後 · 9" missing');
} else {
  shared.push('C12 sprint chip: "售後 · 9"');
}
if ((await page.locator('header >> text=★5').count()) < 1) {
  failures.push('C12 ★5 marker chip missing');
} else {
  shared.push('C12 ★5 marker visible in header');
}

// ★5 cross-link banner
const c12BannerCount = await page
  .locator('text=/★5 跨模組|售後接待視角|CRM 視角/')
  .count();
if (c12BannerCount < 1) {
  failures.push('C12 ★5 cross-link banner missing');
} else {
  shared.push('C12 banner: "★5 跨模組 — 售後接待視角 ↔ CRM 視角"');
}

// Cross-link → B7
const c12XlinkCount = await page
  .locator('a[href="/crm/aftersales/customer-base"]')
  .count();
if (c12XlinkCount < 1) {
  failures.push('C12 cross-link → /crm/aftersales/customer-base missing');
} else {
  shared.push(
    `C12 cross-link → /crm/aftersales/customer-base (count=${c12XlinkCount})`,
  );
}

// 抓第一列客戶姓名 + code（DataGrid 第二欄是「車主」）
// 用 row 內 text-[12.5px] font-medium 抓姓名；用 font-mono 抓 code
let anchorName = '';
let anchorCode = '';
const firstRow = page.locator('tbody tr').first();
if ((await firstRow.count()) > 0) {
  // code 是第一欄的 Link
  anchorCode = (await firstRow.locator('a[href^="/admin/master-data/customers/"]').first().innerText().catch(() => '')).trim();
  // name 是第二欄第一個 span（font-medium）
  anchorName = (await firstRow.locator('span.font-medium').first().innerText().catch(() => '')).trim();
  if (anchorName) shared.push(`C12 anchor customer: code="${anchorCode}" name="${anchorName}"`);
  else failures.push('C12 第一列 anchor 客戶姓名抓不到');
} else {
  failures.push('C12 DataGrid 沒有任何客戶列');
}

await page.screenshot({ path: '/tmp/e2e-star5-customers.png', fullPage: true });
console.error('    screenshot: /tmp/e2e-star5-customers.png');

// ============================================================
// Step 2 — B7 售後客戶基盤（CRM 視角）
// ============================================================
console.error('\n  → B7: /crm/aftersales/customer-base');
const r2 = await page.goto(`${APP_BASE}/crm/aftersales/customer-base`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r2?.status() !== 200) failures.push(`B7 status=${r2?.status()}`);

// H1
const h1B7 = await page.locator('h1').first().innerText().catch(() => '');
if (!h1B7.includes('售後客戶基盤')) failures.push(`B7 h1 missing: "${h1B7}"`);
else shared.push(`B7 h1: "${h1B7}"`);

// 「售後 CRM」既有 chip + 新加的 ★5 marker
if ((await page.locator('text=售後 CRM').count()) < 1) {
  failures.push('B7 sprint chip "售後 CRM" missing');
} else {
  shared.push('B7 sprint chip: "售後 CRM"');
}
if ((await page.locator('header >> text=★5').count()) < 1) {
  failures.push('B7 ★5 marker chip missing');
} else {
  shared.push('B7 ★5 marker visible in header');
}

// 反向 ★5 banner
const b7BannerCount = await page
  .locator('text=/★5 跨模組|售後接待視角|CRM 視角/')
  .count();
if (b7BannerCount < 1) {
  failures.push('B7 反向 ★5 banner missing');
} else {
  shared.push('B7 banner: "★5 跨模組 — CRM 視角 ↔ 售後接待視角"');
}

// 反向 cross-link → C12
const b7XlinkCount = await page
  .locator('a[href="/parts/aftersales/customers"]')
  .count();
if (b7XlinkCount < 1) {
  failures.push('B7 cross-link → /parts/aftersales/customers missing');
} else {
  shared.push(
    `B7 cross-link → /parts/aftersales/customers (count=${b7XlinkCount})`,
  );
}

// SSOT 驗證：C12 抓到的客戶姓名 / code 必須在 B7 也看得到
if (anchorName) {
  const nameHit = await page.locator(`tbody >> text="${anchorName}"`).count();
  if (nameHit < 1) {
    failures.push(
      `SSOT mismatch: C12 anchor name "${anchorName}" 在 B7 列表中找不到`,
    );
  } else {
    shared.push(
      `SSOT 共讀 OK: "${anchorName}" 同時出現在 C12 與 B7（同一筆 customers row）`,
    );
  }
}
if (anchorCode) {
  const codeHit = await page.locator(`tbody >> text="${anchorCode}"`).count();
  if (codeHit < 1) {
    failures.push(`SSOT mismatch: C12 anchor code "${anchorCode}" 在 B7 找不到`);
  } else {
    shared.push(`SSOT 共讀 OK: code "${anchorCode}" 兩頁皆 visible`);
  }
}

await page.screenshot({
  path: '/tmp/e2e-star5-customer-base.png',
  fullPage: true,
});
console.error('    screenshot: /tmp/e2e-star5-customer-base.png');

// ============================================================
// Console errors
// ============================================================
const meaningful = consoleErrors.filter(
  (e) =>
    !/Download the React DevTools|chunk-|Failed to load resource.*favicon/.test(e),
);
if (meaningful.length > 0)
  failures.push(`console: ${meaningful.slice(0, 2).join(' | ')}`);

await browser.close();

// ============================================================
// 結論
// ============================================================
console.log('');
console.log('=== Shared state observed (read-side ★5 串接點同步) ===');
for (const s of shared) console.log('  - ' + s);
console.log('');

if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
}
console.log(
  '[OK] ★5 e2e: C12 人車檔案 + B7 售後客戶基盤 同步呈現「同一批 customers SSOT、雙視角切換」串接語意 + 雙向 cross-link + 同一筆客戶兩頁共讀 visible',
);
process.exit(0);
