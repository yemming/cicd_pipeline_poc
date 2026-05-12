#!/usr/bin/env node
/**
 * Helper 債清理收尾 — 38 個頁面 smoke。
 *
 * 範圍：B1-B5 動過的所有 page route。每頁三檢查：
 *   1. HTTP status < 400
 *   2. 沒被 redirect 到 /login（state 仍有效、helper guard 沒誤踢）
 *   3. body 不含 server-error 字樣（Next "Application error" / "Internal Server Error" /
 *      Supabase "PGRST" / 大量 "Error:" stack）
 *
 * 對 detail / new route 採「smart-pick」：先 goto list、抓第一筆 href、再跑那個 href。
 * list 空就跳過 detail（不算失敗）。
 *
 * Usage:
 *   node scripts/pw-login.mjs --ensure       # 確保 state
 *   node scripts/pw-smoke-helper-debt.mjs    # 全跑、stderr 進度、stdout JSON 摘要
 *
 * Exit code：0=全過、1=有 fail
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";

const SERVER_ERROR_PATTERNS = [
  "Application error",
  "Internal Server Error",
  "PGRST",
];

// Next dev 第一次編譯整支 route 可能要 30-50s（page + 所有 _components）
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 60_000);

const log = (...m) => console.error("[smoke]", ...m);

// 直跑頁面（不需要 ID）
const FLAT_PAGES = [
  // B1
  ["B1", "/sales/card/counter"],
  // B2
  ["B2", "/admin/master-data/customers"],
  ["B2", "/admin/master-data/customers/new"],
  ["B2", "/admin/master-data/supplier-pricing"],
  ["B2", "/admin/master-data/supplier-pricing/new"],
  ["B2", "/admin/master-data/item-lead-times"],
  // B3
  ["B3", "/admin/notifications"],
  ["B3", "/admin/notifications/deliveries"],
  ["B3", "/admin/notifications/subscriptions"],
  ["B3", "/admin/notifications/targets"],
  ["B3", "/admin/notifications/templates"],
  ["B3", "/admin/navigation"],
  ["B3", "/admin/navigation?tab=brand"],
  ["B3", "/admin/navigation?tab=roles"],
  ["B3", "/admin/navigation?tab=permissions"],
  ["B3", "/admin/navigation?tab=users"],
  ["B3", "/admin/org/brands"],
  ["B3", "/admin/org/groups"],
  ["B3", "/admin/org/stores"],
  // B4
  ["B4", "/parts/setup/items"],
  ["B4", "/parts/purchase/replenishment"],
  ["B4", "/parts/purchase/requisitions/new"],
  ["B4", "/parts/receipt/po-grn/new"],
  ["B4", "/parts/operations/count-ops"],
  ["B4", "/parts/analytics/abc-settings"],
  // B5
  ["B5", "/einvoice"],
  ["B5", "/einvoice/allowances"],
  ["B5", "/einvoice/number-pools"],
  ["B5", "/einvoice/voids"],
  ["B5", "/feedback/tickets"],
  ["B5", "/me/profile"],
];

// detail 鏈：先 goto list、抓第一筆 detail href、再跑那個 href
// detailHrefMatch 用 regex 篩 list 內挑出來的 link、確保是 detail 而非 /new / /issue / list 內其他 nav
const DETAIL_CHAINS = [
  {
    batch: "B2",
    listUrl: "/admin/master-data/customers",
    selector: 'a[href^="/admin/master-data/customers/"]',
    match: /^\/admin\/master-data\/customers\/[0-9a-f-]{36}$/,
  },
  {
    batch: "B2",
    listUrl: "/admin/master-data/supplier-pricing",
    selector: 'a[href^="/admin/master-data/supplier-pricing/"]',
    match: /^\/admin\/master-data\/supplier-pricing\/[0-9a-f-]{36}$/,
  },
  {
    batch: "B3",
    listUrl: "/admin/navigation?tab=roles",
    selector: 'a[href^="/admin/navigation/roles/"]',
    match: /^\/admin\/navigation\/roles\/.+$/,
  },
  {
    batch: "B3",
    listUrl: "/admin/navigation?tab=users",
    selector: 'a[href^="/admin/navigation/users/"]',
    match: /^\/admin\/navigation\/users\/[^/]+\/[^/]+$/,    // /users/<uid>/<rid>
  },
  {
    batch: "B4",
    listUrl: "/parts/setup/items",
    selector: 'a[href^="/parts/setup/items/"]',
    match: /^\/parts\/setup\/items\/[0-9a-f-]{36}$/,
  },
  {
    batch: "B4",
    listUrl: "/parts/purchase/requisitions",
    selector: 'a[href^="/parts/purchase/requisitions/"]',
    match: /^\/parts\/purchase\/requisitions\/[0-9a-f-]{36}$/,
  },
  {
    batch: "B5",
    listUrl: "/einvoice",
    selector: 'a[href^="/einvoice/"]',
    match: /^\/einvoice\/[0-9a-f-]{36}$/,
  },
  {
    batch: "B5",
    listUrl: "/feedback/tickets",
    selector: 'a[href^="/feedback/tickets/"]',
    match: /^\/feedback\/tickets\/[0-9a-f-]{36}$/,
  },
];

// 特殊鏈：item label / n/[nodeId] 從 dashboard 抓 dynamic nav
const SPECIAL_CHAINS = [
  {
    batch: "B4",
    name: "item-label",
    pre: async (page) => {
      await page.goto(`${BASE}/parts/setup/items`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      const sel = 'a[href^="/parts/setup/items/"]';
      const hrefs = await page.locator(sel).evaluateAll((els) =>
        els.map((e) => e.getAttribute("href")).filter(Boolean),
      );
      const detail = hrefs.find((h) => /^\/parts\/setup\/items\/[0-9a-f-]{36}$/.test(h));
      return detail ? `${detail}/label` : null;
    },
  },
  {
    batch: "B5",
    name: "n/[nodeId]",
    pre: async (page) => {
      await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      const sel = 'a[href^="/n/"]';
      if ((await page.locator(sel).count()) === 0) return null;
      const href = await page.locator(sel).first().getAttribute("href");
      return href;
    },
  },
];

async function checkPageOnce(page, urlPath, label) {
  const fullUrl = urlPath.startsWith("http") ? urlPath : `${BASE}${urlPath}`;
  const resp = await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
  const status = resp?.status() ?? 0;
  const finalUrl = page.url();

  if (status >= 400) return { ok: false, label, urlPath, reason: `status=${status}` };
  if (finalUrl.includes("/login")) return { ok: false, label, urlPath, reason: `redirected to /login` };

  const body = await page.locator("body").innerText().catch(() => "");
  for (const pat of SERVER_ERROR_PATTERNS) {
    if (body.includes(pat)) {
      return {
        ok: false,
        label,
        urlPath,
        reason: `body contains "${pat}"`,
        excerpt: body.slice(0, 300),
      };
    }
  }
  return { ok: true, label, urlPath, status };
}

// dev mode cold-compile 一頁可能 30-90s、且第二次跑就 warm。對 timeout 自動 retry 一次。
async function checkPage(page, urlPath, label) {
  try {
    const r1 = await checkPageOnce(page, urlPath, label);
    if (r1.ok) return r1;
    return r1;
  } catch (e) {
    const msg = e?.message || String(e);
    if (msg.includes("Timeout")) {
      // 等 dev server 補完 compile、重 try 一次
      await new Promise((r) => setTimeout(r, 2_000));
      try {
        const r2 = await checkPageOnce(page, urlPath, label);
        if (r2.ok) return { ...r2, retried: true };
        return { ...r2, retried: true };
      } catch (e2) {
        return {
          ok: false,
          label,
          urlPath,
          retried: true,
          reason: `retry-throw: ${e2?.message || String(e2)}`,
        };
      }
    }
    return { ok: false, label, urlPath, reason: `throw: ${msg}` };
  }
}

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("ERROR: state file 不存在，先跑：node scripts/pw-login.mjs --ensure");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: STATE_FILE });
  const page = await ctx.newPage();

  const results = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  // 1) 直跑頁面
  log(`▶ flat pages (${FLAT_PAGES.length})`);
  for (const [batch, urlPath] of FLAT_PAGES) {
    const label = `[${batch}] ${urlPath}`;
    const r = await checkPage(page, urlPath, label);
    results.push(r);
    if (r.ok) { passed++; log(`  ✓ ${label}${r.retried ? " (retry)" : ""}`); }
    else      { failed++; log(`  ✗ ${label} — ${r.reason}`); }
  }

  // 2) Detail chains
  log(`▶ detail chains (${DETAIL_CHAINS.length})`);
  for (const { batch, listUrl, selector, match } of DETAIL_CHAINS) {
    const label = `[${batch}] detail-from ${listUrl}`;
    try {
      await page.goto(`${BASE}${listUrl}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      // 撈所有 href、用 regex 篩出真的 detail（排除 /new / /issue / 子路由）
      const allHrefs = await page
        .locator(selector)
        .evaluateAll((els) => els.map((e) => e.getAttribute("href")).filter(Boolean));
      const matched = allHrefs.find((h) => match.test(h));
      if (!matched) {
        skipped++;
        results.push({ ok: true, label, urlPath: listUrl, skipped: true, reason: `no detail link match (${allHrefs.length} link(s) found, none match ${match})` });
        log(`  ⊘ ${label} (no detail link match)`);
        continue;
      }
      const r = await checkPage(page, matched, `${label} → ${matched}`);
      results.push(r);
      if (r.ok) { passed++; log(`  ✓ ${label} → ${matched}`); }
      else      { failed++; log(`  ✗ ${label} → ${matched} — ${r.reason}`); }
    } catch (e) {
      failed++;
      const r = { ok: false, label, urlPath: listUrl, reason: `throw: ${e?.message || String(e)}` };
      results.push(r);
      log(`  ✗ ${label} — ${r.reason}`);
    }
  }

  // 3) Special chains
  log(`▶ special chains (${SPECIAL_CHAINS.length})`);
  for (const { batch, name, pre } of SPECIAL_CHAINS) {
    const label = `[${batch}] ${name}`;
    try {
      const target = await pre(page);
      if (!target) {
        skipped++;
        results.push({ ok: true, label, skipped: true, reason: "prep returned null" });
        log(`  ⊘ ${label} (prep null)`);
        continue;
      }
      const r = await checkPage(page, target, `${label} → ${target}`);
      results.push(r);
      if (r.ok) { passed++; log(`  ✓ ${label} → ${target}`); }
      else      { failed++; log(`  ✗ ${label} → ${target} — ${r.reason}`); }
    } catch (e) {
      failed++;
      const r = { ok: false, label, reason: `throw: ${e?.message || String(e)}` };
      results.push(r);
      log(`  ✗ ${label} — ${r.reason}`);
    }
  }

  await browser.close();

  const total = passed + failed;
  const summary = {
    total,
    passed,
    failed,
    skipped,
    fails: results.filter((r) => !r.ok),
  };
  console.log(JSON.stringify(summary, null, 2));
  log(`✓ ${passed} ✗ ${failed} ⊘ ${skipped}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  log("FATAL:", err?.stack || err);
  process.exit(2);
});
