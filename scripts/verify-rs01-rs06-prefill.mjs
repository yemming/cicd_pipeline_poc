/**
 * verify-rs01-rs06-prefill.mjs
 *
 * BDN #15 · RS01 電子手卡 → RS06 中古車評估 pre-fill
 *
 * 驗證情境：
 *   A. 直接訪 /usedcar/evaluation              → 空表（sellerName 為空）
 *   B. 訪 /usedcar/evaluation?from_handcard=1&customer_name=陳大文
 *                                              → sellerName 欄位帶入「陳大文」
 *   C. 訪 /sales/reception/handcard、填客戶姓名、點「前往中古車鑑價 RS06」
 *                                              → URL 跳到 evaluation 並帶 query、sellerName 已 pre-fill
 *
 * 截圖輸出在 tmp/bdn15-*.png（專案根 tmp/，不是 /tmp）
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TMP_DIR = path.join(ROOT, 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

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

async function readSellerNameValue() {
  const input = page.getByTestId('evaluation-seller-name');
  await input.waitFor({ state: 'visible', timeout: 15000 });
  return await input.inputValue();
}

// ─── 場景 A：無 query string → 空表 ───
console.error('\n[A] /usedcar/evaluation（無 query）');
await page.goto(`${APP_BASE}/usedcar/evaluation`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
const valueA = await readSellerNameValue();
console.error(`    sellerName="${valueA}"`);
if (valueA !== '') failures.push(`[A] expected empty sellerName, got "${valueA}"`);
await page.screenshot({ path: path.join(TMP_DIR, 'bdn15-empty.png'), fullPage: false });
console.error('    screenshot: tmp/bdn15-empty.png');

// ─── 場景 B：帶 query → pre-fill ───
console.error('\n[B] /usedcar/evaluation?from_handcard=1&customer_name=陳大文');
const targetName = '陳大文';
await page.goto(
  `${APP_BASE}/usedcar/evaluation?from_handcard=1&customer_name=${encodeURIComponent(targetName)}`,
  { waitUntil: 'domcontentloaded', timeout: 30000 },
);
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
const valueB = await readSellerNameValue();
console.error(`    sellerName="${valueB}"`);
if (valueB !== targetName) failures.push(`[B] expected "${targetName}", got "${valueB}"`);
await page.screenshot({ path: path.join(TMP_DIR, 'bdn15-prefilled.png'), fullPage: false });
console.error('    screenshot: tmp/bdn15-prefilled.png');

// ─── 場景 C：端對端 — handcard 填名 → 點按鈕 → evaluation pre-filled ───
console.error('\n[C] handcard → 點 RS06 按鈕 → evaluation pre-fill');
await page.goto(`${APP_BASE}/sales/reception/handcard`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

// 填客戶姓名（data-testid="handcard-customer-name"）
const e2eName = '王小明';
const customerInput = page.getByTestId('handcard-customer-name');
await customerInput.waitFor({ state: 'visible', timeout: 10000 });
await customerInput.fill(e2eName);
console.error(`    filled handcard-customer-name="${e2eName}"`);

await page.screenshot({ path: path.join(TMP_DIR, 'bdn15-handcard-filled.png'), fullPage: false });

// 點「前往中古車鑑價 RS06」按鈕
const gotoBtn = page.getByTestId('handcard-goto-rs06');
await gotoBtn.waitFor({ state: 'visible', timeout: 10000 });
await Promise.all([
  page.waitForURL(/\/usedcar\/evaluation\?/, { timeout: 15000 }),
  gotoBtn.click(),
]);
console.error(`    navigated to: ${page.url()}`);
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
const valueC = await readSellerNameValue();
console.error(`    sellerName="${valueC}"`);
if (valueC !== e2eName) failures.push(`[C] expected "${e2eName}", got "${valueC}"`);
if (!page.url().includes('from_handcard=1'))
  failures.push(`[C] expected URL to include from_handcard=1, got ${page.url()}`);
await page.screenshot({ path: path.join(TMP_DIR, 'bdn15-e2e-prefilled.png'), fullPage: false });
console.error('    screenshot: tmp/bdn15-e2e-prefilled.png');

await browser.close();

console.log('');
if (failures.length > 0) {
  console.log(`❌ BDN #15 FAILED (${failures.length} issues):`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log('✅ BDN #15 RS01 → RS06 pre-fill all 3 scenarios passed');
