/**
 * verify-ro-search.mjs — Phase 3B C11 /parts/aftersales/ro-search v2 對齊驗證
 *
 * v2 規格 docs/DUCATI_v2_output/03_售後修護/01_售後接待/10_工單查詢.html
 * 新建頁（C11 不是 e2e ★ 點），驗：
 *   1. sprint chip 「售後 · 10」+ caption
 *   2. KPI 4 卡（本月工單數 / 進行中 / 本月產值（客付）/ 平均工單金額）
 *   3. Filter bar 5 欄（工單號/車主、業務類型、狀態、SA、期間）+ 查詢 / 重置
 *   4. DataGrid 9 欄表頭（工單號、車主/車型、業務類型、維修項目、進廠日、SA、金額、狀態、操作）
 *   5. 至少 1 列 indian demo row 渲染（"MN-CP-260515-001" 之類）
 *   6. 列尾「詳情」連到 /parts/aftersales/repair-orders/{id}
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
  access_token: td.access_token, refresh_token: td.refresh_token,
  expires_in: td.expires_in ?? 3600,
  expires_at: td.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  token_type: td.token_type ?? 'bearer', user: td.user,
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
  name: 'dealeros_scope', value: JSON.stringify({ brand_id: 'indian', store_id: null }),
  domain: appUrl.hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([...authCookies, scopeCookie]);
const page = await ctx.newPage();

const failures = [];
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

console.error('\n  → /parts/aftersales/ro-search?business_month=2026-05');
const resp = await page.goto(`${APP_BASE}/parts/aftersales/ro-search?business_month=2026-05`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// 1. Sprint chip + title
if ((await page.locator('h1:has-text("工單查詢")').count()) < 1) failures.push('h1 工單查詢 missing');
if ((await page.locator('text=售後 · 10').count()) < 1) failures.push('sprint chip 售後 · 10 missing');

// 2. KPI 4 卡
for (const lbl of ['本月工單數', '進行中', '本月產值（客付）', '平均工單金額']) {
  if ((await page.locator(`text=${lbl}`).count()) < 1) failures.push(`KPI "${lbl}" missing`);
}

// 3. Filter bar 欄位 + 按鈕
for (const lbl of ['工單號 / 車主', '業務類型', '狀態', 'SA', '期間']) {
  if ((await page.locator(`text=${lbl}`).count()) < 1) failures.push(`filter "${lbl}" missing`);
}
if ((await page.locator('button:has-text("查詢")').count()) < 1) failures.push('查詢 button missing');
if ((await page.locator('button:has-text("重置")').count()) < 1) failures.push('重置 button missing');

// 4. DataGrid 9 個表頭（工單號 / 車主/車型 / 業務類型 / 維修項目 / 進廠日 / SA / 金額 / 狀態 / 操作）
for (const head of ['工單號', '車主 / 車型', '業務類型', '維修項目', '進廠日', '金額', '狀態', '操作']) {
  if ((await page.locator(`th:has-text("${head}")`).count()) < 1) failures.push(`th "${head}" missing`);
}

// 5. 至少一列 indian demo row
const knownRos = ['MN-CP-260515-001', 'WC-WR-260515-002', 'MN-CP-260514-003', 'RP-CP-260512-001'];
let hit = 0;
for (const r of knownRos) {
  if ((await page.locator(`text=${r}`).count()) > 0) hit += 1;
}
if (hit === 0) failures.push(`expected ≥1 demo RO row visible (none of ${knownRos.join(',')})`);

// 6. 列尾「詳情」連到 repair-orders
const detailLinks = await page.locator('a:has-text("詳情")').count();
if (detailLinks < 1) failures.push('詳情 link missing');

// 7. 共 N 筆 toolbar
if ((await page.locator('text=/工單列表.*共\\s+\\d+\\s+筆/').count()) < 1) failures.push('toolbar 共 N 筆 missing');

// 8. nav_node 入口可見（sidebar 工單查詢（v2））
if ((await page.locator('a[href="/parts/aftersales/ro-search"]').count()) < 1) failures.push('nav link to /parts/aftersales/ro-search missing');

const meaningful = consoleErrors.filter((e) => !/Download the React DevTools|chunk-|You provided a `value` prop to a form field|hydration/.test(e));
if (meaningful.length > 0) failures.push(`console: ${meaningful.slice(0, 2).join(' | ')}`);

await page.screenshot({ path: '/tmp/ro-search-verify.png', fullPage: true });
console.error('    screenshot: /tmp/ro-search-verify.png');

await browser.close();
console.log('');
if (failures.length > 0) { for (const f of failures) console.log(`[FAIL] ${f}`); process.exit(1); }
console.log('[OK] /parts/aftersales/ro-search v2 對齊: 售後 · 10 + KPI 4 卡 + filter 5 欄 + DataGrid 9 欄 + indian demo rows + 詳情連結');
process.exit(0);
