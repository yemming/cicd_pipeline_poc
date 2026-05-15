/**
 * Playwright smoke test — /parts/aftersales/management/ro-numbering
 *
 * - 走 magic link 拿 session
 * - 訪問頁面 → 200
 * - 截圖
 * - 驗證關鍵元素：H1「工單編號規則」、預覽 bar、雙表 header、＋ 新增按鈕
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
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = 'yemming.yu@gmail.com';
const APP_BASE = 'http://localhost:3000';
const TARGET_URL = `${APP_BASE}/parts/aftersales/management/ro-numbering`;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SERVICE_KEY');
  process.exit(1);
}

const projectRef = new URL(SUPABASE_URL).host.split('.')[0];
const COOKIE_NAME = `sb-${projectRef}-auth-token`;

console.error('[1/4] Generating magic link...');
const genRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ type: 'magiclink', email: EMAIL }),
});
if (!genRes.ok) {
  console.error('generate_link failed:', genRes.status, await genRes.text());
  process.exit(1);
}
const genData = await genRes.json();
const hashedToken = genData.properties?.hashed_token || genData.hashed_token;

console.error('[2/4] Verifying token...');
const verifyRes = await fetch(
  `${SUPABASE_URL}/auth/v1/verify?type=magiclink&token=${hashedToken}&redirect_to=${encodeURIComponent(APP_BASE)}`,
  { method: 'GET', redirect: 'manual', headers: { apikey: ANON_KEY } },
);
const loc = verifyRes.headers.get('location');
const params = new URLSearchParams(loc.slice(loc.indexOf('#') + 1));
const accessToken = params.get('access_token');
const refreshToken = params.get('refresh_token');
const expiresIn = Number(params.get('expires_in') || 3600);
const expiresAt = Number(params.get('expires_at') || Math.floor(Date.now() / 1000) + expiresIn);
const tokenType = params.get('token_type') || 'bearer';

const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
  headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
});
const user = await userRes.json();

const session = {
  access_token: accessToken,
  refresh_token: refreshToken,
  expires_in: expiresIn,
  expires_at: expiresAt,
  token_type: tokenType,
  user,
  provider_token: null,
  provider_refresh_token: null,
};
const cookieValue = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64');
const CHUNK_SIZE = 3180;
const cookieParts = [];
for (let i = 0; i < cookieValue.length; i += CHUNK_SIZE) {
  cookieParts.push(cookieValue.slice(i, i + CHUNK_SIZE));
}
const cookies = cookieParts.map((part, idx) => ({
  name: cookieParts.length === 1 ? COOKIE_NAME : `${COOKIE_NAME}.${idx}`,
  value: part,
  domain: 'localhost',
  path: '/',
  httpOnly: false,
  secure: false,
  sameSite: 'Lax',
}));

console.error(`[3/4] Got session for ${user?.email}, launching browser...`);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
await ctx.addCookies(cookies);
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});

console.error('[4/4] Navigating to', TARGET_URL);
const resp = await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
const status = resp.status();
console.error('HTTP status:', status);

await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

const screenshotPath = path.join(ROOT, '.claude', 'ro-numbering-screenshot.png');
fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
await page.screenshot({ path: screenshotPath, fullPage: true });
console.error('Screenshot saved:', screenshotPath);

// 驗證關鍵元素
const checks = [];
checks.push({ name: 'H1 工單編號規則', ok: await page.locator('h1', { hasText: '工單編號規則' }).count() > 0 });
checks.push({ name: '預覽 bar 標題', ok: (await page.getByText('工單編號格式即時預覽').count()) > 0 });
checks.push({ name: 'P1 區塊', ok: (await page.getByText('前綴碼 P1').count()) > 0 });
checks.push({ name: 'P2 區塊', ok: (await page.getByText('前綴碼 P2').count()) > 0 });
checks.push({ name: '＋ 新增業務類型', ok: (await page.getByRole('button', { name: /新增業務類型/ }).count()) > 0 });
checks.push({ name: '＋ 新增付款性質', ok: (await page.getByRole('button', { name: /新增付款性質/ }).count()) > 0 });
checks.push({ name: '常用組合範例 MN-CP', ok: (await page.locator('text=/MN-CP/').count()) > 0 });
checks.push({ name: 'P1 row MN', ok: (await page.locator('text=/^MN$/').count()) > 0 });
checks.push({ name: 'P2 row CP', ok: (await page.locator('text=/^CP$/').count()) > 0 });
checks.push({ name: 'PD prefix (新增的)', ok: (await page.locator('text=/^PD$/').count()) > 0 });
checks.push({ name: 'IN prefix (新增的)', ok: (await page.locator('text=/^IN$/').count()) > 0 });

let allOk = status === 200;
for (const c of checks) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.name}`);
  if (!c.ok) allOk = false;
}
if (errors.length) {
  console.log('\n--- Page Errors ---');
  errors.forEach((e) => console.log(' ', e));
  if (errors.some((e) => !/favicon|404/.test(e))) allOk = false;
}

await browser.close();
process.exit(allOk ? 0 : 1);
