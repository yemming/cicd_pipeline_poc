#!/usr/bin/env node
// BDN #4 verify script — /sales/manager/staff-grid 員工評估九宮格
// - 1) 載入頁面、截圖初始狀態
// - 2) 抓所有 RS 卡片初始 cell（auto-position）
// - 3) 直接呼叫 server action 模擬拖曳（jsdom-headless 不一定能完整 dispatch HTML5 DnD）
// - 4) router.refresh → 截圖
// - 5) 呼叫 resetAll → 截圖還原
//
// Usage:
//   node scripts/pw-login.mjs --ensure    # 先確保有 state
//   node scripts/verify-staff-grid.mjs
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP_DIR = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[bdn4-staff-grid]", ...m);

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
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
  });

  const results = [];
  const screenshot = async (name) => {
    const p = path.join(TMP_DIR, `bdn4-${name}.png`);
    await page.screenshot({ path: p, fullPage: true });
    log("screenshot:", p);
    return p;
  };

  try {
    // 1) 載入
    const resp = await page.goto(`${BASE}/sales/manager/staff-grid`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({ ok: false, step: "load", reason: `status=${status} url=${finalUrl}` });
      throw new Error("load failed");
    }
    results.push({ ok: true, step: "load", status });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

    // 2) H1
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("員工評估九宮格")
        ? { ok: true, step: "H1" }
        : { ok: false, step: "H1", reason: `h1="${h1}"` },
    );

    // 3) 截圖初始
    await screenshot("01-initial");

    // 4) 抓所有 RS 卡片資訊
    const cards = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll("[data-rs-card]").forEach((el) => {
        out.push({
          id: el.getAttribute("data-rs-card"),
          cell: el.getAttribute("data-rs-cell"),
          manual: el.getAttribute("data-rs-manual") === "1",
        });
      });
      return out;
    });
    log("cards on page:", JSON.stringify(cards));

    // 空狀態 — 仍記錄為 pass，但跳過後續互動
    if (cards.length === 0) {
      // 確認是 empty-state UI
      const emptyText = await page
        .locator("text=目前當前品牌沒有在職的 RS 員工")
        .count()
        .catch(() => 0);
      if (emptyText > 0) {
        results.push({ ok: true, step: "empty-state", note: "no active RS in current brand" });
        await screenshot("02-empty-state");
      } else {
        results.push({ ok: false, step: "cards present", reason: "no cards & no empty state" });
      }
    } else {
      results.push({ ok: true, step: "cards present", count: cards.length });

      // 5) 模擬拖曳 — 用 HTML5 DnD event sequence
      const targetCard = cards[0];
      // 找一個跟 target 不同的 cell 作為 drop point
      const candidates = ["1-1", "1-2", "1-3", "2-1", "2-2", "2-3", "3-1", "3-2", "3-3"];
      const dropKey = candidates.find((k) => k !== targetCard.cell) ?? "2-2";

      log(`drag card ${targetCard.id} from cell ${targetCard.cell} → ${dropKey}`);

      const dragOk = await page.evaluate(
        ({ cardId, dropKey }) => {
          const card = document.querySelector(`[data-rs-card="${cardId}"]`);
          // 找 dropKey 對應的格 — 透過 data-rs-cell 找格內任意元素的 parent
          // 我們用 onDrop 在格子層，所以 simulate 對 grid cell 觸發
          // 但 cell 本身沒 data attribute — 改用 attitude/skill query
          const [attitudeStr, skillStr] = dropKey.split("-");
          // 用 board 用 onClick {setActiveCell} 的 grid cell；先找 label
          // 簡單法：找包含 attitude/skill matching label 的格 element
          // 由於 React 內部結構未必穩，改成最直接 — 依顯示文字找
          // 但這太脆弱。改用 dispatchEvent 走 React handler 路徑
          if (!card) return { ok: false, reason: "card not found" };
          const dataTransfer = new DataTransfer();
          dataTransfer.setData("text/plain", cardId);
          const dragStart = new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer });
          card.dispatchEvent(dragStart);

          // 找所有 grid cell（min-h-[140px]）
          const cells = document.querySelectorAll("[onDragOver], div[min-h]");
          // Better: 用 className 找有 'min-h-[140px]' 的 div
          const allDivs = document.querySelectorAll("div");
          let target = null;
          for (const d of allDivs) {
            if (d.className && typeof d.className === "string" && d.className.includes("min-h-[140px]")) {
              // 看 cell label 文字判斷
              const label = d.textContent || "";
              // hack：依 GRID_CELL_LABELS map 反查
              const cellLabels = {
                "3-3": "全方位高手",
                "3-2": "安定高手",
                "3-1": "機會高手",
                "2-3": "明日之星",
                "2-2": "中規中矩",
                "2-1": "食之無味",
                "1-3": "急需磨練",
                "1-2": "難搞定",
                "1-1": "很危險",
              };
              const want = cellLabels[dropKey];
              if (want && label.includes(want)) {
                target = d;
                break;
              }
            }
          }
          if (!target) return { ok: false, reason: "drop target not found" };

          const dragOver = new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer });
          target.dispatchEvent(dragOver);
          const drop = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer });
          target.dispatchEvent(drop);
          const dragEnd = new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer });
          card.dispatchEvent(dragEnd);

          return { ok: true };
        },
        { cardId: targetCard.id, dropKey },
      );

      log("drag result:", JSON.stringify(dragOk));

      // 等 server action 完成 + refresh
      await page.waitForTimeout(2000);
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

      // 6) 確認該卡片 cell 已變
      const afterCards = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll("[data-rs-card]").forEach((el) => {
          out.push({
            id: el.getAttribute("data-rs-card"),
            cell: el.getAttribute("data-rs-cell"),
            manual: el.getAttribute("data-rs-manual") === "1",
          });
        });
        return out;
      });
      const moved = afterCards.find((c) => c.id === targetCard.id);
      if (moved && moved.cell === dropKey && moved.manual) {
        results.push({ ok: true, step: "drag → server action → manual override", from: targetCard.cell, to: moved.cell });
      } else {
        results.push({
          ok: false,
          step: "drag → server action",
          reason: `expected cell=${dropKey} manual=true, got=${JSON.stringify(moved)}`,
        });
      }
      await screenshot("02-after-drag");

      // 7) reset all → 還原
      const resetBtn = page.locator('button:has-text("重置全部為自動")');
      page.once("dialog", (d) => d.accept());
      await resetBtn.click().catch(() => {});
      await page.waitForTimeout(2000);
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

      const finalCards = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll("[data-rs-card]").forEach((el) => {
          out.push({ id: el.getAttribute("data-rs-card"), manual: el.getAttribute("data-rs-manual") === "1" });
        });
        return out;
      });
      const anyManual = finalCards.some((c) => c.manual);
      results.push(
        !anyManual
          ? { ok: true, step: "reset all → all manual cleared", count: finalCards.length }
          : { ok: false, step: "reset all", reason: `still ${finalCards.filter((c) => c.manual).length} manual after reset` },
      );
      await screenshot("03-after-reset");
    }
  } catch (e) {
    log("FATAL:", e?.message);
    results.push({ ok: false, step: "fatal", reason: String(e?.message ?? e) });
  } finally {
    if (consoleErrors.length > 0) {
      results.push({ ok: false, step: "console errors", count: consoleErrors.length, sample: consoleErrors.slice(0, 3) });
    } else {
      results.push({ ok: true, step: "console clean" });
    }
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ results, failed: failed.length }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("[bdn4-staff-grid] FATAL:", e);
  process.exit(1);
});
