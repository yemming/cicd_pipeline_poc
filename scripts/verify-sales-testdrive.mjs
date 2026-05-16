/**
 * verify-sales-testdrive.mjs — A11 試乘試駕 RS02 v1 wizard 端到端驗證
 *
 * 範圍：/sales/testdrive（單頁 4-step wizard）
 *
 * 驗證要點：
 *   1. status=200
 *   2. sprint chip「銷售 · A11-v1」visible
 *   3. step bar 4 顆 tab 都 mount
 *   4. STEP 1 ↔ STEP 2 ↔ STEP 3 ↔ STEP 4 切換正常
 *   5. STEP 2「全部 OK」按下 → 進度 14/14, 100%
 *   6. STEP 3 開始/結束計時 → badge 從「待開始」→「試駕中」→「已結束」、km 自動算
 *   7. STEP 4 黃金時刻 banner 渲染 + 整體感受按鈕可點 + 原試駕車款 readonly 跟 STEP 1 一致
 *   8. console error 0
 *   9. fullPage screenshot
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

// ── auth ──
const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: EMAIL }),
});
if (!tokenRes.ok) {
  console.error('[FAIL] password grant', tokenRes.status);
  process.exit(1);
}
const td = await tokenRes.json();
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
for (let i = 0; i < cookieValue.length; i += CHUNK_SIZE)
  parts.push(cookieValue.slice(i, i + CHUNK_SIZE));
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.addCookies([...authCookies, scopeCookie]);
const page = await ctx.newPage();

const failures = [];
const observed = [];
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

const expectVisible = async (label, selector) => {
  const c = await page.locator(selector).count();
  if (c < 1) failures.push(`${label}: selector "${selector}" missing`);
  else observed.push(`${label}: ${selector} visible`);
};

// ============================================================
// Step 1 — 開頁、檢查基本架構
// ============================================================
console.error('\n  → /sales/testdrive');
const r1 = await page.goto(`${APP_BASE}/sales/testdrive`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r1?.status() !== 200) failures.push(`testdrive status=${r1?.status()}`);

await expectVisible('header', '[data-testid="testdrive-page-header"]');
await expectVisible('sprint', '[data-testid="testdrive-sprint-chip"]');
await expectVisible('step-bar', '[data-testid="testdrive-step-bar"]');

const sprintText = await page
  .locator('[data-testid="testdrive-sprint-chip"]')
  .innerText()
  .catch(() => '');
if (!sprintText.includes('A11-v1')) {
  failures.push(`sprint chip mismatch: "${sprintText}"`);
} else {
  observed.push(`sprint chip = "${sprintText}"`);
}

for (const n of [1, 2, 3, 4]) {
  await expectVisible(`tab-${n}`, `[data-testid="testdrive-step-tab-${n}"]`);
}
await expectVisible('pane-1', '[data-testid="testdrive-pane-1"]');

// ============================================================
// Step 1 — STEP 1 form 動車款下拉
// ============================================================
const bikeBefore = await page
  .locator('[data-testid="testdrive-bike-select"]')
  .inputValue();
observed.push(`STEP 1 default bike = "${bikeBefore}"`);
await page
  .locator('[data-testid="testdrive-bike-select"]')
  .selectOption({ index: 2 }); // Monster SP
const bikeAfter = await page
  .locator('[data-testid="testdrive-bike-select"]')
  .inputValue();
observed.push(`STEP 1 bike changed to = "${bikeAfter}"`);

// 點下一步
await page.locator('[data-testid="testdrive-next-1"]').click();
await page.waitForTimeout(300);
await expectVisible('pane-2', '[data-testid="testdrive-pane-2"]');

// ============================================================
// Step 2 — 安全清單「全部 OK」
// ============================================================
const before = await page
  .locator('[data-testid="testdrive-safe-count"]')
  .innerText();
if (before.trim() !== '0 / 14') {
  failures.push(`STEP 2 initial count not 0/14: "${before}"`);
}

await page.locator('[data-testid="testdrive-check-all"]').click();
await page.waitForTimeout(200);
const after = await page
  .locator('[data-testid="testdrive-safe-count"]')
  .innerText();
const pct = await page
  .locator('[data-testid="testdrive-safe-pct"]')
  .innerText();
if (after.trim() !== '14 / 14' || pct.trim() !== '100%') {
  failures.push(`STEP 2 check-all failed: count="${after}" pct="${pct}"`);
} else {
  observed.push(`STEP 2 check-all OK: ${after} / ${pct}`);
}

await page.locator('[data-testid="testdrive-next-2"]').click();
await page.waitForTimeout(300);
await expectVisible('pane-3', '[data-testid="testdrive-pane-3"]');

// ============================================================
// Step 3 — 計時器 + km 算
// ============================================================
const badgeBefore = await page
  .locator('[data-testid="testdrive-timer-badge"]')
  .innerText();
if (badgeBefore.trim() !== '待開始') {
  failures.push(`STEP 3 badge initial: "${badgeBefore}"`);
}

await page.locator('[data-testid="testdrive-timer-start"]').click();
await page.waitForTimeout(300);
const badgeRunning = await page
  .locator('[data-testid="testdrive-timer-badge"]')
  .innerText();
if (badgeRunning.trim() !== '試駕中') {
  failures.push(`STEP 3 badge after start: "${badgeRunning}"`);
} else {
  observed.push(`STEP 3 timer started, badge = "${badgeRunning}"`);
}

// 等 ~1.2 秒讓秒數動
await page.waitForTimeout(1200);
const display1 = await page
  .locator('[data-testid="testdrive-timer-display"]')
  .innerText();
observed.push(`STEP 3 timer display after ~1.2s = "${display1}"`);

await page.locator('[data-testid="testdrive-timer-stop"]').click();
await page.waitForTimeout(200);
const badgeEnd = await page
  .locator('[data-testid="testdrive-timer-badge"]')
  .innerText();
if (badgeEnd.trim() !== '已結束') {
  failures.push(`STEP 3 badge after stop: "${badgeEnd}"`);
} else {
  observed.push(`STEP 3 timer stopped, badge = "${badgeEnd}"`);
}

// km 自動算
await page.locator('[data-testid="testdrive-km-start"]').fill('1200');
await page.locator('[data-testid="testdrive-km-end"]').fill('1235');
await page.waitForTimeout(150);
const kmTotal = await page
  .locator('[data-testid="testdrive-km-total"]')
  .inputValue();
if (kmTotal !== '35 km') {
  failures.push(`STEP 3 km total wrong: "${kmTotal}" (expected "35 km")`);
} else {
  observed.push(`STEP 3 km auto-calc OK: ${kmTotal}`);
}

await page.locator('[data-testid="testdrive-next-3"]').click();
await page.waitForTimeout(300);
await expectVisible('pane-4', '[data-testid="testdrive-pane-4"]');

// ============================================================
// Step 4 — 黃金時刻 + 結果評估
// ============================================================
await expectVisible('golden', '[data-testid="testdrive-golden-banner"]');
await expectVisible('golden-quote-btn', '[data-testid="testdrive-golden-quote"]');
await expectVisible('golden-skip-btn', '[data-testid="testdrive-golden-skip"]');

// 點「稍後再說」→ skip block 應該出現
await page.locator('[data-testid="testdrive-golden-skip"]').click();
await page.waitForTimeout(150);
await expectVisible('skip-block', '[data-testid="testdrive-skip-block"]');

// 整體感受按鈕可點
await page.locator('[data-testid="testdrive-overall-ok"]').click();
await page.waitForTimeout(120);

// 原試駕車款應該跟 STEP 1 選的一致（Monster SP）
const origModel = await page
  .locator('[data-testid="testdrive-orig-model"]')
  .inputValue();
if (origModel !== bikeAfter) {
  failures.push(
    `STEP 4 orig-model mismatch: "${origModel}" vs STEP1 "${bikeAfter}"`,
  );
} else {
  observed.push(`STEP 4 orig-model synced from STEP 1: "${origModel}"`);
}

// 儲存試駕記錄 → toast
await page.locator('[data-testid="testdrive-save-record"]').click();
await page.waitForTimeout(200);
await expectVisible('toast', '[data-testid="testdrive-toast"]');

// ============================================================
// Screenshot
// ============================================================
await page.screenshot({ path: '/tmp/sales-testdrive-verify.png', fullPage: true });
console.error('    screenshot: /tmp/sales-testdrive-verify.png');

// ============================================================
// Console errors
// ============================================================
const meaningful = consoleErrors.filter(
  (e) =>
    !/Download the React DevTools|chunk-|Failed to load resource.*favicon|hydration|You provided a `value` prop to a form field|Each child in a list/.test(
      e,
    ),
);
if (meaningful.length > 0) {
  failures.push(`console: ${meaningful.slice(0, 2).join(' | ')}`);
  for (const e of meaningful.slice(0, 5)) console.error('    err:', e);
}

await browser.close();

// ============================================================
console.log('');
console.log('=== Observed ===');
for (const s of observed) console.log('  - ' + s);
console.log('');

if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
}
console.log(
  '[OK] A11 RS02 v1: /sales/testdrive 4-step wizard 升級完成 — step 切換 / 安全清單 / 計時 / 黃金時刻 / 結果回寫均正常',
);
process.exit(0);
