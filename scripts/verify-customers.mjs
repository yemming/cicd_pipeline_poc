/**
 * verify-customers.mjs — Phase 3B C12 /parts/aftersales/customers v2 對齊驗證
 *
 * v2 規格 docs/DUCATI_v2_output/03_售後修護/01_售後接待/09_人車檔案.html
 * ★5 跨模組 e2e 點 ↔ /crm/aftersales/customer-base
 *
 * 驗收項：
 *   1. sprint chip 「售後 · 9」+ 「★5」+ caption
 *   2. ★5 cross-link banner 含「切換到 CRM 視角」連到 /crm/aftersales/customer-base
 *   3. Filter bar 3 欄（車主/車牌/電話、類型、服務狀態）+ 查詢 / 重置
 *   4. DataGrid 8 個表頭（客戶編號、車主、聯絡電話、主車輛/里程、累計回廠、上次回廠、下次保養、服務狀態、操作）
 *   5. Indian brand 至少 1 列 demo row
 *   6. 列尾「人車詳情」連到 /admin/master-data/customers/{id}
 *   7. toolbar 共 N 筆 visible
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

console.error('\n  → /parts/aftersales/customers');
const resp = await page.goto(`${APP_BASE}/parts/aftersales/customers`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// 1. Sprint chip + title + ★5
if ((await page.locator('h1:has-text("人車檔案")').count()) < 1) failures.push('h1 人車檔案 missing');
if ((await page.locator('text=售後 · 9').count()) < 1) failures.push('sprint chip 售後 · 9 missing');
if ((await page.locator('text=★5').count()) < 1) failures.push('★5 chip missing');

// 2. ★5 cross-link banner
if ((await page.locator('text=★5 跨模組').count()) < 1) failures.push('★5 跨模組 banner label missing');
const crmLink = await page.locator('a[href="/crm/aftersales/customer-base"]:has-text("切換到 CRM 視角")').count();
if (crmLink < 1) failures.push('cross-link 切換到 CRM 視角 missing or wrong href');

// 3. Filter bar
for (const lbl of ['車主 / 車牌 / 電話', '類型', '服務狀態']) {
  if ((await page.locator(`text=${lbl}`).count()) < 1) failures.push(`filter "${lbl}" missing`);
}
if ((await page.locator('button:has-text("查詢")').count()) < 1) failures.push('查詢 button missing');
if ((await page.locator('button:has-text("重置")').count()) < 1) failures.push('重置 button missing');

// 4. DataGrid 表頭（8 個資料欄 + 操作）
for (const head of ['客戶編號', '車主', '聯絡電話', '主車輛 / 里程', '累計回廠', '上次回廠', '下次保養', '服務狀態', '操作']) {
  if ((await page.locator(`th:has-text("${head}")`).count()) < 1) failures.push(`th "${head}" missing`);
}

// 5. 至少 1 列 indian demo row（看 customer code 樣式 C-YYYYMMDD-NNN 或 toolbar 共 N 筆 > 0）
const toolbarText = await page.locator('text=/人車檔案.*共\\s+\\d+\\s*\\/\\s*\\d+\\s+筆/').first().textContent().catch(() => '');
const m = toolbarText.match(/共\s+(\d+)\s*\/\s*(\d+)\s+筆/);
if (!m) {
  failures.push('toolbar 共 N / M 筆 missing');
} else if (parseInt(m[2], 10) === 0) {
  failures.push('totalCount=0 — Indian brand 沒有 customer demo data');
}

// 6. 列尾人車詳情連到 /admin/master-data/customers
const detailLinks = await page.locator('a[href^="/admin/master-data/customers/"]:has-text("人車詳情")').count();
if (detailLinks < 1) failures.push('人車詳情 link missing or wrong href');

const meaningful = consoleErrors.filter((e) => !/Download the React DevTools|chunk-|You provided a `value` prop to a form field|hydration/.test(e));
if (meaningful.length > 0) failures.push(`console: ${meaningful.slice(0, 2).join(' | ')}`);

await page.screenshot({ path: '/tmp/customers-verify.png', fullPage: true });
console.error('    screenshot: /tmp/customers-verify.png');

await browser.close();
console.log('');
if (failures.length > 0) { for (const f of failures) console.log(`[FAIL] ${f}`); process.exit(1); }
console.log('[OK] /parts/aftersales/customers v2 對齊: 售後 · 9 ★5 + ★5 跨模組 banner → CRM 視角 + filter 3 欄 + DataGrid 8 欄 + Indian demo rows + 人車詳情連結');
process.exit(0);
