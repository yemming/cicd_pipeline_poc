/**
 * Parts 路由 smoke test
 *
 * 流程：
 * 1) 用 SERVICE_ROLE 走 admin/generate_link 取得 magic link，再 verify 取得 access_token / refresh_token
 * 2) 把 session 包成 @supabase/ssr 期待的 cookie 格式（sb-<ref>-auth-token，base64-）
 * 3) 對 53 條 /parts/* 路由做 fetch（帶 cookie）
 * 4) 印出結果 table
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 簡單讀 .env.local
const envText = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = 'yemming.yu@gmail.com';
const APP_BASE = 'http://localhost:3000';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SERVICE_KEY');
  process.exit(1);
}

const projectRef = new URL(SUPABASE_URL).host.split('.')[0];
const COOKIE_NAME = `sb-${projectRef}-auth-token`;

// 1) 取得 session
console.error('[1/3] Generating magic link via admin API...');
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
  console.error('generate_link failed:', genRes.status, await genRes.text());
  process.exit(1);
}
const genData = await genRes.json();
const hashedToken = genData.properties?.hashed_token || genData.hashed_token;
if (!hashedToken) {
  console.error('No hashed_token in response:', genData);
  process.exit(1);
}

console.error('[2/3] Verifying token to get session...');
const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify?type=magiclink&token=${hashedToken}&redirect_to=${encodeURIComponent(APP_BASE)}`, {
  method: 'GET',
  redirect: 'manual',
  headers: { apikey: ANON_KEY },
});

// verify 回 302 redirect to /#access_token=...&refresh_token=...
let accessToken, refreshToken, expiresIn, expiresAt, tokenType, providerToken, providerRefreshToken;
const loc = verifyRes.headers.get('location');
if (loc) {
  const hashIdx = loc.indexOf('#');
  if (hashIdx >= 0) {
    const params = new URLSearchParams(loc.slice(hashIdx + 1));
    accessToken = params.get('access_token');
    refreshToken = params.get('refresh_token');
    expiresIn = Number(params.get('expires_in') || 3600);
    expiresAt = Number(params.get('expires_at') || (Math.floor(Date.now() / 1000) + expiresIn));
    tokenType = params.get('token_type') || 'bearer';
    providerToken = params.get('provider_token');
    providerRefreshToken = params.get('provider_refresh_token');
  }
}
if (!accessToken) {
  // 也許用 verifyOtp endpoint
  const vrJson = await verifyRes.json().catch(() => ({}));
  console.error('verify response (no Location header):', verifyRes.status, vrJson);
  process.exit(1);
}

// 解 user 資料
const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
  headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
});
const user = await userRes.json();

// 3) 組成 @supabase/ssr cookie
// supabase/ssr v0.5+ uses base64- prefix + JSON-stringified session
const session = {
  access_token: accessToken,
  refresh_token: refreshToken,
  expires_in: expiresIn,
  expires_at: expiresAt,
  token_type: tokenType,
  user,
  provider_token: providerToken ?? null,
  provider_refresh_token: providerRefreshToken ?? null,
};
const sessionJson = JSON.stringify(session);
const cookieValue = 'base64-' + Buffer.from(sessionJson).toString('base64');

// supabase/ssr 會把長 cookie 切片（每片 ~3180 bytes 用 .0 .1 後綴），
// 但 ssr 的 getAll() 會自動拼接。對應的我們需要切片 set。
const CHUNK_SIZE = 3180;
const cookieParts = [];
for (let i = 0; i < cookieValue.length; i += CHUNK_SIZE) {
  cookieParts.push(cookieValue.slice(i, i + CHUNK_SIZE));
}

let cookieHeader;
if (cookieParts.length === 1) {
  cookieHeader = `${COOKIE_NAME}=${encodeURIComponent(cookieParts[0])}`;
} else {
  cookieHeader = cookieParts
    .map((part, idx) => `${COOKIE_NAME}.${idx}=${encodeURIComponent(part)}`)
    .join('; ');
}

console.error(`[3/3] Got session for ${user?.email}, cookie ${cookieParts.length} chunk(s), starting smoke test...`);

// 4) 53 條路由
const ROUTES = [
  '/parts',
  '/parts/overview/flow',
  '/parts/setup/org',
  '/parts/setup/purchase-permissions',
  '/parts/setup/item-permissions',
  '/parts/setup/count-rules',
  '/parts/setup/control-types',
  '/parts/setup/warehouse-arch',
  '/parts/setup/warehouse-bins',
  '/parts/setup/suppliers',
  '/parts/setup/contracts',
  '/parts/setup/items',
  '/parts/setup/items-info',
  '/parts/setup/serial',
  '/parts/setup/compatibility',
  '/parts/setup/pricing',
  '/parts/purchase/flow',
  '/parts/purchase/requisitions',
  '/parts/purchase/replenishment',
  '/parts/purchase/orders',
  '/parts/purchase/returns',
  '/parts/receipt/po-grn',
  '/parts/receipt/transfer-in',
  '/parts/receipt/internal-sale',
  '/parts/receipt/return-in',
  '/parts/issue/repair-pick',
  '/parts/issue/transfer-out',
  '/parts/issue/internal-sale',
  '/parts/operations/balance',
  '/parts/operations/receipts-history',
  '/parts/operations/transfers-in-transit',
  '/parts/operations/exceptions',
  '/parts/operations/consignment',
  '/parts/operations/adjust',
  '/parts/operations/count-ops',
  '/parts/count/plans',
  '/parts/count/sessions',
  '/parts/count/adjustments',
  '/parts/alerts/thresholds',
  '/parts/alerts/rules',
  '/parts/alerts/escalation',
  '/parts/alerts/work-order-loop',
  '/parts/warranty/flow',
  '/parts/warranty/ro-link',
  '/parts/warranty/used-parts',
  '/parts/warranty/used-parts-flow',
  '/parts/warranty/staging-warehouse',
  '/parts/warranty/cost-recovery',
  '/parts/analytics/abc-structure',
  '/parts/analytics/abc',
  '/parts/analytics/abc-settings',
  '/parts/analytics/stale',
  '/parts/analytics/turnover',
];

// 並行批次 fetch
async function checkRoute(route) {
  try {
    const res = await fetch(`${APP_BASE}${route}`, {
      headers: { Cookie: cookieHeader },
      redirect: 'manual',
    });
    let bodyPreview = '';
    let hasError = false;
    let titleMatch = '';
    let bodyBytes = 0;
    let hasMain = false;
    if (res.status === 200) {
      const body = await res.text();
      bodyBytes = body.length;
      // Quick grep for build errors
      const errPatterns = [
        /Application error/i,
        /\bUnhandled Runtime Error\b/,
        /\bModuleNotFoundError\b/,
        /\bReferenceError:\s/,
        /\bTypeError:\s/,
        /\bSyntaxError:\s/,
        /Failed to compile/i,
        /Internal Server Error/i,
      ];
      for (const pat of errPatterns) {
        if (pat.test(body)) {
          hasError = true;
          const m = body.match(pat);
          bodyPreview = m ? m[0] : '';
          break;
        }
      }
      const t = body.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (t) titleMatch = t[1].trim().slice(0, 60);
      // 確認頁面內容真有 render（不是只有空殼）
      hasMain = /<main[\s>]/i.test(body) || /min-w-\[1100px\]|stub-action|partsAction|page-header|module-rail/i.test(body);
      if (!hasMain && !hasError) {
        hasError = true;
        bodyPreview = `200 但找不到 main/shell 標記 (size=${bodyBytes})`;
      }
    } else if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location') || '';
      bodyPreview = `redirect → ${loc}`;
    } else {
      // 5xx
      const body = await res.text().catch(() => '');
      bodyPreview = body.slice(0, 200);
    }
    return { route, status: res.status, hasError, titleMatch, bodyPreview, bodyBytes };
  } catch (err) {
    return { route, status: 0, hasError: true, titleMatch: '', bodyPreview: String(err) };
  }
}

const CONCURRENCY = 8;
const results = [];
for (let i = 0; i < ROUTES.length; i += CONCURRENCY) {
  const batch = ROUTES.slice(i, i + CONCURRENCY);
  const batchResults = await Promise.all(batch.map(checkRoute));
  results.push(...batchResults);
  console.error(`  ${i + batch.length}/${ROUTES.length}...`);
}

// 輸出 markdown table
console.log('\n## Parts 53 條路由 smoke test 結果\n');
console.log('| Route | HTTP | OK | Bytes | Note |');
console.log('|-------|------|----|------:|------|');
let okCount = 0;
let badCount = 0;
for (const r of results) {
  const ok = r.status === 200 && !r.hasError;
  if (ok) okCount++;
  else badCount++;
  const mark = ok ? '✓' : '✗';
  const note = ok ? '' : (r.bodyPreview || `status ${r.status}`);
  console.log(`| \`${r.route}\` | ${r.status} | ${mark} | ${r.bodyBytes ?? 0} | ${note.replace(/\|/g, '\\|')} |`);
}
console.log(`\n**總結**: ${okCount}/${results.length} 通過, ${badCount} 失敗\n`);

if (badCount > 0) {
  console.log('### 失敗路由詳情\n');
  for (const r of results) {
    if (r.status !== 200 || r.hasError) {
      console.log(`- \`${r.route}\` — HTTP ${r.status} — ${r.bodyPreview}`);
    }
  }
}
