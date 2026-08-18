#!/usr/bin/env node
/**
 * T3 · 整車車型 ETL — VEH_MODEL / VEH_COLOR / VEH_STOCK → out/vehicles.json + out/vehicles-report.md
 *
 * 範圍限制（MANDATORY）：只讀來源 Excel 的 VEH_MODEL_車型主檔 / VEH_COLOR_車色主檔 / VEH_STOCK_整車庫存表
 * 三張表；不寫任何 DB、不跑 migration、不改 src/。純產出中間格式 JSON + 報告。
 *
 * 執行：node scripts/etl-haidesheng/extract-vehicles.mjs   （必須從專案根目錄跑）
 *
 * ── 結構判定（詳見 out/vehicles-report.md §1）──────────────────────────────
 * 一筆 vehicle_models = 一個「車型（去掉色彩）× 年式」。理由：
 *   1) 目標 DB schema 的車色不是獨立表，是 new_car_inventory.color 自由文字欄位，
 *      業務動線是「先選車型、再選色」，跟這個結構同構。
 *   2) 資料本身撐得住這個切法：Indian 154 列裡，撇除色彩污染的例外（見下方
 *      INDIAN_DIRTY_OVERRIDES），車型正式名稱在同年份內對同一車系穩定重複，
 *      代表本來就是同一份「車型代碼 × 色彩」矩陣被拆成 154 列存。
 *   3) Lambretta 更關鍵：VEH_MODEL 的「車型正式名稱」100% 錯誤（36 列全部塌陷成
 *      "LAMBRETTA X300"，甚至連 G350 都被誤植），但「車型顯示名稱」藏著真正的
 *      trim 變體（SR / SPECIAL / GP - TFT / GT - TFT / CASA），可用正則精準拆出，
 *      拆出來的 5+1 個車型跟 VEH_STOCK 各自出現的 5 種車型名稱（X300/X300SR/
 *      X300 SPECIAL/X300 GP/X300 GT）完全對得上——證明這個切法不是我猜的，
 *      是資料自己交叉驗證出來的。
 */

import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "out");
const SOURCE_XLSX =
  "/Users/mbp2020/.claude/uploads/9c631c83-ca23-4d66-9ecb-91bc7e8ae85a/4b99d996-DealerOS___________________.xlsx";

const SHEET_MODEL = "VEH_MODEL_車型主檔";
const SHEET_COLOR = "VEH_COLOR_車色主檔";
const SHEET_STOCK = "VEH_STOCK_整車庫存表";

// ── 小工具 ──────────────────────────────────────────────────────────────

function cellText(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    if (v.text) return v.text;
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.result !== undefined) return v.result;
  }
  return v;
}

function norm(s) {
  if (s === null || s === undefined) return null;
  return String(s).replace(/\s+/g, " ").trim();
}

function sheetToObjects(ws) {
  const rows = [];
  let header = null;
  ws.eachRow((row, rowNumber) => {
    const vals = row.values.slice(1).map(cellText);
    if (rowNumber === 1) {
      header = vals.map((h) => norm(h));
      return;
    }
    // 跳過完全空白列（例如 VEH_COLOR 裡 Indian/Lambretta 區塊間的分隔空列）
    if (vals.every((v) => v === null || v === undefined || v === "")) return;
    const obj = {};
    header.forEach((h, i) => {
      obj[h] = vals[i] === undefined ? null : vals[i];
    });
    rows.push(obj);
  });
  return rows;
}

// ── Indian FTR 1200 家族：车型正式名稱把色彩焗死進去的例外清單（人工判讀）──
//
// 判讀依據：Indian Motorcycle 官方 FTR 1200 車系 2019-2023 年式實際只有四個
// trim：FTR 1200 / FTR 1200 S / FTR 1200 R Carbon / FTR 1200 Rally。來源
// 表格把每一列的「车型正式名稱」直接複製「车型顯示名稱」（= trim + 色彩全部
// 焗在一起），且這 7 列在全表中車型正式名稱都是獨一無二值（沒有姊妹列可以
// 對照出乾淨版本），無法用「同代碼多列比對」的方式自動清洗，只能人工拆。
const INDIAN_DIRTY_OVERRIDES = {
  N23FZA22P4: { model: "Indian FTR 1200", color: "Onyx Black (Lime GFX)" },
  N23FZA22P6: { model: "Indian FTR 1200", color: "Stealth Gray (Orange GFX)" },
  N23FZM22P3: { model: "Indian FTR 1200 S", color: "Onyx Black Red GFX" },
  N23FZM22P7: { model: "Indian FTR 1200 S", color: "Onyx Black (Red GFX)" },
  N23FZM22P8: { model: "Indian FTR 1200 S", color: "White Lightning over Indy Red" },
  N23FZR22PC: { model: "Indian FTR 1200 R Carbon", color: "Carbon Fiber" },
  N23RTT22E5: { model: "Indian FTR 1200 RALLY [Int'l]", color: "Black Smoke" },
};

