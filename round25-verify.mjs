// 一次性 E2E：對正式站驗第二十四輪 Batch 2 — 集團定價 GRP14 + 促銷 GRP13 的 list+detail Design Pattern
// admin 登入 → Indian scope → 每個 entity：list(DataGrid) 渲染 + detail（view + 修改 pill）+ /new create mode
// 另對 pricing 做一次真寫入 round-trip（建立 e2e 測試定價 draft → detail 渲染 → 刪除清理）
// 跑：node round25-verify.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://dealeros.zeabur.app";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const SHOT_DIR = "docs/test-evidence/round-25";
fs.mkdirSync(SHOT_DIR, { recursive: true });

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

const DENY = /無權限|請先登入|找不到此|僅限管理者|沒有檢視|Coming soon|尚未開發|This page could not|Application error/i;
async function goto(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1800);
}

async function verifyEntity({ key, listPath, listTitle, slug }) {
  console.log(`\n[entity] ${key} ${listPath}`);
  // 1) list
  await goto(listPath);
  let body = await page.locator("body").innerText();
  if (DENY.test(body)) {
    ok(`${key} list 可見`, false, body.slice(0, 140));
    await page.screenshot({ path: `${SHOT_DIR}/${slug}-list-DENIED.png`, fullPage: true });
    return;
  }
  ok(`${key} list 可見`, true);
  if (listTitle) ok(`${key} list 標題`, new RegExp(listTitle).test(body), listTitle);
  ok(`${key} list 有 DataGrid`, (await page.locator("table").count()) > 0);
  await page.screenshot({ path: `${SHOT_DIR}/${slug}-list.png`, fullPage: true });

  // 2) 抓 list 第一個指向 detail 的 a[href]（主欄 Link）
  const detailHrefs = await page
    .locator(`a[href^="${listPath}/"]`)
    .evaluateAll(
      (els, lp) => els.map((e) => e.getAttribute("href")).filter((h) => h && h !== `${lp}/new`),
      listPath,
    );
  const detailHref = detailHrefs[0];
  if (detailHref) {
    await goto(detailHref);
    body = await page.locator("body").innerText();
    const onDetail = page.url().includes(detailHref);
    if (DENY.test(body)) {
      ok(`${key} detail 可見`, false, body.slice(0, 140));
    } else {
      ok(`${key} detail 可見`, onDetail, page.url().replace(BASE, ""));
      ok(`${key} detail 有「修改」pill`, /修改/.test(body) && /返回列表/.test(body));
      const h1 = (await page.locator("h1").first().innerText().catch(() => "")).trim();
      ok(`${key} detail 有標題`, h1.length > 0, h1.slice(0, 30));
      await page.screenshot({ path: `${SHOT_DIR}/${slug}-detail.png`, fullPage: true });
    }
  } else {
    ok(`${key} list 有 detail 連結`, false, "找不到指向 detail 的 a[href]");
  }

  // 3) /new create mode
  await goto(`${listPath}/new`);
  body = await page.locator("body").innerText();
  if (DENY.test(body)) {
    ok(`${key} /new 可見`, false, body.slice(0, 140));
  } else {
    ok(`${key} /new create mode`, /建立模式|建立並開啟|未命名|尚未建立|建立後/.test(body), "create UI");
    await page.screenshot({ path: `${SHOT_DIR}/${slug}-new.png`, fullPage: true });
  }
}

try {
  console.log(`\n[1] 登入 ${BASE}/login`);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 });
  ok("登入成功", true, page.url());
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian" }), url: BASE }]);
  ok("設定 Indian scope cookie", true);

  // ── Batch 2 兩模組 list+detail+new 渲染 ──
  await verifyEntity({ key: "GRP14-pricing", listPath: "/group/pricing", listTitle: "定價折扣設定", slug: "pricing" });
  await verifyEntity({ key: "GRP13-promotions", listPath: "/group/promotions", listTitle: "促銷活動管理", slug: "promotions" });

  // ── 真寫入 round-trip：pricing 建立 draft → 刪除清理 ──
  console.log(`\n[write] pricing create→delete round-trip`);
  const testName = "E2E R25 測試定價";
  await goto("/group/pricing/new");
  let body = await page.locator("body").innerText();
  if (!DENY.test(body)) {
    // create 表單 main input 順序：name / code / msrp / cost / discMin / discMax / effDate(date)
    const mainInputs = page.locator("main input");
    try {
      await mainInputs.nth(0).fill(testName);  // 品項名稱
      await mainInputs.nth(1).fill("E2E-R25");  // 品號
      await mainInputs.nth(2).fill("10000");    // 建議售價
      await mainInputs.nth(4).fill("90");        // 折扣下限
      await mainInputs.nth(5).fill("100");       // 折扣上限
      ok("pricing create 填表", true);
    } catch (e) { ok("pricing create 填表", false, String(e).slice(0, 120)); }
    const createBtn = page.getByRole("button", { name: /建立並開啟|建立/ }).first();
    if (await createBtn.count()) {
      await createBtn.click().catch(() => {});
      await page.waitForTimeout(3500);
      body = await page.locator("body").innerText();
      const created = /\/group\/pricing\/[0-9a-f-]{8,}/.test(page.url()) && new RegExp(testName).test(body);
      ok("pricing create 寫入成功", created, page.url().replace(BASE, ""));
      await page.screenshot({ path: `${SHOT_DIR}/write-pricing-created.png`, fullPage: true });
      if (created) {
        // 草稿狀態 → 應出現「送審」pill（狀態機）
        ok("pricing detail 有狀態機 pill", /送審/.test(body));
        const delBtn = page.getByRole("button", { name: "刪除" }).first();
        if (await delBtn.count()) {
          await delBtn.click().catch(() => {});
          await page.waitForTimeout(3000);
          const backToList = page.url().endsWith("/group/pricing");
          ok("pricing delete 清理成功", backToList, page.url().replace(BASE, ""));
        } else {
          ok("pricing delete 按鈕存在", false);
        }
      }
    } else {
      ok("pricing create 按鈕存在", false);
    }
  } else {
    ok("pricing /new 可寫入", false, body.slice(0, 140));
  }

  ok("無 console / page error", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
} catch (e) {
  ok("執行例外", false, String(e).slice(0, 200));
} finally {
  await browser.close();
}

const pass = results.filter((r) => r.pass).length;
const total = results.length;
console.log(`\n═══ 結果：${pass}/${total} 通過 ═══`);
fs.writeFileSync(`${SHOT_DIR}/result.json`, JSON.stringify({ pass, total, results }, null, 2));
process.exit(pass === total ? 0 : 1);
