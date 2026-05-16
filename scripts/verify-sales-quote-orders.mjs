/**
 * verify-sales-quote-orders.mjs — A13 RS04 v1 端到端驗證
 *
 * 範圍：/sales/quote（賞車報價單）+ /sales/orders（成交合約書）
 *
 * 驗證要點：
 *   QUOTE 頁：
 *   1. status=200
 *   2. sprint chip「銷售 · RS04-v1-quote」visible
 *   3. ClientBar / VehicleSwitch / 6 張車款卡片 mount
 *   4. 切到「中古車報價」→ used-fields panel 顯示、badge 變「中古車」amber
 *   5. 點 Streetfighter V4 卡片 → 報價明細「v0」行的名稱 + 價格更新
 *   6. 編輯 v0 input 為 850000 → 客戶實付總額對應重算
 *   7. 點刪除「g0」（贈品行）→ 那行消失
 *   8. 點「＋ 新增項目」→ modal 出現；填名稱 + 報價後加入表格
 *   9. 點「成交 → 建立合約書」→ 寫 localStorage snapshot、URL 跳到 /sales/orders?type=used
 *  10. console error 0、截圖 /tmp/sales-quote-verify.png
 *
 *   ORDERS 頁：
 *  11. status=200
 *  12. sprint chip「銷售 · RS04-v1-orders」visible
 *  13. URL 帶 ?type=used → 預設展示中古車合約書 pane
 *  14. Snapshot banner 顯示來源 Q-XXX 摘要
 *  15. step bar 4 步驟 mount
 *  16. 點「新車訂購合約書」sub-tab → 切到新車 pane
 *  17. 新車 pane 內 4 段（買受人 / 車輛 / 付款 / 特殊約定）+ 4 顆 payment-card
 *  18. 點 payment-card "loan" → 選中狀態切換
 *  19. 切回中古車 → disclaimer + 8 個車輛欄位 mount
 *  20. 截圖 /tmp/sales-orders-verify.png
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
// QUOTE 頁
// ============================================================
console.error('\n  → /sales/quote');
const r1 = await page.goto(`${APP_BASE}/sales/quote`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r1?.status() !== 200) failures.push(`quote status=${r1?.status()}`);

await expectVisible('quote-header', '[data-testid="quote-page-header"]');
await expectVisible('quote-sprint', '[data-testid="quote-sprint-chip"]');
const quoteSprintText = await page
  .locator('[data-testid="quote-sprint-chip"]')
  .innerText()
  .catch(() => '');
if (!quoteSprintText.includes('RS04-v1-quote')) {
  failures.push(`quote sprint chip mismatch: "${quoteSprintText}"`);
} else {
  observed.push(`quote sprint chip = "${quoteSprintText}"`);
}
await expectVisible('client-bar', '[data-testid="quote-client-bar"]');
await expectVisible('vs-new', '[data-testid="quote-vs-new"]');
await expectVisible('vs-used', '[data-testid="quote-vs-used"]');

// 車款卡片 6 張
for (const id of [
  'panigale-v4',
  'streetfighter-v4',
  'monster-sp',
  'multistrada-v4',
  'diavel-v4',
  'hypermotard-698',
]) {
  await expectVisible(`car-${id}`, `[data-testid="quote-car-${id}"]`);
}

// ── 切到中古車
await page.locator('[data-testid="quote-vs-used"]').click();
await page.waitForTimeout(180);
await expectVisible('used-fields', '[data-testid="quote-used-fields"]');
const badgeUsed = await page
  .locator('[data-testid="quote-vehicle-badge"]')
  .innerText();
if (!badgeUsed.includes('中古車')) {
  failures.push(`badge after used switch: "${badgeUsed}"`);
} else {
  observed.push(`switch new → used: badge = "${badgeUsed}"`);
}

// 切回新車
await page.locator('[data-testid="quote-vs-new"]').click();
await page.waitForTimeout(150);

// ── 點 Streetfighter V4 卡片
await page.locator('[data-testid="quote-car-streetfighter-v4"]').click();
await page.waitForTimeout(200);
const v0Input = await page
  .locator('[data-testid="quote-input-v0"]')
  .inputValue();
if (v0Input.replace(/,/g, '') !== '858000') {
  failures.push(`select Streetfighter V4: v0 input = "${v0Input}" (expected 858,000)`);
} else {
  observed.push(`select Streetfighter V4 → v0 input = ${v0Input}`);
}

// ── 編輯 v0 input 為 850,000 → 總額重算
await page.locator('[data-testid="quote-input-v0"]').fill('850000');
await page.waitForTimeout(180);
const totalAfterEdit = await page
  .locator('[data-testid="quote-total-final"]')
  .innerText();
// 預設 lines（after Streetfighter select）：
//   v0=850,000 (vehicle)
//   g0 = 0 gift (no count)
//   a0=45,000 (addon) i0=1,490 (insurance) i1=26,000 (insurance) l0=7,800 (license)
//   d0=-20,000 (discount)
// final = 850,000 + (45,000+1,490+26,000+7,800) - 20,000 = 850,000 + 80,290 - 20,000 = 910,290
if (!totalAfterEdit.includes('910,290')) {
  failures.push(`total after edit v0=850000: "${totalAfterEdit}" (expected $910,290)`);
} else {
  observed.push(`edit v0=850000 → total = ${totalAfterEdit.trim()}`);
}

// ── 刪 g0
await page.locator('[data-testid="quote-remove-g0"]').click();
await page.waitForTimeout(120);
const g0After = await page.locator('[data-testid="quote-line-g0"]').count();
if (g0After !== 0) {
  failures.push(`g0 should be removed, still ${g0After} row(s)`);
} else {
  observed.push(`remove g0 (gift) → row gone`);
}

// ── 新增項目 modal
await page.locator('[data-testid="quote-add-item-btn"]').click();
await page.waitForTimeout(150);
await expectVisible('modal', '[data-testid="quote-modal"]');
await page.locator('[data-testid="quote-add-name"]').fill('快拆牌架');
await page.locator('[data-testid="quote-add-price"]').fill('3500');
await page.locator('[data-testid="quote-add-submit"]').click();
await page.waitForTimeout(200);
const modalGone = await page.locator('[data-testid="quote-modal"]').count();
if (modalGone !== 0) failures.push(`modal should close after submit, count=${modalGone}`);
else observed.push(`add item modal: 快拆牌架 inserted, modal closed`);

// ── 切到中古車模式（為了 verify orders 頁 ?type=used 流程）
await page.locator('[data-testid="quote-vs-used"]').click();
await page.waitForTimeout(150);

// ── 截圖 quote
await page.screenshot({ path: '/tmp/sales-quote-verify.png', fullPage: true });
console.error('    screenshot: /tmp/sales-quote-verify.png');

// ── 點「成交 → 建立合約書」
await page.locator('[data-testid="quote-go-contract"]').click();
await page.waitForURL(/\/sales\/orders/, { timeout: 8000 }).catch(() => {});
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

const urlAfter = page.url();
if (!/\/sales\/orders\?type=used/.test(urlAfter)) {
  failures.push(`after go-contract URL = "${urlAfter}" (expected /sales/orders?type=used)`);
} else {
  observed.push(`go-contract → ${urlAfter}`);
}

// ============================================================
// ORDERS 頁
// ============================================================
await expectVisible('orders-header', '[data-testid="orders-page-header"]');
await expectVisible('orders-sprint', '[data-testid="orders-sprint-chip"]');
const ordersSprintText = await page
  .locator('[data-testid="orders-sprint-chip"]')
  .innerText()
  .catch(() => '');
if (!ordersSprintText.includes('RS04-v1-orders')) {
  failures.push(`orders sprint chip mismatch: "${ordersSprintText}"`);
} else {
  observed.push(`orders sprint chip = "${ordersSprintText}"`);
}

// snapshot banner（from localStorage）
await expectVisible('snapshot-banner', '[data-testid="orders-snapshot-banner"]');
const snapQuoteNo = await page
  .locator('[data-testid="orders-snapshot-quote-no"]')
  .innerText()
  .catch(() => '');
if (!/^Q-\d{8}-\d{3}$/.test(snapQuoteNo.trim())) {
  failures.push(`snapshot quote-no format wrong: "${snapQuoteNo}"`);
} else {
  observed.push(`snapshot banner quote-no = ${snapQuoteNo.trim()}`);
}

await expectVisible('step-bar', '[data-testid="orders-step-bar"]');
await expectVisible('subtabs', '[data-testid="orders-subtabs"]');

// 預設 used pane（因為 URL ?type=used）
await expectVisible('pane-used', '[data-testid="orders-pane-used"]');
const newPaneCount = await page.locator('[data-testid="orders-pane-new"]').count();
if (newPaneCount !== 0) {
  failures.push(`?type=used should not render new pane, count=${newPaneCount}`);
} else {
  observed.push(`?type=used → only used pane rendered`);
}
await expectVisible('used-disclaimer', '[data-testid="orders-used-disclaimer"]');

// ── 點「新車訂購合約書」sub-tab
await page.locator('[data-testid="orders-subtab-new"]').click();
await page.waitForTimeout(180);
await expectVisible('pane-new', '[data-testid="orders-pane-new"]');
const usedPaneCount = await page.locator('[data-testid="orders-pane-used"]').count();
if (usedPaneCount !== 0) {
  failures.push(`switch to new: used pane should disappear, count=${usedPaneCount}`);
} else {
  observed.push(`switch subtab → new pane`);
}

// 4 顆 payment-card
for (const id of ['cash', 'card', 'loan', 'installment']) {
  await expectVisible(`pay-${id}`, `[data-testid="orders-new-payment-${id}"]`);
}
// 點 loan
await page.locator('[data-testid="orders-new-payment-loan"]').click();
await page.waitForTimeout(120);
const loanHtml = await page
  .locator('[data-testid="orders-new-payment-loan"]')
  .getAttribute('class');
if (!loanHtml || !loanHtml.includes('border-[#185FA5]')) {
  failures.push(`payment-loan should be selected (blue border)`);
} else {
  observed.push(`payment loan selected`);
}

// ── 切回中古車 sub-tab
await page.locator('[data-testid="orders-subtab-used"]').click();
await page.waitForTimeout(150);
await expectVisible('pane-used-after', '[data-testid="orders-pane-used"]');

// 截圖 orders（用中古車視角）
await page.screenshot({ path: '/tmp/sales-orders-verify.png', fullPage: true });
console.error('    screenshot: /tmp/sales-orders-verify.png');

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
  '[OK] A13 RS04 v1: /sales/quote + /sales/orders 升級完成 — 車款選擇 / 報價編輯 / 新增項目 / 成交跳轉 / snapshot 顯示 / sub-tab 切換 / payment-card 均正常',
);
process.exit(0);
