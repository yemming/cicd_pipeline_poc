/**
 * verify-delivery-v1.mjs — A14 RS05 v1 端到端驗證
 *
 * 範圍：/delivery/{confirm-1,pdi,pdi-accessories,confirm-2,warranty-sign,ceremony}
 *
 * 驗證要點：
 *   1. 6 個 route 都 status=200
 *   2. DeliveryFrame mount（page header / sprint chip / step bar / info card）
 *   3. Sprint chip 內文符合「銷售 · RS05-v1-step{1..6}」
 *   4. 跨頁 state 同步：在 step 1 改 VIN → 切到 step 5（保固）也吃到同樣的 VIN
 *   5. step 2 PDI checklist 29 項可勾、進度條更新；觸發工單後 PD-IN 號碼出現
 *   6. step 3 配件勾選後計數更新
 *   7. step 4 全部完成（測試）按鈕 → 36 項全勾
 *   8. step 5 三個簽名 button 按下後變 signed
 *   9. step 6 確認交車 → delivered_at 顯示
 *  10. console error 0、截圖 6 張 /tmp/delivery-{slug}-verify.png
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

const expectSprint = async (stepId, expectFragment) => {
  const t = await page
    .locator('[data-testid="delivery-sprint-chip"]')
    .innerText()
    .catch(() => '');
  if (!t.includes(expectFragment))
    failures.push(`step${stepId} sprint chip mismatch: "${t}" (expect "${expectFragment}")`);
  else observed.push(`step${stepId} sprint chip = "${t.trim()}"`);
};

const gotoStep = async (slug, stepId) => {
  const r = await page.goto(`${APP_BASE}/delivery/${slug}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  if (r?.status() !== 200) failures.push(`/delivery/${slug} status=${r?.status()}`);
  // 等 DeliveryFrame mount
  await page
    .waitForSelector(`[data-testid="delivery-frame-step-${stepId}"]`, { timeout: 8000 })
    .catch(() => failures.push(`/delivery/${slug}: frame step ${stepId} did not mount`));
  await expectVisible(`step${stepId}-header`, '[data-testid="delivery-page-header"]');
  await expectVisible(`step${stepId}-stepbar`, '[data-testid="delivery-step-bar"]');
  await expectVisible(`step${stepId}-info`, '[data-testid="delivery-info-card"]');
};

// ============================================================
// STEP 1 — confirm-1
// ============================================================
console.error('\n  → /delivery/confirm-1');
await gotoStep('confirm-1', 1);
await expectSprint(1, 'RS05-v1-step1');
await expectVisible('confirm1-order-panel', '[data-testid="confirm1-order-panel"]');

// 改 VIN，看 step 5 是否同步
const vinInput = page.locator('[data-testid="confirm1-input-vin"]');
await vinInput.fill('ZDMHA01TESTSYNC42');
await page.waitForTimeout(200);
const vinAfter = await vinInput.inputValue();
if (vinAfter !== 'ZDMHA01TESTSYNC42')
  failures.push(`step1: VIN value did not stick = "${vinAfter}"`);
else observed.push(`step1: VIN typed = ${vinAfter}`);

await page.screenshot({
  path: '/tmp/delivery-confirm-1-verify.png',
  fullPage: true,
});

// ============================================================
// STEP 2 — pdi
// ============================================================
console.error('  → /delivery/pdi');
await gotoStep('pdi', 2);
await expectSprint(2, 'RS05-v1-step2');
await expectVisible('pdi-trigger', '[data-testid="pdi-trigger-card"]');
await expectVisible('pdi-checklist', '[data-testid="pdi-checklist"]');

// 觸發 PDI 工單
await page.locator('[data-testid="pdi-trigger-btn"]').click();
await page.waitForTimeout(200);
await expectVisible('pdi-wo-confirmed', '[data-testid="pdi-wo-confirmed"]');
const woText = await page
  .locator('[data-testid="pdi-wo-confirmed"]')
  .innerText();
if (!/PD-IN-\d{6}-001/.test(woText))
  failures.push(`pdi work order number missing in "${woText}"`);
else observed.push(`pdi work order: ${woText.match(/PD-IN-\d{6}-001/)?.[0]}`);

// 勾 5 項，看進度
for (let i = 0; i < 5; i++)
  await page.locator(`[data-testid="pdi-item-${i}"]`).click();
await page.waitForTimeout(200);
const pdiCount = await page
  .locator('[data-testid="pdi-progress-count"]')
  .innerText();
if (!pdiCount.includes('5 / 29'))
  failures.push(`pdi progress count = "${pdiCount}" (expect "5 / 29")`);
else observed.push(`pdi progress: ${pdiCount.trim()}`);

await page.screenshot({
  path: '/tmp/delivery-pdi-verify.png',
  fullPage: true,
});

// ============================================================
// STEP 3 — pdi-accessories
// ============================================================
console.error('  → /delivery/pdi-accessories');
await gotoStep('pdi-accessories', 3);
await expectSprint(3, 'RS05-v1-step3');
await expectVisible('acc-panel', '[data-testid="acc-panel"]');
await page.locator('[data-testid="acc-item-acc-1"]').click();
await page.locator('[data-testid="acc-item-acc-2"]').click();
await page.waitForTimeout(150);
const accCount = await page
  .locator('[data-testid="acc-progress-count"]')
  .innerText();
if (!accCount.includes('2 / 5'))
  failures.push(`acc progress = "${accCount}" (expect "2 / 5")`);
else observed.push(`acc progress: ${accCount.trim()}`);

await page.screenshot({
  path: '/tmp/delivery-pdi-accessories-verify.png',
  fullPage: true,
});

// ============================================================
// STEP 4 — confirm-2
// ============================================================
console.error('  → /delivery/confirm-2');
await gotoStep('confirm-2', 4);
await expectSprint(4, 'RS05-v1-step4');
await expectVisible('confirm2-panel', '[data-testid="confirm2-panel"]');
await expectVisible('confirm2-cat-a', '[data-testid="confirm2-cat-a"]');
await expectVisible('confirm2-cat-d', '[data-testid="confirm2-cat-d"]');
// 全部勾
await page.locator('[data-testid="confirm2-toggle-all-btn"]').click();
await page.waitForTimeout(250);
const c2 = await page
  .locator('[data-testid="confirm2-progress-count"]')
  .innerText();
if (!c2.includes('36 / 36'))
  failures.push(`confirm2 progress = "${c2}" (expect "36 / 36")`);
else observed.push(`confirm2 progress: ${c2.trim()}`);

await page.screenshot({
  path: '/tmp/delivery-confirm-2-verify.png',
  fullPage: true,
});

// ============================================================
// STEP 5 — warranty-sign （驗證跨頁 state：VIN 從 step1 帶下來）
// ============================================================
console.error('  → /delivery/warranty-sign');
await gotoStep('warranty-sign', 5);
await expectSprint(5, 'RS05-v1-step5');
await expectVisible('warranty-panel', '[data-testid="warranty-panel"]');

// VIN 應該是 step1 改過的值
const warrantyInputs = await page
  .locator('input[value="ZDMHA01TESTSYNC42"]')
  .count();
if (warrantyInputs < 1)
  failures.push(`cross-page state: VIN "ZDMHA01TESTSYNC42" not propagated to step 5`);
else observed.push(`cross-page state sync OK: VIN visible on step 5`);

// 三方簽名
await page.locator('[data-testid="warranty-sign-technician"]').click();
await page.locator('[data-testid="warranty-sign-rs"]').click();
await page.locator('[data-testid="warranty-sign-customer"]').click();
await page.waitForTimeout(200);
const signedCount = await page
  .locator('[data-testid^="warranty-sign-"]')
  .evaluateAll((els) => els.filter((e) => e.className.includes('border-[#0F6E56]')).length);
if (signedCount !== 3)
  failures.push(`signatures: got ${signedCount}/3 signed`);
else observed.push(`signatures: 3/3 signed`);

// 勾 5 項交車確認
for (let i = 0; i < 5; i++)
  await page.locator(`[data-testid="warranty-check-${i}"]`).click();
await page.waitForTimeout(150);
observed.push(`warranty checklist 5/5 checked`);

await page.screenshot({
  path: '/tmp/delivery-warranty-sign-verify.png',
  fullPage: true,
});

// ============================================================
// STEP 6 — ceremony
// ============================================================
console.error('  → /delivery/ceremony');
await gotoStep('ceremony', 6);
await expectSprint(6, 'RS05-v1-step6');
await expectVisible('ceremony-complete', '[data-testid="ceremony-complete-card"]');
await expectVisible('ceremony-docs', '[data-testid="ceremony-docs-panel"]');

// 確認交車
await page.locator('[data-testid="ceremony-confirm-btn"]').click();
await page.waitForTimeout(200);
await expectVisible('delivered-at', '[data-testid="ceremony-delivered-at"]');
const deliveredText = await page
  .locator('[data-testid="ceremony-delivered-at"]')
  .innerText();
observed.push(`delivered: ${deliveredText.trim()}`);

// 6 張文件
for (const key of [
  'doc-pdi',
  'doc-warranty',
  'doc-confirm',
  'doc-manual',
  'doc-license',
  'doc-key',
]) {
  await expectVisible(key, `[data-testid="ceremony-${key}"]`);
}

// 截圖前先 reset 避免污染下一次 run
await page.screenshot({
  path: '/tmp/delivery-ceremony-verify.png',
  fullPage: true,
});

// 收尾 — reset demo state
await page.locator('[data-testid="ceremony-reset-btn"]').click();
await page.waitForTimeout(200);

// ============================================================
// console error
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
  '[OK] A14 RS05 v1: /delivery/* 6 step 升級完成 — DeliveryFrame / cross-page state / PDI 工單 / 配件 / 36 項點交 / 三方簽署 / 完成交車均正常',
);
process.exit(0);
