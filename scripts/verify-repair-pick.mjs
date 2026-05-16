/**
 * verify-repair-pick.mjs — Phase 3B C5 /parts/issue/repair-pick v2 升級驗證
 *
 * 既有 board 已是 design pattern compliant，v2 加：
 *   - h1 改成「維修領料（RO 工單串接）」、sprint chip 補 ★1
 *   - caption 換 v2 spec 文字（依 RO 工單查詢 · 倉管執行正式出庫 ...）
 *   - 加 RO 串接說明 banner（含增項閉環提示）
 *   - 加狀態 KPI pill row（已過帳 / 已作廢 / 草稿 count）
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
if (!tokenRes.ok) { console.error('[FAIL] password grant', tokenRes.status); process.exit(1); }
const td = await tokenRes.json();
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

console.error('\n  → /parts/issue/repair-pick');
const resp = await page.goto(`${APP_BASE}/parts/issue/repair-pick`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// h1
const h1Text = await page.locator('h1').first().innerText().catch(() => '');
if (!h1Text.includes('維修領料（RO 工單串接）')) failures.push(`h1 missing RO 工單串接: "${h1Text}"`);

// caption (v2 spec text)
if ((await page.locator('text=依 RO 工單查詢').count()) < 1) failures.push('v2 caption (依 RO 工單查詢) missing');

// RO 串接 banner
if ((await page.locator('text=與 RO 工單串接').count()) < 1) failures.push('RO 串接 banner missing');
if ((await page.locator('text=D+3 / D+10').count()) < 1) failures.push('D+3/D+10 追蹤提醒 missing');

// 狀態 KPI pill row：已過帳 / 已作廢 / 草稿（即使 count 為 0 也應出現）
for (const label of ['已過帳', '已作廢', '草稿']) {
  const cnt = await page.locator(`text=${label}`).count();
  if (cnt < 1) failures.push(`status pill "${label}" missing`);
}

const meaningful = consoleErrors.filter((e) => !/Download the React DevTools|chunk-/.test(e));
if (meaningful.length > 0) failures.push(`console: ${meaningful.slice(0, 2).join(' | ')}`);

await page.screenshot({ path: '/tmp/repair-pick-verify.png', fullPage: true });
console.error('    screenshot: /tmp/repair-pick-verify.png');

await browser.close();
console.log('');
if (failures.length > 0) { for (const f of failures) console.log(`[FAIL] ${f}`); process.exit(1); }
console.log('[OK] /parts/issue/repair-pick v2: h1 + caption + RO 串接 banner + 狀態 KPI pill 都在');
process.exit(0);
