/**
 * verify-a14-a15-delivery-insurance.mjs
 *
 * Phase 3A A14 `/delivery/*` 6 頁 v2 style 升級 + A15 `/sales/insurance` v1 升級
 * 合併驗證 — 單一 chromium session、依序訪 7 條 route，避免並行起多瀏覽器把機器吃爆
 * （HANDOFF 推測上次 session crash 原因是並行 sub-page 太多）。
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

// ─── 共用：訪一條 route，要求 200 + 含關鍵字 ───
async function visit(route, mustText, screenshotName) {
  console.error(`\n  → ${route}`);
  consoleErrors.length = 0;
  const resp = await page
    .goto(`${APP_BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    .catch((e) => {
      failures.push(`${route} navigate threw: ${e.message}`);
      return null;
    });
  if (!resp) return;
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  if (resp.status() !== 200) failures.push(`${route} status=${resp.status()}`);
  for (const t of mustText) {
    if ((await page.locator(`text=${t}`).count()) < 1) failures.push(`${route} missing: ${t}`);
  }
  const meaningful = consoleErrors.filter(
    (e) =>
      !/Download the React DevTools|chunk-|You provided a `value` prop to a form field|Hydration failed|Each child in a list/.test(
        e,
      ),
  );
  if (meaningful.length > 0)
    failures.push(`${route} console: ${meaningful.slice(0, 1).join(' | ').slice(0, 160)}`);
  await page.screenshot({ path: `/tmp/${screenshotName}.png`, fullPage: true });
  console.error(`    screenshot: /tmp/${screenshotName}.png`);
}

// ─── A14：/delivery/* 6 頁 v2 style ───
await visit('/delivery/pdi', ['PDI', '整備'], 'a14-delivery-pdi');
await visit('/delivery/pdi-accessories', ['配件'], 'a14-delivery-accessories');
await visit('/delivery/confirm-1', ['交車'], 'a14-delivery-confirm-1');
await visit('/delivery/confirm-2', ['交車'], 'a14-delivery-confirm-2');
await visit('/delivery/warranty-sign', ['保固'], 'a14-delivery-warranty-sign');
await visit('/delivery/ceremony', ['交車'], 'a14-delivery-ceremony');

// ─── A15：/sales/insurance v1 ───
await visit('/sales/insurance', ['保險', '續保'], 'a15-sales-insurance');

// 切到 perf tab
await page.locator('button:has-text("績效")').first().click().catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/a15-sales-insurance-perf.png', fullPage: true });
console.error('    screenshot: /tmp/a15-sales-insurance-perf.png (perf tab)');

await browser.close();

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
}
console.log('[OK] A14 /delivery/* 6 頁 + A15 /sales/insurance 全部 200 + 關鍵字命中');
process.exit(0);
