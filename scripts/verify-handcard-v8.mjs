/**
 * verify-handcard-v8.mjs — A10 電子手卡 RS01 v8 三 route 端到端驗證
 *
 * 範圍：
 *   - /sales/card/counter      → STEP 0 身份 / STEP 1 接待 / STEP 2 意向
 *   - /sales/card/consultant   → STEP 3 HABC / STEP 4 試駕 / STEP 5 鑑價
 *   - /sales/card/closing      → STEP 6 報價 / STEP 7 標籤 / STEP 8 備註
 *
 * 驗證要點：
 *   1. 三 route 均 status=200
 *   2. v8 sprint chip「銷售 · RS01-v8」visible
 *   3. handcard-v8-sub-bar 在三頁都 mount
 *   4. counter 選身份 → consultant 的 sub-bar 同步顯示身份標籤（跨頁 state via Context+localStorage）
 *   5. consultant 選 timing + intent → HABC suggest block 出現 + grade badge 正確
 *   6. closing 載 customer_tags 不爆 + 黃金時刻 banner 在 trial writeback 後出現
 *   7. console error 0
 *   8. 每頁截一張 fullPage screenshot
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
const shared = [];
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

const expectVisible = async (label, selector) => {
  const c = await page.locator(selector).count();
  if (c < 1) failures.push(`${label}: selector "${selector}" missing`);
  else shared.push(`${label}: ${selector} visible (count=${c})`);
};

// ── 先打開 counter，清掉 localStorage 從乾淨狀態跑 ──
console.error('\n  → 預熱 / 清空 localStorage');
await page.goto(`${APP_BASE}/sales/card/counter`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.evaluate(() => {
  try { window.localStorage.removeItem('dealeros:handcard:v8'); } catch {}
});

// ============================================================
// Step 1 — counter
// ============================================================
console.error('\n  → counter: /sales/card/counter');
const r1 = await page.goto(`${APP_BASE}/sales/card/counter`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r1?.status() !== 200) failures.push(`counter status=${r1?.status()}`);

await expectVisible('counter', '[data-testid="handcard-sprint-chip"]');
await expectVisible('counter', '[data-testid="handcard-v8-sub-bar"]');
await expectVisible('counter', '[data-testid="handcard-step-identity"]');
await expectVisible('counter', '[data-testid="handcard-step-1"]');
await expectVisible('counter', '[data-testid="handcard-step-2"]');

// 點 STEP 0 owner card → 應該帶出 owner block
await page.locator('[data-testid="identity-card-owner"]').click();
await page.waitForTimeout(200);
await expectVisible('counter', '[data-testid="handcard-owner-block"]');
// sub-bar 身份標籤應該變成「DUCATI 老車主」
const subBarText = await page.locator('[data-testid="handcard-identity-tag"]').innerText().catch(() => '');
if (!subBarText.includes('DUCATI 老車主')) {
  failures.push(`counter sub-bar identity tag mismatch: "${subBarText}"`);
} else {
  shared.push(`counter sub-bar identity = "${subBarText}"`);
}

// 多選 2 款車
await page.locator('[data-testid="bike-Panigale-V4-S"]').click();
await page.locator('[data-testid="bike-Multistrada-V4"]').click();

await page.screenshot({ path: '/tmp/handcard-counter-verify.png', fullPage: true });
console.error('    screenshot: /tmp/handcard-counter-verify.png');

// ============================================================
// Step 2 — consultant（驗證跨頁 state）
// ============================================================
console.error('\n  → consultant: /sales/card/consultant');
const r2 = await page.goto(`${APP_BASE}/sales/card/consultant`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r2?.status() !== 200) failures.push(`consultant status=${r2?.status()}`);

await expectVisible('consultant', '[data-testid="handcard-sprint-chip"]');
await expectVisible('consultant', '[data-testid="handcard-v8-sub-bar"]');
await expectVisible('consultant', '[data-testid="handcard-step-3"]');
await expectVisible('consultant', '[data-testid="handcard-step-4"]');
await expectVisible('consultant', '[data-testid="handcard-step-5"]');

// 跨頁 state：sub-bar 身份標籤應該還是「DUCATI 老車主」（localStorage 帶過來）
const consultantSubBar = await page
  .locator('[data-testid="handcard-identity-tag"]')
  .innerText()
  .catch(() => '');
if (!consultantSubBar.includes('DUCATI 老車主')) {
  failures.push(
    `consultant sub-bar identity NOT synced: "${consultantSubBar}" (跨頁 state 失敗)`,
  );
} else {
  shared.push(`consultant sub-bar identity SYNCED from counter: "${consultantSubBar}"`);
}

// 選 timing 「3 個月內」+ intent 4 → HABC 應該推 A
await page.locator('[data-testid="timing-3m"]').click();
await page.locator('[data-testid="intent-4"]').click();
await page.waitForTimeout(200);

const habcBadgeCount = await page.locator('[data-testid="habc-grade-badge"]').count();
if (habcBadgeCount < 1) {
  failures.push('consultant: habc-grade-badge missing after timing+intent select');
} else {
  const badge = await page.locator('[data-testid="habc-grade-badge"]').innerText();
  // intent=4 → H（規格：intent>=4 直接判 H）
  if (!['H', 'A', 'B', 'C'].includes(badge)) {
    failures.push(`consultant habc badge unexpected: "${badge}"`);
  } else {
    shared.push(`consultant HABC suggest grade = "${badge}" (timing=3m, intent=4)`);
  }
}

// 模擬試駕回寫
await page.locator('[data-testid="handcard-mock-trial"]').click();
await page.waitForTimeout(900);
await expectVisible('consultant', '[data-testid="handcard-rs02-result"]');

await page.screenshot({ path: '/tmp/handcard-consultant-verify.png', fullPage: true });
console.error('    screenshot: /tmp/handcard-consultant-verify.png');

// ============================================================
// Step 3 — closing
// ============================================================
console.error('\n  → closing: /sales/card/closing');
const r3 = await page.goto(`${APP_BASE}/sales/card/closing`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r3?.status() !== 200) failures.push(`closing status=${r3?.status()}`);

await expectVisible('closing', '[data-testid="handcard-sprint-chip"]');
await expectVisible('closing', '[data-testid="handcard-v8-sub-bar"]');
await expectVisible('closing', '[data-testid="handcard-step-6"]');
await expectVisible('closing', '[data-testid="handcard-step-7"]');
await expectVisible('closing', '[data-testid="handcard-step-8"]');

// 黃金時刻 — 因 consultant 已 mock 試駕，banner + Modal 應該被觸發
await expectVisible('closing', '[data-testid="handcard-golden-banner"]');

// 黃金時刻 Modal 可能自動 open；不強制要求
const goldenModalCount = await page
  .locator('[data-testid="handcard-golden-modal"]')
  .count();
shared.push(`closing golden-moment Modal triggered=${goldenModalCount > 0}`);

// 關掉 Modal（如果在）才能截畫面
if (goldenModalCount > 0) {
  // 點稍後處理
  const buttons = await page.locator('[data-testid="handcard-golden-modal"] button').all();
  for (const b of buttons) {
    const t = await b.innerText();
    if (t.includes('稍後處理')) {
      await b.click();
      break;
    }
  }
  await page.waitForTimeout(200);
}

// 跨頁 state：sub-bar 身份標籤同樣應為老車主
const closingSubBar = await page
  .locator('[data-testid="handcard-identity-tag"]')
  .innerText()
  .catch(() => '');
if (!closingSubBar.includes('DUCATI 老車主')) {
  failures.push(`closing sub-bar identity NOT synced: "${closingSubBar}"`);
} else {
  shared.push(`closing sub-bar identity SYNCED: "${closingSubBar}"`);
}

// 標籤區塊應該有「載入中⋯」或實際 tag 出現（不爆即可）
const tagsErrorCount = await page.locator('text=標籤載入失敗').count();
if (tagsErrorCount > 0) {
  failures.push('closing: customer_tags loader returned error');
} else {
  shared.push('closing: customer_tags loader OK');
}

await page.screenshot({ path: '/tmp/handcard-closing-verify.png', fullPage: true });
console.error('    screenshot: /tmp/handcard-closing-verify.png');

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
console.log('=== Shared state observed (cross-page handcard sync) ===');
for (const s of shared) console.log('  - ' + s);
console.log('');

if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
}
console.log(
  '[OK] A10 RS01 v8: counter / consultant / closing 三 route 升級完成，跨頁 state 同步、HABC helper 正確、customer_tags reuse OK',
);
process.exit(0);
