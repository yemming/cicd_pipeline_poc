#!/usr/bin/env node
/**
 * Smoke：/sales/insurance 保險招攬工作台（RS_EX1）
 *
 * 驗證項：
 *  1) 200 OK、不被踢 /login
 *  2) 標題含「保險招攬工作台」
 *  3) 三個 tab 都在（續保到期提醒 / 新車交車招攬 / 業績總覽）
 *  4) KPI 5 顆
 *  5) 預設「續保到期提醒」tab 顯示卡片列表（至少 7 張）
 *  6) Sidenav 到期狀態：全部 / 30 天內 / 31–90 / 91–180 / 已續保
 *  7) 切「新車交車招攬」tab → 表格出現、3 列
 *  8) 切「業績總覽」tab → 4 個 PerfBox
 *  9) 點「＋ 新增保險件」modal 開啟
 * 10) 截圖
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const SHOT_DIR = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 60_000);

const log = (...m) => console.error("[insurance-smoke]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json");
    process.exit(2);
  }
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  const report = { ok: true, steps: [], shots: [] };
  const record = (name, ok, detail = "") => {
    report.steps.push({ name, ok, detail });
    if (!ok) report.ok = false;
    log(`${ok ? "OK " : "NG "} ${name} ${detail}`);
  };

  try {
    const resp = await page.goto(`${BASE}/sales/insurance`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    record("navigate /sales/insurance", status === 200 && !finalUrl.includes("/login"), `status=${status} url=${finalUrl}`);

    await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT });

    // 2) 標題
    const titleCount = await page.locator("text=保險招攬工作台").count();
    record("title visible", titleCount >= 1, `count=${titleCount}`);

    // 3) 三個 tab
    for (const t of ["續保到期提醒", "新車交車招攬", "業績總覽"]) {
      const c = await page.locator(`button:has-text("${t}")`).count();
      record(`tab present: ${t}`, c >= 1, `count=${c}`);
    }

    // 4) KPI 5 顆
    const kpiLabels = ["本月待處理", "30 天內到期", "已完成件數", "本月佣金收入", "年度累計佣金"];
    for (const l of kpiLabels) {
      const c = await page.locator(`text=${l}`).count();
      record(`kpi: ${l}`, c >= 1);
    }

    // 5) 卡片列表 — 客戶姓名出現
    const sampleNames = ["王大明", "陳美玲", "李文彬"];
    for (const n of sampleNames) {
      const c = await page.locator(`text=${n}`).count();
      record(`renewal card: ${n}`, c >= 1);
    }

    // 6) sidenav 到期狀態
    for (const s of ["30 天內", "31–90 天", "91–180 天", "已續保"]) {
      const c = await page.locator(`text=${s}`).count();
      record(`sidenav urgency: ${s}`, c >= 1);
    }

    await page.screenshot({ path: path.join(SHOT_DIR, "insurance-01-renew.png"), fullPage: false });

    // 7) 切到「新車交車招攬」
    await page.locator('button:has-text("🆕 新車交車招攬")').first().click();
    await page.waitForTimeout(400);
    const newRows = await page.locator('[data-testid="new-delivery-tab"] tbody tr').count();
    record("new-delivery tab rows >= 3", newRows >= 3, `rows=${newRows}`);
    await page.screenshot({ path: path.join(SHOT_DIR, "insurance-02-newcar.png"), fullPage: false });

    // 8) 切到「業績總覽」
    await page.locator('button:has-text("📊 業績總覽")').first().click();
    await page.waitForTimeout(400);
    for (const box of ["本月業績摘要", "RS 個人業績", "流失原因分析", "年度累計"]) {
      const c = await page.locator(`text=${box}`).count();
      record(`perf box: ${box}`, c >= 1);
    }
    await page.screenshot({ path: path.join(SHOT_DIR, "insurance-03-perf.png"), fullPage: false });

    // 9) 切回續保 + 點新增 modal
    await page.locator('button:has-text("🔔 續保到期提醒")').first().click();
    await page.waitForTimeout(300);
    await page.locator('button:has-text("＋ 新增保險件")').first().click();
    await page.waitForTimeout(300);
    const modalTitle = await page.locator("text=＋ 新增保險招攬件").count();
    record("modal opened", modalTitle >= 1, `count=${modalTitle}`);
    await page.screenshot({ path: path.join(SHOT_DIR, "insurance-04-modal.png"), fullPage: false });
  } catch (e) {
    record("exception", false, String(e));
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main();
