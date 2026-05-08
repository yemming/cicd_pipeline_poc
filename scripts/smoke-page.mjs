#!/usr/bin/env node
/**
 * 對單一 /parts 頁做 fetch smoke：登入 cookie → fetch → 檢查 200 + 含預期關鍵字。
 *
 * Usage:
 *   node scripts/smoke-page.mjs <page_path> <keyword1> <keyword2> ...
 *
 * Output: JSON one-line summary。exit 0 = pass，exit 1 = fail。
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const envText = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  return Object.fromEntries(
    envText
      .split('\n')
      .filter((l) => l && !l.trim().startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = env.PLAYWRIGHT_TEST_EMAIL || 'yemming.yu@gmail.com';
const APP_BASE = env.APP_BASE_URL || 'http://localhost:3000';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(JSON.stringify({ ok: false, error: 'missing SUPABASE_URL/SERVICE_KEY' }));
  process.exit(1);
}

const [pagePath, ...keywords] = process.argv.slice(2);
if (!pagePath) {
  console.error(JSON.stringify({ ok: false, error: 'usage: smoke-page.mjs <page_path> [...keywords]' }));
  process.exit(2);
}

// 1) 取 magic link → verify 拿 access_token / refresh_token
async function getSession() {
  const linkResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email: EMAIL }),
  });
  if (!linkResp.ok) throw new Error(`generate_link ${linkResp.status}: ${await linkResp.text()}`);
  const linkData = await linkResp.json();
  const otp = linkData?.properties?.email_otp || linkData?.email_otp;
  if (!otp) throw new Error('no otp in generate_link response');

  const verifyResp = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: EMAIL, token: otp }),
  });
  if (!verifyResp.ok) throw new Error(`verify ${verifyResp.status}: ${await verifyResp.text()}`);
  const session = await verifyResp.json();
  return session;
}

// 2) 把 session 包成 @supabase/ssr 期待的 cookie 格式
function buildCookieHeader(session) {
  const ref = SUPABASE_URL.match(/https?:\/\/([^.]+)\./)?.[1];
  if (!ref) throw new Error('cannot parse ref from SUPABASE_URL');
  const cookieName = `sb-${ref}-auth-token`;
  const payload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (session.expires_in || 3600),
    expires_in: session.expires_in || 3600,
    token_type: session.token_type || 'bearer',
    user: session.user,
  };
  const value = 'base64-' + Buffer.from(JSON.stringify(payload)).toString('base64');
  return `${cookieName}=${value}`;
}

const t0 = Date.now();
let session;
try {
  session = await getSession();
} catch (err) {
  console.log(JSON.stringify({ ok: false, page_path: pagePath, error: `auth: ${err.message}` }));
  process.exit(1);
}
const cookieHeader = buildCookieHeader(session);

// 3) Fetch 目標頁
const resp = await fetch(`${APP_BASE}${pagePath}`, {
  headers: { Cookie: cookieHeader },
  redirect: 'manual',
});

const result = { ok: false, page_path: pagePath, status: resp.status, ms: Date.now() - t0 };

if (resp.status >= 300 && resp.status < 400) {
  result.error = `redirect to ${resp.headers.get('location') || '?'}`;
  console.log(JSON.stringify(result));
  process.exit(1);
}

if (resp.status !== 200) {
  const txt = await resp.text();
  result.error = `HTTP ${resp.status}: ${txt.slice(0, 200)}`;
  console.log(JSON.stringify(result));
  process.exit(1);
}

const body = await resp.text();
result.bytes = body.length;

// 錯誤偵測（同 parts-smoke-test.mjs 的 patterns）
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
    const m = body.match(pat);
    result.error = `runtime error: ${m?.[0] ?? 'unknown'}`;
    console.log(JSON.stringify(result));
    process.exit(1);
  }
}

// shell 標記
const hasMain = /<main[\s>]/i.test(body);
if (!hasMain) {
  result.error = `no <main> tag (size=${body.length})`;
  console.log(JSON.stringify(result));
  process.exit(1);
}

// 關鍵字檢查
const missing = [];
for (const kw of keywords) {
  if (!body.includes(kw)) missing.push(kw);
}
if (missing.length > 0) {
  result.error = `missing keywords: ${missing.join(', ')}`;
  console.log(JSON.stringify(result));
  process.exit(1);
}

result.ok = true;
result.matched_keywords = keywords;
console.log(JSON.stringify(result));
