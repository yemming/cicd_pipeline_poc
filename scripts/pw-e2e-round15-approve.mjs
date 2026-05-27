#!/usr/bin/env node
// @ts-check
/** 第十五輪 端到端錄影 — Seg A (PDI) + Seg C (recon) 核准流程（精準 locator 版） */
import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renameSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BASE = "http://localhost:3000";
const OUT = resolve(ROOT, "docs/test-evidence/round-15");
const VID = resolve(OUT, "videos");
const authFile = (r) => resolve(ROOT, `tests/e2e/.auth/${r}.json`);
const TODAY = "2026-05-28";

const SEGS = [
  { name: "segA-pdi-approve", kind: "pdi", ro: "cc6a5905-665a-4a71-af85-f8465e840e58", route: "pdi", checklistTab: /PDI 檢查清單/ },
  { name: "segC-recon-approve", kind: "recon", ro: "8192631a-4206-4c68-b3cc-156f3128a1e1", route: "recon", checklistTab: /整備檢查清單/ },
];

const browser = await chromium.launch();
const results = [];

for (const seg of SEGS) {
  const ctx = await browser.newContext({
    storageState: authFile("aftersales_lead"),
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: VID, size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();
  let detail = "";
  let ok = false;
  try {
    await page.goto(`${BASE}/parts/aftersales/workorders/${seg.route}/${seg.ro}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    // 等頁面真的 render 出 tab（用 button 可見當訊號）
    await page.getByRole("button", { name: seg.checklistTab }).first().waitFor({ state: "visible", timeout: 30000 });

    // 1. 檢查清單 tab
    await page.getByRole("button", { name: seg.checklistTab }).first().click();
    await page.getByRole("button", { name: /未填項全標正常/ }).waitFor({ state: "visible", timeout: 15000 });
    await page.getByRole("button", { name: /未填項全標正常/ }).click();
    await page.waitForTimeout(500);
    // 2. 儲存檢查清單 → 等成功 banner（含 100%）
    await page.getByRole("button", { name: /儲存檢查清單/ }).click();
    await page.getByText(/已儲存檢查清單.*100/, { exact: false }).waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // 3. 完成核准 tab
    await page.getByRole("button", { name: /完成核准/ }).first().click();
    // 等簽名按鈕出現
    await page.getByRole("button", { name: /技師簽名/ }).waitFor({ state: "visible", timeout: 15000 });
    // 4. 補完工日期
    const di = page.locator("input[type='date']");
    for (let i = 0; i < (await di.count()); i++) {
      const v = await di.nth(i).inputValue().catch(() => "x");
      if (!v) await di.nth(i).fill(TODAY).catch(() => {});
    }
    // 5. 兩格簽署
    await page.getByRole("button", { name: /技師簽名/ }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /售後主管核准/ }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, `e2e-${seg.kind}-ready.png`), fullPage: true });
    // 6. 核准完工（先確認 enabled）
    const approveBtn = page.getByRole("button", { name: /核准完工/ });
    const disabled = await approveBtn.isDisabled().catch(() => true);
    detail += `approve-enabled=${!disabled} `;
    await approveBtn.click();
    // 7. 等完成卡
    await page.getByText(/PDI 完成|整備完成|工單.*已關閉|已關單|可售/, { exact: false }).first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: resolve(OUT, `e2e-${seg.kind}-done.png`), fullPage: true });
    const body = await page.locator("body").innerText().catch(() => "");
    ok = /已執行|工單.*已關閉|🎉/.test(body);
    detail += ok ? "完成卡✓" : "無完成卡";
  } catch (e) {
    detail += "ERR:" + (e?.message || e).slice(0, 100);
  }
  // 收影片
  const vp = await page.video()?.path().catch(() => null);
  await ctx.close();
  if (vp) { try { renameSync(vp, resolve(VID, seg.name + ".webm")); } catch {} }
  console.log(`[${ok ? "PASS" : "FAIL"}] ${seg.name}  ${detail}`);
  results.push([seg.name, ok]);
}
await browser.close();
console.log("\n==== SUMMARY ====");
for (const [s, ok] of results) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
