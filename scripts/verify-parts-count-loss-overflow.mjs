/**
 * verify-parts-count-loss-overflow.mjs
 * Phase 3C D6.3 — /parts/count/loss-overflow 報損報溢審核對齊驗證
 *
 * 規格 docs/DUCATI_v2_output/04_庫存管理/06_盤點管理/08_盤點管理_報損報溢.html
 *
 * 驗收項：
 *   1. status 200
 *   2. H1「報損報溢審核」
 *   3. Sprint chip「庫存 · 8.3」
 *   4. Caption 含「財務主管確認損溢單」
 *   5. Filter Bar 三欄位：來源盤點單 / 倉庫 / 審批狀態
 *   6. 「查詢」「重置」按鈕
 *   7. DataGrid 至少 1 row（Indian demo 有 ≥ 1 筆差異 session）
 *   8. 至少出現一個 LG status chip（草稿 / 待審批 / 審批通過 / 駁回）
 *   9. console 無 meaningful error
 *  10. 截圖 /tmp/parts-count-loss-overflow-verify.png
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

console.error('\n  → /parts/count/loss-overflow');
const resp = await page.goto(`${APP_BASE}/parts/count/loss-overflow`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// 2. H1
if ((await page.locator('h1:has-text("報損報溢審核")').count()) < 1) {
  failures.push('h1 「報損報溢審核」 missing');
}

// 3. Sprint chip
if ((await page.locator('text=庫存 · 8.3').first().count()) < 1) {
  failures.push('sprint chip 「庫存 · 8.3」 missing');
}

// 4. Caption
if (
  (await page.locator('text=財務主管確認損溢單').count()) < 1
) {
  failures.push('caption missing');
}

// 5. Filter Bar 欄位
for (const label of ['來源盤點單', '倉庫', '審批狀態']) {
  if ((await page.locator(`text=${label}`).count()) < 1) {
    failures.push(`filter label「${label}」 missing`);
  }
}

// 6. 按鈕
if ((await page.locator('button:has-text("查詢")').count()) < 1) {
  failures.push('查詢 button missing');
}
if ((await page.locator('button:has-text("重置")').count()) < 1) {
  failures.push('重置 button missing');
}

// 7. DataGrid rows — 用「共 N 張」確認
const countText = await page.locator('text=/共 \\d+ 張報損報溢單/').textContent().catch(() => '');
const rowCountMatch = countText && countText.match(/共\s*(\d+)/);
const rowCount = rowCountMatch ? Number(rowCountMatch[1]) : 0;
if (rowCount < 1) {
  failures.push(`row count < 1 (countText="${countText}")`);
}

// 8. 至少一個 LG status chip 出現
const chipLabels = ['草稿', '待審批', '審批通過', '駁回'];
let chipFound = false;
for (const label of chipLabels) {
  if ((await page.locator(`text=${label}`).count()) >= 1) {
    chipFound = true;
    break;
  }
}
if (!chipFound) {
  failures.push('no LG status chip found (草稿/待審批/審批通過/駁回)');
}

await page.screenshot({
  path: '/tmp/parts-count-loss-overflow-verify.png',
  fullPage: true,
});
console.error('    screenshot: /tmp/parts-count-loss-overflow-verify.png');

// 9. console errors
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
  console.error('\n✅ PASS — /parts/count/loss-overflow 對齊 OK');
}
