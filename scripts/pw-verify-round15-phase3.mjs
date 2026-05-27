#!/usr/bin/env node
// @ts-check
/** 第十五輪 Phase 3 中古車鏈 render-smoke（T10/T11/T12） */
import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT = resolve(ROOT, "docs/test-evidence/round-15");
const authFile = (role) => resolve(ROOT, `tests/e2e/.auth/${role}.json`);

const UPR_ID = "b384c1ef-3dcf-4f57-8d1a-ec32f734a66f"; // used_purchase_requests
const RECON_RO_ID = "8192631a-4206-4c68-b3cc-156f3128a1e1"; // PD-UC-990528-901 direct_buy, untouched

const CHECKS = [
  { name: "t10-up-list", role: "rs_manager", path: "/sales/inventory/used-purchase", expectAny: ["收購", "申請", "BUY"] },
  { name: "t10-up-new", role: "rs_manager", path: "/sales/inventory/used-purchase/new", expectAny: ["收購", "車輛", "鑑價", "賣方"] },
  { name: "t10-up-detail", role: "rs_manager", path: `/sales/inventory/used-purchase/${UPR_ID}`, expectAny: ["收購", "BUY-"] },
  { name: "t12-eval-list", role: "rs_manager", path: "/usedcar/evaluations", expectAny: ["評估", "鑑價", "估價"] },
  { name: "t11-recon-exec", role: "aftersales_lead", path: `/parts/aftersales/workorders/recon/${RECON_RO_ID}`, expectAny: ["整備", "PD-UC", "checklist", "工單"] },
];

const results = [];
for (const c of CHECKS) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: authFile(c.role), viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + (e?.message || "").slice(0, 100)));
  let status = "PASS"; let detail = "";
  try {
    const resp = await page.goto(BASE + c.path, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(2800);
    await page.screenshot({ path: resolve(OUT, c.name + ".png"), fullPage: true });
    const body = (await page.locator("body").innerText().catch(() => "")) || "";
    const url = page.url(); const http = resp?.status();
    if (url.includes("/login")) { status = "FAIL"; detail = "redirect /login"; }
    else if (http && http >= 500) { status = "FAIL"; detail = `http ${http}`; }
    else if (/無權限|沒有權限|Forbidden/.test(body)) { status = "WARN"; detail = "permission page"; }
    else if (/尚未對應到任何設計稿/.test(body)) { status = "FAIL"; detail = "PLACEHOLDER (route not matched)"; }
    else if (c.expectAny) {
      const hit = c.expectAny.filter((s) => body.includes(s));
      if (hit.length === 0) { status = "FAIL"; detail = `none of [${c.expectAny.join(", ")}]`; }
      else detail = `found: ${hit.join(",")}`;
    }
    detail += ` | http=${http} url=${url.replace(BASE, "")}`;
    if (consoleErrors.length) { detail += ` | ${consoleErrors[0]}`; if (status === "PASS") status = "WARN"; }
  } catch (e) { status = "FAIL"; detail = "error: " + (e?.message || String(e)).slice(0, 120); }
  finally { await browser.close(); }
  results.push({ ...c, status, detail });
  console.log(`[${status}] ${c.name} (${c.role}) ${c.path}\n        ${detail}`);
}
console.log("\n==== SUMMARY ====");
const f = results.filter((r) => r.status === "FAIL").length;
console.log(`PASS=${results.filter((r) => r.status === "PASS").length} WARN=${results.filter((r) => r.status === "WARN").length} FAIL=${f} / ${results.length}`);
process.exit(f > 0 ? 1 : 0);
