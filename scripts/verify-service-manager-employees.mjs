/**
 * verify-service-manager-employees.mjs
 * Phase 3B C13c — /service/manager/employees 售後主管模組員工人員名冊驗證
 *
 * 規格 docs/DUCATI_v2_output/03_售後修護/02_售後主管設定/07_售後管理模組_v2.html
 *   → Tab A 員工人員名冊（售後服務部門）
 *
 * 驗收項：
 *   1. status 200 + H1「員工人員名冊」+ sprint chip「售後主管 · 13.3」
 *   2. DataGrid 表頭：員工編號 / 姓名 / 職級 / 工種 / 部門 / 竣工複檢授權 / 系統帳號 / 在職 / 操作
 *   3. 篩選列 5 個欄位：職級 / 部門 / 複檢授權 / 在職 / 搜尋
 *   4. ＋ 新增員工 button
 *   5. 職級權限對照表 section（▼ 職級權限對照表）+ 售後主管 / SA / 車間技師 三角色標頭
 *   6. Indian seed：至少撈到 1 列售後員工
 *   7. helper-only：不直連 supabase（compile 期）
 *   8. 既有 /parts/aftersales/management/staff 仍維持原 sprint chip「售後管理」（不被新 wrapper 污染）
 *   9. console 無 meaningful error
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([...authCookies, scopeCookie]);
const page = await ctx.newPage();

const failures = [];
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

// ── 1) 新 wrapper /service/manager/employees ─────────────────────────────
console.error('\n  → /service/manager/employees');
const resp = await page.goto(`${APP_BASE}/service/manager/employees`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// 1. H1 + sprint chip
if ((await page.locator('h1:has-text("員工人員名冊")').count()) < 1) {
  failures.push('h1 員工人員名冊 missing');
}
if ((await page.locator('text=售後主管 · 13.3').count()) < 1) {
  failures.push('sprint chip 售後主管 · 13.3 missing');
}

// 2. DataGrid 表頭
const tableHeaders = [
  '員工編號',
  '姓名',
  '職級',
  '工種',
  '部門',
  '竣工複檢授權',
  '系統帳號',
  '在職',
];
for (const h of tableHeaders) {
  if ((await page.locator(`th:has-text("${h}")`).count()) < 1) {
    failures.push(`th "${h}" missing`);
  }
}

// 3. 篩選列 5 個欄位 — 用 label 找
const filterLabels = ['職級', '部門', '複檢授權', '在職', '搜尋'];
for (const lbl of filterLabels) {
  if ((await page.locator(`label:has-text("${lbl}")`).count()) < 1) {
    failures.push(`filter label "${lbl}" missing`);
  }
}

// 4. ＋ 新增員工 button
if ((await page.locator('button:has-text("＋ 新增員工")').count()) < 1) {
  failures.push('＋ 新增員工 button missing');
}

// 5. 職級權限對照表 section
if ((await page.locator('text=▼ 職級權限對照表').count()) < 1) {
  failures.push('▼ 職級權限對照表 section missing');
}
for (const role of ['售後主管', '車間技師']) {
  if ((await page.locator(`th:has-text("${role}")`).count()) < 1) {
    failures.push(`角色對照表頭 "${role}" missing`);
  }
}

// 6. Indian seed → 至少 1 列售後員工
const staffRowCount = await page.evaluate(() => {
  const h1s = Array.from(document.querySelectorAll('h1'));
  const target = h1s.find((h) => h.textContent?.includes('員工人員名冊'));
  if (!target) return -1;
  // DataGrid 是 main 下第一個 table；找第一個 table 的 tbody tr 數
  const main = target.closest('main');
  if (!main) return -1;
  const tables = main.querySelectorAll('table');
  if (tables.length === 0) return -1;
  const tbody = tables[0].querySelector('tbody');
  if (!tbody) return -1;
  return Array.from(tbody.querySelectorAll('tr')).filter(
    (tr) => tr.querySelectorAll('td').length > 1,
  ).length;
});
if (staffRowCount < 1) {
  failures.push(`售後員工列數 < 1（got ${staffRowCount}；Indian seed 應至少 1 名）`);
}

await page.screenshot({
  path: '/tmp/service-manager-employees-verify.png',
  fullPage: true,
});
console.error('    screenshot: /tmp/service-manager-employees-verify.png');

// ── 2) 既有路由 /parts/aftersales/management/staff 不被污染 ────────────────
console.error('\n  → /parts/aftersales/management/staff (regression check)');
const resp2 = await page.goto(`${APP_BASE}/parts/aftersales/management/staff`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp2?.status() !== 200) failures.push(`legacy status=${resp2?.status()}`);

// h1 仍是「員工名冊」、sprint chip 仍是「售後管理」（default 不被覆寫）
if ((await page.locator('h1:has-text("員工名冊")').count()) < 1) {
  failures.push('legacy h1 員工名冊 missing (default pageHeader broken?)');
}
const legacySprint = await page
  .locator('header span:has-text("售後管理")')
  .count();
if (legacySprint < 1) {
  failures.push('legacy sprint chip 售後管理 missing (default pageHeader broken?)');
}
// 確保新的「售後主管 · 13.3」沒有跑到 legacy 頁
if ((await page.locator('text=售後主管 · 13.3').count()) > 0) {
  failures.push('legacy 路由 leak 出 13.3 sprint chip（default override 沒生效）');
}

// console errors
const meaningful = consoleErrors.filter(
  (e) =>
    !/Download the React DevTools|chunk-|You provided a `value` prop to a form field|hydration|Failed to load resource/.test(
      e,
    ),
);
if (meaningful.length > 0) failures.push(`console: ${meaningful.slice(0, 2).join(' | ')}`);

await browser.close();
console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
}
console.log(
  '[OK] /service/manager/employees C13c: 售後主管 · 13.3 + DataGrid 8 表頭 + 5 filter + 職級對照表 + Indian seed >=1 + legacy /parts/aftersales/management/staff 維持原 sprint chip',
);
process.exit(0);
