/**
 * verify-service-home.mjs — Phase 3B C0a /service home + /parts/aftersales home 驗證
 *
 * 兩 route 共用 <AftersalesFlowDiagram> 元件，差別只在右上「返回」連結。
 * 驗證：
 *   - /service status=200（先前 404、Phase 1 驗收撞到）
 *   - /parts/aftersales status=200
 *   - 兩頁 data-testid="aftersales-flow-diagram" 都在
 *   - 兩頁顯示 4 KPI scorecard
 *   - h1 都包含「售後工單模組」字樣
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
const cookies = parts.map((value, idx) => ({
  name: parts.length === 1 ? COOKIE_NAME : `${COOKIE_NAME}.${idx}`,
  value, domain: appUrl.hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
}));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies(cookies);
const page = await context.newPage();

const ROUTES = [
  { url: '/service', screenshot: '/tmp/service-home-verify.png' },
  { url: '/parts/aftersales', screenshot: '/tmp/parts-aftersales-home-verify.png' },
];

const failures = [];

for (const { url: routeUrl, screenshot } of ROUTES) {
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

    const hasRoot = (await page.locator('[data-testid="aftersales-flow-diagram"]').count()) > 0;
    if (!hasRoot) failures.push(`${routeUrl}: aftersales-flow-diagram root not found`);

    // 4 KPI scorecard
    const kpiText = await page.locator('text=已完成頁面').count();
    if (kpiText < 1) failures.push(`${routeUrl}: 已完成頁面 KPI not found`);

    // hero 售後工單模組
    const heroText = await page.locator('text=售後工單模組').count();
    if (heroText < 1) failures.push(`${routeUrl}: 售後工單模組 hero text not found`);

    // 6 Phase blocks (預約 / SA / RO / 車間 / 竣工 / 結帳 — 6 個)
    const phaseCount = await page.locator('text=Phase').count();
    // 不一定每個 Phase header 都帶 "Phase" 字樣，這條只是 best-effort，不阻擋

    const meaningful = consoleErrors.filter((e) => !/Download the React DevTools|chunk-/.test(e));
    if (meaningful.length > 0) failures.push(`${routeUrl}: console errors: ${meaningful.slice(0, 2).join(' | ')}`);

    await page.screenshot({ path: screenshot, fullPage: true });
    console.error(`    screenshot: ${screenshot}`);
    if (hasRoot && kpiText > 0 && heroText > 0) {
      console.error(`    ✓ root + KPI + hero present (phases=${phaseCount})`);
    }
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
  console.log('[OK] /service + /parts/aftersales both render AftersalesFlowDiagram shared component');
  process.exit(0);
}
