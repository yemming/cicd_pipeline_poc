#!/usr/bin/env node
/**
 * Playwright headless login helper — 給 VPS / CI / sub-agent 在沒有 dev session cookies
 * 的環境用。產出 storageState 給後續 Playwright script 重用，避免每支 script 都自己登一次。
 *
 * Usage:
 *   node scripts/pw-login.mjs              # 一律重新登入，覆寫 state
 *   node scripts/pw-login.mjs --ensure     # state 有效就 reuse；無效或不存在才登入
 *   node scripts/pw-login.mjs --check      # 只檢查 state 是否有效，不重登。exit 0=有效 / 1=無效
 *
 * Output: stdout 印 JSON 摘要，stderr 印 step log。exit 0=成功。
 *
 * Env override（不設就用 dev-test-credentials skill 的預設值）：
 *   DEV_TEST_EMAIL=yemming.yu@gmail.com
 *   DEV_TEST_PASSWORD=yemming.yu@gmail.com
 *   APP_BASE_URL=http://localhost:3000
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(__dirname, '.pw-state.json');

const args = new Set(process.argv.slice(2));
const MODE = args.has('--check') ? 'check' : args.has('--ensure') ? 'ensure' : 'force';

function loadDotEnv() {
  try {
    const txt = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    return Object.fromEntries(
      txt
        .split('\n')
        .filter((l) => l && !l.trim().startsWith('#') && l.includes('='))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

const env = loadDotEnv();
const APP_BASE = process.env.APP_BASE_URL || env.APP_BASE_URL || 'http://localhost:3000';
// 帳密以 dev-test-credentials skill 為單一事實來源；不從 .env.local 讀（那邊的 PASSWORD 是別的 secret）
const EMAIL = process.env.DEV_TEST_EMAIL || env.DEV_TEST_EMAIL || 'yemming.yu@gmail.com';
const PASSWORD = process.env.DEV_TEST_PASSWORD || env.DEV_TEST_PASSWORD || 'yemming.yu@gmail.com';

const log = (...m) => console.error('[pw-login]', ...m);

async function probe(stateFile) {
  // 用 state.json 開 page，goto 一個需要登入的頁面，看會不會被踢回 /login
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ storageState: stateFile });
    const page = await ctx.newPage();
    const probeUrl = `${APP_BASE}/dashboard`;
    const resp = await page.goto(probeUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const finalUrl = page.url();
    const status = resp?.status() ?? 0;
    const ok = !finalUrl.includes('/login') && status < 400;
    return { ok, status, finalUrl };
  } finally {
    await browser.close();
  }
}

async function login() {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    log('goto /login');
    await page.goto(`${APP_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });

    log('fill email + password');
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);

    log('submit');
    await Promise.all([
      page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 }),
      page.locator('button[type="submit"]').click(),
    ]);

    const finalUrl = page.url();
    log('redirected to', finalUrl);

    if (finalUrl.includes('/login')) {
      throw new Error(`still on /login after submit (final=${finalUrl})`);
    }

    await ctx.storageState({ path: STATE_FILE });
    log('storage state written →', STATE_FILE);
    return { finalUrl };
  } finally {
    await browser.close();
  }
}

async function main() {
  const stateExists = fs.existsSync(STATE_FILE);

  if (MODE === 'check') {
    if (!stateExists) {
      console.log(JSON.stringify({ ok: false, reason: 'state_missing' }));
      process.exit(1);
    }
    const result = await probe(STATE_FILE);
    console.log(JSON.stringify({ ok: result.ok, ...result }));
    process.exit(result.ok ? 0 : 1);
  }

  if (MODE === 'ensure' && stateExists) {
    log('state exists, probing...');
    try {
      const result = await probe(STATE_FILE);
      if (result.ok) {
        log('state still valid, skip login');
        console.log(JSON.stringify({ ok: true, action: 'reused', ...result, stateFile: STATE_FILE }));
        return;
      }
      log('state stale (', result.finalUrl, '), re-login');
    } catch (err) {
      log('probe failed:', err?.message || err, '— re-login');
    }
  }

  const { finalUrl } = await login();
  console.log(JSON.stringify({ ok: true, action: 'logged_in', finalUrl, stateFile: STATE_FILE }));
}

main().catch((err) => {
  log('FAILED:', err?.stack || err);
  console.log(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  process.exit(1);
});
