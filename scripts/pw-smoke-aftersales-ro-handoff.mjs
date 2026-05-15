#!/usr/bin/env node
// Smoke test for /parts/aftersales/ro-handoff（串接工單）
// - list 載入 + 三狀態 chip 都看得到
// - filter status=ready 點查詢
// - 點 PI-260515-002 (ready) detail → 串接 modal 開得起來、P1/P2 select 有值
// - PI-260514-008 (transferred) detail → 顯示 ✓ banner + 已串接 RO link
// - PI-260515-001 (awaiting) detail → 顯示 ⚠️ 待簽名 banner、轉單按鈕 disabled
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP_DIR = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[ro-handoff-smoke]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json — run scripts/pw-login.mjs first");
    process.exit(2);
  }
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1440, height: 900 },
  });
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: "indian" }),
      url: BASE,
    },
  ]);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push(`console.error: ${m.text()}`);
  });

  const results = [];

  // 1) list
  {
    const resp = await page.goto(`${BASE}/parts/aftersales/ro-handoff`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    results.push(status === 200 ? "✓ list HTTP 200" : `✗ list HTTP ${status}`);
    await page.waitForTimeout(800);
    const h1 = (await page.locator("h1").first().textContent()) ?? "";
    results.push(h1.includes("串接工單") ? "✓ h1 串接工單" : `✗ h1 = ${h1}`);

    // 三筆 demo
    for (const pi of ["PI-260515-001", "PI-260515-002", "PI-260514-008"]) {
      const link = page.locator("a", { hasText: pi }).first();
      const ok = (await link.count()) > 0;
      results.push(ok ? `✓ row ${pi} 顯示` : `✗ row ${pi} 缺`);
    }
    // 三狀態 chip 都應在 list 裡看到至少一次
    for (const label of ["待簽名", "可串接", "已串接"]) {
      const ok = (await page.locator(`text=${label}`).count()) > 0;
      results.push(ok ? `✓ chip 含 ${label}` : `✗ chip 缺 ${label}`);
    }
    await page.screenshot({
      path: path.join(TMP_DIR, "ro-handoff-list.png"),
      fullPage: true,
    });
  }

  // 2) detail — ready (PI-260515-002)：可開串接 modal、P1/P2 預設 MN/CP
  {
    const link = page.locator("a", { hasText: "PI-260515-002" }).first();
    await Promise.all([
      page.waitForURL(/\/ro-handoff\/[0-9a-f-]{36}/, { timeout: 15_000 }).catch(() => null),
      link.click(),
    ]);
    await page.waitForTimeout(600);
    const url2 = page.url();
    results.push(/\/ro-handoff\/[0-9a-f-]{36}/.test(url2) ? "✓ ready detail 跳轉" : `✗ url = ${url2}`);
    const transferBtn = page.locator("button", { hasText: "串接成正式工單" }).first();
    const disabled = await transferBtn.getAttribute("disabled");
    results.push(disabled === null ? "✓ ready 串接 btn 啟用" : "✗ ready 串接 btn disabled");
    await transferBtn.click();
    await page.waitForTimeout(300);
    const modalTitle = page.locator("text=開立正式工單 RO").first();
    const visible = await modalTitle.isVisible().catch(() => false);
    results.push(visible ? "✓ 串接 modal 開啟" : "✗ modal 未開");
    // 預設 combo 描述應為 valid green box
    const comboBox = page.locator("text=MN-CP 定保客付").first();
    const okCombo = (await comboBox.count()) > 0;
    results.push(okCombo ? "✓ combo 描述 MN-CP 顯示" : "✗ combo 描述缺");
    await page.screenshot({
      path: path.join(TMP_DIR, "ro-handoff-detail-ready.png"),
      fullPage: true,
    });
    // close modal
    await page.keyboard.press("Escape").catch(() => {});
    await page.locator("button", { hasText: "返回修改" }).first().click().catch(() => {});
    await page.waitForTimeout(200);
  }

  // 3) detail — transferred (PI-260514-008)：顯示 ✓ banner + RO link
  {
    await page.goto(`${BASE}/parts/aftersales/ro-handoff`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    const link = page.locator("a", { hasText: "PI-260514-008" }).first();
    await link.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);
    const bodyText = (await page.locator("body").textContent()) ?? "";
    results.push(bodyText.includes("串接成正式工單") || bodyText.includes("已於") ? "✓ transferred banner 顯示" : "✗ transferred banner 缺");
    const roLink = page.locator("a", { hasText: "MN-CP-260515-001" }).first();
    results.push((await roLink.count()) > 0 ? "✓ RO link 顯示" : "✗ RO link 缺");
    results.push(bodyText.includes("開啟正式工單") ? "✓ 開啟正式工單 pill 顯示" : "✗ 開啟正式工單 pill 缺");
    await page.screenshot({
      path: path.join(TMP_DIR, "ro-handoff-detail-transferred.png"),
      fullPage: true,
    });
  }

  // 4) detail — awaiting (PI-260515-001)：⚠ banner + 串接 btn disabled
  {
    await page.goto(`${BASE}/parts/aftersales/ro-handoff`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    const link = page.locator("a", { hasText: "PI-260515-001" }).first();
    await link.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);
    const bodyText2 = (await page.locator("body").textContent()) ?? "";
    results.push(bodyText2.includes("尚未取得車主簽名") ? "✓ awaiting 警示 banner" : "✗ awaiting 警示 banner 缺");
    const transferBtn = page.locator("button", { hasText: "串接成正式工單" }).first();
    const disabled = await transferBtn.getAttribute("disabled");
    results.push(disabled !== null ? "✓ awaiting 串接 btn disabled" : "✗ awaiting 串接 btn 居然啟用");
    await page.screenshot({
      path: path.join(TMP_DIR, "ro-handoff-detail-awaiting.png"),
      fullPage: true,
    });
  }

  await browser.close();

  for (const r of results) console.log(r);
  if (errs.length) {
    console.log("\n--- console errors ---");
    for (const e of errs) console.log(e);
  }
  const failed = results.filter((r) => r.startsWith("✗")).length;
  if (failed > 0 || errs.length > 0) {
    log(`FAILED ${failed} checks, ${errs.length} console errors`);
    process.exit(1);
  }
  log("ALL OK");
}

main().catch((e) => {
  log("fatal", e);
  process.exit(1);
});
