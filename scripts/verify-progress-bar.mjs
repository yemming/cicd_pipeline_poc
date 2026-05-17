/**
 * verify-progress-bar.mjs
 *
 * BDN #21 — RS_EX1 保險招攬工作台「本月業績摘要」內加上達成率 progress bar + 月底預測線。
 * Playwright headless：登入 → /sales/insurance → 點「📊 業績總覽」tab → 截圖含 ProgressBarWithForecast 的區塊。
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([...authCookies, scopeCookie]);
const page = await ctx.newPage();

const failures = [];
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

async function go() {
  const resp = await page.goto(`${APP_BASE}/sales/insurance`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  if (!resp || resp.status() !== 200) {
    failures.push(`/sales/insurance status=${resp?.status() ?? 'null'}`);
    return;
  }
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

  // 切到「📊 業績總覽」tab
  const perfTabBtn = page.locator('button:has-text("業績總覽")').first();
  await perfTabBtn.click().catch((e) => failures.push(`click perf tab: ${e.message}`));
  await page.waitForTimeout(400);

  // 驗 ProgressBarWithForecast 至少出現 2 個（件數 + 佣金）
  const barCount = await page.locator('[data-testid="progress-bar-with-forecast"]').count();
  if (barCount < 2) failures.push(`progress bar count=${barCount} (expect >=2)`);

  // 驗有「件數達成率」「佣金達成率」label
  if ((await page.locator('text=件數達成率').count()) < 1)
    failures.push('missing label: 件數達成率');
  if ((await page.locator('text=佣金達成率').count()) < 1)
    failures.push('missing label: 佣金達成率');

  // 驗有「已過 N / 共 M 天」標記
  if ((await page.locator('text=/已過 \\d+ \\/ 共 \\d+ 天/').count()) < 1)
    failures.push('missing days marker');

  await page.screenshot({ path: path.join(ROOT, 'tmp/bdn21-perf-fullpage.png'), fullPage: true });

  // 局部截圖：聚焦「本月業績摘要」card
  const card = page
    .locator('div', { hasText: '本月業績摘要' })
    .filter({ has: page.locator('[data-testid="progress-bar-with-forecast"]') })
    .first();
  if ((await card.count()) > 0) {
    await card.screenshot({ path: path.join(ROOT, 'tmp/bdn21-perfbox.png') });
  } else {
    failures.push('cannot locate 本月業績摘要 card for cropped screenshot');
  }
}

await go();
await browser.close();

const meaningful = consoleErrors.filter(
  (e) =>
    !/Download the React DevTools|chunk-|You provided a `value` prop to a form field|Hydration failed|Each child in a list/.test(
      e,
    ),
);
if (meaningful.length > 0) {
  console.log('[CONSOLE]', meaningful.slice(0, 2).join(' | ').slice(0, 240));
}

if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
}
console.log('[OK] BDN #21 progress bar + 預測線 verified — screenshots in tmp/bdn21-*.png');
process.exit(0);
