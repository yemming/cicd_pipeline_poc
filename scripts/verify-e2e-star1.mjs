/**
 * verify-e2e-star1.mjs — Phase 4 ★1 跨模組串接點 e2e 驗證
 *
 * ★1「工單零件 ↔ 庫存出庫」串接點：
 *   - C5 維修領料：/parts/issue/repair-pick（sprint chip 標 "6.1 ★1"）
 *   - D4.1 出庫管理：/parts（GROUP B 第 4 panel「出庫管理」，內含 6.1 維修領料卡片）
 *
 * 第一版 e2e 是「兩頁 read-side 同步呈現同一個串接點」驗證，不做真實 mutation。
 * 重點：兩頁都能看到 6.1 維修領料這個 RO ↔ 庫存出庫橋樑（編號 / 名稱 / link）。
 *
 * 驗證劇本：
 *   1. 開 /parts/issue/repair-pick — 觀察 h1 / "6.1 ★1" sprint chip / RO 串接 banner / 狀態 KPI / DataGrid rows
 *   2. 開 /parts hub — 觀察 GROUP B「出庫管理」panel 出現、卡片 6.1「維修領料（RO 工單串接）」visible 且 href 指向 /parts/issue/repair-pick
 *   3. 兩頁 console error 0
 *   4. 各截一張圖
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
// Step 1 — C5 維修領料頁
// ============================================================
console.error('\n  → C5: /parts/issue/repair-pick');
const r1 = await page.goto(`${APP_BASE}/parts/issue/repair-pick`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r1?.status() !== 200) failures.push(`C5 status=${r1?.status()}`);

const h1C5 = await page.locator('h1').first().innerText().catch(() => '');
if (!h1C5.includes('維修領料（RO 工單串接）')) failures.push(`C5 h1 missing: "${h1C5}"`);
else shared.push(`C5 h1: "${h1C5}"`);

// sprint chip 必須是 "6.1 ★1"
const sprintChipC5 = await page.locator('text=6.1 ★1').count();
if (sprintChipC5 < 1) failures.push('C5 sprint chip "6.1 ★1" missing');
else shared.push('C5 sprint chip: "6.1 ★1"（★1 串接點 marker）');

// RO 串接 banner
if ((await page.locator('text=與 RO 工單串接').count()) < 1) failures.push('C5 RO 串接 banner missing');
else shared.push('C5 RO 串接 banner visible（觸發增項閉環）');

// 狀態 KPI pill — 抓出三類 count
const kpiCounts = {};
for (const label of ['已過帳', '已作廢', '草稿']) {
  const pill = page.locator(`text=${label}`).first();
  if ((await pill.count()) < 1) failures.push(`C5 status pill "${label}" missing`);
  else {
    // 找 parent span 抓整段，估算 count
    const parent = pill.locator('xpath=..');
    const txt = await parent.innerText().catch(() => '');
    const num = txt.match(/\d+/);
    kpiCounts[label] = num ? parseInt(num[0], 10) : null;
  }
}
shared.push(`C5 狀態 KPI: 已過帳=${kpiCounts['已過帳']} / 已作廢=${kpiCounts['已作廢']} / 草稿=${kpiCounts['草稿']}`);

// DataGrid rows count — 取 toolbar 「共 N 筆」
const toolbarText = await page.locator('text=/共.*筆/').first().innerText().catch(() => '');
const totalMatch = toolbarText.match(/共\s*(\d+)\s*筆/);
const c5Total = totalMatch ? parseInt(totalMatch[1], 10) : null;
shared.push(`C5 DataGrid 共 ${c5Total ?? '?'} 筆領料單`);

await page.screenshot({ path: '/tmp/e2e-star1-repair-pick.png', fullPage: true });
console.error('    screenshot: /tmp/e2e-star1-repair-pick.png');

// ============================================================
// Step 2 — D4 出庫管理（/parts hub GROUP B 第 4 panel）
// ============================================================
console.error('\n  → D4: /parts (GROUP B 出庫管理 panel)');
const r2 = await page.goto(`${APP_BASE}/parts`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r2?.status() !== 200) failures.push(`D4 hub status=${r2?.status()}`);

// 出庫管理 panel 標題
if ((await page.locator('text=出庫管理').count()) < 1) failures.push('D4 panel title "出庫管理" missing');
else shared.push('D4 panel "出庫管理" visible');

// subtitle 含 "GROUP B · 6.x"
if ((await page.locator('text=GROUP B · 6.x').count()) < 1) failures.push('D4 subtitle "GROUP B · 6.x" missing');
else shared.push('D4 subtitle 標 GROUP B · 6.x');

// 6.1 卡片：維修領料（RO 工單串接）— 用 nth + 卡片內容比對
const cardLocator = page.locator('text=維修領料（RO 工單串接）');
const cardCount = await cardLocator.count();
if (cardCount < 1) failures.push('D4 card 6.1 "維修領料（RO 工單串接）" missing');
else shared.push(`D4 card 6.1 "維修領料（RO 工單串接）" visible (count=${cardCount})`);

// 卡片連結指向 /parts/issue/repair-pick — 找 a[href="/parts/issue/repair-pick"]
const linkCount = await page.locator('a[href="/parts/issue/repair-pick"]').count();
if (linkCount < 1) failures.push('D4 card link href=/parts/issue/repair-pick missing');
else shared.push(`D4 → C5 cross-link: a[href="/parts/issue/repair-pick"] exists (count=${linkCount})`);

// 6.1 code chip
if ((await page.locator('text=6.1').first().count()) < 1) failures.push('D4 card code "6.1" chip missing');

await page.screenshot({ path: '/tmp/e2e-star1-d4.png', fullPage: true });
console.error('    screenshot: /tmp/e2e-star1-d4.png');

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
console.log('=== Shared state observed (read-side ★1 串接點同步) ===');
for (const s of shared) console.log('  - ' + s);
console.log('');

if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
}
console.log('[OK] ★1 e2e: C5 維修領料 + D4 出庫管理 hub 同步呈現「6.1 維修領料（RO 工單串接）」串接點 + cross-link visible');
process.exit(0);
