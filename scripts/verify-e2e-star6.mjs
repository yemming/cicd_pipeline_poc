/**
 * verify-e2e-star6.mjs — Phase 4 ★6 跨模組串接點 e2e 驗證
 *
 * ★6「銷售看板 ↔ 庫存商品查詢」串接點：
 *   - D5.1 備件庫存查詢（零件視角）: /parts/operations/balance
 *     （sprint chip "庫存 · 7.1" + ★6 marker + banner + 3 cross-link → 銷售看板）
 *   - A8 RS 視角: /sales/showroom/stock
 *     （★6 marker + 反向 banner + cross-link → /parts/operations/balance）
 *   - A8 庫管視角: /inventory/vehicles
 *     （★6 marker + 反向 banner + cross-link → /parts/operations/balance）
 *   - A9 中古車: /usedcar/stock
 *     （★6 marker + 反向 banner + cross-link → /parts/operations/balance）
 *
 * 共用資料 SSOT 不同切面：
 *   - 銷售看板從整車 / 中古配額視角看 NEW_CAR_INVENTORY_UNITS / USED_CAR_INVENTORY_UNITS
 *   - 備件庫存查詢從 stock_items 即時水位 + 告警引擎視角
 *   - 同一張「庫存」概念兩個視角，read-side 兩邊都有 ★6 marker + 雙向 cross-link
 *
 * 驗證劇本：
 *   1. 開 D5.1 /parts/operations/balance — 驗 H1 / sprint chip / ★6 marker / banner / 3 cross-link
 *   2. 開 A8 RS /sales/showroom/stock — 驗 ★6 marker + 反向 banner + cross-link → D5.1
 *   3. 開 A8 庫管 /inventory/vehicles — 同上
 *   4. 開 A9 中古 /usedcar/stock — 同上
 *   5. 4 頁 console error 0
 *   6. 各截一張圖
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
const EMAIL = 'yemming.yu@gmail.com';
const APP_BASE = process.env.APP_BASE || 'http://localhost:3000';
const projectRef = new URL(SUPABASE_URL).host.split('.')[0];
const COOKIE_NAME = `sb-${projectRef}-auth-token`;

const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: EMAIL }),
});
if (!tokenRes.ok) {
  console.error('[FAIL] password grant', tokenRes.status);
  process.exit(1);
}
const td = await tokenRes.json();
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([...authCookies, scopeCookie]);
const page = await ctx.newPage();

const failures = [];
const shared = [];
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

// ============================================================
// Step 1 — D5.1 /parts/operations/balance（零件視角）
// ============================================================
console.error('\n  → D5.1: /parts/operations/balance');
const r1 = await page.goto(`${APP_BASE}/parts/operations/balance`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r1?.status() !== 200) failures.push(`D5.1 status=${r1?.status()}`);

const h1D51 = await page.locator('h1').first().innerText().catch(() => '');
if (!h1D51.includes('商品庫存查詢')) failures.push(`D5.1 h1 missing: "${h1D51}"`);
else shared.push(`D5.1 h1: "${h1D51}"`);

if ((await page.locator('text=庫存 · 7.1').count()) < 1) {
  failures.push('D5.1 sprint chip "庫存 · 7.1" missing');
} else {
  shared.push('D5.1 sprint chip: "庫存 · 7.1"');
}
if ((await page.locator('header >> text=★6').count()) < 1) {
  failures.push('D5.1 ★6 marker chip missing');
} else {
  shared.push('D5.1 ★6 marker visible in header');
}
if ((await page.locator('text=★6 跨模組').count()) < 1) {
  failures.push('D5.1 ★6 banner missing');
} else {
  shared.push('D5.1 banner: "★6 跨模組 — 零件視角 ↔ 銷售視角（整車 / 展間 / 中古）"');
}

const d51XlinkChecks = [
  { href: '/sales/showroom/stock', label: 'A8 RS' },
  { href: '/inventory/vehicles', label: 'A8 庫管' },
  { href: '/usedcar/stock', label: 'A9 中古' },
];
for (const x of d51XlinkChecks) {
  const c = await page.locator(`a[href="${x.href}"]`).count();
  if (c < 1) failures.push(`D5.1 cross-link → ${x.href} (${x.label}) missing`);
  else shared.push(`D5.1 cross-link → ${x.href} (${x.label}) count=${c}`);
}

await page.screenshot({ path: '/tmp/e2e-star6-balance.png', fullPage: true });
console.error('    screenshot: /tmp/e2e-star6-balance.png');

// ============================================================
// Helper — 銷售看板反向驗證
// ============================================================
async function verifySalesBoard(label, route, screenshotPath, h1Expect) {
  console.error(`\n  → ${label}: ${route}`);
  const resp = await page.goto(`${APP_BASE}${route}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  if (resp?.status() !== 200) failures.push(`${label} status=${resp?.status()}`);

  const h1 = await page.locator('h1').first().innerText().catch(() => '');
  if (!h1.includes(h1Expect)) failures.push(`${label} h1 missing: "${h1}"`);
  else shared.push(`${label} h1: "${h1}"`);

  // ★6 marker chip — 限定 header 內
  if ((await page.locator('header >> text=★6').count()) < 1) {
    failures.push(`${label} ★6 marker chip missing`);
  } else {
    shared.push(`${label} ★6 marker visible in header`);
  }

  // 反向 banner（data-testid 比較穩）
  const bannerCount = await page
    .locator('[data-testid="star6-cross-module-banner"]')
    .count();
  if (bannerCount < 1) {
    failures.push(`${label} 反向 ★6 banner missing`);
  } else {
    shared.push(`${label} banner: data-testid="star6-cross-module-banner"`);
  }

  // 反向 cross-link → D5.1
  const xlinkCount = await page
    .locator('a[href="/parts/operations/balance"]')
    .count();
  if (xlinkCount < 1) {
    failures.push(`${label} cross-link → /parts/operations/balance missing`);
  } else {
    shared.push(
      `${label} cross-link → /parts/operations/balance (count=${xlinkCount})`,
    );
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.error(`    screenshot: ${screenshotPath}`);
}

await verifySalesBoard(
  'A8 RS',
  '/sales/showroom/stock',
  '/tmp/e2e-star6-showroom-stock.png',
  '新車庫存看板',
);
await verifySalesBoard(
  'A8 庫管',
  '/inventory/vehicles',
  '/tmp/e2e-star6-inventory.png',
  '整車庫存',
);
await verifySalesBoard(
  'A9 中古',
  '/usedcar/stock',
  '/tmp/e2e-star6-usedcar.png',
  '中古車庫存看板',
);

// ============================================================
// Console errors
// ============================================================
const meaningful = consoleErrors.filter(
  (e) =>
    !/Download the React DevTools|chunk-|Failed to load resource.*favicon|hydration|You provided a `value` prop to a form field/.test(
      e,
    ),
);
if (meaningful.length > 0) {
  failures.push(`console: ${meaningful.slice(0, 2).join(' | ')}`);
  for (const e of meaningful.slice(0, 5)) console.error('    err:', e);
}

await browser.close();

// ============================================================
// 結論
// ============================================================
console.log('');
console.log('=== Shared state observed (read-side ★6 串接點同步) ===');
for (const s of shared) console.log('  - ' + s);
console.log('');

if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
}
console.log(
  '[OK] ★6 e2e: D5.1 備件庫存查詢 + A8 RS / 庫管 + A9 中古 同步呈現「同一張庫存概念、零件視角 ↔ 銷售視角」串接語意 + 雙向 cross-link',
);
process.exit(0);
