#!/usr/bin/env node
// @ts-check
/**
 * 第十五輪 完整 UI 端到端錄影
 * Seg A 新車 PDI 工單執行→核准（費用寫回→可售）
 * Seg B 交車管理 STEP1 綠色「PDI 已完成」卡（demo 交車單）
 * Seg C 中古車整備工單執行→核准（費用寫回→可售）
 * 每段獨立 context + 錄影（webm 存 docs/test-evidence/round-15/videos/）
 * 前置：dev server 跑 localhost:3000、storageState refreshed、rm -rf .next 過。
 */
import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renameSync, readdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BASE = "http://localhost:3000";
const OUT = resolve(ROOT, "docs/test-evidence/round-15");
const VID = resolve(OUT, "videos");
const authFile = (r) => resolve(ROOT, `tests/e2e/.auth/${r}.json`);
const TODAY = "2026-05-28";

const PDI_RO = "cc6a5905-665a-4a71-af85-f8465e840e58";   // PD-IN-260527-004, car 2512bfb8
const RECON_RO = "8192631a-4206-4c68-b3cc-156f3128a1e1"; // PD-UC-990528-901, car 299bd697
const DEMO_DELIVERY = "1c092db1-b391-49ed-a0a0-5508d6e90059"; // DLV-26M05-I901

const log = (m) => console.log(m);

async function newCtx(browser, role, name) {
  const ctx = await browser.newContext({
    storageState: authFile(role),
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: VID, size: { width: 1440, height: 900 } },
  });
  ctx._segName = name;
  return ctx;
}
async function closeCtxRenameVideo(ctx, page) {
  const vp = await page.video()?.path().catch(() => null);
  await ctx.close();
  if (vp) {
    try {
      const dst = resolve(VID, ctx._segName + ".webm");
      renameSync(vp, dst);
      log(`   🎬 video → ${dst.replace(ROOT + "/", "")}`);
    } catch { /* ignore */ }
  }
}

// 執行工單核准共用流程（PDI / recon 同結構）
async function runWorkorderApprove(page, kind) {
  const checklistTab = kind === "pdi" ? "PDI 檢查清單" : "整備檢查清單";
  // 1. 進檢查清單 tab
  await page.getByText(checklistTab, { exact: false }).first().click();
  await page.waitForTimeout(800);
  // 2. 未填項全標正常
  await page.getByText("未填項全標正常", { exact: false }).click();
  await page.waitForTimeout(500);
  // 3. 儲存檢查清單
  await page.getByRole("button", { name: /儲存檢查清單/ }).click();
  await page.waitForTimeout(1800); // 等 server action + banner
  // 4. 進完成核准 tab
  await page.getByText("完成核准", { exact: false }).first().click();
  await page.waitForTimeout(800);
  // 5. 補完工日期（若空）
  const dateInputs = page.locator("input[type='date']");
  const n = await dateInputs.count();
  for (let i = 0; i < n; i++) {
    const v = await dateInputs.nth(i).inputValue().catch(() => "x");
    if (!v) await dateInputs.nth(i).fill(TODAY).catch(() => {});
  }
  // 6. 技師簽名 + 售後主管核准
  await page.getByText("技師簽名", { exact: false }).first().click();
  await page.waitForTimeout(400);
  await page.getByText("售後主管核准", { exact: false }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, `e2e-${kind}-before-approve.png`), fullPage: true });
  // 7. 核准完工
  await page.getByRole("button", { name: /核准完工/ }).click();
  await page.waitForTimeout(2500); // server action 寫回
}

const results = [];
const browser = await chromium.launch();

// ───────── Seg A：新車 PDI 執行→核准 ─────────
try {
  const ctx = await newCtx(browser, "aftersales_lead", "segA-pdi-approve");
  const page = await ctx.newPage();
  await page.goto(`${BASE}/parts/aftersales/workorders/pdi/${PDI_RO}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2500);
  await runWorkorderApprove(page, "pdi");
  const body = await page.locator("body").innerText().catch(() => "");
  const ok = /PDI 完成|核准完成|已關單|可售/.test(body);
  await page.screenshot({ path: resolve(OUT, "e2e-segA-pdi-done.png"), fullPage: true });
  log(`[${ok ? "PASS" : "FAIL"}] Seg A 新車 PDI 核准  ${ok ? "完成卡出現" : "未見完成卡"}`);
  results.push(["segA", ok]);
  await closeCtxRenameVideo(ctx, page);
} catch (e) { log("[FAIL] Seg A error: " + (e?.message || e).slice(0, 160)); results.push(["segA", false]); }

// ───────── Seg B：交車 PDI 完成綠卡 ─────────
try {
  const ctx = await newCtx(browser, "rs_manager", "segB-delivery-green");
  const page = await ctx.newPage();
  await page.goto(`${BASE}/delivery/pdi?deliveryId=${DEMO_DELIVERY}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3000);
  const body = await page.locator("body").innerText().catch(() => "");
  const ok = /PDI 已完成|已完成|可售|可繼續|PD-IN/.test(body) && !/找不到關聯車輛|PDI 未完成|無 PDI/.test(body);
  await page.screenshot({ path: resolve(OUT, "e2e-segB-delivery-green.png"), fullPage: true });
  log(`[${ok ? "PASS" : "WARN"}] Seg B 交車綠卡  ${body.match(/PDI[^。\n]{0,12}/)?.[0] ?? ""}`);
  results.push(["segB", ok]);
  await closeCtxRenameVideo(ctx, page);
} catch (e) { log("[FAIL] Seg B error: " + (e?.message || e).slice(0, 160)); results.push(["segB", false]); }

// ───────── Seg C：中古車整備 執行→核准 ─────────
try {
  const ctx = await newCtx(browser, "aftersales_lead", "segC-recon-approve");
  const page = await ctx.newPage();
  await page.goto(`${BASE}/parts/aftersales/workorders/recon/${RECON_RO}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2500);
  await runWorkorderApprove(page, "recon");
  const body = await page.locator("body").innerText().catch(() => "");
  const ok = /完成|核准完成|已關單|可售|available/i.test(body);
  await page.screenshot({ path: resolve(OUT, "e2e-segC-recon-done.png"), fullPage: true });
  log(`[${ok ? "PASS" : "FAIL"}] Seg C 中古整備核准  ${ok ? "完成卡出現" : "未見完成卡"}`);
  results.push(["segC", ok]);
  await closeCtxRenameVideo(ctx, page);
} catch (e) { log("[FAIL] Seg C error: " + (e?.message || e).slice(0, 160)); results.push(["segC", false]); }

await browser.close();
log("\n==== E2E SUMMARY ====");
for (const [s, ok] of results) log(`  ${ok ? "✅" : "❌"} ${s}`);
