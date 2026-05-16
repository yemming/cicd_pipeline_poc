/**
 * verify-e2e-star3.mjs — Phase 4 ★3 跨模組串接點 e2e 驗證
 *
 * ★3「增項閉環 ↔ 調撥入庫」串接點：
 *   - C7 工單增項閉環：/parts/alerts/work-order-loop
 *     （sprint chip "10.4 ★3"，6 步閉環流程圖、待料工單列表）
 *   - D3.2 調撥入庫：/parts/receipt/transfer-in
 *     （sprint chip "5.2 ★3"，反向 cross-link 回 work-order-loop）
 *
 * 第一版 e2e 是「兩頁 read-side 同步呈現同一個串接點」驗證，不做真實 mutation。
 * 重點：
 *   - C7 顯示 ★3 marker、6 步閉環流程圖、待料工單列表、cross-link 到維修領料
 *   - D3.2 顯示 ★3 marker、反向 banner「待料工單觸發倉間調撥 → 備件入庫後自動解除待料」
 *   - 兩頁都帶 cross-link 同一串接語意（工單缺料 → 調撥備件 → 入庫解除待料）
 *
 * 驗證劇本：
 *   1. 開 /parts/alerts/work-order-loop — 觀察 ★3 marker + 流程圖 6 步 + 待料工單 toolbar
 *   2. 開 /parts/receipt/transfer-in — 觀察 ★3 marker + 反向 banner + cross-link 回 C7
 *   3. 觀察兩頁共通的「工單缺料 → 調撥備件 → 入庫解除」串接語意
 *   4. 兩頁 console error 0
 *   5. 各截一張圖
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
if (!tokenRes.ok) { console.error('[FAIL] password grant', tokenRes.status); process.exit(1); }
const td = await tokenRes.json();
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
const shared = [];
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

// ============================================================
// Step 1 — C7 工單增項閉環
// ============================================================
console.error('\n  → C7: /parts/alerts/work-order-loop');
const r1 = await page.goto(`${APP_BASE}/parts/alerts/work-order-loop`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r1?.status() !== 200) failures.push(`C7 status=${r1?.status()}`);

// H1
const h1C7 = await page.locator('h1').first().innerText().catch(() => '');
if (!h1C7.includes('工單增項閉環')) failures.push(`C7 h1 missing: "${h1C7}"`);
else shared.push(`C7 h1: "${h1C7}"`);

// Sprint chip "10.4 ★3"
if ((await page.locator('text=10.4 ★3').count()) < 1) {
  failures.push('C7 sprint chip "10.4 ★3" missing');
} else {
  shared.push('C7 sprint chip: "10.4 ★3"');
}

// 串接語意 banner（同一句也是 ★2 共用，這裡只驗 "增項閉環子模組"）
if ((await page.locator('text=/增項閉環子模組|售後工單模組/').count()) < 1) {
  failures.push('C7 售後工單模組串接語意 missing');
} else {
  shared.push('C7 串接語意: 售後工單模組「增項閉環子模組」');
}

// 流程圖：SA 領料 → 缺料告警 → 自動建需求 → 採購審核 → 備件到庫 → 自動解除
const flowLabels = ['SA 領料', '缺料告警', '自動建需求', '採購審核', '備件到庫', '自動解除'];
const missingFlow = [];
for (const lab of flowLabels) {
  if ((await page.locator(`text=${lab}`).count()) < 1) missingFlow.push(lab);
}
if (missingFlow.length > 0) {
  failures.push(`C7 flow steps missing: ${missingFlow.join('、')}`);
} else {
  shared.push(`C7 6 步閉環流程圖完整: ${flowLabels.join(' → ')}`);
}

// Toolbar 「共 N 筆待料工單，未解除 M 筆」
const tbarText = await page.locator('text=/共.*筆待料工單/').first().innerText().catch(() => '');
const totalMatch = tbarText.match(/共\s*(\d+)\s*筆/);
const pendingMatch = tbarText.match(/未解除\s*(\d+)\s*筆/);
const c7Total = totalMatch ? parseInt(totalMatch[1], 10) : null;
const c7Pending = pendingMatch ? parseInt(pendingMatch[1], 10) : null;
shared.push(`C7 待料工單 共 ${c7Total ?? '?'} 筆 / 未解除 ${c7Pending ?? '?'} 筆`);

// Cross-link 出去：C7 → 維修領料出庫（同 ★2 / ★3 共用既有 cross-link）
const c7XlinkCount = await page.locator('a[href="/parts/issue/repair-pick"]').count();
if (c7XlinkCount < 1) {
  failures.push('C7 cross-link → /parts/issue/repair-pick missing');
} else {
  shared.push(`C7 cross-link → /parts/issue/repair-pick (count=${c7XlinkCount})`);
}

await page.screenshot({ path: '/tmp/e2e-star3-wo-loop.png', fullPage: true });
console.error('    screenshot: /tmp/e2e-star3-wo-loop.png');

// ============================================================
// Step 2 — D3.2 調撥入庫
// ============================================================
console.error('\n  → D3.2: /parts/receipt/transfer-in');
const r2 = await page.goto(`${APP_BASE}/parts/receipt/transfer-in`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r2?.status() !== 200) failures.push(`D3.2 status=${r2?.status()}`);

// H1
const h1D32 = await page.locator('h1').first().innerText().catch(() => '');
if (!h1D32.includes('調撥入庫')) failures.push(`D3.2 h1 missing: "${h1D32}"`);
else shared.push(`D3.2 h1: "${h1D32}"`);

// Sprint chip "5.2 ★3"（本工序新加）
if ((await page.locator('text=5.2 ★3').count()) < 1) {
  failures.push('D3.2 sprint chip "5.2 ★3" missing');
} else {
  shared.push('D3.2 sprint chip: "5.2 ★3"');
}

// ★3 反向串接 banner — 「待料工單觸發倉間調撥 → 備件入庫後自動解除待料」
const reverseBanner = await page
  .locator('text=/工單增項閉環.*串接.*待料工單.*倉間調撥|待料工單觸發倉間調撥.*備件入庫.*自動解除待料/')
  .count();
if (reverseBanner < 1) {
  failures.push('D3.2 反向串接 banner missing');
} else {
  shared.push('D3.2 banner: "待料工單觸發倉間調撥 → 備件入庫後自動解除待料 → SA LINE 通知"');
}

// Cross-link 反向：D3.2 → /parts/alerts/work-order-loop
const d32XlinkCount = await page.locator('a[href="/parts/alerts/work-order-loop"]').count();
if (d32XlinkCount < 1) {
  failures.push('D3.2 cross-link → /parts/alerts/work-order-loop missing');
} else {
  shared.push(`D3.2 cross-link → /parts/alerts/work-order-loop (count=${d32XlinkCount})`);
}

// Toolbar 「共 N 筆在途/到貨調撥」
const d32TbarText = await page.locator('text=/共.*筆在途\\/到貨調撥/').first().innerText().catch(() => '');
const d32TotalMatch = d32TbarText.match(/共\s*(\d+)\s*筆/);
const d32Total = d32TotalMatch ? parseInt(d32TotalMatch[1], 10) : null;
shared.push(`D3.2 在途/到貨調撥 共 ${d32Total ?? '?'} 筆`);

// DataGrid 表頭欄位（驗證調撥入庫的標準 schema）
const headerLabels = ['調撥單號', '來源倉', '目標倉', '出貨日', '預計到貨', '出貨/到貨', '狀態'];
const missingHeaders = [];
for (const lab of headerLabels) {
  if ((await page.locator(`text=${lab}`).count()) < 1) missingHeaders.push(lab);
}
if (missingHeaders.length > 0) {
  failures.push(`D3.2 grid headers missing: ${missingHeaders.join('、')}`);
} else {
  shared.push(`D3.2 grid 7 欄位齊全: ${headerLabels.join(' / ')}`);
}

await page.screenshot({ path: '/tmp/e2e-star3-transfer-in.png', fullPage: true });
console.error('    screenshot: /tmp/e2e-star3-transfer-in.png');

// ============================================================
// Console errors
// ============================================================
const meaningful = consoleErrors.filter((e) => !/Download the React DevTools|chunk-|Failed to load resource.*favicon/.test(e));
if (meaningful.length > 0) failures.push(`console: ${meaningful.slice(0, 2).join(' | ')}`);

await browser.close();

// ============================================================
// 結論
// ============================================================
console.log('');
console.log('=== Shared state observed (read-side ★3 串接點同步) ===');
for (const s of shared) console.log('  - ' + s);
console.log('');

if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
}
console.log('[OK] ★3 e2e: C7 工單增項閉環 + D3.2 調撥入庫 同步呈現「工單缺料 → 調撥備件 → 入庫解除」串接語意 + 6 步閉環流程圖完整 + 雙向 cross-link visible');
process.exit(0);
