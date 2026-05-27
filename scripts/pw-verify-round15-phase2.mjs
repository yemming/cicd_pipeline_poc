#!/usr/bin/env node
// @ts-check
/**
 * 第十五輪 Phase 2 新車鏈 render-smoke（T6~T9）
 * 逐 route 在對的 persona 下載入、截圖、斷言關鍵元素、抓 console error / 500。
 * 前置：dev server 跑在 localhost:3000（BRAND_KEY=indian）、storageState 已 refresh。
 */
import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT = resolve(ROOT, "docs/test-evidence/round-15");
const authFile = (role) => resolve(ROOT, `tests/e2e/.auth/${role}.json`);

// T7/T8 留下的活資料
const PO_ID = "eb7e0d4c-df25-4a82-a3be-6861215be5d0"; // VPO-T7VERIFY-001
const ARR_ID = "09084f12-ed58-46e6-8d40-6eca4338f5e4"; // ARR-20260527-001
const PDI_RO_ID = "cc6a5905-665a-4a71-af85-f8465e840e58"; // PD-IN-260527-004 (live, untouched)

const CHECKS = [
  { name: "t6-po-list", role: "rs_manager", path: "/sales/inventory/purchase-orders", expectAny: ["採購", "VPO"] },
  { name: "t6-po-new", role: "rs_manager", path: "/sales/inventory/purchase-orders/new", expectAny: ["採購", "車款", "新增"] },
  { name: "t6-po-detail", role: "rs_manager", path: `/sales/inventory/purchase-orders/${PO_ID}`, expectAny: ["VPO-T7VERIFY-001", "採購"] },
  { name: "t7-arr-list", role: "rs_manager", path: "/sales/inventory/arrival-confirmation", expectAny: ["到港", "ARR"] },
  { name: "t7-arr-new", role: "rs_manager", path: "/sales/inventory/arrival-confirmation/new", expectAny: ["到港", "採購單", "VIN"] },
  { name: "t7-arr-detail", role: "rs_manager", path: `/sales/inventory/arrival-confirmation/${ARR_ID}`, expectAny: ["ARR-20260527-001", "到港"] },
  { name: "t8-pdi-exec", role: "aftersales_lead", path: `/parts/aftersales/workorders/pdi/${PDI_RO_ID}`, expectAny: ["PDI", "PD-IN-260527-004", "checklist", "整備"] },
  { name: "t9-delivery", role: "rs_manager", path: "/sales/delivery", expectAny: ["交車"] },
];

const results = [];
for (const c of CHECKS) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: authFile(c.role), viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 100)); });
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + (e?.message || "").slice(0, 100)));
  let status = "PASS";
  let detail = "";
  try {
    const resp = await page.goto(BASE + c.path, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(2800);
    await page.screenshot({ path: resolve(OUT, c.name + ".png"), fullPage: true });
    const body = (await page.locator("body").innerText().catch(() => "")) || "";
    const url = page.url();
    const http = resp?.status();
    if (url.includes("/login")) { status = "FAIL"; detail = "redirect /login"; }
    else if (http && http >= 500) { status = "FAIL"; detail = `http ${http}`; }
    else if (/無權限|沒有權限|Forbidden/.test(body)) { status = "WARN"; detail = "permission page"; }
    else if (c.expectAny) {
      const hit = c.expectAny.filter((s) => body.includes(s));
      if (hit.length === 0) { status = "FAIL"; detail = `none of [${c.expectAny.join(", ")}]`; }
      else detail = `found: ${hit.join(",")}`;
    }
    const realErrs = consoleErrors.filter((e) => !/favicon|404|Download the React|hydrat/i.test(e));
    detail += ` | http=${http} url=${url.replace(BASE, "")}`;
    if (realErrs.length) { detail += ` | consoleErr(${realErrs.length}): ${realErrs[0]}`; if (status === "PASS") status = "WARN"; }
  } catch (e) {
    status = "FAIL"; detail = "error: " + (e?.message || String(e)).slice(0, 120);
  } finally { await browser.close(); }
  results.push({ ...c, status, detail });
  console.log(`[${status}] ${c.name} (${c.role}) ${c.path}\n        ${detail}`);
}
console.log("\n==== SUMMARY ====");
const f = results.filter((r) => r.status === "FAIL").length;
const w = results.filter((r) => r.status === "WARN").length;
console.log(`PASS=${results.filter((r) => r.status === "PASS").length} WARN=${w} FAIL=${f} / ${results.length}`);
process.exit(f > 0 ? 1 : 0);
