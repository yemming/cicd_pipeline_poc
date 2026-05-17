/**
 * verify-vin-verify.mjs
 *
 * BDN #12 第三輪 — RS06 中古車評估鑑價 OCR VIN / 引擎號一致性驗證提示
 *
 * 場景：
 *   A. 兩邊 VIN 都填且一致 → 沒 banner
 *   B. 填不一致 → 黃 banner 出現
 *   C. 清空一邊 → banner 消失
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
page.on('console', (m) => {
  if (m.type() === 'error') {
    const t = m.text();
    if (!/DevTools|chunk-|Hydration|Each child/.test(t)) {
      console.error('  [console.error]', t.slice(0, 200));
    }
  }
});

const TMP = path.join(ROOT, 'tmp');
fs.mkdirSync(TMP, { recursive: true });

const ROUTE = '/usedcar/evaluation';
console.error(`\n→ 開啟 ${ROUTE}`);
const resp = await page.goto(`${APP_BASE}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
if (resp.status() !== 200) failures.push(`route status ${resp.status()}`);
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

// 確認 tab 0 已開啟、scan grid 在頁上
const scanGrid = page.locator('[data-testid="evaluation-scan-grid"]');
if ((await scanGrid.count()) < 1) failures.push('scan grid not found');

const vinInput = page.locator('input[placeholder="ZDM...（17碼）"]');
const engineInput = page.locator('input[placeholder="引擎號碼"]');
const banner = page.locator('[data-testid="evaluation-vin-mismatch-banner"]');

// ─── 場景 A：兩邊 VIN 都填且一致 → 沒 banner ───
console.error('\n[場景 A] 一致 → 沒 banner');
await vinInput.fill('ZDM14BWW7MB123456');
// 觸發 Demo OCR 行照（同時填 VIN + engine）
await page.locator('[data-testid="evaluation-demo-ocr-0"]').click();
await page.waitForTimeout(300);
await engineInput.fill('ZDM1218 0012345');
await page.waitForTimeout(500);
const bannerAfterA = await banner.count();
if (bannerAfterA !== 0) failures.push(`[A] banner should be hidden, got count=${bannerAfterA}`);
await page.screenshot({ path: path.join(TMP, 'bdn12-A-consistent.png'), fullPage: true });
console.error('  截圖 → tmp/bdn12-A-consistent.png  banner_count=' + bannerAfterA);

// ─── 場景 B：填不一致 → 黃 banner 出現 ───
console.error('\n[場景 B] 不一致 → banner 出現');
await vinInput.fill('ZDM14BWW7MB999999'); // 改成不一致
await page.waitForTimeout(500);
const bannerAfterB = await banner.count();
if (bannerAfterB !== 1) failures.push(`[B] banner should show, got count=${bannerAfterB}`);
const bannerText = (await banner.textContent()) ?? '';
if (!bannerText.includes('不一致')) failures.push(`[B] banner text wrong: ${bannerText.slice(0, 80)}`);
// 驗 amber 色票（FDF3E3）
const bg = await banner.evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '');
// rgb(253, 243, 227) === #FDF3E3
if (!bg.includes('253, 243, 227')) {
  console.error(`  warn: banner bg-color = ${bg}（預期 rgb(253,243,227)）`);
}
await page.screenshot({ path: path.join(TMP, 'bdn12-B-mismatch.png'), fullPage: true });
console.error('  截圖 → tmp/bdn12-B-mismatch.png  banner_count=' + bannerAfterB);

// ─── 場景 C：清空一邊 → banner 消失 ───
console.error('\n[場景 C] 清空 VIN → banner 消失');
await vinInput.fill('');
await page.waitForTimeout(500);
const bannerAfterC = await banner.count();
// 引擎號還是一致的（demoOcr 行照填的是 'ZDM1218 0012345'，engineInput 也是同字串）
// 所以清空 VIN 後 vinMismatch=false、engineMismatch=false → banner 整個消失
if (bannerAfterC !== 0) failures.push(`[C] banner should be hidden after clearing VIN, got count=${bannerAfterC}`);
await page.screenshot({ path: path.join(TMP, 'bdn12-C-empty.png'), fullPage: true });
console.error('  截圖 → tmp/bdn12-C-empty.png  banner_count=' + bannerAfterC);

// ─── 場景 D（bonus）：引擎號不一致 → banner 只顯示引擎號那行 ───
console.error('\n[場景 D bonus] 只有引擎號不一致');
await vinInput.fill('ZDM14BWW7MB123456'); // 一致
await engineInput.fill('ZDM9999 9999999'); // 改成不一致
await page.waitForTimeout(500);
const vinDetail = await page.locator('[data-testid="evaluation-vin-mismatch-detail-vin"]').count();
const engDetail = await page.locator('[data-testid="evaluation-vin-mismatch-detail-engine"]').count();
if (vinDetail !== 0) failures.push(`[D] VIN detail should hidden, got ${vinDetail}`);
if (engDetail !== 1) failures.push(`[D] engine detail should show, got ${engDetail}`);
await page.screenshot({ path: path.join(TMP, 'bdn12-D-engine-only.png'), fullPage: true });
console.error('  截圖 → tmp/bdn12-D-engine-only.png  vin_detail=' + vinDetail + ' eng_detail=' + engDetail);

await browser.close();

if (failures.length > 0) {
  console.error('\n❌ FAILURES:');
  for (const f of failures) console.error('  -', f);
  process.exit(1);
}
console.error('\n✅ 全部場景通過');
