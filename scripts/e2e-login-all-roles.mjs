#!/usr/bin/env node
// @ts-check
/**
 * 第十一輪 E2E 基建 — Batch A3
 *
 * 一次搞定 8 個業務 persona 的測試帳號生命週期：
 *   1) 用 Supabase Admin API 建/確保 8 個帳號（密碼已知、email_confirm）
 *   2) 指派 RBAC 角色，scope = Indian brand（idempotent：先刪後插）
 *   3) 起一個臨時 Playwright（單一 browser、序列 8 context）逐一登入
 *      → 產出 8 個 storageState JSON 給 playwright.config.ts 的 chromium-{role} project 吃
 *
 * 跑法：
 *   node --env-file=.env.local scripts/e2e-login-all-roles.mjs            # 完整跑（建帳號→指派→登入）
 *   node --env-file=.env.local scripts/e2e-login-all-roles.mjs --refresh  # 只重跑登入產 storageState（給每 ~50 分鐘刷 token 用）
 *
 * 前置：
 *   - dev server 必須已在 BASE_URL（預設 http://localhost:3000）跑著（BRAND_KEY=indian npm run dev -- -p 3000）
 *   - chromium binary 已下載（npx playwright install chromium）
 *
 * ⚠️ OOM 紀律：本腳本只開「單一 browser、序列 8 個 context」，絕不並行開 8 個 Chromium。
 */

import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

// ─── 設定常數 ──────────────────────────────────────────────────────────────

const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "E2eDealer!2026";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const AUTH_DIR = resolve(PROJECT_ROOT, "tests/e2e/.auth");

// email TLD：預設 .test，若 Admin API 嫌棄會自動 fallback 到 .example.com（見 ensureUser）
const PRIMARY_DOMAIN = "dealeros.test";
const FALLBACK_DOMAIN = "example.com";

/**
 * persona key（= storageState 檔名）→ DB role_id 對映。
 * 跟 playwright.config.ts 的 E2E_ROLES 一字不差。
 */
const PERSONAS = [
  { key: "rs_manager", roleId: "rs_manager" },
  { key: "sales_lead", roleId: "sales_lead" },
  { key: "crm_agent", roleId: "crm_agent" },
  { key: "sa", roleId: "service_advisor" },
  { key: "tech", roleId: "technician" },
  { key: "aftersales_lead", roleId: "aftersales_lead" },
  { key: "warehouse", roleId: "warehouse" },
  { key: "stock_lead", roleId: "stock_lead" },
];

const SCOPE_TYPE = "brand";
const SCOPE_ID = "indian";

// ─── env 載入（--env-file 沒帶時自己 fallback parse .env.local）────────────

