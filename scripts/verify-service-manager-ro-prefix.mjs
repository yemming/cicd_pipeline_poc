/**
 * verify-service-manager-ro-prefix.mjs
 * Phase 3B C13d — /service/manager/ro-prefix 售後主管模組工單前綴碼設定驗證
 *
 * 規格 docs/DUCATI_v2_output/03_售後修護/02_售後主管設定/07_售後管理模組_v2.html
 *   → Tab B 工單編號設定
 *
 * 驗收項：
 *   1. status 200 + H1「工單前綴碼設定」+ sprint chip「售後主管 · 13.4」
 *   2. ▼ 工單編號格式即時預覽 section
 *   3. 雙表 ▼ 前綴碼 P1　業務類型 + ▼ 前綴碼 P2　付款性質
 *   4. P1 columns：代碼 / 業務類型 / 財會性質 / 會計說明 / 備註 / 狀態
 *   5. P2 columns：代碼 / 付款性質 / 適用對象 / 備註 / 狀態
 *   6. ＋ 新增業務類型 / ＋ 新增付款性質 兩顆 button
 *   7. ⚠️ 重要警告 banner
 *   8. Indian seed：P1 >= 1 列 + P2 >= 1 列
 *   9. 既有 /parts/aftersales/management/ro-numbering 仍維持原 H1「工單編號規則」+ sprint chip「售後管理」（不被新 wrapper 污染）
 *  10. console 無 meaningful error
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

// ── 1) 新 wrapper /service/manager/ro-prefix ─────────────────────────────
console.error('\n  → /service/manager/ro-prefix');
const resp = await page.goto(`${APP_BASE}/service/manager/ro-prefix`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// 1. H1 + sprint chip
if ((await page.locator('h1:has-text("工單前綴碼設定")').count()) < 1) {
  failures.push('h1 工單前綴碼設定 missing');
}
if ((await page.locator('text=售後主管 · 13.4').count()) < 1) {
  failures.push('sprint chip 售後主管 · 13.4 missing');
}

// 2. 即時預覽 section
if ((await page.locator('text=▼ 工單編號格式即時預覽').count()) < 1) {
  failures.push('▼ 工單編號格式即時預覽 section missing');
}

// 3. 雙表 section
if ((await page.locator('text=▼ 前綴碼 P1').count()) < 1) {
  failures.push('▼ 前綴碼 P1 section missing');
}
if ((await page.locator('text=▼ 前綴碼 P2').count()) < 1) {
  failures.push('▼ 前綴碼 P2 section missing');
}

// 4 & 5. 表頭
const headers = [
  '代碼',
  '業務類型',
  '財會性質',
  '會計說明',
  '備註',
  '狀態',
  '付款性質',
  '適用對象',
];
for (const h of headers) {
  if ((await page.locator(`th:has-text("${h}")`).count()) < 1) {
    failures.push(`th "${h}" missing`);
  }
}

// 6. ＋ 新增 buttons
if ((await page.locator('button:has-text("＋ 新增業務類型")').count()) < 1) {
  failures.push('＋ 新增業務類型 button missing');
}
if ((await page.locator('button:has-text("＋ 新增付款性質")').count()) < 1) {
  failures.push('＋ 新增付款性質 button missing');
}

// 7. ⚠️ 警告 banner
if ((await page.locator('text=⚠️ 重要').count()) < 1) {
  failures.push('⚠️ 重要 warning banner missing');
}

// 8. Indian seed：兩張表都至少 1 row
const counts = await page.evaluate(() => {
  const main = document.querySelector('main');
  if (!main) return { p1: -1, p2: -1 };
  const tables = main.querySelectorAll('table');
  const rowCount = (t) => {
    if (!t) return -1;
    const tbody = t.querySelector('tbody');
    if (!tbody) return -1;
    return Array.from(tbody.querySelectorAll('tr')).filter(
      (tr) => tr.querySelectorAll('td').length > 1,
    ).length;
  };
  return { p1: rowCount(tables[0]), p2: rowCount(tables[1]) };
});
if (counts.p1 < 1) failures.push(`P1 列數 < 1（got ${counts.p1}；Indian seed 應 6 筆）`);
if (counts.p2 < 1) failures.push(`P2 列數 < 1（got ${counts.p2}；Indian seed 應 4 筆）`);

await page.screenshot({
  path: '/tmp/service-manager-ro-prefix-verify.png',
  fullPage: true,
});
console.error('    screenshot: /tmp/service-manager-ro-prefix-verify.png');

// ── 2) 既有 /parts/aftersales/management/ro-numbering 不被污染 ─────────────
console.error('\n  → /parts/aftersales/management/ro-numbering (regression check)');
const resp2 = await page.goto(`${APP_BASE}/parts/aftersales/management/ro-numbering`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp2?.status() !== 200) failures.push(`legacy status=${resp2?.status()}`);

if ((await page.locator('h1:has-text("工單編號規則")').count()) < 1) {
  failures.push('legacy h1 工單編號規則 missing (default pageHeader broken?)');
}
const legacySprint = await page
  .locator('header span:has-text("售後管理")')
  .count();
if (legacySprint < 1) {
  failures.push('legacy sprint chip 售後管理 missing (default pageHeader broken?)');
}
if ((await page.locator('text=售後主管 · 13.4').count()) > 0) {
  failures.push('legacy 路由 leak 出 13.4 sprint chip（default override 沒生效）');
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
  '[OK] /service/manager/ro-prefix C13d: 售後主管 · 13.4 + 即時預覽 + P1/P2 雙表 + Indian seed P1>=1 P2>=1 + legacy /parts/aftersales/management/ro-numbering 維持原 sprint chip',
);
process.exit(0);
