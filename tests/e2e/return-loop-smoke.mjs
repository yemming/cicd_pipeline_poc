// 退料閉環 + TL 工單 — 本機冒煙驗證（admin 帳號、indian scope）
// 跑：node tests/e2e/return-loop-smoke.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://localhost:3100";
const DEMO_RO = "201532f6-0d00-4b36-bad2-01a340338a2a"; // RP-CP-260616-901（3 part lines）
const TL_RO = "61c3387d-e6fa-4af8-bc3c-b7d7f74aa2a3"; // TL-IN-260616-901
const OUT = "/tmp/return-tl";
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function log(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}
async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }).catch(() => {});
}
async function has(page, testid, timeout = 8000) {
  try {
    await page.waitForSelector(`[data-testid="${testid}"]`, { timeout });
    return true;
  } catch {
    return false;
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

try {
  // 登入（yemming admin，email/password 表單）
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type=email]', "yemming.yu@gmail.com");
  await page.fill('input[type=password]', "yemming.yu@gmail.com");
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {});
  await shot(page, "00_after-login");
  log("登入完成", !page.url().includes("/login"), page.url());
  // 切 indian scope（admin 預設 ducati，否則 indian 詳情會被 RLS 遮成 404）
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: "indian", store_id: null }),
      domain: "localhost",
      path: "/",
    },
  ]);
  // 1. return-in Tab B
  await page.goto(`${BASE}/parts/receipt/return-in`, { waitUntil: "domcontentloaded" });
  const tabB = await has(page, "tab-return-confirmation").catch(() => false);
  // Tab 可能用文字按鈕；先截圖
  await shot(page, "01_return-in_loaded");
  log("return-in 頁載入", !/Application error|500/.test(await page.content()));

  // 2. 新工單 → TL
  await page.goto(`${BASE}/parts/aftersales/repair-orders/new`, { waitUntil: "domcontentloaded" });
  const hasTLcard = await has(page, "prefix-TL");
  log("新工單頁有 TL 業務類型卡", hasTLcard);
  if (hasTLcard) {
    await page.click('[data-testid="prefix-TL"]');
    const tlForm = await has(page, "tl-form");
    log("選 TL → 顯示借用測試表單", tlForm);
    await shot(page, "02_tl-form");
    log("TL 表單有借出目的欄", await has(page, "tl-loan-purpose", 3000));
    log("TL 表單有 SA 簽名", await has(page, "tl-sa-signature-canvas", 3000));
    log("TL 表單有技師簽名", await has(page, "tl-tech-signature-canvas", 3000));
  }

  // 3. addons 取消頁
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${DEMO_RO}/addons`, {
    waitUntil: "domcontentloaded",
  });
  await shot(page, "03_addons-cancel");
  log("追加取消頁有整筆取消鈕", await has(page, "cancel-agreed-btn"));

  // 4. tl-close 結案頁
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${TL_RO}/tl-close`, {
    waitUntil: "domcontentloaded",
  });
  await shot(page, "04_tl-close");
  log("TL 結案頁表單", await has(page, "tl-close-form"));
  log("TL 結案頁零件行處置 radio", await has(page, "line-0-return-to-stock", 3000));

  // 5. RO 詳情頁 — cancel-ro-btn / TL due badge
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${TL_RO}`, { waitUntil: "domcontentloaded" });
  await shot(page, "05_tl-detail");
  log("TL 詳情頁顯示 due-by badge", await has(page, "tl-due-by-badge"));

  await page.goto(`${BASE}/parts/aftersales/repair-orders/${DEMO_RO}`, { waitUntil: "domcontentloaded" });
  log("RO 詳情頁有取消工單鈕", await has(page, "cancel-ro-btn"));
  await shot(page, "06_ro-detail");

  // 6. /notifications
  await page.goto(`${BASE}/notifications`, { waitUntil: "domcontentloaded" });
  log("通知中心頁載入", await has(page, "notifications-inbox", 5000));
  await shot(page, "07_notifications");

  // 7. 退料閉環：取消 demo RO → Tab B 確認 → 庫存回補
  // 先記錄煞車皮料件(CON-FIL-001 = 2041680a) 取消前可用量
  const itemId = "2041680a-cff2-4bce-e749-992c9e8fccd0";
  const before = await page.evaluate(async (id) => {
    const r = await fetch(`/api/stock-balance?item_id=${id}`);
    return (await r.json()).available_qty;
  }, itemId);
  log("取消前可用庫存", true, `available_qty=${before}`);

  await page.goto(`${BASE}/parts/aftersales/repair-orders/${DEMO_RO}`, { waitUntil: "domcontentloaded" });
  if (await has(page, "cancel-ro-btn")) {
    await page.click('[data-testid="cancel-ro-btn"]');
    if (await has(page, "cancel-ro-modal", 4000)) {
      await page.fill('[data-testid="cancel-reason-input"]', "冒煙測試：客戶取消");
      await page.click('[data-testid="confirm-cancel-btn"]');
      const cancelled = await has(page, "ro-cancelled-badge", 8000);
      log("取消工單成功（已取消 badge）", cancelled);
      await shot(page, "08_ro-cancelled");
    }
  }
  // 驗退料待確認記錄已建立
  const rts = await page.evaluate(async (ro) => {
    const r = await fetch(`/api/parts-return-requests?source_ro_id=${ro}&status=pending`);
    return (await r.json()).data;
  }, DEMO_RO);
  log("取消後建立退料待確認記錄", Array.isArray(rts) && rts.length >= 1, `count=${rts?.length}`);
  // 取消後庫存「未立即回補」
  const afterCancel = await page.evaluate(async (id) => {
    const r = await fetch(`/api/stock-balance?item_id=${id}`);
    return (await r.json()).available_qty;
  }, itemId);
  log("取消後庫存未立即回補", afterCancel === before, `before=${before} after=${afterCancel}`);

  // Tab B 倉管確認其中一筆 → 庫存回補
  await page.goto(`${BASE}/parts/receipt/return-in`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="tab-return-confirmation"]', { timeout: 15000 }).catch(() => {});
  await page.click('[data-testid="tab-return-confirmation"]').catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, "09_tabB");
  log("Tab B 顯示退料待確認清單", await has(page, "return-request-list", 6000));
  // 點第一筆「確認」展開 inline 表單
  const toggle = page.locator('[data-testid="return-request-item"]').first();
  if ((await toggle.count()) > 0) {
    await toggle.click();
    const formShown = await has(page, "confirm-return-btn", 5000);
    log("展開倉管確認表單", formShown);
    if (formShown) {
      await page.click('[data-testid="return-type-full-return"]').catch(() => {});
      await page.fill('[data-testid="warehouse-note-input"]', "冒煙：零件完好已入庫").catch(() => {});
      await page.click('[data-testid="confirm-return-btn"]');
      const ok = await has(page, "confirm-success-toast", 8000);
      log("倉管確認成功 toast", ok);
      await shot(page, "10_confirmed");
      await page.waitForTimeout(1200);
      const afterConfirm = await page.evaluate(async (id) => {
        const r = await fetch(`/api/stock-balance?item_id=${id}`);
        return (await r.json()).available_qty;
      }, itemId);
      log("確認後庫存回補（閉環完成）", afterConfirm > afterCancel, `afterCancel=${afterCancel} afterConfirm=${afterConfirm}`);
    }
  }

  console.log("\npageerrors:", errors.length, errors.slice(0, 3));
} catch (e) {
  log("FATAL", false, String(e));
} finally {
  await shot(page, "99_final");
  await browser.close();
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n=== ${pass}/${results.length} checks passed ===`);
}
