// Round C 本機 E2E — 打 localhost:3000（既有常駐 dev），admin 登入 + Indian scope
// 覆蓋：進口文件 list+CRUD round-trip / 進口採購單 list+detail+進口付款區段編輯 / 三張列印頁渲染
// 跑：node roundC-verify.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const SHOT_DIR = "docs/test-evidence/round-C";
fs.mkdirSync(SHOT_DIR, { recursive: true });

const PO_ID = "eb7e0d4c-df25-4a82-a3be-6861215be5d0";
const SHIPMENT_ID = "621b4ad3-5738-475a-9fef-1ebf90e63936";
const VEHICLE_ID = "d8423b34-d851-4cd3-a185-6a10db0aac85";

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  ✓" : "  ✗"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));
page.on("dialog", (d) => d.accept().catch(() => {}));

const DENY = /無權限|請先登入|找不到|僅限管理者|沒有.*權限|Coming soon|尚未開發|could not be found|Application error|This page/i;
async function goto(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function login() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.locator('input[type="email"]').fill(EMAIL);
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 });
      return true;
    } catch (e) {
      if (attempt === 3) throw e;
      await page.waitForTimeout(1500);
    }
  }
}

try {
  console.log(`\n[1] 登入 ${BASE}/login`);
  await login();
  ok("登入成功", true, page.url().replace(BASE, ""));
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian" }), url: BASE }]);
  ok("設定 Indian scope cookie", true);

  // ── A) 進口文件 list + CRUD round-trip ──
  console.log(`\n[A] 進口文件 /vehicle-import/documents`);
  await goto("/vehicle-import/documents");
  let body = await page.locator("body").innerText();
  ok("文件 list 可見", !DENY.test(body), DENY.test(body) ? body.slice(0, 120) : "");
  ok("文件 list 標題", /進口文件/.test(body));
  ok("文件 list 有 DataGrid", (await page.locator("table").count()) > 0);
  await page.screenshot({ path: `${SHOT_DIR}/documents-list.png`, fullPage: true });

  // 開新增 modal → 填 → 建立
  const addBtn = page.getByRole("button", { name: /新增文件/ }).first();
  let createdDocVisible = false;
  if (await addBtn.count()) {
    await addBtn.click();
    await page.waitForTimeout(600);
    // modal: 文件類型(select) / 單號(input) ...
    const docNo = `E2E-RC-${Date.now().toString().slice(-6)}`;
    const filled = await page.getByPlaceholder("例：PI-2026-001").fill(docNo).then(() => true).catch(() => false);
    ok("文件 modal 開啟+填單號", filled, docNo);
    const submit = page.locator(".fixed").getByRole("button", { name: /^建立$/ }).first();
    if (await submit.count()) {
      await submit.click().catch(() => {});
      await page.waitForTimeout(2500);
      body = await page.locator("body").innerText();
      createdDocVisible = body.includes(docNo);
      ok("文件 create 寫入成功", createdDocVisible, docNo);
      await page.screenshot({ path: `${SHOT_DIR}/documents-after-create.png`, fullPage: true });
      // 清理：刪除剛建立的那列
      if (createdDocVisible) {
        const row = page.locator("tr", { hasText: docNo }).first();
        const delBtn = row.getByRole("button", { name: "刪除" }).first();
        if (await delBtn.count()) {
          await delBtn.click().catch(() => {});
          await page.waitForTimeout(2000);
          body = await page.locator("body").innerText();
          ok("文件 delete 清理成功", !body.includes(docNo));
        }
      }
    } else ok("文件 modal 建立按鈕存在", false);
  } else ok("文件 新增按鈕存在", false);

  // ── B) 進口採購單 list + detail + 進口付款區段編輯 ──
  console.log(`\n[B] 進口採購單 /vehicle-import/purchase-orders`);
  await goto("/vehicle-import/purchase-orders");
  body = await page.locator("body").innerText();
  ok("採購單 list 可見", !DENY.test(body), DENY.test(body) ? body.slice(0, 120) : "");
  ok("採購單 list 標題", /進口採購單/.test(body));
  ok("採購單 list 有 DataGrid", (await page.locator("table").count()) > 0);
  await page.screenshot({ path: `${SHOT_DIR}/po-list.png`, fullPage: true });

  await goto(`/vehicle-import/purchase-orders/${PO_ID}`);
  body = await page.locator("body").innerText();
  ok("採購單 detail 可見", !DENY.test(body), DENY.test(body) ? body.slice(0, 120) : "");
  ok("detail 有「進口與付款」區段", /進口與付款/.test(body));
  ok("detail 有列印鈕", /列印/.test(body));
  ok("detail 有麵包屑「進口採購單」", /進口採購單/.test(body));
  await page.screenshot({ path: `${SHOT_DIR}/po-detail.png`, fullPage: true });

  // 進口付款區段編輯 round-trip：設 PI / Incoterms / 訂金30% → 儲存 → 驗證
  const editImpBtn = page.locator("section", { hasText: "進口與付款" }).getByRole("button", { name: "編輯" }).first();
  if (await editImpBtn.count()) {
    await editImpBtn.click();
    await page.waitForTimeout(500);
    const sec = page.locator("section", { hasText: "進口與付款" });
    await sec.locator("input").nth(0).fill("PI-E2E-RC").catch(() => {}); // PI 號
    await sec.locator("select").first().selectOption("CIF").catch(() => {});
    // 訂金比例 input：第 2 個 text input（PI=0, 原產國=1? 順序 PI/原產國/訂金比例）
    const txtInputs = sec.locator('input:not([type="date"])');
    const cnt = await txtInputs.count();
    // 找含 placeholder 例：30 的訂金比例欄
    await txtInputs.nth(cnt - 1).fill("30").catch(() => {});
    const saveBtn = sec.getByRole("button", { name: /儲存/ }).first();
    await saveBtn.click().catch(() => {});
    await page.waitForTimeout(2500);
    body = await page.locator("body").innerText();
    const saved = /PI-E2E-RC/.test(body);
    ok("進口付款區段編輯儲存成功", saved, saved ? "PI-E2E-RC 已落地" : body.slice(0, 120));
    await page.screenshot({ path: `${SHOT_DIR}/po-import-edited.png`, fullPage: true });
  } else ok("進口付款區段編輯鈕存在", false);

  // ── C) 三張列印頁渲染 ──
  console.log(`\n[C] 列印頁渲染`);
  const prints = [
    { slug: "import-po", id: PO_ID, title: /進口採購單|IMPORT PURCHASE ORDER/ },
    { slug: "landed-cost-statement", id: SHIPMENT_ID, title: /落地成本結算|LANDED COST/ },
    { slug: "vehicle-cost-card", id: VEHICLE_ID, title: /車輛成本歸集卡|VEHICLE COST CARD/ },
  ];
  for (const p of prints) {
    await goto(`/print/${p.slug}/${p.id}`);
    body = await page.locator("body").innerText();
    const visible = !DENY.test(body) && p.title.test(body);
    ok(`列印 ${p.slug} 渲染`, visible, visible ? "" : body.slice(0, 120));
    // PrintToolbar「下載 PDF」存在
    ok(`列印 ${p.slug} 有下載 PDF 鈕`, /下載\s*PDF|PDF/i.test(body));
    await page.screenshot({ path: `${SHOT_DIR}/print-${p.slug}.png`, fullPage: true });
  }

  ok("無 console / page error", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
} catch (e) {
  ok("執行例外", false, String(e).slice(0, 200));
} finally {
  await browser.close();
}

const pass = results.filter((r) => r.pass).length;
const total = results.length;
console.log(`\n═══ Round C 結果：${pass}/${total} 通過 ═══`);
fs.writeFileSync(`${SHOT_DIR}/result.json`, JSON.stringify({ pass, total, results }, null, 2));
process.exit(pass === total ? 0 : 1);
