import { chromium } from "@playwright/test";

const BASE_URL = "https://dealeros.zeabur.app";
const OUT_DIR = "docs/20260815/screenshots";
const SWITCHER_TITLE = '[title="切換品牌 / 門店"]';

async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await gotoDashboardSettled(page);
}

async function openSwitcher(page) {
  const btn = page.locator(SWITCHER_TITLE);
  await btn.waitFor({ state: "visible", timeout: 10000 });
  await btn.click();
  await page.waitForTimeout(400);
}

async function gotoDashboardSettled(page) {
  // headless 環境下 Next RSC prefetch 常被 abort，直接用 full navigation 取代 waitForURL 賭 race
  await page.waitForTimeout(2000);
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForTimeout(1200);
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  // 1) test-sch — 應看到 Indian（已知：所屬 org「雙洽興高雄據點」is_active=false，
  //    getAccessibleScopes() 有 .eq("is_active", true) 過濾，這張單獨會 fallback 到 ducati，
  //    是資料問題不是本次修復範圍，仍截圖存證現況）
  await (async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    try {
      await login(page, "test-sch@dealeros-internal.test", "E2eDealer!2026");
      await page.screenshot({ path: `${OUT_DIR}/1-test-sch-home.png` });
      const text = await page.locator(SWITCHER_TITLE).innerText().catch(() => "(找不到 switcher，代表 accessibleBrands 為空)");
      console.log("[test-sch] switcher text:", text);
    } catch (e) {
      console.error("[test-sch] ERROR", e.message);
    } finally {
      await ctx.close();
    }
  })();

  // 2) test-mj — 應看到 Indian，且能切到 Lambretta
  await (async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    try {
      await login(page, "test-mj@dealeros-internal.test", "E2eDealer!2026");
      await page.screenshot({ path: `${OUT_DIR}/3-test-mj-home.png` });
      console.log("[test-mj] switcher text:", await page.locator(SWITCHER_TITLE).innerText().catch(() => "(找不到 switcher)"));
      await openSwitcher(page);
      await page.screenshot({ path: `${OUT_DIR}/3b-test-mj-switcher.png` });
      const lambretta = page.getByRole("button", { name: /Lambretta/i }).first();
      const hasLambretta = (await lambretta.count()) > 0;
      console.log("[test-mj] Lambretta option found:", hasLambretta);
      if (hasLambretta) {
        await lambretta.click();
        await page.waitForTimeout(1200);
      }
      await page.screenshot({ path: `${OUT_DIR}/4-test-mj-lambretta.png` });
      console.log("[test-mj] switcher text after switch:", await page.locator(SWITCHER_TITLE).innerText().catch(() => "(找不到 switcher)"));
    } catch (e) {
      console.error("[test-mj] ERROR", e.message);
    } finally {
      await ctx.close();
    }
  })();

  // 3) test-td — 應看到 Indian
  await (async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    try {
      await login(page, "test-td@dealeros-internal.test", "E2eDealer!2026");
      await page.screenshot({ path: `${OUT_DIR}/5-test-td-home.png` });
      console.log("[test-td] switcher text:", await page.locator(SWITCHER_TITLE).innerText().catch(() => "(找不到 switcher)"));
    } catch (e) {
      console.error("[test-td] ERROR", e.message);
    } finally {
      await ctx.close();
    }
  })();

  // 4) 既有 Ducati 帳號回歸測試（yemming.yu@gmail.com 同時有 indian(admin) + ducati(member) 兩筆 profile_brands）
  await (async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    try {
      await login(page, "yemming.yu@gmail.com", "yemming.yu@gmail.com");
      console.log("[ducati-regression] default switcher text:", await page.locator(SWITCHER_TITLE).innerText().catch(() => "(找不到 switcher)"));
      await openSwitcher(page);
      const ducatiOpt = page.getByRole("button", { name: /Ducati/i }).first();
      const hasDucati = (await ducatiOpt.count()) > 0;
      console.log("[ducati-regression] Ducati option found:", hasDucati);
      if (hasDucati) {
        await ducatiOpt.click();
        await page.waitForTimeout(1200);
      }
      await page.screenshot({ path: `${OUT_DIR}/6-ducati-regression-home.png` });
      console.log("[ducati-regression] switcher text after switch:", await page.locator(SWITCHER_TITLE).innerText().catch(() => "(找不到 switcher)"));
    } catch (e) {
      console.error("[ducati-regression] ERROR", e.message);
    } finally {
      await ctx.close();
    }
  })();

  await browser.close();
  console.log("DONE");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
