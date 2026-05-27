#!/usr/bin/env node
// @ts-check
/** 第十五輪 Phase 4 拓展頁 render-smoke（T13/T14/T15） */
import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT = resolve(ROOT, "docs/test-evidence/round-15");
const authFile = (role) => resolve(ROOT, `tests/e2e/.auth/${role}.json`);

const PO_ID = "eb7e0d4c-df25-4a82-a3be-6861215be5d0"; // VPO-T7VERIFY-001 (arrived)

const CHECKS = [
  { name: "t13-settle-list", role: "rs_manager", path: "/sales/inventory/cost-settlement", expectAny: ["結算", "採購", "關"] },
  { name: "t13-settle-detail", role: "rs_manager", path: `/sales/inventory/cost-settlement/${PO_ID}`, expectAny: ["結算", "關稅", "運費", "保險", "分攤"] },
  { name: "t14-transfer-list", role: "rs_manager", path: "/sales/inventory/transfers", expectAny: ["調撥", "VTR", "運費"] },
  { name: "t14-transfer-new", role: "rs_manager", path: "/sales/inventory/transfers/new", expectAny: ["調撥", "運費", "倉"] },
  { name: "t15-outbound", role: "rs_manager", path: "/sales/inventory/outbound", expectAny: ["出庫", "毛利", "銷售"] },
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
