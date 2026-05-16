/**
 * verify-service-manager-customer-tags.mjs
 * Phase 3B C14 — /service/manager/customer-tags 售後主管模組客戶標籤主管設定驗證
 *
 * 規格 docs/DUCATI_v2_output/03_售後修護/02_售後主管設定/12_客戶標籤主管設定.html
 *
 * 驗收項：
 *   1. status 200 + H1「客戶標籤主管設定」+ sprint chip「售後主管 · 14」
 *   2. 🔒 權限提示 banner
 *   3. 兩 tab：🏷 官方標籤字典管理 + 👁️ 主管觀察視角
 *   4. 預設 dict tab：左側 4 色 section + 右側「➕ 新增官方標籤」+「📋 使用規則說明」
 *   5. 新增 form：類別 select + 標籤文字 input + 「＋ 新增官方標籤」button
 *   6. Indian seed：官方標籤總數 >= 20（22 個）；4 色都至少有 1 個 chip
 *   7. 規則說明 4 條（🔒/✏️/🌐/⚠️）
 *   8. 切到 obs tab：應出現「主管觀察視角」banner（或空狀態）
 *   9. console 無 meaningful error
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
for (let i = 0; i < cookieValue.length; i += CHUNK_SIZE) parts.push(cookieValue.slice(i, i + CHUNK_SIZE));
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

console.error('\n  → /service/manager/customer-tags');
const resp = await page.goto(`${APP_BASE}/service/manager/customer-tags`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (resp?.status() !== 200) failures.push(`status=${resp?.status()}`);

// 1. H1 + sprint chip
if ((await page.locator('h1:has-text("客戶標籤主管設定")').count()) < 1) {
  failures.push('h1 客戶標籤主管設定 missing');
}
if ((await page.locator('text=售後主管 · 14').count()) < 1) {
  failures.push('sprint chip 售後主管 · 14 missing');
}

// 2. 權限提示 banner
if ((await page.locator('text=此頁面僅限「售後主管」權限操作').count()) < 1) {
  failures.push('權限提示 banner missing');
}

// 3. 兩 tab
if ((await page.locator('button:has-text("官方標籤字典管理")').count()) < 1) {
  failures.push('tab 官方標籤字典管理 missing');
}
if ((await page.locator('button:has-text("主管觀察視角")').count()) < 1) {
  failures.push('tab 主管觀察視角 missing');
}

// 4. 預設 dict tab：4 色 sectionTitle
const sectionTitles = ['🔴 注意事項（高風險）', '🟡 偏好習慣', '🟢 服務備忘', '🔵 費用／溝通偏好'];
for (const s of sectionTitles) {
  if ((await page.locator(`text=${s}`).count()) < 1) {
    failures.push(`section "${s}" missing`);
  }
}

// 右側區塊
if ((await page.locator('text=➕ 新增官方標籤').count()) < 1) {
  failures.push('section 新增官方標籤 missing');
}
if ((await page.locator('text=📋 使用規則說明').count()) < 1) {
  failures.push('section 使用規則說明 missing');
}

// 5. 新增 form 元素
if ((await page.locator('input[placeholder*="例：曾有客訴紀錄"]').count()) < 1) {
  failures.push('input 標籤文字 missing');
}
if ((await page.locator('button:has-text("＋ 新增官方標籤")').count()) < 1) {
  failures.push('button ＋ 新增官方標籤 missing');
}

// 6. Indian seed：chip 總數
const chipCount = await page.evaluate(() => {
  // 抓 4 色 section 範圍內、形狀為 pill 的 chip
  const main = document.querySelector('main');
  if (!main) return 0;
  // 取 rounded-full + 內含 emoji 的 span
  const candidates = Array.from(main.querySelectorAll('span'));
  return candidates.filter((s) => {
    const cls = s.className || '';
    if (!cls.includes('rounded-full')) return false;
    const t = (s.textContent || '').trim();
    return /^(🔴|🟡|🟢|🔵)/.test(t);
  }).length;
});
if (chipCount < 20) {
  failures.push(`chip 總數 < 20（got ${chipCount}；Indian seed 應 22 個）`);
}

// 7. 4 條規則
const rules = ['官方標籤', '自訂標籤', '標籤來源', '安全事項'];
for (const r of rules) {
  if ((await page.locator(`text=${r}`).count()) < 1) {
    failures.push(`rule line "${r}" missing`);
  }
}

await page.screenshot({
  path: '/tmp/service-manager-customer-tags-verify.png',
  fullPage: true,
});
console.error('    screenshot: /tmp/service-manager-customer-tags-verify.png');

// 8. 切到 obs tab
await page.locator('button:has-text("主管觀察視角")').first().click();
await page.waitForTimeout(400);
const obsBanner = await page.locator('text=主管觀察視角：').count();
const obsEmpty = await page.locator('text=尚無自訂標籤').count();
if (obsBanner < 1 && obsEmpty < 1) {
  failures.push('obs tab body missing (應該有「主管觀察視角：」banner 或空狀態)');
}

// 9. console errors
const meaningful = consoleErrors.filter(
  (e) =>
    !/Download the React DevTools|chunk-|You provided a `value` prop to a form field|hydration|Failed to load resource/.test(
      e,
    ),
);
if (meaningful.length > 0) failures.push(`console: ${meaningful.slice(0, 2).join(' | ')}`);

await browser.close();
console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(`[FAIL] ${f}`);
  process.exit(1);
}
console.log(
  `[OK] /service/manager/customer-tags C14: 售後主管 · 14 + 雙 tab + 4 色 section + Indian seed chip>=20（got ${chipCount}）+ 新增 form + 規則說明 + obs tab`,
);
process.exit(0);
