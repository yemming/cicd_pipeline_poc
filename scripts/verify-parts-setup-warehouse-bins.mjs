/**
 * verify-parts-setup-warehouse-bins.mjs
 * Phase 3C D1.9 — /parts/setup/warehouse-bins 倉庫/庫區/庫位/擺放設定 對齊驗證
 *
 * 規格 docs/DUCATI_v2_output/04_庫存管理/01_基礎設定/02_基礎設定_倉庫庫區庫位設定.html
 *
 * 驗收項：
 *   1. status 200
 *   2. H1「倉庫/庫區/庫位/擺放設定」
 *   3. Sprint chip「庫存 · 2.2」
 *   4. Caption「設定四層倉儲結構的實際位置與編碼規則」
 *   5. 「← 倉儲四層架構」反向連結
 *   6. 左 panel「倉庫選擇」
 *   7. Indian demo 倉庫名（至少出現 主零件倉 / 寄存倉 / 保固暫存倉 其中之一 — Indian seed 可能不同）
 *   8. 「庫區與庫位設定」section title（活躍倉庫）
 *   9. CRUD 按鈕「＋ 庫區」「＋ 庫位」「＋ 批次建庫位」存在
 *  10. 庫位狀態 legend「💡 庫位狀態（已用 / 空 / 保留）」
 *  11. console 無 meaningful error
 *  12. 截圖 /tmp/parts-setup-warehouse-bins-verify.png
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

console.error('\n  → /parts/setup/warehouse-bins');
const resp = await page.goto(`${APP_BASE}/parts/setup/warehouse-bins`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// 2. H1
if ((await page.locator('h1:has-text("倉庫/庫區/庫位/擺放設定")').count()) < 1) {
  failures.push('h1 「倉庫/庫區/庫位/擺放設定」 missing');
}

// 3. Sprint chip — 「庫存 · 2.2」
const sprintChipCount = await page
  .locator('span.rounded-full', { hasText: /庫存\s*[·・]\s*2\.2/ })
  .count();
if (sprintChipCount < 1) {
  failures.push('sprint chip 「庫存 · 2.2」 missing');
}

// 4. Caption
if (
  (await page
    .locator('text=設定四層倉儲結構的實際位置與編碼規則')
    .count()) < 1
) {
  failures.push('caption「設定四層倉儲結構的實際位置與編碼規則」 missing');
}

// 5. 反向連結
const backLink = page.locator('a:has-text("倉儲四層架構")').first();
if ((await backLink.count()) < 1) {
  failures.push('「← 倉儲四層架構」 link missing');
} else {
  const href = await backLink.getAttribute('href');
  if (href !== '/parts/setup/warehouse-arch') {
    failures.push(`「← 倉儲四層架構」href="${href}" (期望 /parts/setup/warehouse-arch)`);
  }
}

// 6. 左 panel
if ((await page.locator('text=倉庫選擇').count()) < 1) {
  failures.push('左 panel「倉庫選擇」 header missing');
}

// 7. 倉庫 demo 資料（Indian seed 中至少出現以下其中一個倉庫）
const expectedWarehouses = ['主零件倉', '寄存倉', '保固暫存倉'];
let foundAnyWh = false;
for (const wh of expectedWarehouses) {
  if ((await page.locator(`text=${wh}`).count()) >= 1) {
    foundAnyWh = true;
    break;
  }
}
if (!foundAnyWh) {
  failures.push(`Indian demo 倉庫（主零件倉/寄存倉/保固暫存倉）均未出現`);
}

// 8. 「— 庫區與庫位設定」section title
if ((await page.locator('text=庫區與庫位設定').count()) < 1) {
  failures.push('section title「庫區與庫位設定」 missing');
}

// 9. CRUD 按鈕
for (const btn of ['＋ 庫區', '＋ 庫位', '＋ 批次建庫位']) {
  if ((await page.locator(`button:has-text("${btn}")`).count()) < 1) {
    failures.push(`button「${btn}」 missing`);
  }
}

// 10. 庫位狀態 legend
if (
  (await page.locator('text=庫位狀態').count()) < 1
) {
  failures.push('庫位狀態 legend missing');
}

await page.screenshot({
  path: '/tmp/parts-setup-warehouse-bins-verify.png',
  fullPage: true,
});
console.error('    screenshot: /tmp/parts-setup-warehouse-bins-verify.png');

// 11. console errors
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
  console.error('\n✅ PASS — /parts/setup/warehouse-bins 對齊 OK');
}
