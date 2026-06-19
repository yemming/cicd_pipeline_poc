// Russell 2026-06-19 庫存模組場景式自測 — Pass1 全場景現況截圖（正式站 indian scope）
// 跑：node tests/e2e/russell-inv-selftest-20260619.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.BASE || "https://dealeros.zeabur.app";
const HOST = new URL(BASE).hostname;
const OUT = "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260619/shots";
fs.mkdirSync(OUT, { recursive: true });

const RO_ID = "7e877ef7-e59d-4dc0-b992-2b1c2548aebe"; // TL-IN-260619-001 indian
const SUPPLIER_OEM_ID = "55e8363e-7958-406b-99c3-ca3b631f9e8f"; // Indian Motorcycle USA (VEHICLE_DEALER/原廠)
const WC_OK = []; // warranty claim ids 動態抓

const log = (m) => console.log(m);
async function shot(page, name, full = true) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }).catch((e) => log("shot fail " + name + " " + e));
  log("📸 " + name);
}
async function go(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => log("goto fail " + path + " " + e));
  await page.waitForTimeout(1800);
}
async function has(page, t) {
  return (await page.content()).includes(t);
}
// 每個場景包一層，單一失敗不影響其他
async function step(name, fn) {
  try { await fn(); } catch (e) { log(`✗ ${name} ERROR: ${e.message}`); }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1480, height: 1150 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);

