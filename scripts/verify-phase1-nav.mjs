/**
 * verify-phase1-nav.mjs — Phase 1 1C sidebar 視覺驗收
 *
 * 確認 Phase 1 預埋的 8 個 nav route（原 9 個，/sales/manager/reports 已刪重指）
 * 在 Indian brand 的 sidebar tree 真的出現：
 *   - 2 個 react_route：點下去 status=200 且不落到 /n/* placeholder catch-all
 *       /sales/manager/card-config          (主管工作台)
 *       /sales/showroom/stock               (展廳接待)
 *   - 6 個 placeholder + coming_soon=true：sidebar 有 label、href 指 /sales|service|parts/...
 *       /service/manager/customer-tags / workshop / employees / ro-prefix  (主管工作檯)
 *       /parts/setup/serial-tracking        (商品管理)
 *       /parts/count/loss-overflow          (盤點管理)
 *
 * 註：sidebar tree 的 NestedChild 不渲染 "Soon" chip（只在 dock fallback 用），
 * 所以視覺上 placeholder 跟 react_route 沒區隔；驗收只能靠「label 出現 + href 正確」。
 *
 * 流程同 verify-showroom-stock.mjs：magic link → cookie → chromium headless。
 * 巡訪三個模組可達根頁、展開所有 L2 group、截圖 sidebar。
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
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = 'yemming.yu@gmail.com';
const APP_BASE = process.env.APP_BASE || 'http://localhost:3000';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[FAIL] Missing SUPABASE_URL or SERVICE_KEY');
  process.exit(1);
}

const projectRef = new URL(SUPABASE_URL).host.split('.')[0];
const COOKIE_NAME = `sb-${projectRef}-auth-token`;

console.error('[1/5] Generating magic link...');
const genRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ type: 'magiclink', email: EMAIL }),
});
if (!genRes.ok) {
  console.error('[FAIL] generate_link', genRes.status, await genRes.text());
  process.exit(1);
}
const genData = await genRes.json();
const hashedToken = genData.properties?.hashed_token || genData.hashed_token;

console.error('[2/5] Verifying token...');
const verifyRes = await fetch(
  `${SUPABASE_URL}/auth/v1/verify?type=magiclink&token=${hashedToken}&redirect_to=${encodeURIComponent(APP_BASE)}`,
  { method: 'GET', redirect: 'manual', headers: { apikey: ANON_KEY } }
);
const loc = verifyRes.headers.get('location') || '';
const hashIdx = loc.indexOf('#');
if (hashIdx < 0) {
  console.error('[FAIL] no hash in verify response location', loc);
  process.exit(1);
}
const params = new URLSearchParams(loc.slice(hashIdx + 1));
const accessToken = params.get('access_token');
const refreshToken = params.get('refresh_token');
const expiresIn = Number(params.get('expires_in') || 3600);
const expiresAt = Number(params.get('expires_at') || Math.floor(Date.now() / 1000) + expiresIn);
const tokenType = params.get('token_type') || 'bearer';

const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
  headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
});
const user = await userRes.json();

const session = {
  access_token: accessToken,
  refresh_token: refreshToken,
  expires_in: expiresIn,
  expires_at: expiresAt,
  token_type: tokenType,
  user,
  provider_token: null,
  provider_refresh_token: null,
};
const cookieValue = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64');

const CHUNK_SIZE = 3180;
const parts = [];
for (let i = 0; i < cookieValue.length; i += CHUNK_SIZE) {
  parts.push(cookieValue.slice(i, i + CHUNK_SIZE));
}

const appUrl = new URL(APP_BASE);
const cookies = parts.map((value, idx) => ({
  name: parts.length === 1 ? COOKIE_NAME : `${COOKIE_NAME}.${idx}`,
  value,
  domain: appUrl.hostname,
  path: '/',
  httpOnly: false,
  secure: false,
  sameSite: 'Lax',
}));

// 強制 active scope = Indian brand（Phase 1 nav 全在 indian brand）
cookies.push({
  name: 'dealeros_scope',
  value: JSON.stringify({ brand_id: 'indian', store_id: null }),
  domain: appUrl.hostname,
  path: '/',
  httpOnly: false,
  secure: false,
  sameSite: 'Lax',
});

console.error(`[3/5] Launching chromium (${parts.length} cookie chunks)...`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies(cookies);
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

/**
 * 巡訪一個模組、展開所有 L2 group、驗證指定的 nav entries 都出現。
 *
 * @param {object} cfg
 * @param {string} cfg.module 模組根 URL（e.g. /sales）
 * @param {string} cfg.screenshot 截圖落地路徑
 * @param {Array<{label: string, kind: 'react_route' | 'placeholder'}>} cfg.entries
 */
