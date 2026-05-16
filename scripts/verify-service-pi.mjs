/**
 * verify-service-pi.mjs — Phase 3B C2 /service/pi v3 visual refresh 驗證
 *
 * /service/pi 是現有 5-tab wizard，v3 spec 對齊：
 *   - tab 名稱：環車檢查 / 來意詢問 / 技師深入檢查 / 報價 / 確認簽名
 *   - tab 3 報價 上方加 v2 chip：🔴 需主管陪同報價（含 critical 拒絕項）/ 🔵 需要詳細報價單（小計 ≥ 30000）
 *   - tab 5 簽名前加 amber alert：以上均須進入 RO 後由售後主管簽核審批
 *   - SA / 車主簽名標題改為「確認簽名」
 *
 * 驗證：
 *   - /service/pi status=200
 *   - 5 tabs 名稱正確
 *   - 切到 tab 5（確認簽名）能看到 amber 簽核審批提示
 *   - 0 console error
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

const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

const failures = [];

console.error('\n  → /service/pi');
try {
  const resp = await page.goto(`${APP_BASE}/service/pi`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  const status = resp?.status();
  console.error(`    nav: status=${status}`);
  if (status !== 200) failures.push(`/service/pi: expected 200, got ${status}`);

  // 5 tabs 名稱
  for (const label of ['環車檢查', '來意詢問', '技師深入檢查', '報價', '確認簽名']) {
    const cnt = await page.locator(`text=${label}`).count();
    if (cnt < 1) failures.push(`tab label "${label}" missing`);
  }
  // 老 tab 名稱不應再出現
  for (const oldLabel of ['車間檢查', '報價彙整']) {
    const cnt = await page.locator(`text=${oldLabel}`).count();
    if (cnt > 0) failures.push(`old tab label "${oldLabel}" still present (count=${cnt})`);
  }

  // 切到 tab 4 (確認簽名)
  await page.locator('button:has-text("確認簽名")').first().click();
  await page.waitForTimeout(400);
  const hasSignatureAlert = (await page.locator('text=以上均須進入正式工單').count()) > 0;
  if (!hasSignatureAlert) failures.push('Tab 5 missing 簽核審批 amber alert');
  const hasSaSign = (await page.locator('text=SA 確認簽名').count()) > 0;
  if (!hasSaSign) failures.push('Tab 5 SA 確認簽名 label missing');

  // 切到 tab 3 (報價) 看 hint
  await page.locator('button:has-text("報價")').first().click();
  await page.waitForTimeout(400);
  const hasQuoteHint = (await page.locator('text=SA 可隨時編輯').count()) > 0;
  if (!hasQuoteHint) failures.push('Tab 4 quote hint missing');

  const meaningful = consoleErrors.filter((e) => !/Download the React DevTools|chunk-/.test(e));
  if (meaningful.length > 0) failures.push(`console errors: ${meaningful.slice(0, 2).join(' | ')}`);

  await page.screenshot({ path: '/tmp/service-pi-verify.png', fullPage: true });
  console.error('    screenshot: /tmp/service-pi-verify.png');
  console.error('    5 tabs + 確認簽名 alert + 報價 hint all present');
} catch (e) {
  failures.push(`/service/pi: exception: ${e.message}`);
  try { await page.screenshot({ path: '/tmp/service-pi-verify.png', fullPage: true }); } catch {}
}

await browser.close();
console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
} else {
  console.log('[OK] /service/pi v3 visual refresh');
  process.exit(0);
}
