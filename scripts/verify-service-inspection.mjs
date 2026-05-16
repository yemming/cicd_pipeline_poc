/**
 * verify-service-inspection.mjs — Phase 3B C8 /service/inspection 竣工複檢 v1 升級驗證 (★4)
 *
 * v1 規格 06_竣工複檢_v1.html — 5-step wizard：複檢 / 試車 / 清潔 / 簽核 / 通知。
 * 本輪 visual refresh：
 *   1. 加 sprint chip 「8.1 ★4」+ caption
 *   2. ★4 跨模組 e2e banner（竣工複檢 ↔ 保固舊件管理 D7.2，SRV-SRB-26-014）
 *   3. Step 3（複檢簽核）加授權驗證 info card（4 欄系統帶出）+ 結論備註欄
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

console.error('\n  → /service/inspection');
const resp = await page.goto(`${APP_BASE}/service/inspection`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// ── Step 0：sprint chip + ★4 banner ────────────────────────
if ((await page.locator('text=8.1 ★4').count()) < 1) failures.push('sprint chip 8.1 ★4 missing');
if ((await page.locator('text=★4 跨模組串接').count()) < 1) failures.push('★4 跨模組 banner missing');
if ((await page.locator('text=保固舊件管理').count()) < 1) failures.push('保固舊件管理 cross-link missing');
if ((await page.locator('text=SRV-SRB-26-014').count()) < 1) failures.push('SRV-SRB-26-014 regulation marker missing');

// Step 0 看到 RO 摘要 bar
if ((await page.locator('text=RO-20260730-001').count()) < 1) failures.push('RO 編號 not visible');

// ── 切到 Step 3（複檢簽核）測新增 info card + 結論備註 ──
await page.locator('button:has-text("複檢簽核")').first().click().catch(() => {});
await page.waitForTimeout(400);

if ((await page.locator('text=複檢簽核　電子簽名').count()) < 1) failures.push('Step 3 title v1 caption missing');
if ((await page.locator('text=複檢人員').count()) < 1) failures.push('Step 3 sig-info 複檢人員 missing');
if ((await page.locator('text=人員名冊').count()) < 1) failures.push('Step 3 sig-info 人員名冊 tag missing');
if ((await page.locator('text=自動帶入').count()) < 1) failures.push('Step 3 sig-info 自動帶入 tag missing');
if ((await page.locator('text=複檢結論備註').count()) < 1) failures.push('Step 3 結論備註 textarea missing');
if ((await page.locator('textarea[placeholder*="BAT-2026-0042"]').count()) < 1) failures.push('Step 3 保固舊件單號 placeholder missing');

// console error 過濾常見 noise
const meaningful = consoleErrors.filter((e) => !/Download the React DevTools|chunk-|You provided a `value` prop to a form field/.test(e));
if (meaningful.length > 0) failures.push(`console: ${meaningful.slice(0, 2).join(' | ')}`);

await page.screenshot({ path: '/tmp/service-inspection-verify.png', fullPage: true });
console.error('    screenshot: /tmp/service-inspection-verify.png');

await browser.close();
console.log('');
if (failures.length > 0) { for (const f of failures) console.log(`[FAIL] ${f}`); process.exit(1); }
console.log('[OK] /service/inspection v1 升級: sprint chip ★4 + 保固舊件 banner + Step3 授權 info card + 結論備註');
process.exit(0);
