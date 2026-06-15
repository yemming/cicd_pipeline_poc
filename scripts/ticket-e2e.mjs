#!/usr/bin/env node
// @ts-check
/**
 * ticket-e2e.mjs — 許願單 → 自動 E2E → 回填證據（DevOps 閉環的「執行端」）
 *
 * CI/CD pipeline 的驗收環節。一張單 = 一個需求 = 一條 route + N 條 given-when-then。
 * 這支腳本把「單據的驗收規格」變成「對部署站的真實 E2E」，跑完把結果寫回 metadata.evidence：
 *
 *   1. 用 service role 讀 feedback_tickets.<id> 的 metadata（scope.route + acceptance[]）
 *   2. Playwright 登入部署站（admin 帳號）→ goto scope.route
 *   3. 對每條 acceptance 做「可機測的部分」：
 *        - 可達性：route 載入成功、沒被踢回 /login、沒有 Next error overlay（真 smoke）
 *        - 啟發式：then 文字裡引號/關鍵詞是否出現在頁面可見文字（heuristic，非語意級）
 *   4. 截一張 scope.route 的圖存證 → tests/e2e/tickets/<shortid>.png
 *   5. 把 { sha: HEAD, e2e: {status, passed, failed, report, ran_at} } 寫回 metadata.evidence
 *
 * ⚠️ 誠實邊界：deterministic 的「可達性 smoke + 截圖存證」是全自動的；
 *    「圖表是不是圓餅圖」這種語意級驗證，啟發式只能給線索 → 標 uncertain，留給 agent/人收尾。
 *    （要語意級全自動，就把這支的 per-criterion 換成 Sonnet+Playwright agent 判讀。）
 *
 * 跑法：
 *   node --env-file=.env.local scripts/ticket-e2e.mjs <ticketId|前6碼>
 *   # env：PLAYWRIGHT_BASE_URL（預設 https://dealeros.zeabur.app）
 *   #      E2E_EMAIL / E2E_PASSWORD（預設 admin yemming.yu@gmail.com，帳密相同）
 *   #      TICKET_E2E_HEADED=1 看畫面跑
 */

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

const BASE_URL = (process.env.PLAYWRIGHT_BASE_URL ?? "https://dealeros.zeabur.app").replace(/\/+$/, "");
const EMAIL = process.env.E2E_EMAIL ?? "yemming.yu@gmail.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "yemming.yu@gmail.com";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const ticketArg = process.argv[2];
if (!ticketArg) die("用法：node --env-file=.env.local scripts/ticket-e2e.mjs <ticketId|前6碼>");
if (!SUPABASE_URL || !SERVICE_KEY) die("缺 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（用 --env-file=.env.local）");

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** 取 git HEAD short sha（拿不到不致命） */
function headSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: PROJECT_ROOT }).toString().trim();
  } catch {
    return null;
  }
}

/** 從 then 文字抽「引號內字串」或長度≥2的中文詞當啟發式關鍵詞 */
function keywordsFromThen(then) {
  const quoted = [...then.matchAll(/[「"'『]([^」"'』]{2,})[」"'』]/g)].map((m) => m[1].trim());
  if (quoted.length > 0) return quoted;
  // 沒引號：取「狀態變XXX」「顯示XXX」這類常見斷言的尾詞
  const m = then.match(/(?:變成?|顯示為?|出現|為)\s*([一-龥A-Za-z0-9]{2,12})/);
  return m ? [m[1]] : [];
}

