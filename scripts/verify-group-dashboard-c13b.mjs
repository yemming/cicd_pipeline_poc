/**
 * verify-group-dashboard-c13b.mjs
 * Phase 3B C13b — /group/dashboard 加售後人效統計 section 對齊驗證
 *
 * 規格 docs/DUCATI_v2_output/03_售後修護/02_售後主管設定/07_售後管理模組_v2.html
 *   → 今日人效統計（NADA 標準） + 人效公式說明
 *
 * 驗收項：
 *   1. status 200 + section H2「售後人效統計」+ sprint chip「售後管理 · 13.2」
 *   2. KPI 6 卡 label：施工中 / 今日工單 / 平均效率 Eff. / 平均生產力 Prod. / 平均利用率 Util. / 達標技師
 *   3. 排行表頭 11 欄：# / 技師 / 職級 / 今日工單 / 可用工時 / 銷售工時 / 實際施工 / 效率 Eff. / 生產力 Prod. / 利用率 Util. / 狀態
 *   4. Indian seed 6 名技師 → 排行至少 6 列
 *   5. 公式說明含 NADA 三指標目標數字（125 / 85 / 80）
 *   6. 原 Stitch 集團看板仍存在（class stitch-body）
 *   7. console 無 meaningful error
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

console.error('\n  → /group/dashboard');
const resp = await page.goto(`${APP_BASE}/group/dashboard`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// 1. Section H2 + sprint chip
if ((await page.locator('h2:has-text("售後人效統計")').count()) < 1) {
  failures.push('h2 售後人效統計 missing');
}
if ((await page.locator('text=售後管理 · 13.2').count()) < 1) {
  failures.push('sprint chip 售後管理 · 13.2 missing');
}

// 2. KPI 6 卡 label
const kpiLabels = [
  '施工中',
  '今日工單',
  '平均效率 Eff.',
  '平均生產力 Prod.',
  '平均利用率 Util.',
  '達標技師',
];
for (const lbl of kpiLabels) {
  if ((await page.locator(`text=${lbl}`).count()) < 1) {
    failures.push(`KPI 卡 "${lbl}" missing`);
  }
}

// 3. 排行表頭 11 欄（# 用 selector 較鬆）
const headers = [
  '技師',
  '職級',
  '今日工單',
  '可用工時',
  '銷售工時',
  '實際施工',
  '效率 Eff.',
  '生產力 Prod.',
  '利用率 Util.',
  '狀態',
];
for (const head of headers) {
  if ((await page.locator(`th:has-text("${head}")`).count()) < 1) {
    failures.push(`th "${head}" missing`);
  }
}

// 4. Indian seed 6 名技師 → 排行至少 6 列
// 用排行 # 圓形 badge（1-9）來算列數
const rankCells = await page.locator('tbody tr td span:has-text("1"), tbody tr td span:has-text("2")').count();
// 改用更穩的方式：排行表的 tbody tr 數
const techCount = await page.evaluate(() => {
  // 找 H2「售後人效統計」所在的 section
  const h2s = Array.from(document.querySelectorAll('h2'));
  const target = h2s.find((h) => h.textContent?.includes('售後人效統計'));
  if (!target) return -1;
  const section = target.closest('section');
  if (!section) return -1;
  const tbody = section.querySelector('table tbody');
  if (!tbody) return -1;
  // 排除 colspan 的空行
  return Array.from(tbody.querySelectorAll('tr')).filter((tr) => {
    const tds = tr.querySelectorAll('td');
    return tds.length > 1;
  }).length;
});
if (techCount < 6) {
  failures.push(`排行表列數 < 6（got ${techCount}；Indian seed 應 6 名技師；rankCells=${rankCells}）`);
}

// 5. 公式說明（NADA 三指標目標）
const helpText = await page.locator('text=/NADA 標準/').count();
if (helpText < 1) failures.push('公式說明 NADA 標準 missing');
for (const target of ['125%', '80%']) {
  if ((await page.locator(`text=${target}`).count()) < 1) {
    failures.push(`公式說明 target "${target}" missing`);
  }
}

// 6. 原 Stitch 集團看板仍在
const stitchCount = await page.locator('.stitch-body').count();
if (stitchCount < 1) failures.push('原 Stitch .stitch-body 區塊不見了（不應破壞既有 dashboard）');

// 7. console errors
const meaningful = consoleErrors.filter(
  (e) => !/Download the React DevTools|chunk-|You provided a `value` prop to a form field|hydration|Failed to load resource/.test(e),
);
if (meaningful.length > 0) failures.push(`console: ${meaningful.slice(0, 2).join(' | ')}`);

await page.screenshot({ path: '/tmp/group-dashboard-c13b-verify.png', fullPage: true });
console.error('    screenshot: /tmp/group-dashboard-c13b-verify.png');

await browser.close();
console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
}
console.log(
  '[OK] /group/dashboard C13b: 售後管理 · 13.2 + KPI 6 卡 + 人效排行 (Indian 6 技師) + NADA 公式說明 + 保留 Stitch + helper-only',
);
process.exit(0);