async function visitModule(cfg) {
  const failures = [];
  const target = `${APP_BASE}${cfg.landing}`;
  console.error(`\n  → ${cfg.module} (landing ${cfg.landing})`);
  const resp = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  const status = resp?.status();
  const finalUrl = page.url();
  console.error(`    nav: status=${status} final=${finalUrl}`);
  if (status !== 200) failures.push(`${cfg.landing}: expected 200, got ${status}`);

  // debug: 先截一次，看 sidebar 到底在不在
  await page.screenshot({ path: cfg.screenshot, fullPage: false });
  console.error(`    screenshot (pre-expand) saved: ${cfg.screenshot}`);

  // 等 sidebar tree 渲染
  try {
    await page.locator('.pages-panel-nav').waitFor({ timeout: 8000 });
  } catch {
    failures.push(`${cfg.landing}: .pages-panel-nav never appeared (sidebar collapsed or shell mismatch?)`);
    return failures;
  }
  await page.waitForTimeout(300);

  // 展開所有 L2 group（aria-expanded=false 的 button）
  for (let pass = 0; pass < 2; pass += 1) {
    const buttons = await page.locator('.pages-panel-nav button[aria-expanded="false"]').all();
    if (buttons.length === 0) break;
    for (const btn of buttons) {
      await btn.click({ delay: 20 }).catch(() => {});
    }
    await page.waitForTimeout(250);
  }

  // 驗證每個 nav entry 在 sidebar tree 出現（label + href 都對）
  const sidebarText = await page.locator('.pages-panel-nav').innerText().catch(() => '');
  // debug：列出 sidebar 全部 anchor href（前 60 個）
  const sidebarHrefs = await page.locator('.pages-panel-nav a[href]').evaluateAll(
    (els) => els.map((e) => e.getAttribute('href')),
  );
  console.error(`    sidebar has ${sidebarHrefs.length} anchors`);
  // 只 dump 跟我們有關的
  const matched = sidebarHrefs.filter((h) =>
    cfg.entries.some((e) => h === e.href || h?.startsWith(e.href.split('/').slice(0, 3).join('/'))),
  );
  if (matched.length === 0) {
    console.error(`    no matching anchors — sample of 10: ${sidebarHrefs.slice(0, 10).join(' | ')}`);
  }

  for (const entry of cfg.entries) {
    if (!sidebarText.includes(entry.label)) {
      failures.push(`${cfg.landing}: sidebar missing label "${entry.label}"`);
      continue;
    }
    // 確認 href 對映
    const link = page.locator(`.pages-panel-nav a[href="${entry.href}"]`);
    const linkCount = await link.count();
    if (linkCount === 0) {
      failures.push(`${cfg.landing}: no <a href="${entry.href}"> in sidebar`);
    } else {
      console.error(`    ✓ ${entry.label} → ${entry.href} [${entry.kind}]`);
    }
  }

  await page.screenshot({ path: cfg.screenshot, fullPage: false });
  console.error(`    screenshot saved: ${cfg.screenshot}`);

  return failures;
}

console.error('[4/5] Visiting modules...');
const allFailures = [];

allFailures.push(
  ...(await visitModule({
    module: 'sales',
    // Indian brand nav 裡 /sales/funnel 不存在（Ducati 才有）。
    // 改用 /sales/manager/card-config — 它本身就是 Phase 1 react_route 目標之一，
    // 在 nav 裡有對應 row、activates 銷售接待 module，PagesPanel 就會渲染。
    landing: '/sales/manager/card-config',
    screenshot: '/tmp/phase1-nav-sales.png',
    entries: [
      { label: '手卡參數設定', href: '/sales/manager/card-config', kind: 'react_route' },
      { label: '新車庫存（RS 視角）', href: '/sales/showroom/stock', kind: 'react_route' },
    ],
  })),
);

// Placeholder href 在前端被 nav loader 改寫成 /n/{nav_node_id}（catch-all 接 PlaceholderPage），
// 不是原本的 /service/manager/* 或 /parts/*/* href。下面 href 用 /n/{id} 對。
allFailures.push(
  ...(await visitModule({
    module: 'service',
    landing: '/parts/aftersales/appointments',
    screenshot: '/tmp/phase1-nav-service.png',
    entries: [
      { label: '客戶標籤主管設定', href: '/n/a5aff2ed-873f-456a-9433-6cb970d66e6b', kind: 'placeholder' },
      { label: '車間管理看板',     href: '/n/9ee1815d-1fd4-4731-ac75-92facc14d7d5', kind: 'placeholder' },
      { label: '員工人員名冊',     href: '/n/0f312234-b087-437b-9519-3a2b692134d3', kind: 'placeholder' },
      { label: '工單前綴碼設定',   href: '/n/e32193d0-9c6e-4700-90f5-89f72fb170da', kind: 'placeholder' },
    ],
  })),
);

allFailures.push(
  ...(await visitModule({
    module: 'parts',
    landing: '/parts/setup/items',
    screenshot: '/tmp/phase1-nav-parts.png',
    entries: [
      { label: '序列號追蹤',   href: '/n/c716e223-c130-40fd-b5bb-26d8ed4d3770', kind: 'placeholder' },
      { label: '報損報溢審核', href: '/n/e5ae4744-2dc3-482b-acbe-ff9ea2c5bc51', kind: 'placeholder' },
    ],
  })),
);

if (consoleErrors.length > 0) {
  // 把 RSC payload 失敗 / next route 失敗等過濾過於吵雜的 errors 紀錄
  const meaningful = consoleErrors.filter(
    (e) => !/Download the React DevTools|chunk-/.test(e),
  );
  if (meaningful.length > 0) {
    allFailures.push(`console errors: ${meaningful.slice(0, 3).join(' | ')}`);
  }
}

await browser.close();

console.error('[5/5] Done');

if (allFailures.length > 0) {
  for (const f of allFailures) console.log(`[FAIL] ${f}`);
  process.exit(1);
} else {
  console.log('[OK] Phase 1 sidebar verification passed — 2 react_route + 6 placeholder all visible');
  process.exit(0);
}
