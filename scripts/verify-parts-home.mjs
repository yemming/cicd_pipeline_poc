/**
 * verify-parts-home.mjs
 * Phase 3C D1.1 — /parts home v2 圖卡導覽驗證
 *
 * 規格 docs/DUCATI_v2_output/04_庫存管理/01_基礎設定/00_庫存管理模組_導覽總覽.html
 *
 * 驗收項：
 *   1. status 200 + Hero「DUCATI 庫存管理模組」
 *   2. Hero stats: 30 / 9 / v2
 *   3. KPI row 4 張
 *   4. 9 個 panel 標題：基礎設定 / 採購管理 / 入庫管理 / 出庫管理 /
 *      庫存查詢與作業 / 盤點管理 / 預警告警 / 保固索賠舊件 / 分析報表
 *   5. 卡片總數 = 52（基礎 14 + 採購 5 + 入庫 4 + 出庫 3 + 庫存作業 7 +
 *      盤點 3 + 預警 5 + 保固 6 + 分析 5）
 *   6. 樣本卡片：採購入庫（5.1）、維修領料（6.1）、ABC 分類（12.4）顯示
 *   7. 樣本連結：/parts/setup/items、/parts/purchase/orders、/parts/count/plans
 *   8. console 無 meaningful error
 *   9. 截圖 /tmp/parts-home-verify.png
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
const td = await tokenRes.json();
if (!td.access_token) {
  console.error('[FATAL] password grant failed:', JSON.stringify(td));
  process.exit(2);
}
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
for (let i = 0; i < cookieValue.length; i += CHUNK_SIZE) parts.push(cookieValue.slice(i, i + CHUNK_SIZE));
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await ctx.addCookies([...authCookies, scopeCookie]);
const page = await ctx.newPage();

const failures = [];
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

console.error('\n  → /parts');
const resp = await page.goto(`${APP_BASE}/parts`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// 1. Hero 標題
if ((await page.locator('h1:has-text("DUCATI 庫存管理模組")').count()) < 1) {
  failures.push('hero h1 「DUCATI 庫存管理模組」 missing');
}

// 2. Hero stats
for (const stat of ['30', '9', 'v2']) {
  if ((await page.locator(`text=${stat}`).first().count()) < 1) {
    failures.push(`hero stat "${stat}" missing`);
  }
}
for (const label of ['規格 HTML 頁面', '功能子模組', '本頁版本']) {
  if ((await page.locator(`text=${label}`).count()) < 1) {
    failures.push(`hero stat label "${label}" missing`);
  }
}

// 3. KPI row 4 張（label 都要在）
for (const k of ['基礎設定', '進出庫流程', '庫存 × 盤點 × 預警', '保固 + 分析']) {
  if ((await page.locator(`text=${k}`).count()) < 1) {
    failures.push(`kpi label "${k}" missing`);
  }
}

// 4. 9 panel 標題
const panelTitles = [
  '基礎設定',
  '採購管理',
  '入庫管理',
  '出庫管理',
  '庫存查詢與作業',
  '盤點管理',
  '預警告警',
  '保固索賠舊件',
  '分析報表',
];
for (const t of panelTitles) {
  if ((await page.locator(`text=${t}`).count()) < 1) {
    failures.push(`panel title "${t}" missing`);
  }
}

// 5. 卡片總數（每卡都是 <a> 帶 href，內含 code 樣式 mono）
const cardCount = await page.evaluate(() => {
  const main = document.querySelector('main');
  if (!main) return 0;
  return main.querySelectorAll('a[href^="/parts/"]').length;
});
if (cardCount !== 52) {
  failures.push(`card count = ${cardCount} (expected 52)`);
}

// 6. 樣本卡片名稱
const sampleCards = [
  '採購入庫（含原廠 DMS 匯入）',
  '維修領料（RO 工單串接）',
  '商品庫存查詢',
  '告警階層設定',
  '舊件管理介面',
  'ABC 分類報表',
];
for (const name of sampleCards) {
  if ((await page.locator(`text=${name}`).count()) < 1) {
    failures.push(`sample card "${name}" missing`);
  }
}

// 7. 樣本連結（DOM 應有對應 anchor）
const sampleLinks = [
  '/parts/setup/items',
  '/parts/setup/org',
  '/parts/purchase/orders',
  '/parts/receipt/po-grn',
  '/parts/issue/repair-pick',
  '/parts/count/plans',
  '/parts/alerts/escalation',
  '/parts/warranty/used-parts',
  '/parts/analytics/abc',
];
for (const href of sampleLinks) {
  if ((await page.locator(`a[href="${href}"]`).count()) < 1) {
    failures.push(`link href="${href}" missing`);
  }
}

await page.screenshot({
  path: '/tmp/parts-home-verify.png',
  fullPage: true,
});
console.error('    screenshot: /tmp/parts-home-verify.png');

// 8. console errors
const meaningful = consoleErrors.filter(
  (e) =>
    !/Download the React DevTools|chunk-|You provided a `value` prop to a form field|hydration|Failed to load resource/.test(
      e,
    ),
);
if (meaningful.length > 0) {
  failures.push(`console errors: ${meaningful.length}`);
  for (const e of meaningful.slice(0, 5)) console.error('    err:', e);
}

await browser.close();

if (failures.length > 0) {
  console.error('\n❌ FAIL');
  for (const f of failures) console.error('  -', f);
  process.exit(1);
} else {
  console.error('\n✅ PASS — 庫存管理 v2 圖卡導覽 OK');
}