// Lambretta 顯示名稱正則：LAMBRETTA (X300|G350) [SR|SPECIAL|GP|GT|CASA]? [- TFT]? <色彩...>
const LAMBRETTA_RE = /^LAMBRETTA\s+(X300|G350)\s*(SR|SPECIAL|GP|GT|CASA)?\b\s*(?:-\s*TFT)?\s*(.*)$/i;

// Indian 車系（series）推導關鍵字，依優先序比對（Chieftain 必須排在 Chief 前面，
// 否則 "Chieftain" 字串裡含有 "Chief" 子字串會誤判）
const SERIES_KEYWORDS = ["FTR", "Scout", "Challenger", "Pursuit", "Chieftain", "Springfield", "Chief"];

function deriveIndianSeries(modelName) {
  for (const kw of SERIES_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, "i");
    if (re.test(modelName)) return kw === "FTR" ? "FTR" : kw;
  }
  return "Indian 其他"; // fallback，理論上不會走到
}

// ── 主程式 ──────────────────────────────────────────────────────────────

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SOURCE_XLSX);

  const modelRowsRaw = sheetToObjects(wb.getWorksheet(SHEET_MODEL));
  const colorRowsRaw = sheetToObjects(wb.getWorksheet(SHEET_COLOR));
  const stockRowsRaw = sheetToObjects(wb.getWorksheet(SHEET_STOCK));

  const flags = {
    dedupedDirtyDuplicates: [], // NTA00PP / NTA00PR 類型：同 code+year+顯示名稱、正式名稱不一致
    ftrOverridesApplied: [],
    colorLookupMisses: [],
    lambrettaParseFailures: [],
    engineInconsistencies: [],
  };

  // ---- 1) 建立 VEH_COLOR 對照表：key = brand|code|year|原廠車色名稱(=顯示名稱) → 中文車色名稱
  const colorLookup = new Map();
  for (const r of colorRowsRaw) {
    const brand = norm(r["品牌"]);
    const code = norm(r["車型代碼"]);
    const year = r["年式"];
    const origColor = norm(r["原廠車色名稱"]);
    if (!brand || !code || !year || !origColor) continue;
    const key = `${brand}|${code}|${year}|${origColor}`;
    colorLookup.set(key, norm(r["中文車色名稱"]));
  }

  function lookupZh(brand, code, year, displayName) {
    const key = `${brand}|${code}|${year}|${displayName}`;
    if (colorLookup.has(key)) return colorLookup.get(key);
    flags.colorLookupMisses.push({ brand, code, year, displayName });
    return null;
  }

  // ---- 2) 去重：同一 (brand, code, year, 顯示名稱) 出現多列、正式名稱不一致
  //         （= 同一顏色被記錄了兩次，其中一次正式名稱欄位混進了色彩污染）
  //         規則：保留較短的正式名稱（較短 = 較乾淨的車型名，未混色彩字串）
  const byDedupKey = new Map();
  for (const r of modelRowsRaw) {
    const brand = norm(r["品牌"]);
    const code = norm(r["車型代碼"]);
    const year = r["年式"];
    const display = norm(r["車型顯示名稱"]);
    const formal = norm(r["車型正式名稱"]);
    const key = `${brand}|${code}|${year}|${display}`;
    if (!byDedupKey.has(key)) {
      byDedupKey.set(key, []);
    }
    byDedupKey.get(key).push({ ...r, _brand: brand, _code: code, _year: year, _display: display, _formal: formal });
  }

  const dedupedRows = [];
  for (const [key, group] of byDedupKey.entries()) {
    if (group.length === 1) {
      dedupedRows.push(group[0]);
      continue;
    }
    // 多列同 key：可能是完全相同的重複列，也可能是正式名稱不一致的髒重複
    const distinctFormals = [...new Set(group.map((g) => g._formal))];
    if (distinctFormals.length === 1) {
      // 純重複列（沒有髒污染），保留一筆即可
      dedupedRows.push(group[0]);
      continue;
    }
    // 正式名稱不一致 → 選最短者為乾淨版本
    const sorted = [...group].sort((a, b) => (a._formal?.length ?? 0) - (b._formal?.length ?? 0));
    const kept = sorted[0];
    const dropped = sorted.slice(1);
    flags.dedupedDirtyDuplicates.push({
      key,
      kept_formal: kept._formal,
      dropped_formals: dropped.map((d) => d._formal),
    });
    dedupedRows.push(kept);
  }

  // ---- 3) 逐列清洗出 clean model name + color text ----
  const enrichedRows = dedupedRows.map((r) => {
    const brand = r._brand;
    const code = r._code;
    const year = r._year;
    const display = r._display;
    const formal = r._formal;
    const engineCc = r["排氣量"];
    const engineType = norm(r["引擎型式"]);

    let modelName, colorText, series, rowFlags = [];

    if (brand === "Lambretta") {
      const m = display?.match(LAMBRETTA_RE);
      if (!m) {
        flags.lambrettaParseFailures.push({ code, year, display });
        modelName = "LAMBRETTA (未知)";
        colorText = display ?? "";
        series = "未知";
        rowFlags.push("lambretta_parse_failed");
      } else {
        const base = m[1].toUpperCase();
        const variant = m[2] ? m[2].toUpperCase() : null;
        colorText = norm(m[3]) ?? "";
        modelName = variant ? `LAMBRETTA ${base} ${variant}` : `LAMBRETTA ${base}`;
        series = base;
        if (formal && norm(formal) !== "LAMBRETTA X300") {
          // 除了已知的 "全部塌陷成 X300" 之外，若出現其他值也值得留意
        }
        if (base === "G350" && formal && norm(formal).includes("X300")) {
          rowFlags.push("g350_formal_field_wrongly_says_x300_corrected_via_display_name");
        }
      }
    } else {
      // Indian
      if (INDIAN_DIRTY_OVERRIDES[code]) {
        const ov = INDIAN_DIRTY_OVERRIDES[code];
        modelName = ov.model;
        colorText = ov.color;
        rowFlags.push("ftr_dirty_override_applied");
        flags.ftrOverridesApplied.push({ code, year, raw_formal: formal, resolved_model: ov.model, resolved_color: ov.color });
      } else {
        modelName = formal;
        colorText = display && modelName && display.startsWith(modelName) ? norm(display.slice(modelName.length)) || "(無色彩後綴)" : display;
      }
      series = deriveIndianSeries(modelName);
    }

    const zh = lookupZh(brand, code, year, display);
    if (!zh) rowFlags.push("color_zh_lookup_miss");

    // engine 一致性稍後在 group 階段檢查
    return {
      brand,
      code,
      year,
      display,
      formal,
      modelName,
      series,
      colorText,
      colorZh: zh,
      engineCc,
      engineType,
      rowFlags,
    };
  });

  // ---- 4) Group by (brand, modelName, year) ----
  const groups = new Map();
  for (const r of enrichedRows) {
    const gkey = `${r.brand}|${r.modelName}|${r.year}`;
    if (!groups.has(gkey)) groups.set(gkey, []);
    groups.get(gkey).push(r);
  }

  const models = [];
  for (const [gkey, rows] of groups.entries()) {
    const first = rows[0];
    const engineCcSet = new Set(rows.map((r) => r.engineCc));
    const engineTypeSet = new Set(rows.map((r) => r.engineType));
    const groupFlags = new Set();
    rows.forEach((r) => r.rowFlags.forEach((f) => groupFlags.add(f)));

    if (engineCcSet.size > 1) {
      groupFlags.add("engine_cc_inconsistent_within_group");
      flags.engineInconsistencies.push({ gkey, values: [...engineCcSet] });
    }
    if (engineTypeSet.size > 1) {
      groupFlags.add("engine_type_inconsistent_within_group");
      flags.engineInconsistencies.push({ gkey, values: [...engineTypeSet] });
    }

    const sourceModelCodes = [...new Set(rows.map((r) => r.code))].sort();

    const colors = rows.map((r) => ({
      code: r.code,
      name_original: r.colorText,
      name_zh: r.colorZh,
    }));

    models.push({
      series: first.series,
      model_name: first.modelName,
      display_name: first.modelName, // 見 report §1：來源無獨立「顯示用名稱」概念，暫等同 model_name
      brand: first.brand,
      year: first.year,
      engine_cc: first.engineCc ?? null,
      engine_type: first.engineType ?? null,
      colors,
      source_model_codes: sourceModelCodes,
      metadata: {
        source_sheet: "VEH_MODEL_車型主檔 / VEH_COLOR_車色主檔",
        series_derived: first.brand !== "Lambretta" || true, // 車系欄位來源 100% 空，全部是推導值
        vehicle_type_hint: first.brand === "Lambretta" ? "scooter" : "motorcycle",
        raw_display_names: [...new Set(rows.map((r) => r.display))],
      },
      _flags: [...groupFlags],
    });
  }

  models.sort((a, b) => a.brand.localeCompare(b.brand) || a.year - b.year || a.model_name.localeCompare(b.model_name));

  // ---- 5) VEH_STOCK：原樣保留 + 標註為何灌不進去 ----
  const stockUnloadable = stockRowsRaw.map((r, idx) => ({
    row_index: idx + 2, // Excel 列號（含 header）
    brand: norm(r["品牌"]),
    model_display_name: norm(r["車型名稱"]),
    year: r["年式"],
    color_original: norm(r["原廠車色名稱"]),
    store_code: norm(r["門店代碼"]),
    stock_status: norm(r["庫存狀態"]),
    vehicle_purpose: norm(r["車輛用途"]),
    qty: r["數量"],
    is_bought_out: norm(r["是否買斷"]),
    reason:
      "VEH_STOCK 無 VIN、無入庫日，是「車型×色彩×門店」的聚合庫存快照；目標表 new_car_inventory 是 VIN 級別單車一筆，結構上無法逐台對應，此列原樣保存待客戶確認顆粒度後另案處理",
  }));

  // ---- 輸出 ----
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonOut = { models, stock_unloadable: stockUnloadable };
  fs.writeFileSync(path.join(OUT_DIR, "vehicles.json"), JSON.stringify(jsonOut, null, 2), "utf8");

  // ---- 驗證 ----
  const rawText = fs.readFileSync(path.join(OUT_DIR, "vehicles.json"), "utf8");
  let parsedOk = false;
  try {
    JSON.parse(rawText);
    parsedOk = true;
  } catch (e) {
    console.error("JSON parse 失敗:", e.message);
  }
  const groupKeys = models.map((m) => `${m.brand}|${m.model_name}|${m.year}`);
  const dupGroupKeys = groupKeys.filter((k, i) => groupKeys.indexOf(k) !== i);

  console.log("=== extract-vehicles.mjs 執行結果 ===");
  console.log("VEH_MODEL 原始列數:", modelRowsRaw.length);
  console.log("VEH_MODEL 去重後列數:", dedupedRows.length, "（丟棄髒重複列", flags.dedupedDirtyDuplicates.length, "組）");
  console.log("VEH_COLOR 原始列數:", colorRowsRaw.length);
  console.log("VEH_STOCK 原始列數:", stockRowsRaw.length);
  console.log("---");
  console.log("產出 vehicle_models 筆數:", models.length);
  console.log("  Indian:", models.filter((m) => m.brand === "Indian").length);
  console.log("  Lambretta:", models.filter((m) => m.brand === "Lambretta").length);
  console.log("JSON 可 parse:", parsedOk);
  console.log("Group key 重複數:", dupGroupKeys.length, dupGroupKeys);
  console.log("FTR 例外套用列數:", flags.ftrOverridesApplied.length);
  console.log("Lambretta 解析失敗列數:", flags.lambrettaParseFailures.length);
  console.log("色彩中文對照 miss 數:", flags.colorLookupMisses.length);
  console.log("Engine 不一致 group 數:", flags.engineInconsistencies.length);

  // 把 flags 明細也吐出來，供寫報告時引用
  fs.writeFileSync(path.join(OUT_DIR, "_debug-flags.json"), JSON.stringify(flags, null, 2), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "_debug-enriched-rows.json"), JSON.stringify(enrichedRows, null, 2), "utf8");

  return { models, stockUnloadable, flags, modelRowsRaw, colorRowsRaw, stockRowsRaw, dedupedRows, dupGroupKeys, parsedOk };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
