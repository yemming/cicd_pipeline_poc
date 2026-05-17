/**
 * verify-fifth-round.mjs — 第五輪 BDN Playwright 結構驗收
 *
 * 驗收 5 個模組 x 3 URL（list / detail / create）共 14 個 URL
 * （delivery 無獨立 [id] 路由，改驗 /sales/delivery/[id] 是否 redirect 到 list）
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '.');

// ── 讀 .env.local ──
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
const APP_BASE = process.env.APP_BASE || 'http://localhost:3001';
const projectRef = new URL(SUPABASE_URL).host.split('.')[0];
const COOKIE_NAME = `sb-${projectRef}-auth-token`;

// ── Supabase auth ──
console.error('[Auth] getting session...');
const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: EMAIL }),
});
if (!tokenRes.ok) {
  console.error('[FAIL] auth', tokenRes.status, await tokenRes.text());
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
console.error('[Auth] session ok, user:', td.user?.email);

// ── seed IDs ──
const IDS = {
  sales_orders:      'e4b6ad23-6132-4458-b15d-d3a3d1836d2f',
  deliveries:        '598228e7-5481-4513-ae24-8dddd5388374',
  sales_handcards:   'bcf2e006-b140-466d-8193-b7cac353e4c0',
  used_car_inventory:'feaa757e-e6ce-47d1-a9f6-d078aa7fa448',
  new_car_inventory: '80abf6d8-d705-4768-aa19-da20010192f6',
};

// ── URL 清單 ──
const URLS = [
  // A1 sales/orders
  { slug: 'orders-list',   url: '/sales/orders',                                  type: 'list',   module: 'A1 銷售訂單', screenshotKey: 'orders' },
  { slug: 'orders-detail', url: `/sales/orders/${IDS.sales_orders}`,              type: 'detail', module: 'A1 銷售訂單' },
  { slug: 'orders-new',    url: '/sales/orders/new',                               type: 'create', module: 'A1 銷售訂單' },

  // A2 sales/delivery
  { slug: 'delivery-list', url: '/sales/delivery',                                type: 'list',   module: 'A2 交車作業', screenshotKey: 'delivery' },
  { slug: 'delivery-detail',url: `/sales/delivery/${IDS.deliveries}`,             type: 'detail', module: 'A2 交車作業', expectRedirectOrList: true },
  { slug: 'delivery-create',url: '/sales/delivery',                               type: 'list',   module: 'A2 交車作業（wizard on list）' },

  // A3 sales/reception/handcard
  { slug: 'handcard-list',  url: '/sales/reception/handcard',                     type: 'list',   module: 'A3 名片管理', screenshotKey: 'handcard' },
  { slug: 'handcard-detail',url: `/sales/reception/handcard/${IDS.sales_handcards}`, type: 'detail', module: 'A3 名片管理' },
  { slug: 'handcard-new',   url: '/sales/reception/new',                          type: 'create', module: 'A3 名片管理（create）' },

  // A4 sales/showroom/used-cars
  { slug: 'usedcar-list',   url: '/sales/showroom/used-cars',                     type: 'list',   module: 'A4 中古車展間', screenshotKey: 'used-cars' },
  { slug: 'usedcar-detail', url: `/sales/showroom/used-cars/${IDS.used_car_inventory}`, type: 'detail', module: 'A4 中古車展間' },
  { slug: 'usedcar-create', url: '/sales/showroom/used-cars',                     type: 'list',   module: 'A4 中古車展間（create on list）' },

  // A5 sales/showroom/new-cars
  { slug: 'newcar-list',    url: '/sales/showroom/new-cars',                      type: 'list',   module: 'A5 新車展間', screenshotKey: 'new-cars' },
  { slug: 'newcar-detail',  url: `/sales/showroom/new-cars/${IDS.new_car_inventory}`, type: 'detail', module: 'A5 新車展間' },
  { slug: 'newcar-new',     url: '/sales/showroom/new-cars/new',                  type: 'create', module: 'A5 新車展間' },
];

// ── browser ──
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.addCookies([...authCookies, scopeCookie]);

const results = [];

for (const entry of URLS) {
  const fullUrl = `${APP_BASE}${entry.url}`;
  console.error(`\n→ [${entry.slug}] ${fullUrl}`);

  const page = await ctx.newPage();
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  let status = 0;
  let finalUrl = '';
  let h1Text = '';
  let overlayVisible = false;
  let hasDataGridRow = false;
  let hasCrudPill = false;
  let hasCreateModeBadge = false;
  let errorSummary = '';

  try {
    const resp = await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    status = resp?.status() ?? 0;
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    finalUrl = page.url();

    // redirect 到 /login → 認證失敗
    if (finalUrl.includes('/login')) {
      errorSummary = 'redirect to /login (auth failed)';
      status = 401;
    } else {
      // H1
      h1Text = await page.locator('h1').first().innerText({ timeout: 3000 }).catch(() => '');

      // next.js error overlay
      overlayVisible = (await page.locator('[data-nextjs-dialog]').count()) > 0 ||
                       (await page.locator('#__next-error').count()) > 0;

      if (entry.type === 'list') {
        // DataGrid: 抓 tbody tr 或 table row（DataGrid 用 role=row）
        const rowCount = await page.locator('table tbody tr, [role="row"]:not([aria-label])').count();
        hasDataGridRow = rowCount > 1; // header 算一個，body 至少一行
      }

      if (entry.type === 'detail') {
        // CRUD pill bar：找「返回列表」「新增」「修改」「刪除」「停用」or「啟用」
        const btns = await page.locator('button, a').allInnerTexts();
        const hasBack   = btns.some((t) => t.includes('返回') || t.includes('列表'));
        const hasNew    = btns.some((t) => t.trim() === '新增');
        const hasEdit   = btns.some((t) => t.includes('修改'));
        const hasDelete = btns.some((t) => t.includes('刪除'));
        const hasToggle = btns.some((t) => t.includes('停用') || t.includes('啟用'));
        hasCrudPill = hasBack && hasNew && hasEdit && hasDelete && hasToggle;
        if (!hasCrudPill) {
          errorSummary += ` missing_pills:[back=${hasBack},new=${hasNew},edit=${hasEdit},del=${hasDelete},toggle=${hasToggle}]`;
        }
      }

      if (entry.type === 'create') {
        // 建立模式 amber badge
        const pageText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
        hasCreateModeBadge = pageText.includes('建立模式') || pageText.includes('create') || pageText.includes('新增');
      }

      // hydration errors
      const hydrationErrors = [...pageErrors, ...consoleErrors].filter((e) =>
        /hydration|Hydration|Cannot read prop|undefined is not|TypeError/.test(e),
      );
      if (hydrationErrors.length > 0) {
        errorSummary += ` hydration:${hydrationErrors.slice(0, 1).join(' | ').slice(0, 80)}`;
      }
    }

    // screenshot for list pages
    if (entry.screenshotKey) {
      const screenshotPath = `/tmp/fifth-round-verify-${entry.screenshotKey}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.error(`   screenshot: ${screenshotPath}`);
    }

  } catch (err) {
    errorSummary = `exception: ${err.message?.slice(0, 100)}`;
    status = -1;
  } finally {
    await page.close();
  }

  // 判定結果
  let result = '🟢';
  const issues = [];

  if (status !== 200 && status !== 0 && !entry.expectRedirectOrList) {
    issues.push(`HTTP ${status}`);
    result = '🔴';
  }
  if (status === 0 && !finalUrl) {
    issues.push('no response');
    result = '🔴';
  }
  if (!h1Text && !entry.expectRedirectOrList) {
    issues.push('no h1');
    result = result === '🔴' ? '🔴' : '🟡';
  }
  if (overlayVisible) {
    issues.push('next.js error overlay');
    result = '🔴';
  }
  if (entry.type === 'list' && !hasDataGridRow) {
    issues.push('no data rows');
    result = result === '🔴' ? '🔴' : '🟡';
  }
  if (entry.type === 'detail' && !hasCrudPill) {
    issues.push('CRUD pills incomplete');
    result = result === '🔴' ? '🔴' : '🟡';
  }
  if (errorSummary.includes('hydration')) {
    issues.push('hydration error');
    result = '🔴';
  }
  if (errorSummary && issues.length === 0) {
    issues.push(errorSummary.slice(0, 60));
    result = result === '🔴' ? '🔴' : '🟡';
  }

  results.push({
    slug: entry.slug,
    module: entry.module,
    type: entry.type,
    url: entry.url,
    status,
    h1: h1Text.slice(0, 30) || '—',
    consoleErrors: consoleErrors.filter((e) => !/favicon|DevTools|chunk/.test(e)).length,
    overlayVisible,
    issues: issues.join(', ') || '',
    result,
  });
}

await browser.close();

// ── 輸出表格 ──
console.log('\n');
console.log('=== 第五輪 BDN Playwright 驗收結果 ===\n');
console.log('| 模組 | Type | URL | Status | H1 | Console Err | Overlay | Issues | 結果 |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of results) {
  console.log(
    `| ${r.module} | ${r.type} | ${r.url} | ${r.status} | ${r.h1} | ${r.consoleErrors} | ${r.overlayVisible ? '⚠️' : '—'} | ${r.issues || '—'} | ${r.result} |`,
  );
}

const passed  = results.filter((r) => r.result === '🟢').length;
const medium  = results.filter((r) => r.result === '🟡').length;
const failed  = results.filter((r) => r.result === '🔴').length;

console.log(`\n🔴 嚴重: ${failed} 條 / 🟡 中等: ${medium} 條 / 🟢 通過: ${passed} 條`);

if (failed + medium > 0) {
  console.log('\n=== 問題列表 ===');
  for (const r of results.filter((r) => r.result !== '🟢')) {
    console.log(`${r.result} [${r.slug}] ${r.url}`);
    if (r.issues) console.log(`   → ${r.issues}`);
  }
}

// exit code
process.exit(failed > 0 ? 1 : 0);
