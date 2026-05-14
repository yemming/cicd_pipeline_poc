#!/usr/bin/env node
// Smoke test for /dashboard/store-overview（門店綜合概覽）
// - 純 dashboard，無 CRUD
// - 驗 H1 / range select / nps-compare / nps-trend-chart / staff-ranking / top-tags / alert-list
// - range 切換 90d / ytd → URL 帶 ?range=XXX
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP_DIR = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[store-overview-smoke]", ...m);

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
      value: JSON.stringify({ brand_id: "indian", store_id: null }),
      url: BASE,
    },
  ]);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
  });

  const results = [];
  const uniqSuffix = String(Date.now()).slice(-6);

  // 1) 載入 dashboard（cold compile 給 180s）
  {
    const resp = await page.goto(`${BASE}/dashboard/store-overview`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load dashboard",
        reason: `status=${status} url=${finalUrl}`,
      });
    } else {
      results.push({ ok: true, step: "load dashboard", status });
    }
  }

  // 2) H1
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("門店綜合概覽")
        ? { ok: true, step: "H1" }
        : { ok: false, step: "H1", reason: `h1="${h1}"` },
    );
  }

  // 3) range select 存在
  {
    const c = await page.getByTestId("store-range-select").count();
    results.push(
      c === 1
        ? { ok: true, step: "range select present" }
        : { ok: false, step: "range select present", reason: `count=${c}` },
    );
  }

  // 4) NPS 跨部門比較（銷售 vs 售後）
  {
    const c = await page.getByTestId("nps-compare").count();
    results.push(
      c >= 1
        ? { ok: true, step: "nps-compare rendered" }
        : { ok: false, step: "nps-compare rendered" },
    );
  }

  // 5) NPS 趨勢圖
  {
    const c = await page.getByTestId("nps-trend-chart").count();
    results.push(
      c >= 1
        ? { ok: true, step: "nps-trend-chart rendered" }
        : { ok: false, step: "nps-trend-chart rendered" },
    );
  }

  // 6) 員工排行表
  {
    const c = await page.getByTestId("staff-ranking").count();
    results.push(
      c >= 1
        ? { ok: true, step: "staff-ranking rendered" }
        : { ok: false, step: "staff-ranking rendered" },
    );
  }

  // 7) Top tags（跨部門標籤）
  {
    const c = await page.getByTestId("top-tags").count();
    results.push(
      c >= 1
        ? { ok: true, step: "top-tags rendered" }
        : { ok: false, step: "top-tags rendered" },
    );
  }

  // 8) Alerts 區塊
  {
    const c = await page.getByTestId("alert-list").count();
    results.push(
      c >= 1
        ? { ok: true, step: "alert-list rendered" }
        : { ok: false, step: "alert-list rendered" },
    );
    await page.screenshot({
      path: path.join(TMP_DIR, `store-overview-default-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  // 9) 切 range = 90d → URL 帶 ?range=90d
  {
    await page.getByTestId("store-range-select").selectOption("90d");
    await page
      .waitForURL((u) => u.toString().includes("range=90d"), { timeout: NAV_TIMEOUT })
      .catch(() => {});
    const ok = page.url().includes("range=90d");
    results.push(
      ok
        ? { ok: true, step: "range=90d switch" }
        : { ok: false, step: "range=90d switch", reason: page.url() },
    );
  }

  // 10) 切 range = ytd → URL 帶 ?range=ytd
  {
    await page.getByTestId("store-range-select").selectOption("ytd");
    await page
      .waitForURL((u) => u.toString().includes("range=ytd"), { timeout: NAV_TIMEOUT })
      .catch(() => {});
    const ok = page.url().includes("range=ytd");
    results.push(
      ok
        ? { ok: true, step: "range=ytd switch" }
        : { ok: false, step: "range=ytd switch", reason: page.url() },
    );
    // 切換後 dashboard 仍渲染
    const h1After = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1After.includes("門店綜合概覽")
        ? { ok: true, step: "ytd dashboard re-rendered" }
        : { ok: false, step: "ytd dashboard re-rendered", reason: h1After },
    );
    await page.screenshot({
      path: path.join(TMP_DIR, `store-overview-ytd-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  // 11) 切回 30d（default）
  {
    await page.getByTestId("store-range-select").selectOption("30d");
    await page
      .waitForURL((u) => !u.toString().includes("range="), { timeout: NAV_TIMEOUT })
      .catch(() => {});
    const ok = !page.url().includes("range=");
    results.push(
      ok
        ? { ok: true, step: "range=30d back to default" }
        : { ok: false, step: "range=30d back to default", reason: page.url() },
    );
  }

  await browser.close();

  // 忽略 shell 既存 caret-color / hydration noise
  const realErrors = consoleErrors.filter(
    (e) => !e.includes("caret-color") && !e.includes("hydration"),
  );
  const failed = results.filter((r) => !r.ok);
  console.log(
    JSON.stringify(
      { results, realErrors, ignored: consoleErrors.length, failed },
      null,
      2,
    ),
  );
  if (failed.length > 0 || realErrors.length > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[store-overview-smoke] unexpected", e);
  process.exit(2);
});
