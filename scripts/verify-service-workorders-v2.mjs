/**
 * verify-service-workorders-v2.mjs — Phase 3B C4 /service/workorders v2 visual refresh 驗證
 *
 * 在既有 6-tab A-F RO 頁加上 v3 RO 串接規格的 4 個關鍵 alert：
 *   - Tab B：⚠️ 含 🔴 立即必修項目（條件式：agreedItems 含 critical 才顯示）
 *   - Tab C：🔵 領料流程說明（取代既有簡短說明、加 v3 完整流程）
 *   - Tab D：⚠️ 電子打卡強制規定（2024 年起）amber 警示
 *   - Tab E：🛡️ 竣工複檢說明（授權人員資格）
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
const PASSWORD = EMAIL;
const APP_BASE = process.env.APP_BASE || 'http://localhost:3000';
const projectRef = new URL(SUPABASE_URL).host.split('.')[0];
const COOKIE_NAME = `sb-${projectRef}-auth-token`;

const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!tokenRes.ok) {
  console.error('[FAIL] password grant', tokenRes.status, await tokenRes.text());
  process.exit(1);
}
const tokenData = await tokenRes.json();
const session = {
  access_token: tokenData.access_token,
  refresh_token: tokenData.refresh_token,
  expires_in: tokenData.expires_in ?? 3600,
  expires_at: tokenData.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  token_type: tokenData.token_type ?? 'bearer',
  user: tokenData.user,
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
  name: 'dealeros_scope',
  value: JSON.stringify({ brand_id: 'indian', store_id: null }),
  domain: appUrl.hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([...authCookies, scopeCookie]);
const page = await context.newPage();

const failures = [];
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

console.error('\n  → /service/workorders');
const resp = await page.goto(`${APP_BASE}/service/workorders`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// Tab B: 含 critical 必修項目（mock 預設有 critical item，所以 alert 必出）
await page.locator('button:has-text("B 維修項目")').first().click();
await page.waitForTimeout(300);
if ((await page.locator('text=立即必修項目').count()) < 1) failures.push('Tab B critical alert missing');

// Tab C: 領料流程說明
await page.locator('button:has-text("C 領料單")').first().click();
await page.waitForTimeout(300);
if ((await page.locator('text=領料流程說明').count()) < 1) failures.push('Tab C 領料流程說明 missing');

// Tab D: 電子打卡強制規定
await page.locator('button:has-text("D 電子打卡")').first().click();
await page.waitForTimeout(300);
if ((await page.locator('text=電子打卡強制規定').count()) < 1) failures.push('Tab D 電子打卡 alert missing');

// Tab E: 竣工複檢說明
await page.locator('button:has-text("E 竣工複檢")').first().click();
await page.waitForTimeout(300);
if ((await page.locator('text=竣工複檢說明').count()) < 1) failures.push('Tab E 竣工複檢 alert missing');

const meaningful = consoleErrors.filter((e) =>
  !/Download the React DevTools|chunk-/.test(e) &&
  !/You provided a `value` prop to a form field without an `onChange`/.test(e)
);
if (meaningful.length > 0) failures.push(`console: ${meaningful.slice(0, 2).join(' | ')}`);

await page.screenshot({ path: '/tmp/service-workorders-v2-verify.png', fullPage: true });
console.error('    screenshot: /tmp/service-workorders-v2-verify.png');

await browser.close();
console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
} else {
  console.log('[OK] /service/workorders v2 visual refresh: 4 alerts (critical/領料/打卡/竣工複檢) all in place');
  process.exit(0);
}