try {
  // ── 登入 + 切 Indian scope ──
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type=email]', "yemming.yu@gmail.com");
  await page.fill('input[type=password]', "yemming.yu@gmail.com");
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => {});
  log("登入後 URL: " + page.url());
  await ctx.addCookies([
    { name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian", store_id: null }), domain: HOST, path: "/" },
  ]);
  await page.waitForTimeout(800);

  // ═══ 場景一：零件預留機制 ═══
  await step("場景一", async () => {
    await go(page, "/parts/issue/repair-pick/new");
    log("S1 領料new頁含『預留』: " + (await has(page, "預留")));
    log("S1 含『可用』: " + (await has(page, "可用")));
    await shot(page, "S1a_repair-pick-new");
    // 技師工作台（預留實際接點）
    await go(page, "/tech");
    log("S1 tech頁含『預留』: " + (await has(page, "預留")));
    await shot(page, "S1b_tech-workstation");
  });

  // ═══ 場景二：出庫後零件費用更新工單 ═══
  await step("場景二", async () => {
    await go(page, `/parts/aftersales/repair-orders/${RO_ID}`);
    log("S2 RO詳情含『零件』: " + (await has(page, "零件")));
    log("S2 RO詳情含『小計』: " + (await has(page, "小計")));
    await shot(page, "S2a_repair-order-detail");
    await go(page, `/parts/aftersales/repair-orders/${RO_ID}/lines`);
    await shot(page, "S2b_repair-order-lines");
  });

  // ═══ 場景三：退料三型 ═══
  await step("場景三", async () => {
    await go(page, "/parts/receipt/return-in/new");
    log("S3 退料new含『完整退料』: " + (await has(page, "完整退料")));
    log("S3 退料new含『損耗核銷』: " + (await has(page, "損耗")));
    await shot(page, "S3a_return-in-new");
    await go(page, "/parts/receipt/return-in");
    log("S3 退料確認含『ro_cancel/整單取消』: " + ((await has(page, "取消")) || (await has(page, "ro_cancel"))));
    await shot(page, "S3b_return-in-confirm");
    await go(page, "/parts/count/writeoffs");
    log("S3 核銷審批含『審批/核准』: " + ((await has(page, "審批")) || (await has(page, "核准"))));
    await shot(page, "S3c_writeoffs-approval");
  });

  // ═══ 場景四：採購部分到貨 ═══
  await step("場景四", async () => {
    await go(page, "/parts/purchase/orders");
    log("S4 採購列表含『部分到貨』: " + (await has(page, "部分到貨")));
    await shot(page, "S4a_purchase-orders-list");
    await go(page, "/parts/receipt/po-grn/new");
    log("S4 GRN收貨頁含『訂購/已收』: " + ((await has(page, "訂購")) || (await has(page, "已收"))));
    await shot(page, "S4b_po-grn-new");
  });

  // ═══ 場景五：保固索賠舊件 ═══
  await step("場景五", async () => {
    await go(page, "/parts/warranty/staging-warehouse");
    log("S5 暫存倉頁含『暫存』: " + (await has(page, "暫存")));
    await shot(page, "S5a_staging-warehouse");
    await go(page, "/parts/warranty/used-parts");
    log("S5 舊件登記含『舊件/暫存倉』: " + ((await has(page, "舊件")) || (await has(page, "暫存"))));
    await shot(page, "S5b_used-parts");
    await go(page, "/parts/warranty/ro-link");
    log("S5 索賠頁含『核准/拒絕』: " + ((await has(page, "核准")) || (await has(page, "拒絕"))));
    await shot(page, "S5c_warranty-claims");
    await go(page, "/admin/master-data/warranty-claims");
    await shot(page, "S5d_warranty-claims-admin");
  });

  // ═══ 場景六：跨門店調撥 ═══
  await step("場景六", async () => {
    await go(page, "/parts/issue/transfer-out/new");
    log("S6 調撥出庫new含『調撥/目標倉』: " + ((await has(page, "調撥")) || (await has(page, "目標"))));
    await shot(page, "S6a_transfer-out-new");
    await go(page, "/parts/operations/transfers-in-transit");
    log("S6 在途頁含『在途』: " + (await has(page, "在途")));
    await shot(page, "S6b_transfers-in-transit");
    await go(page, "/parts/receipt/transfer-in");
    log("S6 接收入庫頁含『收貨/入庫』: " + ((await has(page, "收貨")) || (await has(page, "入庫"))));
    await shot(page, "S6c_transfer-in");
  });

  // ═══ 場景七：採購進貨成本記錄 ═══
  await step("場景七", async () => {
    await go(page, "/parts/receipt/po-grn");
    log("S7 GRN列表含『成本/入庫』: " + ((await has(page, "成本")) || (await has(page, "入庫"))));
    await shot(page, "S7a_po-grn-list");
    // 嘗試成本相關分析頁
    await go(page, "/parts/analytics/abc-structure");
    await shot(page, "S7b_cost-analytics");
  });

  // ═══ 場景八：供應商原廠欄位 ═══
  await step("場景八", async () => {
    await go(page, `/parts/setup/suppliers/${SUPPLIER_OEM_ID}`);
    log("S8 供應商詳情含『供應商類型』: " + (await has(page, "供應商類型")));
    log("S8 含『原廠』: " + (await has(page, "原廠")));
    log("S8 含『經銷商代碼』: " + (await has(page, "經銷商代碼")));
    await shot(page, "S8a_supplier-detail");
  });

  // ═══ 場景九：Price Book 匯入 ═══
  await step("場景九", async () => {
    await go(page, "/parts/setup/items");
    log("S9 料號頁含『匯入』: " + (await has(page, "匯入")));
    log("S9 含『Price Book』: " + (await has(page, "Price Book")));
    await shot(page, "S9a_items-import");
  });

  // ═══ 第五組：盤點 / ABC ═══
  await step("盤點", async () => {
    await go(page, "/parts/count/plans");
    log("盤點計畫頁含『盤點』: " + (await has(page, "盤點")));
    await shot(page, "X1_count-plans");
  });
  await step("ABC", async () => {
    await go(page, "/parts/analytics/abc");
    log("ABC頁含『ABC』: " + (await has(page, "ABC")));
    await shot(page, "X2_abc");
    await go(page, "/parts/analytics/stale");
    log("呆滯頁含『呆滯』: " + (await has(page, "呆滯")));
    await shot(page, "X3_stale");
  });

  log("DONE Pass1");
} catch (e) {
  log("FATAL: " + e);
  await shot(page, "99_fatal");
} finally {
  await browser.close();
}
