/**
 * verify-usedcar-evaluation.mjs — A12 中古車評估鑑價 RS06 v2 端到端驗證
 *
 * 範圍：/usedcar/evaluation（單頁 5-tab 評估單）
 *
 * 驗證要點：
 *   1. status=200
 *   2. sprint chip「銷售 · RS06-v2」visible
 *   3. tab bar 5 顆 tab 都 mount
 *   4. TAB 0 → TAB 1 → TAB 2 → TAB 3 → TAB 4 切換正常
 *   5. TAB 0：點掃描方格 → 計數 0/8 → 1/8
 *   6. TAB 1：點側面圖第一個 dot → state 從 empty → ok；輸入漆膜 250μm → state 變 bad
 *   7. TAB 2：點「全部 OK」→ 進度 100%
 *   8. TAB 3：輸入前輪花紋 4mm → ts mark = ✓；2mm 後輪 → ⚠
 *   9. TAB 4：輸入 market=300000 / repair=20000 → suggested = NT$ 275,000；總成本 25,000
 *  10. console error 0
 *  11. fullPage screenshot
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
// Step 1 — open page
// ============================================================
console.error('\n  → /usedcar/evaluation');
const r1 = await page.goto(`${APP_BASE}/usedcar/evaluation`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (r1?.status() !== 200) failures.push(`evaluation status=${r1?.status()}`);

await expectVisible('header', '[data-testid="evaluation-page-header"]');
await expectVisible('sprint', '[data-testid="evaluation-sprint-chip"]');
await expectVisible('tab-bar', '[data-testid="evaluation-tab-bar"]');

const sprintText = await page
  .locator('[data-testid="evaluation-sprint-chip"]')
  .innerText()
  .catch(() => '');
if (!sprintText.includes('RS06-v2')) {
  failures.push(`sprint chip mismatch: "${sprintText}"`);
} else {
  observed.push(`sprint chip = "${sprintText}"`);
}

for (const n of [0, 1, 2, 3, 4]) {
  await expectVisible(`tab-${n}`, `[data-testid="evaluation-tab-${n}"]`);
}
await expectVisible('pane-0', '[data-testid="evaluation-pane-0"]');

// ============================================================
// TAB 0 — 掃描方格計數
// ============================================================
const scanBefore = await page
  .locator('[data-testid="evaluation-scan-count"]')
  .innerText();
if (scanBefore.trim() !== '0 / 8 已掃描') {
  failures.push(`TAB 0 scan count initial: "${scanBefore}"`);
}

await page.locator('[data-testid="evaluation-scan-0"]').click();
await page.waitForTimeout(180);
const scanAfter = await page
  .locator('[data-testid="evaluation-scan-count"]')
  .innerText();
if (scanAfter.trim() !== '1 / 8 已掃描') {
  failures.push(`TAB 0 scan-0 click failed: "${scanAfter}"`);
} else {
  observed.push(`TAB 0 scan count: ${scanBefore.trim()} → ${scanAfter.trim()}`);
}

// 填里程
await page.locator('[data-testid="evaluation-mileage"]').fill('35,000 km');

await page.locator('[data-testid="evaluation-next-0"]').click();
await page.waitForTimeout(250);
await expectVisible('pane-1', '[data-testid="evaluation-pane-1"]');

// ============================================================
// TAB 1 — 損傷點 cycle + 漆膜厚度 → bad
// ============================================================
const dotBefore = await page
  .locator('[data-testid="evaluation-side-dot-s0"]')
  .getAttribute('data-state');
if (dotBefore !== 'empty') {
  failures.push(`TAB 1 dot initial state: "${dotBefore}"`);
}
await page.locator('[data-testid="evaluation-side-dot-s0"]').click();
await page.waitForTimeout(120);
const dotAfter = await page
  .locator('[data-testid="evaluation-side-dot-s0"]')
  .getAttribute('data-state');
if (dotAfter !== 'ok') {
  failures.push(`TAB 1 dot after one click: "${dotAfter}" (expected "ok")`);
} else {
  observed.push(`TAB 1 side-dot-s0 state: ${dotBefore} → ${dotAfter}`);
}

// 漆膜：輸入 250 應該變 bad（紅色 active）— 檢查第一個 zone 的「✗」鈕是否帶 bg-[#C8001A]
await page.locator('[data-testid="evaluation-paint-um-0"]').fill('250');
await page.waitForTimeout(150);
const zone0Html = await page
  .locator('[data-testid="evaluation-paint-zone-0"]')
  .innerHTML();
if (!zone0Html.includes('bg-[#C8001A]')) {
  failures.push('TAB 1 paint 250μm should set zone to bad (red active)');
} else {
  observed.push('TAB 1 paint 250μm → zone 0 set to bad');
}

await page.locator('[data-testid="evaluation-next-1"]').click();
await page.waitForTimeout(250);
await expectVisible('pane-2', '[data-testid="evaluation-pane-2"]');

// ============================================================
// TAB 2 — 全部 OK → 100%
// ============================================================
const framePctBefore = await page
  .locator('[data-testid="evaluation-frame-pct"]')
  .innerText();
if (framePctBefore.trim() !== '0%') {
  failures.push(`TAB 2 frame pct initial: "${framePctBefore}"`);
}
await page.locator('[data-testid="evaluation-frame-check-all"]').click();
await page.waitForTimeout(200);
const framePctAfter = await page
  .locator('[data-testid="evaluation-frame-pct"]')
  .innerText();
if (framePctAfter.trim() !== '100%') {
  failures.push(`TAB 2 frame pct after all OK: "${framePctAfter}"`);
} else {
  observed.push(`TAB 2 frame pct: ${framePctBefore.trim()} → ${framePctAfter.trim()}`);
}

await page.locator('[data-testid="evaluation-next-2"]').click();
await page.waitForTimeout(250);
await expectVisible('pane-3', '[data-testid="evaluation-pane-3"]');

// ============================================================
// TAB 3 — 輪胎花紋深度
// ============================================================
await page.locator('[data-testid="evaluation-tire-front-mm"]').fill('4');
await page.waitForTimeout(120);
const frontTs = await page
  .locator('[data-testid="evaluation-tire-front-ts"]')
  .innerText();
if (frontTs.trim() !== '✓') {
  failures.push(`TAB 3 front tire 4mm should be OK (✓), got "${frontTs}"`);
} else {
  observed.push(`TAB 3 tire front 4mm → ${frontTs.trim()}`);
}

await page.locator('[data-testid="evaluation-tire-rear-mm"]').fill('2');
await page.waitForTimeout(120);
const rearTs = await page
  .locator('[data-testid="evaluation-tire-rear-ts"]')
  .innerText();
if (rearTs.trim() !== '⚠') {
  failures.push(`TAB 3 rear tire 2mm should be WARN (⚠), got "${rearTs}"`);
} else {
  observed.push(`TAB 3 tire rear 2mm → ${rearTs.trim()}`);
}

await page.locator('[data-testid="evaluation-next-3"]').click();
await page.waitForTimeout(250);
await expectVisible('pane-4', '[data-testid="evaluation-pane-4"]');

// ============================================================
// TAB 4 — 計算
// ============================================================
await page.locator('[data-testid="evaluation-calc-market"]').fill('300000');
await page.waitForTimeout(80);
await page.locator('[data-testid="evaluation-calc-repair"]').fill('20000');
await page.waitForTimeout(150);

const suggested = await page
  .locator('[data-testid="evaluation-suggested"]')
  .innerText();
if (!suggested.includes('275,000')) {
  failures.push(
    `TAB 4 suggested wrong: "${suggested}" (expected NT$ 275,000) [market=300000, repair=20000, admin=5000 default]`,
  );
} else {
  observed.push(`TAB 4 suggested = ${suggested.trim()}`);
}

const totalCost = await page
  .locator('[data-testid="evaluation-total-cost"]')
  .innerText();
if (!totalCost.includes('25,000')) {
  failures.push(
    `TAB 4 total-cost wrong: "${totalCost}" (expected 25,000 = repair 20000 + admin 5000)`,
  );
} else {
  observed.push(`TAB 4 total-cost = ${totalCost.trim()}`);
}

// BDN #11 — D 段殘值試算驗證
// 殘值 = 收購價 − 整備預估費（B 段合計 = repair 20000 + admin 5000 = 25000）
// suggested = market 300000 − cost 25000 = 275000
// residual = suggested 275000 − refurbCost 25000 = 250000
const residual = await page
  .locator('[data-testid="evaluation-residual"]')
  .innerText();
if (!residual.includes('250,000')) {
  failures.push(
    `TAB 4 residual wrong: "${residual}" (expected 250,000 = suggested 275000 − refurbCost 25000)`,
  );
} else {
  observed.push(`TAB 4 D-tier residual = ${residual.trim()}`);
}

// BDN #11 截圖：定位到 TAB 4 result-box
await page
  .locator('[data-testid="evaluation-result-box"]')
  .scrollIntoViewIfNeeded();
await page.waitForTimeout(180);
await page.screenshot({
  path: 'tmp/bdn11-pricing-tier-d.png',
  fullPage: false,
  clip: await page
    .locator('[data-testid="evaluation-result-box"]')
    .boundingBox()
    .then((b) =>
      b
        ? { x: Math.max(0, b.x - 8), y: Math.max(0, b.y - 8), width: b.width + 16, height: b.height + 16 }
        : undefined,
    ),
});
console.error('    BDN#11 screenshot: tmp/bdn11-pricing-tier-d.png');

// 儲存
await page.locator('[data-testid="evaluation-save-final"]').click();
await page.waitForTimeout(200);
await expectVisible('toast', '[data-testid="evaluation-toast"]');

// ============================================================
// Screenshot
// ============================================================
await page.screenshot({ path: '/tmp/usedcar-evaluation-verify.png', fullPage: true });
console.error('    screenshot: /tmp/usedcar-evaluation-verify.png');

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
  '[OK] A12 RS06 v2: /usedcar/evaluation 5-tab 評估單升級完成 — tab 切換 / 證件掃描 / 損傷點 / 漆膜 / 骨架進度 / 輪胎 / 收購定價計算均正常',
);
process.exit(0);
