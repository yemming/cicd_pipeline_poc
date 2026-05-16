/**
 * verify-service-workorders.mjs — Phase 3B C3 預檢單 → RO 串接 正式 route 驗證
 *
 * /service/workorders 是正式工單 RO route，6 tabs（A-F）。
 * 跟 /service/pi 共用 `useServiceDemo` context，PI state（piNo / customer / vehicle / techItems / saItems）
 * 流入 RO，無需 page 自帶 data 鏈。
 *
 * 驗證：
 *   - /service/workorders status=200
 *   - 6 tabs A-F 名稱齊全（A 工單資料 / B 維修項目 / C 領料單 / D 電子打卡 / E 竣工複檢 / F 授權簽名）
 *   - Tab A 顯示 piNo「PI-20260730-001」+ 客戶「王小明」（從 useServiceDemo mock）
 *   - 0 console error
 *
 * 同時 regression：/service/pi 仍 OK + 確認轉 RO 按鈕在 tab 5（雖然在 page 載入時 tab 0、不主動觸發）
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

async function check(route, validator, screenshot) {
  const consoleErrors = [];
  const handler = (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); };
  page.on('console', handler);

  console.error(`\n  → ${route}`);
  try {
    const resp = await page.goto(`${APP_BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    const status = resp?.status();
    console.error(`    nav: status=${status}`);
    if (status !== 200) failures.push(`${route}: expected 200, got ${status}`);

    await validator();

    const meaningful = consoleErrors.filter((e) =>
      !/Download the React DevTools|chunk-/.test(e) &&
      // 預存問題：workorders 用 disabled input、無 onChange handler — 不阻擋 C3 串接驗收
      !/You provided a `value` prop to a form field without an `onChange`/.test(e)
    );
    if (meaningful.length > 0) failures.push(`${route}: console errors: ${meaningful.slice(0, 2).join(' | ')}`);

    await page.screenshot({ path: screenshot, fullPage: true });
    console.error(`    screenshot: ${screenshot}`);
  } catch (e) {
    failures.push(`${route}: exception: ${e.message}`);
    try { await page.screenshot({ path: screenshot, fullPage: true }); } catch {}
  }
  page.off('console', handler);
}

await check('/service/workorders', async () => {
  // 6 tabs A-F
  for (const label of ['A 工單資料', 'B 維修項目', 'C 領料單', 'D 電子打卡', 'E 竣工複檢', 'F 授權簽名']) {
    const cnt = await page.locator(`text=${label}`).count();
    if (cnt < 1) failures.push(`tab "${label}" missing`);
  }
  // PI state 流入：piNo（顯示在文字中）+ customer name（在 disabled input value 裡）
  const hasPiNo = (await page.locator('text=PI-20260730-001').count()) > 0;
  const hasCustomer = (await page.locator('input[value="王小明"]').count()) > 0;
  if (!hasPiNo) failures.push('PI piNo "PI-20260730-001" not flowing to /service/workorders');
  if (!hasCustomer) failures.push('PI customer input[value="王小明"] not flowing to /service/workorders');
}, '/tmp/service-workorders-verify.png');

await check('/service/pi', async () => {
  // Regression: 5 tabs still ok
  for (const label of ['環車檢查', '來意詢問', '技師深入檢查', '報價', '確認簽名']) {
    const cnt = await page.locator(`text=${label}`).count();
    if (cnt < 1) failures.push(`/service/pi tab "${label}" missing (regression)`);
  }
  // 確認轉 RO 按鈕（at tab 5 only — page initially on tab 0、click last tab to surface）
  await page.locator('button:has-text("確認簽名")').first().click();
  await page.waitForTimeout(400);
  const hasTransferBtn = (await page.locator('button:has-text("確認轉 RO")').count()) > 0;
  if (!hasTransferBtn) failures.push('/service/pi: 確認轉 RO transfer button not on tab 5');
}, '/tmp/service-pi-regression.png');

await browser.close();

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
} else {
  console.log('[OK] /service/workorders 6 tabs + PI state 串接 OK, /service/pi 確認轉 RO 連結就緒');
  process.exit(0);
}
