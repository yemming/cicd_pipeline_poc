/**
 * verify-lost-reason.mjs
 *
 * BDN #14 — RS_EX1 保險招攬工作台「流失原因 ROOT CAUSE」dropdown 驗證
 *
 * 流程：
 * 1. password grant 取 Supabase session、注入 cookies
 * 2. 訪 /sales/insurance
 * 3. 找第一張保險件、點開展開區
 * 4. 確認新增的「流失原因（ROOT CAUSE）」select 存在
 * 5. 選一個 root cause、截圖
 * 6. 切到「業績總覽」tab、確認 PerfBox「流失原因分析」動態 render（從字典撈、不是 hardcoded）
 *
 * 用法：node scripts/verify-lost-reason.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, 'tmp');
fs.mkdirSync(TMP, { recursive: true });

// ── env / supabase session ──────────────────────────────────────────
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

// ── playwright run ──────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addCookies([...authCookies, scopeCookie]);
const page = await ctx.newPage();
const log = (...a) => console.log('[bdn14]', ...a);
const fails = [];

try {
  log('navigate /sales/insurance');
  const resp = await page.goto(`${APP_BASE}/sales/insurance`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  if (!resp || resp.status() >= 400) {
    throw new Error(`HTTP ${resp?.status()} on /sales/insurance`);
  }
  if (page.url().includes('/login')) {
    throw new Error(`redirected to /login: ${page.url()}`);
  }
  await page.screenshot({ path: path.join(TMP, 'bdn14-01-list.png'), fullPage: true });
  log('screenshot 01 saved');

  // 點開第一張保險件（toggle 綁在 article 內第一個 cursor-pointer header div 上）
  await page.waitForSelector('article', { timeout: 10000 });
  const beforeCount = await page.locator('[data-testid="lost-reason-select"]').count();
  log('lost-reason-select count before click:', beforeCount);
  const firstHeader = page.locator('article .cursor-pointer').first();
  await firstHeader.scrollIntoViewIfNeeded();
  await firstHeader.click({ force: true });
  await page.waitForTimeout(1500);
  let afterCount = await page.locator('[data-testid="lost-reason-select"]').count();
  log('lost-reason-select count after click:', afterCount);
  if (afterCount === 0) {
    // 試第二張
    log('first card 沒展開 → 試第二張');
    const second = page.locator('article').nth(1).locator('.cursor-pointer').first();
    await second.scrollIntoViewIfNeeded();
    await second.click({ force: true });
    await page.waitForTimeout(1500);
    afterCount = await page.locator('[data-testid="lost-reason-select"]').count();
    log('lost-reason-select count after 2nd click:', afterCount);
  }
  if (afterCount === 0) {
    const articleCount = await page.locator('article').count();
    log('total articles:', articleCount);
    const html = await page.content();
    fs.writeFileSync(path.join(TMP, 'bdn14-debug.html'), html);
    log('full page HTML saved to tmp/bdn14-debug.html');
  }

  // 驗證 dropdown 存在
  const dd = page.locator('[data-testid="lost-reason-select"]').first();
  await dd.waitFor({ timeout: 5000 });
  const options = await dd.locator('option').allTextContents();
  log('lost-reason options:', JSON.stringify(options));

  const expected = ['客戶決策者已投保他家', '價格太高', '服務滿意度低', '保單需求改變', '其他'];
  const missing = expected.filter((e) => !options.some((o) => o.includes(e)));
  if (missing.length) {
    fails.push(`dropdown 少了 options: ${missing.join(', ')}`);
  } else {
    log('all 5 root-cause options present ✓');
  }

  await page.screenshot({ path: path.join(TMP, 'bdn14-02-dropdown-visible.png'), fullPage: true });
  log('screenshot 02 saved');

  // 選一個 root cause
  const opts = await dd.locator('option').all();
  let pickedLabel = null;
  for (const o of opts) {
    const v = await o.getAttribute('value');
    const txt = (await o.textContent()) ?? '';
    if (v && v !== '' && txt.includes('價格太高')) {
      await dd.selectOption(v);
      pickedLabel = txt;
      break;
    }
  }
  if (!pickedLabel) fails.push('沒選到「價格太高」option');
  else log('selected:', pickedLabel);

  await page.waitForTimeout(300);
  const selectedValue = await dd.inputValue();
  log('select value after pick:', selectedValue);
  if (!selectedValue) fails.push('select value 為空、選擇沒寫進 state');

  await page.screenshot({ path: path.join(TMP, 'bdn14-03-selected.png'), fullPage: true });
  log('screenshot 03 saved');

  // 切到「業績總覽」tab，看 PerfBox「流失原因分析」是否動態 render
  const perfTab = page.locator('button', { hasText: '業績總覽' }).first();
  await perfTab.click();
  await page.waitForTimeout(500);

  // 「流失原因分析」box 應該出現 5 個 dictionary label 之一（不是 hardcoded「電銷直接投保」）
  const perfBox = page.locator('div').filter({ hasText: /^流失原因分析/ }).first();
  const perfText = await perfBox.textContent();
  log('perf box text (excerpt):', (perfText ?? '').slice(0, 200));

  // 動態狀態下應該看到 root cause label（價格太高 / 其他 等）
  const sawDictLabel = expected.some((e) => (perfText ?? '').includes(e));
  if (!sawDictLabel) {
    fails.push('PerfBox 沒看到任何 dictionary label，可能 fallback 到 hardcoded（lostReasons prop 為空？）');
  } else {
    log('PerfBox 動態 render ✓');
  }
  await page.screenshot({ path: path.join(TMP, 'bdn14-04-perfbox.png'), fullPage: true });
  log('screenshot 04 saved');

} catch (e) {
  console.error('[bdn14 ERROR]', e.message);
  fails.push(e.message);
  await page.screenshot({ path: path.join(TMP, 'bdn14-error.png'), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

if (fails.length) {
  console.error('\n❌ FAILED:');
  for (const f of fails) console.error('  -', f);
  process.exit(1);
} else {
  console.log('\n✅ BDN #14 verify passed — all 4 screenshots saved to tmp/');
  process.exit(0);
}