/** @returns {Record<string,string>} */
function loadEnvFallback() {
  const out = {};
  const envPath = resolve(PROJECT_ROOT, ".env.local");
  if (!existsSync(envPath)) return out;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    // 去掉包覆引號
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabaseUrl = SUPABASE_URL;
let serviceKey = SERVICE_KEY;

if (!supabaseUrl || !serviceKey) {
  const fb = loadEnvFallback();
  supabaseUrl = supabaseUrl || fb.NEXT_PUBLIC_SUPABASE_URL;
  serviceKey = serviceKey || fb.SUPABASE_SERVICE_ROLE_KEY;
}

if (!supabaseUrl || !serviceKey) {
  console.error(
    "[fatal] 缺 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY。" +
      "請用 `node --env-file=.env.local scripts/e2e-login-all-roles.mjs` 跑。"
  );
  process.exit(1);
}

const REFRESH_ONLY = process.argv.includes("--refresh");

// service role client — bypass RLS
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Step 3 · 建/確保帳號 ──────────────────────────────────────────────────

/**
 * 取得全部既有 users（分頁撈完），回 email(lowercase) → id 的 Map。
 * @returns {Promise<Map<string,string>>}
 */
async function listAllUsers() {
  /** @type {Map<string,string>} */
  const map = new Map();
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers 失敗: ${error.message}`);
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.email) map.set(u.email.toLowerCase(), u.id);
    }
    if (users.length < perPage) break;
    page += 1;
  }
  return map;
}

/**
 * 確保一個 persona 帳號存在且密碼為 E2E_PASSWORD。
 * 回傳 { email, userId, created, domain }
 * @param {{key:string}} persona
 * @param {Map<string,string>} existing  email(lowercase) → id
 */
async function ensureUser(persona, existing) {
  // 先用 primary domain；若該 email 已存在（任一 domain）就沿用
  const primaryEmail = `e2e-${persona.key}@${PRIMARY_DOMAIN}`;
  const fallbackEmail = `e2e-${persona.key}@${FALLBACK_DOMAIN}`;

  const existingPrimary = existing.get(primaryEmail.toLowerCase());
  const existingFallback = existing.get(fallbackEmail.toLowerCase());

  // 已存在 → 確保密碼已知（idempotent updateUserById）
  if (existingPrimary || existingFallback) {
    const userId = existingPrimary ?? existingFallback;
    const email = existingPrimary ? primaryEmail : fallbackEmail;
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: E2E_PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`updateUserById(${email}) 失敗: ${error.message}`);
    return {
      email,
      userId,
      created: false,
      domain: existingPrimary ? PRIMARY_DOMAIN : FALLBACK_DOMAIN,
    };
  }

  // 不存在 → 建。先試 primary domain，被嫌就 fallback
  const tryCreate = async (email) =>
    admin.auth.admin.createUser({
      email,
      password: E2E_PASSWORD,
      email_confirm: true,
    });

  let { data, error } = await tryCreate(primaryEmail);
  if (error) {
    const msg = (error.message || "").toLowerCase();
    const domainRejected =
      msg.includes("invalid") ||
      msg.includes("email") ||
      msg.includes("not allowed") ||
      msg.includes("unable to validate");
    if (domainRejected) {
      console.warn(
        `[warn] primary domain 被拒（${primaryEmail}）：${error.message} → 改用 ${FALLBACK_DOMAIN}`
      );
      ({ data, error } = await tryCreate(fallbackEmail));
      if (error)
        throw new Error(`createUser(${fallbackEmail}) 也失敗: ${error.message}`);
      return {
        email: fallbackEmail,
        userId: data.user.id,
        created: true,
        domain: FALLBACK_DOMAIN,
      };
    }
    // 競態：已被別處註冊
    if (msg.includes("already") || msg.includes("registered")) {
      const refreshed = await listAllUsers();
      const id =
        refreshed.get(primaryEmail.toLowerCase()) ??
        refreshed.get(fallbackEmail.toLowerCase());
      if (!id) throw new Error(`createUser 回 already 但找不到 ${primaryEmail}`);
      await admin.auth.admin.updateUserById(id, {
        password: E2E_PASSWORD,
        email_confirm: true,
      });
      const email = refreshed.has(primaryEmail.toLowerCase())
        ? primaryEmail
        : fallbackEmail;
      return {
        email,
        userId: id,
        created: false,
        domain: email.endsWith(PRIMARY_DOMAIN) ? PRIMARY_DOMAIN : FALLBACK_DOMAIN,
      };
    }
    throw new Error(`createUser(${primaryEmail}) 失敗: ${error.message}`);
  }
  return {
    email: primaryEmail,
    userId: data.user.id,
    created: true,
    domain: PRIMARY_DOMAIN,
  };
}

// ─── Step 4 · 指派角色（idempotent）─────────────────────────────────────────

/**
 * @param {Array<{persona:{key:string,roleId:string}, userId:string}>} assignments
 */
async function assignRoles(assignments) {
  const userIds = assignments.map((a) => a.userId);

  // 先刪這 8 個 user 的所有指派（service role bypass RLS）
  const { error: delErr } = await admin
    .from("user_assignments")
    .delete()
    .in("user_id", userIds);
  if (delErr) throw new Error(`刪舊指派失敗: ${delErr.message}`);

  // 重新插 8 筆 brand/indian
  const rows = assignments.map((a) => ({
    user_id: a.userId,
    role_id: a.persona.roleId,
    scope_type: SCOPE_TYPE,
    scope_id: SCOPE_ID,
    notes: "E2E test account (Batch A3)",
  }));
  const { error: insErr } = await admin.from("user_assignments").insert(rows);
  if (insErr) throw new Error(`插新指派失敗: ${insErr.message}`);
}

/**
 * 確保 8 個 persona 的 profile_brands 都掛在 brand/indian。
 *
 * ⚠️ 為什麼必要：RLS 的 user_has_brand(text) 讀的是 profile_brands
 * （user_id = auth.uid() AND brand_id），不是 user_assignments（後者只管 RBAC scope）。
 * 漏塞 profile_brands → 所有 RLS-gated 表對 e2e persona 全空（畫面看起來像功能壞掉）。
 *
 * 用 upsert + ignoreDuplicates（PK = user_id, brand_id）：idempotent、不刪既有 row、
 * 重建帳號 / 重產 storageState 時都能保證 brand 歸屬不掉。
 * @param {Array<{userId:string}>} assignments
 */
async function ensureProfileBrands(assignments) {
  const rows = assignments.map((a) => ({
    user_id: a.userId,
    brand_id: SCOPE_ID, // 'indian'
    role: "member", // profile_brands_role_check 只允許 'member' | 'admin'
  }));
  const { error } = await admin
    .from("profile_brands")
    .upsert(rows, { onConflict: "user_id,brand_id", ignoreDuplicates: true });
  if (error) throw new Error(`upsert profile_brands 失敗: ${error.message}`);
}

// ─── Step 5 · Playwright 序列登入產 storageState ────────────────────────────

/**
 * @param {Array<{persona:{key:string}, email:string}>} accounts
 * @returns {Promise<Array<{key:string, ok:boolean, reason?:string, fileSize?:number, cookieCount?:number}>>}
 */
async function loginAll(accounts) {
  mkdirSync(AUTH_DIR, { recursive: true });

  const results = [];
  const browser = await chromium.launch({ headless: true });
  try {
    // 序列 — 一次一個 context，避免多 Chromium OOM
    for (const acc of accounts) {
      const { key, email } = acc;
      const statePath = resolve(AUTH_DIR, `${key}.json`);
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await page.goto(`${BASE_URL}/login`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await page.locator('input[type="email"]').fill(email);
        await page.locator('input[type="password"]').fill(E2E_PASSWORD);
        await page.locator('button[type="submit"]').click();

        // 成功訊號：離開 /login
        await page.waitForURL((u) => !u.pathname.endsWith("/login"), {
          timeout: 20_000,
        });

        // 保險：cookie 裡有 sb- 開頭 auth cookie
        const cookies = await context.cookies();
        const sbCookies = cookies.filter((c) => c.name.startsWith("sb-"));
        if (sbCookies.length === 0) {
          throw new Error("離開 /login 但沒有 sb- auth cookie");
        }

        await context.storageState({ path: statePath });
        const sz = statSync(statePath).size;
        results.push({
          key,
          ok: true,
          fileSize: sz,
          cookieCount: cookies.length,
        });
        console.log(
          `  ✓ ${key.padEnd(16)} ${email.padEnd(34)} → ${key}.json (${sz}B, ${cookies.length} cookies)`
        );
      } catch (err) {
        // 嘗試抓畫面上的「登入失敗」文字當原因
        let reason = err instanceof Error ? err.message : String(err);
        try {
          const failVisible = await page
            .getByText("登入失敗")
            .isVisible()
            .catch(() => false);
          if (failVisible) {
            const errText = await page
              .locator(".bg-error-container")
              .first()
              .innerText()
              .catch(() => "");
            reason = `登入失敗：${errText || "(畫面顯示登入失敗)"}`;
          }
        } catch {
          /* ignore */
        }
        results.push({ key, ok: false, reason });
        console.error(`  ✗ ${key.padEnd(16)} ${email.padEnd(34)} → ${reason}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(72));
  console.log(
    `[A3] E2E login all roles ${REFRESH_ONLY ? "(--refresh: 只產 storageState)" : "(完整：建帳號→指派→登入)"}`
  );
  console.log(`     Supabase: ${supabaseUrl}`);
  console.log(`     BASE_URL: ${BASE_URL}`);
  console.log("═".repeat(72));

  // 拿到每個 persona 的 email + userId
  /** @type {Array<{persona:{key:string,roleId:string}, email:string, userId:string, created:boolean, domain:string}>} */
  let accounts = [];

  if (REFRESH_ONLY) {
    // refresh 模式：只查 email→id，不建、不指派
    const existing = await listAllUsers();
    for (const persona of PERSONAS) {
      const primaryEmail = `e2e-${persona.key}@${PRIMARY_DOMAIN}`;
      const fallbackEmail = `e2e-${persona.key}@${FALLBACK_DOMAIN}`;
      const id =
        existing.get(primaryEmail.toLowerCase()) ??
        existing.get(fallbackEmail.toLowerCase());
      if (!id) {
        console.error(
          `[fatal] --refresh 模式但找不到 ${persona.key} 帳號。先跑一次完整模式。`
        );
        process.exit(1);
      }
      const email = existing.has(primaryEmail.toLowerCase())
        ? primaryEmail
        : fallbackEmail;
      accounts.push({
        persona,
        email,
        userId: id,
        created: false,
        domain: email.endsWith(PRIMARY_DOMAIN) ? PRIMARY_DOMAIN : FALLBACK_DOMAIN,
      });
    }
  } else {
    console.log("\n[1/3] 建/確保 8 個帳號 …");
    const existing = await listAllUsers();
    for (const persona of PERSONAS) {
      const r = await ensureUser(persona, existing);
      accounts.push({ persona, ...r });
      console.log(
        `  ${r.created ? "＋建立" : "＝已存在"} ${persona.key.padEnd(16)} ${r.email.padEnd(34)} id…${r.userId.slice(-4)}`
      );
    }

    console.log("\n[2/3] 指派角色 → scope brand/indian（先刪後插）…");
    await assignRoles(accounts.map((a) => ({ persona: a.persona, userId: a.userId })));
    console.log(`  ✓ 已寫 ${accounts.length} 筆 user_assignments`);

    // RLS 歸屬：profile_brands（user_has_brand 靠這張，非 user_assignments）
    await ensureProfileBrands(accounts.map((a) => ({ userId: a.userId })));
    console.log(`  ✓ 已確保 ${accounts.length} 筆 profile_brands（brand/indian）`);
  }

  console.log(`\n[${REFRESH_ONLY ? "1/1" : "3/3"}] Playwright 序列登入產 storageState …`);
  const results = await loginAll(
    accounts.map((a) => ({ persona: a.persona, key: a.persona.key, email: a.email }))
  );

  // ─── Summary ───────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(72));
  console.log("Summary");
  console.log("─".repeat(72));
  const domainsUsed = new Set(accounts.map((a) => a.domain));
  console.log(`  email domain 用了：${[...domainsUsed].join(", ")}`);
  let failCount = 0;
  for (const r of results) {
    if (r.ok) {
      console.log(`  ✓ ${r.key.padEnd(16)} ${r.fileSize}B, ${r.cookieCount} cookies`);
    } else {
      failCount += 1;
      console.log(`  ✗ ${r.key.padEnd(16)} ${r.reason}`);
    }
  }
  console.log("─".repeat(72));
  console.log(`  ${results.length - failCount}/${results.length} 成功`);
  console.log("═".repeat(72));

  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\n[fatal]", err instanceof Error ? err.stack : err);
  process.exit(1);
});
