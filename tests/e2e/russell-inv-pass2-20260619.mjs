// Russell 2026-06-19 Pass2 — 場景一預覽配置 + 場景三退料三型逐行（需實際操作才顯示的 UI）
import { chromium } from "@playwright/test";
import fs from "node:fs";
const BASE = "https://dealeros.zeabur.app";
const HOST = new URL(BASE).hostname;
const OUT = "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260619/shots";
fs.mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(m);
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }).then(() => log("📸 " + n)).catch((e) => log("shot fail " + n + " " + e));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1480, height: 1150 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type=email]', "yemming.yu@gmail.com");
  await page.fill('input[type=password]', "yemming.yu@gmail.com");
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => {});
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian", store_id: null }), domain: HOST, path: "/" }]);
  await page.waitForTimeout(800);

  // ── 場景一：選工單 + 預覽配置 ──
  try {
    await page.goto(`${BASE}/parts/issue/repair-pick/new`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    // 選 RO-20260508-556831（部分已領·待補貨，車主陳大明）這張，點該列 radio
    const row = page.locator("tr", { hasText: "RO-20260508-556831" }).first();
    await row.locator('input[type=radio]').click().catch(async () => { await row.click(); });
    await page.waitForTimeout(500);
    // 確保出庫倉 = WH-001 主零件倉
    await page.locator("select").first().selectOption({ label: /主零件倉/ }).catch((e) => log("選倉 " + e));
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /預覽配置/ }).click().catch((e) => log("預覽 fail " + e));
    await page.waitForTimeout(3000);
    log("S1 預覽含『可用』: " + (await page.content()).includes("可用"));
    log("S1 預覽含『缺料/不足/充足』: " + /缺料|不足|充足|可部分/.test(await page.content()));
    await shot(page, "S1c_repair-pick-preview");
  } catch (e) { log("S1 ERROR " + e.message); }

  // ── 場景三：退料 new 選一張已過帳領料單，展開逐行退料/核銷 ──
  try {
    await page.goto(`${BASE}/parts/receipt/return-in/new`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const sel = page.locator("select").first();
    const opts = await sel.locator("option").allTextContents();
    log("S3 領料單選項數: " + opts.length + " | " + opts.slice(0, 4).join(" / "));
    // 選第一個非 placeholder 選項
    const vals = await sel.locator("option").evaluateAll((os) => os.map((o) => o.value).filter((v) => v && v !== ""));
    if (vals.length) {
      await sel.selectOption(vals[0]);
      await page.waitForTimeout(2500);
      log("S3 選單後含『完整退料』: " + (await page.content()).includes("完整退料"));
      log("S3 含『損耗/核銷』: " + /損耗|核銷/.test(await page.content()));
      log("S3 含『退料類型/退回/數量』: " + /退料類型|退回|退料數量/.test(await page.content()));
      await shot(page, "S3d_return-in-line-detail");
    } else {
      log("S3 無可選領料單（無已過帳領料單）");
      await shot(page, "S3d_return-in-no-pick");
    }
  } catch (e) { log("S3 ERROR " + e.message); }

  log("DONE Pass2");
} catch (e) { log("FATAL " + e); } finally { await browser.close(); }
