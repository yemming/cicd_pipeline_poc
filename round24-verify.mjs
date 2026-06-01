// 一次性 E2E：對正式站驗第二十四輪 Batch 1 — 6 主檔的 list+detail Design Pattern
// admin 登入 → Indian scope → 每個 entity：list 渲染 + 點編輯進 detail（view→修改 pill）+ /new 進 create mode
// 另對 groups 做一次真寫入 round-trip（建立 e2e 測試集團 → detail 渲染 → 刪除清理 → 查 DB 確認乾淨由 SQL 另驗）
// 跑：node round24-verify.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://dealeros.zeabur.app";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const SHOT_DIR = "docs/test-evidence/round-24";
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
// 自動接受 confirm()（刪除確認）
page.on("dialog", (d) => d.accept().catch(() => {}));

const DENY = /無權限|請先登入|找不到|僅限管理者|沒有檢視|Coming soon|尚未開發|This page could not|Application error/i;
async function goto(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1800);
}

// 對一個 entity：驗 list 渲染 → 點第一個「編輯」進 detail → 驗 /new create mode
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

  // 2) 抓 list 第一個指向 detail 的連結（編輯 link / code link），直接 goto 進 detail
  //    （比點擊穩：client Link 導航時機難等，用真 href goto 排除 race）
  const detailHrefs = await page
    .locator(`a[href^="${listPath}/"]`)
    .evaluateAll(
      (els, lp) =>
        els
          .map((e) => e.getAttribute("href"))
          .filter((h) => h && h !== `${lp}/new`),
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
      // detail 應有 CRUD pill「修改」「返回列表」
      ok(`${key} detail 有「修改」pill`, /修改/.test(body) && /返回列表/.test(body));
      // h1 有實際標題（非空）
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

  // ── 6 主檔 list+detail+new 渲染 ──
  await verifyEntity({ key: "GRP-brands", listPath: "/admin/org/brands", listTitle: "組織架構", slug: "brands" });
  await verifyEntity({ key: "GRP-groups", listPath: "/admin/org/groups", listTitle: "組織架構", slug: "groups" });
  await verifyEntity({ key: "GRP-stores", listPath: "/admin/org/stores", listTitle: "組織架構", slug: "stores" });
  await verifyEntity({ key: "MD-contacts", listPath: "/admin/master-data/customer-contacts", listTitle: "客戶聯絡人", slug: "customer-contacts" });
  await verifyEntity({ key: "MD-leadtimes", listPath: "/admin/master-data/item-lead-times", listTitle: "前置時間", slug: "item-lead-times" });
  await verifyEntity({ key: "MD-roles", listPath: "/admin/master-data/employee-roles", listTitle: "員工角色", slug: "employee-roles" });

  // ── 真寫入 round-trip：groups 建立 e2e 測試集團 → 刪除清理 ──
  console.log(`\n[write] groups create→delete round-trip`);
  const testId = "e2e_r24_grp";
  const testName = "E2E R24 測試集團";
  await goto("/admin/org/groups/new");
  let body = await page.locator("body").innerText();
  if (!DENY.test(body)) {
    // create 表單在 <main> 內依序 3 個 input：Group ID / 名稱 / 簡稱
    const mainInputs = page.locator("main input");
    try {
      await mainInputs.nth(0).fill(testId);   // Group ID
      await mainInputs.nth(1).fill(testName); // 集團名稱
      ok("groups create 填表", true);
    } catch (e) { ok("groups create 填表", false, String(e).slice(0, 120)); }
    const createBtn = page.getByRole("button", { name: /建立並開啟|建立/ }).first();
    if (await createBtn.count()) {
      await createBtn.click().catch(() => {});
      await page.waitForTimeout(3000);
      body = await page.locator("body").innerText();
      const created = page.url().includes(testId) || new RegExp(testName).test(body);
      ok("groups create 寫入成功", created, page.url());
      await page.screenshot({ path: `${SHOT_DIR}/write-groups-created.png`, fullPage: true });
      // 刪除清理（detail pill 「刪除」→ confirm 自動 accept）
      if (created) {
        const delBtn = page.getByRole("button", { name: "刪除" }).first();
        if (await delBtn.count()) {
          await delBtn.click().catch(() => {});
          await page.waitForTimeout(3000);
          const backToList = page.url().endsWith("/admin/org/groups");
          ok("groups delete 清理成功", backToList, page.url());
        } else {
          ok("groups delete 按鈕存在", false);
        }
      }
    } else {
      ok("groups create 按鈕存在", false);
    }
  } else {
    ok("groups /new 可寫入", false, body.slice(0, 140));
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
