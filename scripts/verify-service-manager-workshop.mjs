/**
 * verify-service-manager-workshop.mjs
 * Phase 3B C13a — /service/manager/workshop（車間管理看板 / 主管視角）對齊驗證
 *
 * 規格 docs/DUCATI_v2_output/03_售後修護/02_售後主管設定/07_售後管理模組_v2.html
 *   → 即時看板 → 🔧 工位看板（主管視角整廠看法）
 *
 * 驗收項：
 *   1. status 200 + H1「車間管理看板」+ sprint chip「售後主管 · 13.1」
 *   2. KPI 4 chip：空閒 / 使用中 / 逾時警示 / 停用（Indian 應該都 > 0 或至少看得到 4 個 label）
 *   3. 每日可用工時 select + 預設 8/9/10/12 之一（C7 setShopDailyHours 共用）
 *   4. 工位卡 grid ≥ 1 張（Indian seed 8 張）
 *   5. 工位效率統計表頭 8 欄：工位 / 性質/用途 / 完成工單 / 已用工時 / 可用工時 / 使用率 / 周轉率(張/日) / 狀態
 *   6. 統計表至少 1 列資料 + 合計列「全場合計」
 *   7. helper audit cross-check：UI 不直連 supabase（fail 點靠 grep CI，這裡只跑頁面）
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

console.error('\n  → /service/manager/workshop');
const resp = await page.goto(`${APP_BASE}/service/manager/workshop`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// 1. H1 + sprint chip
if ((await page.locator('h1:has-text("車間管理看板")').count()) < 1) {
  failures.push('h1 車間管理看板 missing');
}
if ((await page.locator('text=售後主管 · 13.1').count()) < 1) {
  failures.push('sprint chip 售後主管 · 13.1 missing');
}
if ((await page.locator('text=整廠工位即時狀態').count()) < 1) {
  failures.push('caption 整廠工位即時狀態 missing');
}

// 2. KPI 4 chip labels
for (const lbl of ['空閒', '使用中', '逾時警示', '停用']) {
  if ((await page.locator(`text=${lbl}`).count()) < 1) failures.push(`KPI chip "${lbl}" missing`);
}

// 3. 每日可用工時 select
if ((await page.locator('text=每日可用工時').count()) < 1) {
  failures.push('每日可用工時 label missing');
}
const dailySelect = page.locator('select').first();
const dailyVal = await dailySelect.inputValue().catch(() => '');
if (!['8', '9', '10', '12'].includes(dailyVal)) {
  failures.push(`每日可用工時 select 預設值非 8/9/10/12（got "${dailyVal}"）`);
}

// 4. 工位卡 grid（Indian seed 8 張）
const bayCardCount = await page.locator('[class*="font-bold"][class*="truncate"]').count();
// 用工位 KPI 加總算 total
const kpiTexts = await page.locator('text=/空閒|使用中|逾時警示|停用/').allTextContents();
// 直接讀 H1 下面的工位 grid card 數量（每張卡有 .text-[13px].font-bold）
const baySectionCards = await page.evaluate(() => {
  // 找 H1 後第三個 section（kpi bar / bay grid），count 內部 div with class 含 "rounded-lg" + "bg-white" + "border-[1.5px]"
  const cards = Array.from(document.querySelectorAll('div'))
    .filter((el) => /rounded-lg/.test(el.className) && /border-\[1.5px\]/.test(el.className));
  return cards.length;
});
if (baySectionCards < 1) {
  failures.push(`bay card grid 渲染 0 張（Indian seed 應 ≥ 1，got ${baySectionCards}；參考 bayCard ${bayCardCount}、kpi ${kpiTexts.length}）`);
}

// 5. 工位效率統計表頭 8 欄
for (const head of ['工位', '性質/用途', '完成工單', '已用工時', '可用工時', '使用率', '周轉率(張/日)', '狀態']) {
  if ((await page.locator(`th:has-text("${head}")`).count()) < 1) {
    failures.push(`th "${head}" missing`);
  }
}

// 6. 合計列
if ((await page.locator('text=全場合計').count()) < 1) {
  failures.push('tfoot 全場合計 missing');
}

const meaningful = consoleErrors.filter(
  (e) => !/Download the React DevTools|chunk-|You provided a `value` prop to a form field|hydration/.test(e),
);
if (meaningful.length > 0) failures.push(`console: ${meaningful.slice(0, 2).join(' | ')}`);

await page.screenshot({ path: '/tmp/service-manager-workshop-verify.png', fullPage: true });
console.error('    screenshot: /tmp/service-manager-workshop-verify.png');

await browser.close();
console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
}
console.log(
  '[OK] /service/manager/workshop C13a: 售後主管 · 13.1 + 整廠 KPI/工位 grid + 工位效率統計 (含合計) + helper-only',
);
process.exit(0);
