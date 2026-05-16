/**
 * verify-showroom-stock.mjs — Phase 3A A8 驗證
 *
 * 對應頁面：/sales/showroom/stock（RS 視角新車庫存看板，RS03A_v1）。
 *
 * 流程：
 * 1) magic link 拿 access_token / refresh_token、組 @supabase/ssr cookie（base64- prefix）
 * 2) Playwright chromium headless 注入 cookie、訪問 http://localhost:3009/sales/showroom/stock
 * 3) 驗證：
 *    - status=200
 *    - 無 console error
 *    - data-testid="newcar-inventory-rs" 存在（RS 視角專屬 root）
 *    - data-testid="rs-perspective-chip" 存在（RS 視角專屬 chip，dealer view 沒有）
 *    - 至少 4 顆 KPI、>= 8 張車卡
 * 4) 截圖 /tmp/showroom-stock-verify.png
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
const APP_BASE = process.env.APP_BASE || 'http://localhost:3009';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[FAIL] Missing SUPABASE_URL or SERVICE_KEY');
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
  console.error('[FAIL] generate_link', genRes.status, await genRes.text());
  process.exit(1);
}
const genData = await genRes.json();
const hashedToken = genData.properties?.hashed_token || genData.hashed_token;

console.error('[2/4] Verifying token...');
const verifyRes = await fetch(
  `${SUPABASE_URL}/auth/v1/verify?type=magiclink&token=${hashedToken}&redirect_to=${encodeURIComponent(APP_BASE)}`,
  { method: 'GET', redirect: 'manual', headers: { apikey: ANON_KEY } }
);
const loc = verifyRes.headers.get('location') || '';
const hashIdx = loc.indexOf('#');
if (hashIdx < 0) {
  console.error('[FAIL] no hash in verify response location', loc);
  process.exit(1);
}
const params = new URLSearchParams(loc.slice(hashIdx + 1));
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
const parts = [];
for (let i = 0; i < cookieValue.length; i += CHUNK_SIZE) {
  parts.push(cookieValue.slice(i, i + CHUNK_SIZE));
}

const appUrl = new URL(APP_BASE);
const cookies = parts.map((value, idx) => ({
  name: parts.length === 1 ? COOKIE_NAME : `${COOKIE_NAME}.${idx}`,
  value,
  domain: appUrl.hostname,
  path: '/',
  httpOnly: false,
  secure: false,
  sameSite: 'Lax',
}));

console.error(`[3/4] Launching chromium (${parts.length} cookie chunks)...`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies(cookies);
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

const target = `${APP_BASE}/sales/showroom/stock`;
const failures = [];
let kpiCount = 0;
let cardCount = 0;
let hasRsChip = false;
let hasRsRoot = false;

try {
  const resp = await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 });
  const status = resp?.status();
  const finalUrl = page.url();
  console.error(`    nav: status=${status} final=${finalUrl}`);

  if (status !== 200) failures.push(`expected status 200, got ${status}`);
  if (finalUrl.includes('/login') || finalUrl.includes('/auth')) {
    failures.push(`redirected to login (${finalUrl})`);
  }

  hasRsRoot = (await page.locator('[data-testid="newcar-inventory-rs"]').count()) > 0;
  if (!hasRsRoot) failures.push('newcar-inventory-rs root not found');

  hasRsChip = (await page.locator('[data-testid="rs-perspective-chip"]').count()) > 0;
  if (!hasRsChip) failures.push('rs-perspective-chip not found (RS view should have this)');

  kpiCount = await page.locator('[data-testid^="newcar-kpi-"]').count();
  if (kpiCount < 4) failures.push(`expected >=4 KPI tiles, got ${kpiCount}`);

  cardCount = await page.locator('[data-testid^="newcar-card-"]').count();
  if (cardCount < 8) failures.push(`expected >=8 cards, got ${cardCount}`);

  await page.screenshot({ path: '/tmp/showroom-stock-verify.png', fullPage: true });
  console.error('    screenshot saved: /tmp/showroom-stock-verify.png');

  if (consoleErrors.length > 0) {
    failures.push(`console errors: ${consoleErrors.slice(0, 3).join(' | ')}`);
  }
} catch (e) {
  failures.push(`exception: ${e.message}`);
  try {
    await page.screenshot({ path: '/tmp/showroom-stock-verify.png', fullPage: true });
  } catch {}
} finally {
  await browser.close();
}

console.error(`[4/4] kpis=${kpiCount} cards=${cardCount} rsRoot=${hasRsRoot} rsChip=${hasRsChip}`);

if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
} else {
  console.log(`[OK] /sales/showroom/stock RS view rendered ${kpiCount} KPIs + ${cardCount} cards`);
  process.exit(0);
}
