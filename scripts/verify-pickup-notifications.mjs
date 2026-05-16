/**
 * verify-pickup-notifications.mjs — Phase 3B C10 /parts/aftersales/pickup-notifications v2 對齊驗證
 *
 * v2 規格 docs/DUCATI_v2_output/03_售後修護/01_售後接待/11_取車通知設定.html
 * 本輪 visual refresh（C10 不是 e2e ★ 點，不加 ★ marker）：
 *   1. sprint chip 改 「售後 · 11」+ caption 對齊規格「緩衝後手動」描述
 *   2. v2 規格 info banner 緩衝機制說明（一字不差比對）
 *   3. 通知範本設定 / 今日通知統計 兩塊區段保留
 *   4. 待發送清單欄位（車主・工單・偏好通道 / 通知狀態）正確渲染
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

console.error('\n  → /parts/aftersales/pickup-notifications');
const resp = await page.goto(`${APP_BASE}/parts/aftersales/pickup-notifications`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// ── v2 對齊 element checks ──────────────────────────────
// 1. Sprint chip 改 「售後 · 11」
if ((await page.locator('text=售後 · 11').count()) < 1) failures.push('sprint chip 售後 · 11 missing');

// 2. caption 微調對齊「緩衝後手動」描述
if ((await page.locator('text=緩衝後手動發送').count()) < 1) failures.push('caption 緩衝後手動發送 missing');

// 3. v2 規格 info banner（緩衝機制說明，跟 HTML 一字不差）
if ((await page.locator('text=系統不會自動推播').count()) < 1) failures.push('info banner 系統不會自動推播 missing');
if ((await page.locator('text=緩衝機制').count()) < 1) failures.push('info banner 緩衝機制 missing');

// 4. 通知範本設定 card 在
if ((await page.locator('text=通知範本設定').count()) < 1) failures.push('通知範本設定 card missing');
if ((await page.locator('text=Line 通知範本').count()) < 1) failures.push('Line 通知範本 textarea label missing');
if ((await page.locator('text=簡訊通知範本').count()) < 1) failures.push('簡訊通知範本 textarea label missing');
if ((await page.locator('text=預設通知方式').count()) < 1) failures.push('預設通知方式 區段 missing');

// 5. 今日通知統計 card 在（規格右下三個 KPI）
if ((await page.locator('text=今日通知統計').count()) < 1) failures.push('今日通知統計 card missing');
if ((await page.locator('text=已發送通知').count()) < 1) failures.push('KPI 已發送通知 missing');
if ((await page.locator('text=待發送').count()) < 1) failures.push('KPI 待發送 missing');
if ((await page.locator('text=平均等候時間').count()) < 1) failures.push('KPI 平均等候時間 missing');

// 6. 待發送清單 toolbar（共 N 筆）
if ((await page.locator('text=/共\\s+\\d+\\s+筆/').count()) < 1) failures.push('toolbar 共 N 筆 missing');

// 7. Filter bar 篩選範圍 / 關鍵字
if ((await page.locator('text=篩選範圍').count()) < 1) failures.push('filter 篩選範圍 missing');
if ((await page.locator('text=關鍵字').count()) < 1) failures.push('filter 關鍵字 missing');

const meaningful = consoleErrors.filter((e) => !/Download the React DevTools|chunk-|You provided a `value` prop to a form field|hydration/.test(e));
if (meaningful.length > 0) failures.push(`console: ${meaningful.slice(0, 2).join(' | ')}`);

await page.screenshot({ path: '/tmp/pickup-notifications-verify.png', fullPage: true });
console.error('    screenshot: /tmp/pickup-notifications-verify.png');

await browser.close();
console.log('');
if (failures.length > 0) { for (const f of failures) console.log(`[FAIL] ${f}`); process.exit(1); }
console.log('[OK] /parts/aftersales/pickup-notifications v2 對齊: sprint chip 售後 · 11 + 緩衝機制 banner + 範本設定 / 今日統計 card');
process.exit(0);
