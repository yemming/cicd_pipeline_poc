/**
 * verify-service-appointments.mjs — Phase 3B C1 /service/appointments v2 升級驗證
 *
 * /service/appointments 從 timetable mock 升級為共用 <AppointmentsBoard>，
 * 跟 /parts/aftersales/appointments 同元件、僅在 basePath / pageHeader 上分支。
 *
 * 驗證：
 *   - /service/appointments status=200 + 顯示 4 KPI / 排程 / 技師負載 / 預約清單表格
 *   - /parts/aftersales/appointments status=200（regression）
 *   - 兩 route 各自的 h1 文案：
 *       /service/appointments → 「預約看板」
 *       /parts/aftersales/appointments → 「預約管理看板」
 *   - 0 console error（password grant + Indian scope）
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
const PASSWORD = EMAIL;
const APP_BASE = process.env.APP_BASE || 'http://localhost:3000';
const projectRef = new URL(SUPABASE_URL).host.split('.')[0];
const COOKIE_NAME = `sb-${projectRef}-auth-token`;

const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!tokenRes.ok) {
  console.error('[FAIL] password grant', tokenRes.status, await tokenRes.text());
  process.exit(1);
}
const tokenData = await tokenRes.json();
const session = {
  access_token: tokenData.access_token,
  refresh_token: tokenData.refresh_token,
  expires_in: tokenData.expires_in ?? 3600,
  expires_at: tokenData.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  token_type: tokenData.token_type ?? 'bearer',
  user: tokenData.user,
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
  name: 'dealeros_scope',
  value: JSON.stringify({ brand_id: 'indian', store_id: null }),
  domain: appUrl.hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([...authCookies, scopeCookie]);
const page = await context.newPage();

const ROUTES = [
  {
    url: '/service/appointments',
    title: '預約看板',
    screenshot: '/tmp/service-appointments-verify.png',
  },
  {
    url: '/parts/aftersales/appointments',
    title: '預約管理看板',
    screenshot: '/tmp/parts-aftersales-appointments-verify.png',
  },
];

const failures = [];

for (const { url: routeUrl, title, screenshot } of ROUTES) {
  const consoleErrors = [];
  const handler = (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); };
  page.on('console', handler);

  console.error(`\n  → ${routeUrl}`);
  try {
    const resp = await page.goto(`${APP_BASE}${routeUrl}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    const status = resp?.status();
    const finalUrl = page.url();
    console.error(`    nav: status=${status} final=${finalUrl}`);
    if (status !== 200) failures.push(`${routeUrl}: expected 200, got ${status}`);

    // h1 文案
    const h1Text = await page.locator('h1').first().innerText().catch(() => '');
    if (!h1Text.includes(title)) failures.push(`${routeUrl}: h1 expected "${title}", got "${h1Text}"`);

    // 4 KPI labels
    for (const k of ['今日預約', '等待中', '維修中', '已完成']) {
      const cnt = await page.locator(`text=${k}`).count();
      if (cnt < 1) failures.push(`${routeUrl}: KPI label "${k}" not found`);
    }

    // schedule + tech load section titles
    const hasSchedule = (await page.locator('text=今日排程').count()) > 0;
    const hasTechLoad = (await page.locator('text=技師工作負載').count()) > 0;
    if (!hasSchedule) failures.push(`${routeUrl}: 今日排程 section missing`);
    if (!hasTechLoad) failures.push(`${routeUrl}: 技師工作負載 section missing`);

    // appointments DataGrid header
    const hasGrid = (await page.locator('text=預約時段').count()) > 0;
    if (!hasGrid) failures.push(`${routeUrl}: DataGrid "預約時段" column header missing`);

    // filter bar 查詢 button
    const hasQueryBtn = (await page.locator('button:has-text("查詢")').count()) > 0;
    if (!hasQueryBtn) failures.push(`${routeUrl}: 查詢 button missing`);

    const meaningful = consoleErrors.filter((e) => !/Download the React DevTools|chunk-/.test(e));
    if (meaningful.length > 0) failures.push(`${routeUrl}: console errors: ${meaningful.slice(0, 2).join(' | ')}`);

    await page.screenshot({ path: screenshot, fullPage: true });
    console.error(`    screenshot: ${screenshot}`);
    console.error(`    h1="${h1Text}" KPI/排程/技師/Grid all present`);
  } catch (e) {
    failures.push(`${routeUrl}: exception: ${e.message}`);
    try { await page.screenshot({ path: screenshot, fullPage: true }); } catch {}
  }
  page.off('console', handler);
}

await browser.close();

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
} else {
  console.log('[OK] /service/appointments + /parts/aftersales/appointments both render shared AppointmentsBoard (v2)');
  process.exit(0);
}
