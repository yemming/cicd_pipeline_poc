/**
 * verify-parts-setup-warehouse-arch.mjs
 * Phase 3C D1.8 — /parts/setup/warehouse-arch 倉儲四層架構說明 對齊驗證
 *
 * 規格 docs/DUCATI_v2_output/04_庫存管理/01_基礎設定/02_基礎設定_倉儲四層架構.html
 *
 * 驗收項：
 *   1. status 200
 *   2. H1「倉儲四層架構」
 *   3. Sprint chip「2.1」
 *   4. Caption 含「倉庫 → 庫區 → 庫位 → 擺放位」
 *   5. 四層說明卡 layer_name 都出現：倉庫 Warehouse / 庫區 Zone / 庫位 Bin / 擺放位 Slot
 *   6. 四層 layer_title 都出現：第一層 / 第二層 / 第三層 / 第四層
 *   7. 四層 badge label 都出現（取自 business_rules.warehouse_layer.config.badge.label）
 *   8. Section header「倉儲架構總覽」
 *   9. 表格欄表頭 6 個都出現：倉庫 / 庫區數 / 庫位數 / 擺放位數 / 使用率 / 倉庫類型
 *  10. Indian demo 倉庫名 至少出現「主零件倉」「寄存倉」「保固暫存倉」
 *  11. 「進入設定 →」連結指向 /parts/setup/warehouse-bins
 *  12. console 無 meaningful error
 *  13. 截圖 /tmp/parts-setup-warehouse-arch-verify.png
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([...authCookies, scopeCookie]);
const page = await ctx.newPage();

const failures = [];
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

console.error('\n  → /parts/setup/warehouse-arch');
const resp = await page.goto(`${APP_BASE}/parts/setup/warehouse-arch`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// 2. H1
if ((await page.locator('h1:has-text("倉儲四層架構")').count()) < 1) {
  failures.push('h1 「倉儲四層架構」 missing');
}

// 3. Sprint chip — 「2.1」
const sprintChipCount = await page
  .locator('span.rounded-full', { hasText: /^2\.1$/ })
  .count();
if (sprintChipCount < 1) {
  failures.push('sprint chip 「2.1」 missing');
}

// 4. Caption
if (
  (await page
    .locator('text=倉庫 → 庫區 → 庫位 → 擺放位')
    .count()) < 1
) {
  failures.push('caption「倉庫 → 庫區 → 庫位 → 擺放位」 missing');
}

// 5. 四層 layer_name
for (const layerName of ['倉庫 Warehouse', '庫區 Zone', '庫位 Bin', '擺放位 Slot']) {
  if ((await page.locator(`text=${layerName}`).count()) < 1) {
    failures.push(`layer_name「${layerName}」 missing`);
  }
}

// 6. 四層 layer_title
for (const layerTitle of ['第一層', '第二層', '第三層', '第四層']) {
  if ((await page.locator(`text=${layerTitle}`).count()) < 1) {
    failures.push(`layer_title「${layerTitle}」 missing`);
  }
}

// 7. 四層 badge label（取自 business_rules seed）
const badgeLabels = [
  '每門店可有多個倉庫',
  '主零件倉設有多個庫區',
  '支援條碼掃描定位',
  'A 類商品必須設定',
];
for (const label of badgeLabels) {
  if ((await page.locator(`text=${label}`).count()) < 1) {
    failures.push(`badge label「${label}」 missing`);
  }
}

// 8. Section header
if ((await page.locator('h2:has-text("倉儲架構總覽")').count()) < 1) {
  failures.push('section header「倉儲架構總覽」 missing');
}

// 9. 表格欄表頭
for (const th of ['倉庫', '庫區數', '庫位數', '擺放位數', '使用率', '倉庫類型']) {
  if ((await page.locator(`th:has-text("${th}")`).count()) < 1) {
    failures.push(`th「${th}」 missing`);
  }
}

// 10. Indian demo 倉庫名
for (const wh of ['主零件倉', '寄存倉', '保固暫存倉']) {
  if ((await page.locator(`td:has-text("${wh}")`).count()) < 1) {
    failures.push(`warehouse row「${wh}」 missing（Indian demo data）`);
  }
}

// 11. 「進入設定 →」連結
const enterLink = page.locator('a:has-text("進入設定")').first();
if ((await enterLink.count()) < 1) {
  failures.push('「進入設定 →」link missing');
} else {
  const href = await enterLink.getAttribute('href');
  if (href !== '/parts/setup/warehouse-bins') {
    failures.push(`「進入設定 →」href="${href}" (期望 /parts/setup/warehouse-bins)`);
  }
}

await page.screenshot({
  path: '/tmp/parts-setup-warehouse-arch-verify.png',
  fullPage: true,
});
console.error('    screenshot: /tmp/parts-setup-warehouse-arch-verify.png');

// 12. console errors
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
  console.error('\n✅ PASS — /parts/setup/warehouse-arch 對齊 OK');
}
