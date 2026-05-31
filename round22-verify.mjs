// 一次性 E2E：對正式站驗第二十二輪 GRP20 組織架構設定（唯讀統一樹 + 深連結）
// admin 登入 → /group/org-structure → 樹渲染（集團/法人/門店/部門）+ 點節點顯示詳情 KV
//   + 人員指派清單 + 頁面權限總覽 + 深連結 /admin/* 存在
// 跑：node round22-verify.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://dealeros.zeabur.app";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const SHOT_DIR = "docs/test-evidence/round-22";
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

const DENY = /無權限|請先登入|找不到|僅限管理者|Coming soon|尚未開發|This page could not|Application error/i;
async function goto(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2000);
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

  console.log(`\n[2] GRP20 組織架構設定 /group/org-structure`);
  await goto("/group/org-structure");
  let body = await page.locator("body").innerText();
  if (DENY.test(body)) {
    ok("GRP20 頁可見", false, body.slice(0, 160));
    await page.screenshot({ path: `${SHOT_DIR}/grp20-DENIED.png`, fullPage: true });
  } else {
    ok("GRP20 頁可見", true);
    ok("GRP20 標題", /組織架構設定/.test(body));
    ok("樹：組織樹狀結構區", /組織樹狀結構/.test(body));
    ok("樹：集團節點", /DealerOS Demo Group/.test(body));
    ok("樹：法人節點（Indian）", /Indian Motorcycle Taiwan/.test(body));
    ok("樹：法人節點（控股）", /控股/.test(body));
    ok("統計 chips", /法人/.test(body) && /門店/.test(body) && /部門/.test(body));
    ok("頁面權限總覽區", /頁面權限總覽/.test(body));
    await page.screenshot({ path: `${SHOT_DIR}/grp20-01-default.png`, fullPage: true });

    // 展開法人 → 點門店節點，驗詳情 KV 切換
    console.log(`\n[3] 點門店節點 → 詳情 KV`);
    // 先點「Indian」法人展開（預設法人層已展開），找門店節點
    const storeNode = page.locator("text=台北直營店").first();
    if (await storeNode.count()) {
      await storeNode.click();
      await page.waitForTimeout(800);
      body = await page.locator("body").innerText();
      ok("門店詳情：門市型態 KV", /門市型態/.test(body));
      ok("門店詳情：標題切換", /台北直營店/.test(body));
      await page.screenshot({ path: `${SHOT_DIR}/grp20-02-store-detail.png`, fullPage: true });
    } else {
      ok("門店節點可點", false, "找不到 台北直營店 節點");
    }

    // 點法人節點 → 人員指派清單
    console.log(`\n[4] 點法人節點 → 人員指派`);
    const subNode = page.locator("text=Indian Motorcycle Taiwan").first();
    if (await subNode.count()) {
      await subNode.click();
      await page.waitForTimeout(800);
      body = await page.locator("body").innerText();
      ok("法人詳情：統一編號 KV", /統一編號/.test(body));
      ok("人員指派區", /人員指派/.test(body));
      ok("人員指派：角色（老闆/店長等）", /老闆|店長|服務顧問|技師|倉管/.test(body));
      await page.screenshot({ path: `${SHOT_DIR}/grp20-03-sub-assignments.png`, fullPage: true });
    } else {
      ok("法人節點可點", false);
    }

    // 深連結存在
    ok("深連結 /admin/org/groups", (await page.locator('a[href="/admin/org/groups"]').count()) > 0);
    ok("深連結 /admin/navigation", (await page.locator('a[href^="/admin/navigation"]').count()) > 0);
  }

  console.log(`\n[5] sidebar 入口（系統設定 › 組織架構設定）`);
  ok("console 無嚴重錯誤", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
} catch (e) {
  ok("執行例外", false, String(e).slice(0, 200));
} finally {
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n═══ ${pass}/${results.length} 通過 ═══`);
  fs.writeFileSync(`${SHOT_DIR}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
}
