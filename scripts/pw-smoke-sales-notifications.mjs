#!/usr/bin/env node
// Smoke test for /sales/crm/push-notifications（推播通知設定 - 銷售）
// - Header / summary chips / 6 個事件 card 渲染
// - toggle 一筆訂閱（看到 banner、is_active 對調、重整後保留）
// - 還原 toggle，避免污染 demo 資料
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP_DIR = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[push-notifications-smoke]", ...m);

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

  // 1) Load page
  {
    const resp = await page.goto(`${BASE}/sales/crm/push-notifications`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load page",
        reason: `status=${status} url=${finalUrl}`,
      });
    } else {
      results.push({ ok: true, step: "load page", status });
    }
  }

  // 2) H1
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("推播通知設定")
        ? { ok: true, step: "H1", h1 }
        : { ok: false, step: "H1", reason: `h1="${h1}"` },
    );
  }

  // 3) Summary chip
  {
    const t = await page.getByTestId("push-summary").innerText().catch(() => "");
    results.push(
      t.includes("6")
        ? { ok: true, step: "summary shows 6 events" }
        : { ok: false, step: "summary shows 6 events", reason: t },
    );
  }

  // 4) Event cards count == 6
  {
    const count = await page.getByTestId("push-event-card").count();
    results.push(
      count === 6
        ? { ok: true, step: "6 event cards rendered" }
        : { ok: false, step: "6 event cards rendered", reason: `count=${count}` },
    );
    await page.screenshot({
      path: path.join(TMP_DIR, `sales-push-default-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  // 5) Subscription rows present (seed 應該有 6 條)
  {
    const count = await page.getByTestId("push-subscription-row").count();
    results.push(
      count >= 6
        ? { ok: true, step: "subscription rows >= 6", count }
        : { ok: false, step: "subscription rows >= 6", reason: `count=${count}` },
    );
  }

  // 6) Toggle 第一筆訂閱（記錄初始狀態 → toggle → 看 banner → 看 row 狀態反轉）
  let firstRowId = null;
  let firstInitialActive = null;
  {
    const firstRow = page.getByTestId("push-subscription-row").first();
    firstRowId = await firstRow.getAttribute("data-subscription-id");
    firstInitialActive = await firstRow.getAttribute("data-active");
    const toggleBtn = firstRow.getByTestId("push-toggle-btn");
    await toggleBtn.click();
    // 等 banner 出現
    const banner = page.getByTestId("push-banner");
    await banner.waitFor({ state: "visible", timeout: NAV_TIMEOUT }).catch(() => {});
    const bannerText = await banner.innerText().catch(() => "");
    results.push(
      bannerText.includes("✓")
        ? { ok: true, step: "toggle banner shown", bannerText }
        : { ok: false, step: "toggle banner shown", reason: bannerText },
    );

    // 等 row data-active flip
    await page
      .waitForFunction(
        ({ id, initial }) => {
          const row = document.querySelector(
            `[data-testid="push-subscription-row"][data-subscription-id="${id}"]`,
          );
          if (!row) return false;
          return row.getAttribute("data-active") !== initial;
        },
        { id: firstRowId, initial: firstInitialActive },
        { timeout: NAV_TIMEOUT },
      )
      .catch(() => {});
    let newActive = null;
    try {
      newActive = await page
        .locator(
          `[data-testid="push-subscription-row"][data-subscription-id="${firstRowId}"]`,
        )
        .getAttribute("data-active", { timeout: 10_000 });
    } catch {
      // dump DOM for debugging
      const dump = await page
        .locator('[data-testid="push-subscription-row"]')
        .evaluateAll((els) =>
          els.map((el) => ({
            id: el.getAttribute("data-subscription-id"),
            active: el.getAttribute("data-active"),
          })),
        )
        .catch(() => []);
      log("rows now in DOM:", JSON.stringify(dump));
    }
    results.push(
      newActive !== firstInitialActive
        ? {
            ok: true,
            step: "toggle flipped is_active",
            before: firstInitialActive,
            after: newActive,
          }
        : {
            ok: false,
            step: "toggle flipped is_active",
            reason: `before=${firstInitialActive} after=${newActive}`,
          },
    );
  }

  // 7) Reload → 狀態保留
  {
    await page.goto(`${BASE}/sales/crm/push-notifications`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const v = await page
      .locator(
        `[data-testid="push-subscription-row"][data-subscription-id="${firstRowId}"]`,
      )
      .getAttribute("data-active");
    results.push(
      v !== firstInitialActive
        ? { ok: true, step: "reload preserved toggle", value: v }
        : {
            ok: false,
            step: "reload preserved toggle",
            reason: `value=${v} initial=${firstInitialActive}`,
          },
    );
  }

  // 8) Cleanup — toggle back to original
  {
    const rowSel = `[data-testid="push-subscription-row"][data-subscription-id="${firstRowId}"]`;
    await page.waitForSelector(rowSel, { timeout: NAV_TIMEOUT });
    const row = page.locator(rowSel);
    await row.getByTestId("push-toggle-btn").click();
    await page
      .waitForFunction(
        ({ sel, initial }) => {
          const r = document.querySelector(sel);
          return r && r.getAttribute("data-active") === initial;
        },
        { sel: rowSel, initial: firstInitialActive },
        { timeout: NAV_TIMEOUT },
      )
      .catch(() => {});
    let restored = null;
    try {
      restored = await page.locator(rowSel).getAttribute("data-active", {
        timeout: 5000,
      });
    } catch {
      restored = null;
    }
    results.push(
      restored === firstInitialActive
        ? { ok: true, step: "cleanup restored is_active" }
        : {
            ok: false,
            step: "cleanup restored is_active",
            reason: `restored=${restored} initial=${firstInitialActive}`,
          },
    );
    await page
      .screenshot({
        path: path.join(TMP_DIR, `sales-push-after-${uniqSuffix}.png`),
        fullPage: true,
      })
      .catch(() => {});
  }

  await browser.close();

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
  console.error("[push-notifications-smoke] unexpected", e);
  process.exit(2);
});
