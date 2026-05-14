#!/usr/bin/env node
// Smoke test for /sales/crm/nps-dashboard（銷售 NPS 看板）
// - 純 dashboard，不做 CRUD
// - 確認 H1 / KPI 5 卡 / 趨勢圖容器 / 分組表 / 批評者清單渲染
// - range select 切換 → URL 帶 ?range=XXX
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP_DIR = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[nps-dashboard-smoke]", ...m);

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
  // 強制把 active scope 切到 indian（demo 資料只塞在 indian）
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

  // 1) 載入 dashboard
  {
    const resp = await page.goto(`${BASE}/sales/crm/nps-dashboard`, {
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
      h1.includes("銷售 NPS 看板") || h1.includes("銷售NPS看板")
        ? { ok: true, step: "H1" }
        : { ok: false, step: "H1", reason: `h1="${h1}"` },
    );
  }

  // 3) KPI cards: score / total / promoter / passive / detractor
  {
    const score = await page.getByTestId("nps-kpi-score").innerText().catch(() => "");
    const total = await page.getByTestId("nps-kpi-total").innerText().catch(() => "");
    const promoter = await page.getByTestId("nps-kpi-promoter").innerText().catch(() => "");
    const passive = await page.getByTestId("nps-kpi-passive").innerText().catch(() => "");
    const detractor = await page.getByTestId("nps-kpi-detractor").innerText().catch(() => "");
    const allPresent =
      score !== "" && total !== "" && promoter !== "" && passive !== "" && detractor !== "";
    results.push(
      allPresent
        ? {
            ok: true,
            step: "KPI cards rendered",
            kpi: { score, total, promoter, passive, detractor },
          }
        : {
            ok: false,
            step: "KPI cards rendered",
            reason: `score="${score}" total="${total}" promoter="${promoter}" passive="${passive}" detractor="${detractor}"`,
          },
    );
  }

  // 4) Range select 存在
  {
    const sel = page.getByTestId("nps-range-select");
    const c = await sel.count();
    results.push(
      c === 1
        ? { ok: true, step: "range select present" }
        : { ok: false, step: "range select present" },
    );
  }

  // 5) Trend chart container
  {
    const c = await page.getByTestId("nps-trend-chart").count();
    results.push(
      c >= 1
        ? { ok: true, step: "trend chart rendered" }
        : { ok: false, step: "trend chart rendered" },
    );
  }

  // 6) 分組表（門店 / 業務員）
  {
    const store = await page.getByTestId("nps-group-store").count();
    const sales = await page.getByTestId("nps-group-sales").count();
    results.push(
      store >= 1 && sales >= 1
        ? { ok: true, step: "group tables rendered" }
        : { ok: false, step: "group tables rendered", reason: `store=${store} sales=${sales}` },
    );
  }

  // 7) 批評者清單（30 筆 demo 應該有幾筆 < 7 分）
  {
    const body = await page.locator("body").innerText().catch(() => "");
    const hasDetractorBlock =
      body.includes("最近批評者留言") || body.includes("0–6 分");
    results.push(
      hasDetractorBlock
        ? { ok: true, step: "detractor section rendered" }
        : { ok: false, step: "detractor section rendered" },
    );
    await page.screenshot({
      path: path.join(TMP_DIR, `sales-nps-dashboard-default-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  // 8) 切 range = 7d → URL 帶 ?range=7d
  {
    await page.getByTestId("nps-range-select").selectOption("7d");
    await page
      .waitForURL((u) => u.toString().includes("range=7d"), { timeout: NAV_TIMEOUT })
      .catch(() => {});
    const ok = page.url().includes("range=7d");
    results.push(
      ok
        ? { ok: true, step: "range=7d switch" }
        : { ok: false, step: "range=7d switch", reason: page.url() },
    );
  }

  // 9) 切 range = all → URL 帶 ?range=all
  {
    await page.getByTestId("nps-range-select").selectOption("all");
    await page
      .waitForURL((u) => u.toString().includes("range=all"), { timeout: NAV_TIMEOUT })
      .catch(() => {});
    const ok = page.url().includes("range=all");
    results.push(
      ok
        ? { ok: true, step: "range=all switch" }
        : { ok: false, step: "range=all switch", reason: page.url() },
    );
    // all range KPI 數字應該至少 >= 預設 90d（如果 demo 有 90 天外的就更多）
    const total = await page.getByTestId("nps-kpi-total").innerText().catch(() => "");
    results.push(
      total !== ""
        ? { ok: true, step: "all-range KPI re-rendered", total }
        : { ok: false, step: "all-range KPI re-rendered" },
    );
    await page.screenshot({
      path: path.join(TMP_DIR, `sales-nps-dashboard-all-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  await browser.close();

  // 忽略 hydration / caret-color noise（shell 既存問題、非本頁引入）
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
  console.error("[nps-dashboard-smoke] unexpected", e);
  process.exit(2);
});
