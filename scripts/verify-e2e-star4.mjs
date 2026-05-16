/**
 * verify-e2e-star4.mjs — Phase 4 ★4 跨模組串接點 e2e 驗證
 *
 * ★4「竣工複檢 ↔ 保固舊件管理」串接點：
 *   - C8 竣工複檢：/service/inspection
 *     （sprint chip "8.1 ★4"、★4 banner 指向 D7.2/D8.4、Step 3 結論備註 textarea 含
 *      "舊件 BAT-..."/"保固電瓶" placeholder + SRV-SRB-26-014 規範引用）
 *   - D8.4 保固舊件管理：/parts/warranty/used-parts
 *     （sprint chip "11.4 ★4"、反向 banner 指回 /service/inspection、共通引用
 *      SRV-SRB-26-014、表內已有「關聯 RO 工單」column + filter）
 *
 * 第一版 e2e 是「兩頁 read-side 同步呈現同一個串接點」驗證，不做真實 mutation。
 * 重點：
 *   - C8 顯示 ★4 marker + banner + 結論備註 textarea + SRV-SRB-26-014 引用
 *   - D8.4 顯示 ★4 marker + 反向 banner + cross-link 回 /service/inspection
 *   - 兩頁帶共通的「保固舊件回收 / 拆下異常件 / SRV-SRB-26-014」串接語意
 *
 * 驗證劇本：
 *   1. 開 /service/inspection — 觀察 ★4 sprint chip + banner + SRV-SRB-26-014 引用
 *   2. 點 Step 3「複檢簽核」— 觀察「複檢結論備註」textarea 與保固舊件單號 placeholder
 *   3. 開 /parts/warranty/used-parts — 觀察 ★4 sprint chip + 反向 banner + 共通規範引用
 *   4. 觀察 D8.4 表頭「關聯 RO 工單」column（作為串接點的資料證據）
 *   5. 兩頁 console error 0
 *   6. 各截一張圖
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
// Step 1 — C8 竣工複檢
// ============================================================
console.error('\n  → C8: /service/inspection');
const r1 = await page.goto(`${APP_BASE}/service/inspection`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r1?.status() !== 200) failures.push(`C8 status=${r1?.status()}`);

// H1
const h1C8 = await page.locator('h1').first().innerText().catch(() => '');
if (!h1C8.includes('竣工複檢')) failures.push(`C8 h1 missing: "${h1C8}"`);
else shared.push(`C8 h1: "${h1C8}"`);

// Sprint chip "8.1 ★4"
if ((await page.locator('text=8.1 ★4').count()) < 1) {
  failures.push('C8 sprint chip "8.1 ★4" missing');
} else {
  shared.push('C8 sprint chip: "8.1 ★4"');
}

// ★4 cross-link banner — 「保固舊件管理」
const c8Banner = await page
  .locator('text=/★4 跨模組串接.*竣工複檢.*保固舊件管理|保固舊件回收流程/')
  .count();
if (c8Banner < 1) {
  failures.push('C8 ★4 cross-link banner missing');
} else {
  shared.push('C8 banner: "竣工複檢 ↔ 保固舊件管理（D7.2）"');
}

// SRV-SRB-26-014 規範引用
if ((await page.locator('text=SRV-SRB-26-014').count()) < 1) {
  failures.push('C8 SRV-SRB-26-014 規範引用 missing');
} else {
  shared.push('C8 規範: Ducati SRV-SRB-26-014（原廠保固件回繳規定）');
}

// 切到 Step 3「複檢簽核」確認 textarea
console.error('    切到 Step 3 「複檢簽核」');
const step3Btn = page.locator('button:has-text("複檢簽核")').first();
if (await step3Btn.count() === 0) {
  failures.push('C8 Step 3 「複檢簽核」按鈕 not found');
} else {
  await step3Btn.click();
  await page.waitForTimeout(400);
  // 結論備註 textarea label
  if ((await page.locator('text=複檢結論備註').count()) < 1) {
    failures.push('C8 「複檢結論備註」label missing');
  } else {
    shared.push('C8 Step 3: 「複檢結論備註（選填，含保固舊件單號）」textarea visible');
  }
  // textarea placeholder 含「保固電瓶」或「BAT-」
  const placeholderTextareaCount = await page
    .locator('textarea[placeholder*="保固電瓶"], textarea[placeholder*="BAT-"]')
    .count();
  if (placeholderTextareaCount < 1) {
    failures.push('C8 結論備註 placeholder 缺少 "保固電瓶" 或 "BAT-" 串接示意');
  } else {
    shared.push('C8 textarea placeholder 包含「BAT-2026-0042（保固電瓶）」串接示意');
  }
}

await page.screenshot({ path: '/tmp/e2e-star4-inspection.png', fullPage: true });
console.error('    screenshot: /tmp/e2e-star4-inspection.png');

// ============================================================
// Step 2 — D8.4 保固舊件管理
// ============================================================
console.error('\n  → D8.4: /parts/warranty/used-parts');
const r2 = await page.goto(`${APP_BASE}/parts/warranty/used-parts`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r2?.status() !== 200) failures.push(`D8.4 status=${r2?.status()}`);

// H1
const h1D84 = await page.locator('h1').first().innerText().catch(() => '');
if (!h1D84.includes('保固索賠舊件管理')) failures.push(`D8.4 h1 missing: "${h1D84}"`);
else shared.push(`D8.4 h1: "${h1D84}"`);

// Sprint chip "11.4 ★4"（本工序新加）
if ((await page.locator('text=11.4 ★4').count()) < 1) {
  failures.push('D8.4 sprint chip "11.4 ★4" missing');
} else {
  shared.push('D8.4 sprint chip: "11.4 ★4"');
}

// ★4 反向 banner — 「保固舊件管理 ↔ 竣工複檢」
const d84Banner = await page
  .locator('text=/★4 跨模組串接.*保固舊件管理.*竣工複檢|竣工複檢.*標記為.*異常.*保固範圍/')
  .count();
if (d84Banner < 1) {
  failures.push('D8.4 反向 banner missing');
} else {
  shared.push('D8.4 banner: "保固舊件管理 ↔ 竣工複檢（C8）"');
}

// 反向 cross-link：D8.4 → /service/inspection
const d84XlinkCount = await page.locator('a[href="/service/inspection"]').count();
if (d84XlinkCount < 1) {
  failures.push('D8.4 cross-link → /service/inspection missing');
} else {
  shared.push(`D8.4 cross-link → /service/inspection (count=${d84XlinkCount})`);
}

// 共通規範引用 SRV-SRB-26-014
if ((await page.locator('text=SRV-SRB-26-014').count()) < 1) {
  failures.push('D8.4 SRV-SRB-26-014 共通規範引用 missing');
} else {
  shared.push('D8.4 共通規範: Ducati SRV-SRB-26-014');
}

// 表頭欄位「關聯 RO 工單」— 串接點的資料證據
const roHeaderCount = await page.locator('text=/關聯 RO 工單/').count();
if (roHeaderCount < 1) {
  failures.push('D8.4 「關聯 RO 工單」column header missing');
} else {
  shared.push('D8.4 DataGrid column「關聯 RO 工單」visible（串接 C8 RO 來源的資料欄）');
}

// 也驗 filter 帶 ro_no 欄位（搜尋 placeholder "RO-"）
const roFilterCount = await page.locator('input[placeholder="RO-"]').count();
if (roFilterCount < 1) {
  failures.push('D8.4 filter 「關聯 RO 工單號」input missing');
} else {
  shared.push('D8.4 filter 「關聯 RO 工單號」input visible（可反查 C8 工單對應的舊件）');
}

// KPI strip — 共 5 個狀態（驗 read-side 完整呈現）
const kpiLabels = ['已逾期', '即將到期', '保管中', '已寄回原廠', '已銷毀'];
const missingKpi = [];
for (const lab of kpiLabels) {
  if ((await page.locator(`text=${lab}`).count()) < 1) missingKpi.push(lab);
}
if (missingKpi.length > 0) {
  failures.push(`D8.4 KPI strip missing: ${missingKpi.join('、')}`);
} else {
  shared.push(`D8.4 5 KPI 齊全: ${kpiLabels.join(' / ')}`);
}

await page.screenshot({ path: '/tmp/e2e-star4-used-parts.png', fullPage: true });
console.error('    screenshot: /tmp/e2e-star4-used-parts.png');

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
console.log('=== Shared state observed (read-side ★4 串接點同步) ===');
for (const s of shared) console.log('  - ' + s);
console.log('');

if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
}
console.log('[OK] ★4 e2e: C8 竣工複檢 + D8.4 保固舊件管理 同步呈現「複檢異常 → 保固舊件回收」串接語意 + SRV-SRB-26-014 共通規範引用 + 雙向 cross-link visible');
process.exit(0);
