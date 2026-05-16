/**
 * verify-parts-purchase-flow.mjs
 * Phase 3C D2.1 — /parts/purchase/flow 採購流程鏈路說明 v2 對齊驗證
 *
 * 規格 docs/DUCATI_v2_output/04_庫存管理/02_採購管理/04_採購管理_採購流程說明.html
 *
 * 驗收項：
 *   1. status 200
 *   2. H1「採購流程鏈路說明」
 *   3. Sprint chip「4.1」
 *   4. Caption「從缺料觸發到入庫完成的完整採購作業流程說明」
 *   5. 區塊標題「📋 採購流程總覽（端對端）」
 *   6. 5 個流程節點（按文案 substring）：庫存告警 / 需求處理 / 商品採購 / 採購入庫 / 庫存更新
 *   7. 5 個節點對應的 link href 都存在
 *   8. 兩欄區塊：「採購類型說明」「快速進入各流程」
 *   9. 採購類型 3 條：計畫採購 / 緊急採購 / 原廠到貨匯入
 *  10. 快速進入 4 條 link：requisitions / orders / po-grn / returns
 *  11. console 無 meaningful error
 *  12. 截圖 /tmp/parts-purchase-flow-verify.png
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

console.error('\n  → /parts/purchase/flow');
const resp = await page.goto(`${APP_BASE}/parts/purchase/flow`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// 2. H1
if ((await page.locator('h1:has-text("採購流程鏈路說明")').count()) < 1) {
  failures.push('h1 「採購流程鏈路說明」 missing');
}

// 3. Sprint chip 4.1
if ((await page.locator('text=4.1').first().count()) < 1) {
  failures.push('sprint chip "4.1" missing');
}

// 4. Caption
if ((await page.locator('text=從缺料觸發到入庫完成的完整採購作業流程說明').count()) < 1) {
  failures.push('caption missing');
}

// 5. 區塊標題
if ((await page.locator('text=採購流程總覽（端對端）').count()) < 1) {
  failures.push('section title 「採購流程總覽（端對端）」 missing');
}

// 6. 5 個流程節點（規格的 label 已被 \n 拆兩行，這裡用 substring 比對首段）
const nodeLabels = ['庫存告警', '需求處理', '商品採購', '採購入庫', '庫存更新'];
for (const label of nodeLabels) {
  if ((await page.locator(`text=${label}`).count()) < 1) {
    failures.push(`flow node "${label}" missing`);
  }
}

// 7. 5 個節點 link href
const nodeHrefs = [
  '/parts/operations/balance',     // 庫存告警觸發 + 庫存更新（兩處共用）
  '/parts/purchase/requisitions',  // 需求處理 4.3
  '/parts/purchase/orders',        // 商品採購 4.4
  '/parts/receipt/po-grn',         // 採購入庫 5.1
];
for (const href of nodeHrefs) {
  if ((await page.locator(`a[href="${href}"]`).count()) < 1) {
    failures.push(`flow link href="${href}" missing`);
  }
}

// 8. 兩欄區塊標題
for (const t of ['採購類型說明', '快速進入各流程']) {
  if ((await page.locator(`h2:has-text("${t}")`).count()) < 1) {
    failures.push(`column section "${t}" missing`);
  }
}

// 9. 採購類型 3 條
for (const t of ['計畫採購', '緊急採購', '原廠到貨匯入']) {
  if ((await page.locator(`text=${t}`).count()) < 1) {
    failures.push(`purchase type "${t}" missing`);
  }
}

// 10. 快速進入 4 條（含採購退貨）
const quickHrefs = [
  '/parts/purchase/requisitions',
  '/parts/purchase/orders',
  '/parts/receipt/po-grn',
  '/parts/purchase/returns',
];
for (const href of quickHrefs) {
  if ((await page.locator(`a[href="${href}"]`).count()) < 1) {
    failures.push(`quick link href="${href}" missing`);
  }
}

await page.screenshot({
  path: '/tmp/parts-purchase-flow-verify.png',
  fullPage: true,
});
console.error('    screenshot: /tmp/parts-purchase-flow-verify.png');

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
  console.error('\n✅ PASS — 採購流程鏈路說明 v2 對齊 OK');
}
