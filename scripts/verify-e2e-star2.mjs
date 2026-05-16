/**
 * verify-e2e-star2.mjs — Phase 4 ★2 跨模組串接點 e2e 驗證
 *
 * ★2「追加項目 ↔ 備件預留」串接點：
 *   - C6 增項管理：/service/dropoff（標 ★2 marker + 確認方式 chip）
 *   - D7.4 工單增項閉環：/parts/alerts/work-order-loop
 *     （sprint chip 為 "10.4 ★3"，但 banner 文案「車主同意回廠 → 庫存自動預留備料」
 *      就是 ★2 的對映邏輯；D7.4 同時擔任 ★2 + ★3 的閉環頁面）
 *
 * 第一版 e2e 是「兩頁 read-side 同步呈現同一個串接點」驗證，不做真實 mutation。
 * 重點：
 *   - C6 顯示「同意 → 備料預留 / 拒絕 → 增項閉環」雙路徑
 *   - D7.4 顯示「車主同意回廠 → 庫存自動預留備料」反向引文（同一串接點的下游視角）
 *   - 兩頁都帶 cross-link / 同一 RO 串接語意
 *
 * 驗證劇本：
 *   1. 開 /service/dropoff — 觀察 ★2 banner + 確認方式 chip + KPI + dropoff 案件列表
 *   2. 開 /parts/alerts/work-order-loop — 觀察「車主同意回廠 → 庫存自動預留備料」banner + 流程圖
 *   3. 觀察兩頁共通的「車主同意 → 備料預留」串接語意
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
// Step 1 — C6 增項管理頁
// ============================================================
console.error('\n  → C6: /service/dropoff');
const r1 = await page.goto(`${APP_BASE}/service/dropoff`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r1?.status() !== 200) failures.push(`C6 status=${r1?.status()}`);

// H1
const h1C6 = await page.locator('h1').first().innerText().catch(() => '');
if (!h1C6.includes('增項管理')) failures.push(`C6 h1 missing: "${h1C6}"`);
else shared.push(`C6 h1: "${h1C6}"`);

// ★2 串接 banner（綠色 v2 banner）
if ((await page.locator('text=★2 跨模組 e2e 串接 → 備件預留').count()) < 1) {
  failures.push('C6 ★2 marker chip missing');
} else {
  shared.push('C6 ★2 marker: "★2 跨模組 e2e 串接 → 備件預留"');
}

// ★2 核心語意：同意 → 備料預留 / 拒絕 → 增項閉環
const consentBanner = await page
  .locator('text=/同意.*庫存自動預留備料.*拒絕.*觸發增項閉環/')
  .count();
if (consentBanner < 1) failures.push('C6 同意/拒絕 雙路徑 banner missing');
else shared.push('C6 banner: "同意→備料預留 / 拒絕→增項閉環追蹤（D+3 / D+10）"');

// 確認方式 chip（電話 / 現場 / Line）
if ((await page.locator('text=/電話口頭確認.*現場本人確認.*Line/').count()) < 1) {
  failures.push('C6 確認方式 chip 列 missing');
} else {
  shared.push('C6 確認方式: 電話 / 現場 / Line');
}

// KPI 卡 — 抓 "增項提報率"
if ((await page.locator('text=增項提報率').count()) < 1) failures.push('C6 KPI "增項提報率" missing');
else shared.push('C6 KPI "增項提報率" visible');

// 追蹤中案件列表（demo dropoff cases）
const trackingMatch = await page.locator('text=/追蹤中案件（\\d+ 件）/').first().innerText().catch(() => '');
const trackingNum = trackingMatch.match(/(\d+)/);
const c6Total = trackingNum ? parseInt(trackingNum[1], 10) : null;
shared.push(`C6 追蹤中案件 ${c6Total ?? '?'} 件（demo dropoff cases — 含同意/拒絕案件）`);

await page.screenshot({ path: '/tmp/e2e-star2-dropoff.png', fullPage: true });
console.error('    screenshot: /tmp/e2e-star2-dropoff.png');

// ============================================================
// Step 2 — D7.4 工單增項閉環
// ============================================================
console.error('\n  → D7.4: /parts/alerts/work-order-loop');
const r2 = await page.goto(`${APP_BASE}/parts/alerts/work-order-loop`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r2?.status() !== 200) failures.push(`D7.4 status=${r2?.status()}`);

// H1
const h1D74 = await page.locator('h1').first().innerText().catch(() => '');
if (!h1D74.includes('工單增項閉環')) failures.push(`D7.4 h1 missing: "${h1D74}"`);
else shared.push(`D7.4 h1: "${h1D74}"`);

// Sprint chip — 確認 "10.4 ★3" 在（D7.4 本身是 ★3 頁，但同時擔任 ★2 的下游視角）
if ((await page.locator('text=10.4 ★3').count()) < 1) {
  failures.push('D7.4 sprint chip "10.4 ★3" missing');
} else {
  shared.push('D7.4 sprint chip: "10.4 ★3"（同時擔任 ★2 備件預留的下游視角）');
}

// ★2 核心對映 banner：「車主同意回廠 → 庫存自動預留備料」
const reservationBanner = await page
  .locator('text=/車主同意回廠.*庫存自動預留備料/')
  .count();
if (reservationBanner < 1) {
  failures.push('D7.4 ★2 對映 banner "車主同意回廠 → 庫存自動預留備料" missing');
} else {
  shared.push('D7.4 banner: "車主同意回廠 → 庫存自動預留備料"（★2 同一串接點下游視角）');
}

// 增項閉環子模組串接語意
if ((await page.locator('text=/增項閉環子模組|售後工單模組/').count()) < 1) {
  failures.push('D7.4 售後工單模組串接語意 missing');
} else {
  shared.push('D7.4 串接語意: 售後工單模組「增項閉環子模組」');
}

// 流程圖：SA 領料 → 缺料告警 → 自動建需求 → 採購審核 → 備件到庫 → 自動解除
const flowLabels = ['SA 領料', '缺料告警', '自動建需求', '採購審核', '備件到庫', '自動解除'];
const missingFlow = [];
for (const lab of flowLabels) {
  if ((await page.locator(`text=${lab}`).count()) < 1) missingFlow.push(lab);
}
if (missingFlow.length > 0) {
  failures.push(`D7.4 flow steps missing: ${missingFlow.join('、')}`);
} else {
  shared.push(`D7.4 6 步閉環流程圖完整: ${flowLabels.join(' → ')}`);
}

// Toolbar 「共 N 筆待料工單，未解除 M 筆」
const tbarText = await page.locator('text=/共.*筆待料工單/').first().innerText().catch(() => '');
const totalMatch = tbarText.match(/共\s*(\d+)\s*筆/);
const pendingMatch = tbarText.match(/未解除\s*(\d+)\s*筆/);
const d74Total = totalMatch ? parseInt(totalMatch[1], 10) : null;
const d74Pending = pendingMatch ? parseInt(pendingMatch[1], 10) : null;
shared.push(`D7.4 待料工單 共 ${d74Total ?? '?'} 筆 / 未解除 ${d74Pending ?? '?'} 筆`);

// 反向 cross-link：D7.4 → 維修領料出庫
const xlinkCount = await page.locator('a[href="/parts/issue/repair-pick"]').count();
if (xlinkCount < 1) {
  failures.push('D7.4 cross-link → /parts/issue/repair-pick missing');
} else {
  shared.push(`D7.4 cross-link → /parts/issue/repair-pick (count=${xlinkCount})`);
}

await page.screenshot({ path: '/tmp/e2e-star2-wo-loop.png', fullPage: true });
console.error('    screenshot: /tmp/e2e-star2-wo-loop.png');

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
console.log('=== Shared state observed (read-side ★2 串接點同步) ===');
for (const s of shared) console.log('  - ' + s);
console.log('');

if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
}
console.log('[OK] ★2 e2e: C6 增項管理 + D7.4 工單增項閉環 同步呈現「車主同意 → 備件預留」串接語意 + 確認方式 chip 在 + 6 步閉環流程圖完整 + cross-link visible');
process.exit(0);
