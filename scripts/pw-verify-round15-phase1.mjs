#!/usr/bin/env node
// @ts-check
/**
 * 第十五輪 Phase 1 回歸驗證（T1~T5）
 * 序列、單一 browser、逐 route 截圖 + 斷言關鍵元素文字。
 * 前置：dev server 跑在 http://localhost:3000（BRAND_KEY=indian）、storageState 已 refresh。
 * 跑法：node scripts/pw-verify-round15-phase1.mjs
 */
import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT = resolve(ROOT, "docs/test-evidence/round-15");
const authFile = (role) => resolve(ROOT, `tests/e2e/.auth/${role}.json`);

const CUSTOMER_ID = "0246817a-d154-45fb-af1e-b73a9c124031";

/** @type {{name:string, role:string, path:string, expectAny?:string[], expectAll?:string[]}[]} */
const CHECKS = [
  {
    name: "t1-rs03a-new-cars",
    role: "rs_manager",
    path: "/sales/showroom/new-cars",
    expectAny: ["待 PDI", "PDI", "pending_pdi"],
  },
  {
    name: "t2-rs03b-used-cars",
    role: "rs_manager",
    path: "/sales/showroom/used-cars",
    expectAny: ["置換", "直購", "拍賣", "整備"],
  },
  {
    name: "t3-ro-new",
    role: "aftersales_lead",
    path: "/parts/aftersales/repair-orders/new",
    expectAny: ["PDI整備", "PDI", "PD"],
  },
  {
    name: "t4-ro-search",
    role: "aftersales_lead",
    path: "/parts/aftersales/ro-search",
    expectAny: ["整車成本", "內部"],
  },
  {
    name: "t5-customer-detail",
    role: "sa",
    path: `/parts/aftersales/customers/${CUSTOMER_ID}`,
    expectAny: ["維修歷史", "類型"],
  },
];

const results = [];

for (const c of CHECKS) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    storageState: authFile(c.role),
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  let status = "PASS";
  let detail = "";
  try {
    const resp = await page.goto(BASE + c.path, { waitUntil: "domcontentloaded", timeout: 30000 });
    // 等一點 client render
    await page.waitForTimeout(2500);
    await page.screenshot({ path: resolve(OUT, c.name + ".png"), fullPage: true });
    const body = (await page.locator("body").innerText().catch(() => "")) || "";
    const url = page.url();
    if (url.includes("/login")) {
      status = "FAIL";
      detail = "redirected to /login (auth lost)";
    } else if (/無權限|沒有權限|403|Forbidden/.test(body)) {
      status = "WARN";
      detail = "permission page";
    } else if (c.expectAny) {
      const hit = c.expectAny.filter((s) => body.includes(s));
      if (hit.length === 0) {
        status = "FAIL";
        detail = `none of [${c.expectAny.join(", ")}] found`;
      } else {
        detail = `found: ${hit.join(", ")}`;
      }
    }
    detail += ` | http=${resp?.status()} url=${url.replace(BASE, "")}`;
  } catch (e) {
    status = "FAIL";
    detail = "error: " + (e?.message || String(e)).slice(0, 120);
  } finally {
    await browser.close();
  }
  results.push({ ...c, status, detail });
  console.log(`[${status}] ${c.name} (${c.role}) ${c.path}\n        ${detail}`);
}

console.log("\n==== SUMMARY ====");
const pass = results.filter((r) => r.status === "PASS").length;
const warn = results.filter((r) => r.status === "WARN").length;
const fail = results.filter((r) => r.status === "FAIL").length;
console.log(`PASS=${pass} WARN=${warn} FAIL=${fail} / ${results.length}`);
process.exit(fail > 0 ? 1 : 0);
