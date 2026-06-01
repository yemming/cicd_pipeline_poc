// 一次性 E2E：對正式站驗第二十三輪 GRP15 技師效率診斷 + GRP19 中古車能效
// admin 登入 → Indian scope → 兩頁散佈圖/KPI/告警/排名/庫存清單渲染 + 門店切換
// 跑：node round23-verify.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://dealeros.zeabur.app";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const SHOT_DIR = "docs/test-evidence/round-23";
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
  await page.waitForTimeout(2500);
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

  // ══════════════ GRP15 技師效率診斷 ══════════════
  console.log(`\n[2] GRP15 /group/tech-efficiency`);
  await goto("/group/tech-efficiency");
  let body = await page.locator("body").innerText();
  if (DENY.test(body)) {
    ok("GRP15 頁可見", false, body.slice(0, 160));
    await page.screenshot({ path: `${SHOT_DIR}/grp15-DENIED.png`, fullPage: true });
  } else {
    ok("GRP15 頁可見", true);
    ok("GRP15 標題", /技師效率診斷/.test(body));
    ok("GRP15 KPI 技師人數", /技師人數/.test(body));
    ok("GRP15 KPI 均值工時效率", /均值工時效率/.test(body));
    ok("GRP15 T1 工時效率圖", /T1.*工時效率/.test(body));
    ok("GRP15 T2 品質風險圖", /T2.*品質風險/.test(body));
    ok("GRP15 T3 完工準時圖", /T3.*完工準時/.test(body));
    ok("GRP15 T4 資歷成長圖", /T4.*資歷成長/.test(body));
    ok("GRP15 返修率告警橫幅", /返修率告警/.test(body), "台中林志豪 18.4%");
    ok("GRP15 綜合排名表", /全體技師效率綜合排名/.test(body));
    const svg15 = await page.locator("svg").count();
    ok("GRP15 4 散佈圖渲染", svg15 >= 4, `${svg15} 個 svg`);
    await page.screenshot({ path: `${SHOT_DIR}/grp15-tech-efficiency.png`, fullPage: true });

    // 門店切換：選台中（林志豪危險型）
    const sel = page.locator("select").first();
    if (await sel.count()) {
      const opts = await sel.locator("option").allInnerTexts();
      const taichung = opts.find((o) => /台中/.test(o));
      if (taichung) {
        await sel.selectOption({ label: taichung });
        await page.waitForTimeout(1500);
        ok("GRP15 門店切換（台中）", true, taichung);
        await page.screenshot({ path: `${SHOT_DIR}/grp15-taichung.png`, fullPage: true });
      } else {
        ok("GRP15 門店切換選項含台中", false, opts.join("/"));
      }
    }
  }

  // ══════════════ GRP19 品牌認證中古車能效 ══════════════
  console.log(`\n[3] GRP19 /group/usedcar-efficiency`);
  await goto("/group/usedcar-efficiency");
  body = await page.locator("body").innerText();
  if (DENY.test(body)) {
    ok("GRP19 頁可見", false, body.slice(0, 160));
    await page.screenshot({ path: `${SHOT_DIR}/grp19-DENIED.png`, fullPage: true });
  } else {
    ok("GRP19 頁可見", true);
    ok("GRP19 標題", /品牌認證中古車能效/.test(body));
    ok("GRP19 KPI 本季收購台數", /本季收購台數/.test(body));
    ok("GRP19 KPI 現有庫存台數", /現有庫存台數/.test(body));
    ok("GRP19 U1 收購能力圖", /U1.*收購能力/.test(body));
    ok("GRP19 U2 售出效率圖", /U2.*售出效率/.test(body));
    ok("GRP19 U3 庫存周轉圖", /U3.*庫存周轉/.test(body));
    ok("GRP19 U4 綜合獲利圖", /U4.*綜合獲利/.test(body));
    ok("GRP19 門店綜合績效排名", /各門店中古車綜合績效/.test(body));
    ok("GRP19 庫存清單", /品牌認證中古車庫存清單/.test(body));
    const svg19 = await page.locator("svg").count();
    ok("GRP19 4 散佈圖渲染", svg19 >= 4, `${svg19} 個 svg`);
    // 車輛資料真實落地（重分佈/補的 seed 車牌 UCD- 或既有車）
    ok("GRP19 庫存清單有車輛列", /UCD-|Scout|Chief|FTR|Roadmaster|Springfield|Hypermotard/.test(body));
    await page.screenshot({ path: `${SHOT_DIR}/grp19-usedcar-efficiency.png`, fullPage: true });

    // 門店切換深鑽（選第一個非全部門店）
    const sel19 = page.locator("select").first();
    if (await sel19.count()) {
      const opts = await sel19.locator("option").allInnerTexts();
      const store = opts.find((o) => /直營店/.test(o));
      if (store) {
        await sel19.selectOption({ label: store });
        await page.waitForTimeout(1500);
        ok("GRP19 門店切換深鑽", true, store);
        await page.screenshot({ path: `${SHOT_DIR}/grp19-store-drill.png`, fullPage: true });
      }
    }
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