async function main() {
  // 1. 讀單據（id 是 uuid 不能 ILIKE → 抓回來用 JS 前綴比對；POC 單據量小）
  let ticket;
  if (ticketArg.length === 36) {
    const { data, error } = await sb
      .from("feedback_tickets")
      .select("id, title, status, metadata")
      .eq("id", ticketArg)
      .maybeSingle();
    if (error) die(`讀單據失敗：${error.message}`);
    ticket = data;
  } else {
    const { data, error } = await sb
      .from("feedback_tickets")
      .select("id, title, status, metadata")
      .limit(500);
    if (error) die(`讀單據失敗：${error.message}`);
    const matched = (data ?? []).filter((t) => t.id.startsWith(ticketArg));
    if (matched.length > 1) die(`前綴 ${ticketArg} 對到多筆，請給更長的 id`);
    ticket = matched[0];
  }
  if (!ticket) die(`找不到單據 ${ticketArg}`);
  const meta = ticket.metadata ?? {};
  const scope = meta.scope ?? null;
  const acceptance = Array.isArray(meta.acceptance) ? meta.acceptance : [];

  console.log(`\n📋 #${ticket.id.slice(0, 8)} ${ticket.title}`);
  console.log(`   範圍：${scope?.route ?? "（未設定 scope.route）"}`);
  console.log(`   驗收條件：${acceptance.length} 條\n`);

  if (!scope?.route) die("此單沒有 scope.route，無法 E2E（請先補範圍）");

  const targetUrl = scope.route.startsWith("http") ? scope.route : `${BASE_URL}${scope.route}`;

  // 2. Playwright：單一 browser、單 context（OOM 紀律）
  const browser = await chromium.launch({ headless: process.env.TICKET_E2E_HEADED !== "1" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const results = [];
  let smokeOk = false;
  let shotPath = null;

  try {
    // 登入
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    // 只等 URL 離開 /login（commit 即可，不等 dashboard 全部資源 load 完，否則 prod 重頁面會 timeout）
    await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45000, waitUntil: "commit" });
    await page.waitForLoadState("domcontentloaded").catch(() => {});

    // goto scope.route
    const resp = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1500); // 給 client render

    // smoke：沒被踢回 login、沒有 Next error overlay
    const bouncedToLogin = page.url().includes("/login");
    const httpOk = !resp || resp.status() < 400;
    const hasErrorOverlay = await page
      .locator("text=/Application error|Unhandled Runtime Error|This page could not be found/i")
      .count()
      .then((c) => c > 0)
      .catch(() => false);
    smokeOk = httpOk && !bouncedToLogin && !hasErrorOverlay;

    // 截圖存證
    mkdirSync(resolve(PROJECT_ROOT, "tests/e2e/tickets"), { recursive: true });
    shotPath = `tests/e2e/tickets/${ticket.id.slice(0, 8)}.png`;
    await page.screenshot({ path: resolve(PROJECT_ROOT, shotPath), fullPage: true });

    // 頁面可見文字（給啟發式比對）
    const bodyText = (await page.locator("body").innerText().catch(() => "")) || "";

    // 3. 逐條 acceptance：啟發式判讀
    for (const c of acceptance) {
      const then = (c.then ?? "").toString();
      const kws = keywordsFromThen(then);
      let verdict;
      if (!smokeOk) {
        verdict = { status: "fail", note: "頁面無法正常開啟（smoke 失敗）" };
      } else if (kws.length === 0) {
        verdict = { status: "uncertain", note: "then 無可機測關鍵詞，需 agent/人語意判讀" };
      } else {
        const hit = kws.filter((k) => bodyText.includes(k));
        verdict =
          hit.length === kws.length
            ? { status: "pass", note: `頁面含關鍵詞：${hit.join("、")}` }
            : { status: "uncertain", note: `關鍵詞未全部命中（${hit.join("、") || "無"}）需語意判讀` };
      }
      results.push({ id: c.id ?? "", then, ...verdict });
      console.log(`   ${verdict.status === "pass" ? "✓" : verdict.status === "fail" ? "✗" : "?"} ${c.id ?? ""} ${then.slice(0, 40)} — ${verdict.note}`);
    }
  } catch (e) {
    console.error("   ✗ E2E 執行錯誤：", e instanceof Error ? e.message : e);
    smokeOk = false;
  } finally {
    await browser.close();
  }

  // 4. 彙總 → evidence
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const uncertain = results.filter((r) => r.status === "uncertain").length;
  // 整體狀態：smoke 掛 = fail；有 fail = fail；全 pass = pass；有 uncertain 但 smoke ok = pending（待 agent 收尾）
  const status = !smokeOk ? "fail" : failed > 0 ? "fail" : uncertain > 0 ? "pending" : acceptance.length > 0 ? "pass" : "pending";
  const report =
    `smoke：${smokeOk ? "OK" : "FAIL"}｜${passed}✓ / ${failed}✗ / ${uncertain}? ｜截圖：${shotPath ?? "無"}\n` +
    results.map((r) => `${r.id} [${r.status}] ${r.note}`).join("\n");

  const nowIso = new Date().toISOString();
  const newMeta = {
    ...meta,
    evidence: { sha: headSha(), e2e: { status, passed, failed, ran_at: nowIso, report }, updated_at: nowIso },
  };
  const { error: upErr } = await sb.from("feedback_tickets").update({ metadata: newMeta }).eq("id", ticket.id);
  if (upErr) die(`回填 evidence 失敗：${upErr.message}`);

  console.log(`\n✅ 已回填 evidence → status=${status}（${passed}✓/${failed}✗/${uncertain}?）`);
  console.log(`   截圖：${shotPath}`);
  console.log(`   詳情頁：${BASE_URL}/feedback/tickets/${ticket.id}\n`);
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
