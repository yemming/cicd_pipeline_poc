/**
 * verify-inventory-batch.mjs — Indian /inventory/* 6 頁 status sanity check
 *
 * 跟 Ming 拍板：把 Indian /inventory/* 整組 nav 開啟（L1 經銷商管理 + L2 庫存與結算 / 行銷與政策
 * + L3 6 個 react_route 都 is_active=true）。本 script 確認 6 個頁面在 Indian scope 下 status=200，
 * 不會渲染失敗。壞的 page 列出來、不卡流程。
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
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = 'yemming.yu@gmail.com';
const APP_BASE = process.env.APP_BASE || 'http://localhost:3000';
const projectRef = new URL(SUPABASE_URL).host.split('.')[0];
const COOKIE_NAME = `sb-${projectRef}-auth-token`;

// password grant 取代 magic link（admin/generate_link 跑多輪會 401 rate-limited）
const PASSWORD = EMAIL;
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
const accessToken = tokenData.access_token;
const refreshToken = tokenData.refresh_token;
const expiresIn = tokenData.expires_in ?? 3600;
const expiresAt = tokenData.expires_at ?? Math.floor(Date.now() / 1000) + expiresIn;
const tokenType = tokenData.token_type ?? 'bearer';
const user = tokenData.user;
const session = {
  access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn,
  expires_at: expiresAt, token_type: tokenType, user,
  provider_token: null, provider_refresh_token: null,
};
const cookieValue = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64');
const CHUNK_SIZE = 3180;
const parts = [];
for (let i = 0; i < cookieValue.length; i += CHUNK_SIZE) {
  parts.push(cookieValue.slice(i, i + CHUNK_SIZE));
}
const appUrl = new URL(APP_BASE);
const cookies = parts.map((value, idx) => ({
  name: parts.length === 1 ? COOKIE_NAME : `${COOKIE_NAME}.${idx}`,
  value, domain: appUrl.hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
}));
cookies.push({
  name: 'dealeros_scope',
  value: JSON.stringify({ brand_id: 'indian', store_id: null }),
  domain: appUrl.hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
});

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies(cookies);
const page = await context.newPage();

const ROUTES = [
  '/inventory/vehicles',
  '/inventory/quota',
  '/inventory/rebate',
  '/inventory/marketing',
  '/inventory/policy',
  '/inventory/compliance',
];

const results = [];
for (const route of ROUTES) {
  const consoleErrors = [];
  const handler = (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); };
  page.on('console', handler);
  try {
    const resp = await page.goto(`${APP_BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const status = resp?.status();
    const final = page.url();
    const meaningful = consoleErrors.filter((e) => !/Download the React DevTools|chunk-/.test(e));
    const redirected = final.includes('/login') || final.includes('/auth');
    results.push({
      route, status, final, redirected,
      consoleErrors: meaningful.length,
      errSample: meaningful.slice(0, 1).join(' | ').slice(0, 120),
    });
    console.error(`  ${status === 200 && !redirected ? '✓' : '✗'} ${route} status=${status} errors=${meaningful.length}`);
  } catch (e) {
    results.push({ route, status: 'EXCEPTION', error: e.message });
    console.error(`  ✗ ${route} exception: ${e.message}`);
  }
  page.off('console', handler);
}

await browser.close();

const broken = results.filter((r) => r.status !== 200 || r.redirected || (r.consoleErrors ?? 0) > 0);
console.log('');
console.log(`Total: ${results.length}, OK: ${results.length - broken.length}, Issues: ${broken.length}`);
if (broken.length > 0) {
  for (const b of broken) {
    console.log(`  - ${b.route}: status=${b.status}${b.redirected ? ' [redirect]' : ''}${b.consoleErrors ? ` errors=${b.consoleErrors}` : ''}${b.errSample ? ` "${b.errSample}"` : ''}`);
  }
}
process.exit(broken.length > 0 ? 0 : 0); // non-blocking: always exit 0
