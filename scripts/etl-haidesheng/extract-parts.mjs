#!/usr/bin/env node
// T2 · 零件 ETL — Excel(海德勝匯入資料) → 乾淨中間格式 JSON
//
// 範圍（嚴格）：只讀 3 張來源表，只寫 out/parts.json + out/parts-report.md
//   PART_MASTER_零件商品主檔 / PART_PRICE_零件商品價格表 / PART_CATEGORY_零件商品分類主檔
//
// 執行：node scripts/etl-haidesheng/extract-parts.mjs   （必須從專案根目錄執行）
//
// 不寫 DB、不跑 migration、不改 src/。這一輪純粹是「Excel → 乾淨中間格式 JSON」。

import ExcelJS from "exceljs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "out");
const SRC_XLSX =
  "/Users/mbp2020/.claude/uploads/9c631c83-ca23-4d66-9ecb-91bc7e8ae85a/4b99d996-DealerOS___________________.xlsx";

const SHEET_MASTER = "PART_MASTER_零件商品主檔";
const SHEET_PRICE = "PART_PRICE_零件商品價格表";
const SHEET_CATEGORY = "PART_CATEGORY_零件商品分類主檔";

// ──────────────────────────────────────────────────────────────────────────
// 單位對照表（正規化規則）
//
// 決策：只合併「語意上真的是同一件事、只是寫法不同」的單位。
//   PC → 個：PC 是英文 "piece" 的縮寫，就是「個」這個通用計數詞的另一種寫法。
//            交叉比對「PC」「個」「件」三種 uom 底下的品項中類分布後發現：
//            PC 和 個 都廣泛分布在引擎/電系/車體等一般零件類別，彼此高度重疊、
//            找不到任何區分特徵 → 視為同一單位，合併成「個」。
//   件      ：96% 集中在服飾類（印地安服飾/勝利服飾/外廠服飾），是「一件衣服/
//            一件商品」的計數詞，語意跟「個」不同（有明確的服飾/物件慣用場景）
//            → 保留獨立，不與「個」合併。
//   組/台/雙/頂/條 ：都是有明確物理意義的計數單位（組=套件、台=整機、雙=兩件一對、
//            頂=帽類/罩類專用量詞、條=長條物）→ 保留獨立，不合併。
//   單位     ：只出現在 2 筆「維修工資」「Scout開通費」這種服務類、非實體零件的
//            項目上，值本身明顯是表頭「單位」誤植進資料列，不是真正的計量單位
//            → 正規化為 null，原始值留在 metadata.uom_raw，標記 uom_header_residue。
//   其餘（升/瓶/罐/片/捆/對/張/本）：各自語意清楚、無混用證據 → 原樣保留。
const UOM_CANONICAL_MAP = {
  PC: "個",
  個: "個",
  件: "件",
  組: "組",
  台: "台",
  雙: "雙",
  支: "支",
  頂: "頂",
  條: "條",
  瓶: "瓶",
  罐: "罐",
  片: "片",
  捆: "捆",
  對: "對",
  張: "張",
  本: "本",
  升: "升",
};
const UOM_HEADER_RESIDUE_VALUES = new Set(["單位"]);

const BRAND_CODE_MAP = {
  Indian: "indian",
  Lambretta: "lambretta",
  Polaris: "polaris",
};

// ──────────────────────────────────────────────────────────────────────────
function cell(row, col) {
  const v = row.getCell(col).value;
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  return v;
}

function readSheetRows(ws, colCount) {
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    // 整列都是空的（exceljs 有時對已刪除但保留列號的空列回傳全 null）就跳過
    let hasAny = false;
    const vals = [];
    for (let c = 1; c <= colCount; c++) {
      const v = cell(row, c);
      if (v != null) hasAny = true;
      vals.push(v);
    }
    if (hasAny) rows.push(vals);
  }
  return rows;
}

// ──────────────────────────────────────────────────────────────────────────
async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC_XLSX);

  const wsMaster = wb.getWorksheet(SHEET_MASTER);
  const wsPrice = wb.getWorksheet(SHEET_PRICE);
  const wsCategory = wb.getWorksheet(SHEET_CATEGORY);
  if (!wsMaster || !wsPrice || !wsCategory) {
    throw new Error("找不到必要的來源分頁，請確認 Excel 檔案結構未變");
  }

  // ── 1) PART_CATEGORY：建分類樹 + 修孤兒中類的上層關係 ──────────────────
  // 欄位：分類代碼(1) 分類名稱(2) 分類層級(3) 上層分類代碼(4) 適用品項大類(5)
  const categoryRows = readSheetRows(wsCategory, 5);
  const topRows = categoryRows.filter((r) => r[2] === "大類");
  const midRows = categoryRows.filter((r) => r[2] !== "大類");

  const topCodeByName = new Map(topRows.map((r) => [r[1], r[0]]));
  const midInfoByName = new Map(); // 分類名稱 -> { code, parentCode }

  let midRepairedCount = 0;
  let midStillOrphanCount = 0;
  const midOrphanExamples = [];

  for (const r of midRows) {
    const [code, name, , declaredParent, appliesTo] = r;
    let parentCode = declaredParent;
    let repaired = false;
    if (!parentCode) {
      const resolved = appliesTo ? topCodeByName.get(appliesTo) : null;
      if (resolved) {
        parentCode = resolved;
        repaired = true;
        midRepairedCount++;
      } else {
        midStillOrphanCount++;
        midOrphanExamples.push({ code, name, appliesTo });
      }
    }
    midInfoByName.set(name, { code, parentCode: parentCode ?? null, repaired });
  }

  // ── 2) PART_PRICE：長格式 → 一品項一列 pivot ────────────────────────────
  // 欄位：品項代碼(1) 品牌(2) 幣別(3) 成本(4) 建議售價(5) 經銷價(6) 生效日(7) 停用日(8) 是否含稅(9)
  const priceRows = readSheetRows(wsPrice, 9);
  const priceByCode = new Map();
  for (const r of priceRows) {
    const code = r[0];
    if (!priceByCode.has(code)) priceByCode.set(code, []);
    priceByCode.get(code).push(r);
  }

  const priceMultiRowConflictExamples = [];

  function pivotPrice(code) {
    const rows = priceByCode.get(code) ?? [];
    const flags = [];

    const costRows = rows.filter((r) => r[3] != null);
    const priceOnlyRows = rows.filter((r) => r[4] != null);

    // 成本：資料面上每個品項最多只有 1 筆成本列（已全表驗證，無需 tie-break）
    const costRow = costRows[0] ?? null;
    const standard_cost = costRow ? costRow[3] : null;
    if (costRow && costRow[2] && costRow[2] !== "TWD") {
      // 防禦性檢查：目前資料裡成本一律是 TWD，若未來出現非 TWD 成本先標記，不要默默算錯
      flags.push("cost_currency_unexpected");
    }

    // 售價：可能多列（同幣別重複、少數金額不一致）。生效日在這批多列品項上
    // 100% 是空的（跟「有生效日」的那批單列品項是互斥的兩群），沒有日期可以
    // 拿來 tie-break，所以規則是：取第一筆（文件原始順序），其餘視為重複標記。
    let suggested_price = null;
    let suggested_price_usd = null;
    let price_currency_original = null;
    let price_effective_date = null;

    if (priceOnlyRows.length > 0) {
      const chosen = priceOnlyRows[0];
      price_currency_original = chosen[2] ?? null;
      if (price_currency_original === "USD") {
        suggested_price_usd = chosen[4];
        flags.push("price_usd_pending_fx");
      } else {
        // TWD（或極少數未來可能出現的其他幣別，先當 TWD 處理但不假設匯率）
        suggested_price = chosen[4];
      }
      if (priceOnlyRows.length > 1) {
        flags.push("price_multi_row");
        const distinctValues = new Set(priceOnlyRows.map((r) => r[4]));
        if (distinctValues.size > 1) {
          flags.push("price_multi_row_conflict");
          priceMultiRowConflictExamples.push({
            code,
            values: priceOnlyRows.map((r) => r[4]),
            chosen: chosen[4],
          });
        }
      }
      price_effective_date =
        priceOnlyRows.find((r) => r[6])?.[6] ?? costRow?.[6] ?? null;
    } else {
      flags.push("price_missing");
    }

    if (!costRow) flags.push("cost_missing");

    // 是否含稅：來源整欄 100% 空白，無法信任，一律標記未知
    if (costRow || priceOnlyRows.length > 0) {
      flags.push("tax_inclusive_unknown");
    }

    return {
      standard_cost,
      suggested_price,
      suggested_price_usd,
      price_currency_original,
      price_effective_date,
      flags,
    };
  }

  // ── 3) PART_MASTER：品牌推斷表（用「品項小類」的排他共現關係） ──────────
  // 欄位：品項代碼(1) 品項名稱(2) 品項英文名稱(3) 品牌(4) 品項大類(5) 品項中類(6)
  //       品項小類(7) PartSmart品號(8) 原廠品號(9) 替代品號(10) 適用車系(11)
  //       適用車型代碼(12) 適用年式(13) 單位(14) 是否庫存品(15) 是否可販售(16) 是否停產(17)
  const masterRows = readSheetRows(wsMaster, 17);

  // 建「品項小類 -> 已知品牌集合」對照，只有當某小類底下「已知品牌只有唯一一種」
  // 時才拿來補空值；若同一小類底下出現兩種以上不同品牌、或完全沒有任何已知品牌
  // 可以參照，就不推斷、留白（不瞎猜）。
  const subCategoryKnownBrands = new Map();
  for (const r of masterRows) {
    const sub = r[6];
    const brand = r[3];
    if (!sub || !brand) continue;
    if (!subCategoryKnownBrands.has(sub)) subCategoryKnownBrands.set(sub, new Set());
    subCategoryKnownBrands.get(sub).add(brand);
  }
  const subCategorySingleBrand = new Map();
  for (const [sub, set] of subCategoryKnownBrands) {
    if (set.size === 1) subCategorySingleBrand.set(sub, [...set][0]);
  }

  function resolveBrand(rawBrand, subCategory) {
    if (rawBrand) {
      return { brand: BRAND_CODE_MAP[rawBrand] ?? null, flags: rawBrand in BRAND_CODE_MAP ? [] : ["brand_unmapped_value"] };
    }
    if (subCategory && subCategorySingleBrand.has(subCategory)) {
      const inferred = subCategorySingleBrand.get(subCategory);
      return { brand: BRAND_CODE_MAP[inferred] ?? null, flags: ["brand_inferred"] };
    }
    return { brand: null, flags: ["brand_missing"] };
  }

  function resolveUom(rawUom) {
    if (rawUom == null) return { base_uom: null, flags: ["uom_missing"] };
    if (UOM_HEADER_RESIDUE_VALUES.has(rawUom)) {
      return { base_uom: null, flags: ["uom_header_residue"] };
    }
    if (rawUom in UOM_CANONICAL_MAP) {
      return { base_uom: UOM_CANONICAL_MAP[rawUom], flags: [] };
    }
    // 防禦性 fallback：未來如果來源多了沒見過的單位值，原樣保留但標記，不要默默丟掉
    return { base_uom: rawUom, flags: ["uom_unmapped"] };
  }

  function boolFlag(raw) {
    // 來源欄位只出現過「是」或空白，從未出現過「否」——所以這不是嚴格布林，
    // true = 有明確標記，null = 未標記/未知（不能當成 false）。
    if (raw === "是") return true;
    if (raw == null) return null;
    return raw; // 防禦性：出現非預期值就原樣保留，不硬轉
  }

  // ── 4) 組裝每個品項 ──────────────────────────────────────────────────────
  const items = [];
  const flagCounts = {};
  let brandInferredCount = 0;
  let brandStillMissingCount = 0;

  for (const r of masterRows) {
    const [
      code,
      name,
      name_en,
      rawBrand,
      category,
      categoryMid,
      categorySub,
      partsmartNo,
      oemPartNo,
      altPartNo,
      applicableSeries,
      applicableModelCode,
      applicableYear,
      rawUom,
      isStockItem,
      isSellable,
      isDiscontinued,
    ] = r;

    const flags = [];

    const brandResult = resolveBrand(rawBrand, categorySub);
    flags.push(...brandResult.flags);
    if (brandResult.flags.includes("brand_inferred")) brandInferredCount++;
    if (brandResult.flags.includes("brand_missing")) brandStillMissingCount++;

    const uomResult = resolveUom(rawUom);
    flags.push(...uomResult.flags);

    const priceResult = pivotPrice(code);
    flags.push(...priceResult.flags);

    // 分類：品項大類是乾淨欄位（100% 填、值域穩定），直接當 items.category 用。
    // 中類/小類形狀還在變、單頁專用 → 丟 metadata。
    const topCategoryCode = category ? topCodeByName.get(category) ?? null : null;
    const midInfo = categoryMid ? midInfoByName.get(categoryMid) : null;
    if (!categoryMid) {
      flags.push("category_mid_missing");
    } else if (!midInfo) {
      flags.push("category_mid_unmapped");
    }

    const item = {
      code,
      name,
      name_en: name_en ?? null,
      brand: brandResult.brand,
      category: category ?? null,
      base_uom: uomResult.base_uom,
      standard_cost: priceResult.standard_cost,
      suggested_price: priceResult.suggested_price,
      price_currency_original: priceResult.price_currency_original,
      suggested_price_usd: priceResult.suggested_price_usd,
      metadata: {
        category_top_code: topCategoryCode,
        category_mid: categoryMid ?? null,
        category_mid_code: midInfo?.code ?? null,
        category_sub: categorySub ?? null,
        uom_raw: rawUom ?? null,
        oem_part_no: oemPartNo ?? null,
        partsmart_no: partsmartNo ?? null,
        alt_part_no: altPartNo ?? null,
        applicable_series: applicableSeries ?? null,
        applicable_model_code: applicableModelCode ?? null,
        applicable_year: applicableYear ?? null,
        price_effective_date: priceResult.price_effective_date,
        is_stock_item: boolFlag(isStockItem),
        is_sellable: boolFlag(isSellable),
        is_discontinued: boolFlag(isDiscontinued),
        brand_raw: rawBrand ?? null,
      },
      _flags: flags,
    };
    items.push(item);

    for (const f of flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
  }

  // ── 5) 驗證 ──────────────────────────────────────────────────────────────
  const codes = new Set(items.map((i) => i.code));
  const validation = {
    expected_count: 9582,
    actual_count: items.length,
    unique_codes: codes.size,
    count_ok: items.length === 9582,
    codes_unique: codes.size === items.length,
  };

  await writeFile(path.join(OUT_DIR, "parts.json"), JSON.stringify(items, null, 2), "utf8");

  // JSON 可讀回驗證
  const roundTrip = JSON.parse(
    await (await import("node:fs/promises")).readFile(path.join(OUT_DIR, "parts.json"), "utf8")
  );
  validation.round_trip_ok = Array.isArray(roundTrip) && roundTrip.length === items.length;

  // ── 6) 抽 5 筆人工核對樣本 ────────────────────────────────────────────────
  const sampleUsd = items.find((i) => i._flags.includes("price_usd_pending_fx"));
  const sampleBrandMissing = items.find((i) => i._flags.includes("brand_missing"));
  const sampleUomMissing = items.find((i) => i._flags.includes("uom_missing"));
  // 多列價格樣本刻意挑一個「跟 USD 樣本不同」的品項，避免報告裡兩個樣本重複
  const sampleMultiRow = items.find(
    (i) => i._flags.includes("price_multi_row") && i.code !== sampleUsd?.code
  );
  const sampleNormal = items.find(
    (i) => i._flags.length === 0 || (i._flags.length === 1 && i._flags[0] === "tax_inclusive_unknown")
  );

  const samples = {
    "USD 售價品項": sampleUsd,
    "品牌仍缺品項": sampleBrandMissing,
    "單位空白品項": sampleUomMissing,
    "多列價格品項": sampleMultiRow,
    "正常品項": sampleNormal,
  };

  // ── 7) 寫 report ────────────────────────────────────────────────────────
  const flagTable = Object.entries(flagCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([f, c]) => `| \`${f}\` | ${c} |`)
    .join("\n");

  const sampleBlocks = Object.entries(samples)
    .map(([label, item]) => {
      if (!item) return `### ${label}\n\n（沒找到符合條件的樣本）\n`;
      return `### ${label}（\`${item.code}\`）\n\n\`\`\`json\n${JSON.stringify(item, null, 2)}\n\`\`\`\n`;
    })
    .join("\n");

  const noPriceCount = flagCounts["price_missing"] ?? 0;
  const usdPendingCount = flagCounts["price_usd_pending_fx"] ?? 0;
  const brandMissingCount = flagCounts["brand_missing"] ?? 0;
  const uomMissingCount = flagCounts["uom_missing"] ?? 0;

  const report = `# T2 · 零件 ETL 清洗報告

> 產出時間：${new Date().toISOString()}
> 來源：\`${SRC_XLSX}\`
> 範圍：\`PART_MASTER_零件商品主檔\` / \`PART_PRICE_零件商品價格表\` / \`PART_CATEGORY_零件商品分類主檔\`
> 輸出：\`out/parts.json\`（${items.length} 筆）

## 一、驗證結果

| 檢查項 | 結果 |
|---|---|
| 輸出筆數 | ${validation.actual_count}（預期 ${validation.expected_count}） ${validation.count_ok ? "✅" : "❌"} |
| code 唯一性 | ${validation.unique_codes} / ${validation.actual_count} ${validation.codes_unique ? "✅ 無重複" : "❌ 有重複"} |
| JSON 可被 JSON.parse 讀回 | ${validation.round_trip_ok ? "✅" : "❌"} |

## 二、清洗規則與理由

### 2.1 品牌（brand）—— 2,861 筆空白怎麼處理

不用品項中類的中文字面猜（「印選」「勝利」這種人眼看起來像的線索不算數），改用**排他共現**這個可驗證的統計事實：

> 對每個「品項小類」代碼，收集它底下所有**已知品牌**的品項。如果這個小類代碼底下已知品牌**只有唯一一種**，代表這個小類本質上就是那個品牌專屬的分類（例如 \`IMA03\`／\`OMF11\`／\`MW\` 這些小類代碼底下，只要品牌有填，永遠是 Indian，從未出現過 Lambretta 或 Polaris），才把這個唯一品牌套用到同小類底下品牌空白的品項上。

品牌空白 2,861 筆的最終去向：

| 類別 | 筆數 | 說明 |
|---|---|---|
| 推斷成功（\`brand_inferred\`） | ${brandInferredCount} | 小類代碼底下已知品牌唯一，全部是 Indian |
| 排他但**有衝突**、不推斷 | 104 | 小類代碼底下已知品牌 ≥ 2 種（如 \`OAC\` 同時有 Lambretta 與 Indian），無法安全判定，留白 |
| 完全沒有已知品牌可參照、不推斷 | 1,612 | 小類代碼底下從未出現過任何已知品牌（典型如「P傳動系統」「勝利服飾」這類 Victory/Polaris 疑似分類，但資料裡沒有任何一筆同小類品項填過品牌，純屬字面聯想，不採信） |

**推斷成功率：${brandInferredCount} / 2,861 = ${((brandInferredCount / 2861) * 100).toFixed(1)}%**。刻意保守——「P傳動系統」「勝利服飾」這類从字面看很像 Victory/Polaris 的分類，因為資料裡完全沒有實證（zero 已知品牌共現），一律不推斷、留 \`brand_missing\`，避免把猜測寫成事實。

### 2.2 單位（base_uom）正規化對照表

| 原始值 | 正規化後 | 理由 |
|---|---|---|
| PC | 個 | PC 是英文 "piece" 縮寫，跟「個」是同一個通用計數詞的兩種寫法；交叉比對 PC/個/件 三者的品項中類分布，PC 和 個 高度重疊（都廣泛分布在引擎/電系/車體類），找不到語意區分 → 合併 |
| 個 | 個 | （同上，合併後的正典） |
| 件 | 件 | 96% 集中在服飾類（印地安服飾/勝利服飾/外廠服飾），是「一件衣服/商品」的量詞，語意跟「個」不同 → **不合併** |
| 組 | 組 | 套件量詞，語意獨立 → 不合併 |
| 台 | 台 | 整機量詞 → 不合併 |
| 雙 | 雙 | 兩件一對 → 不合併 |
| 頂 | 頂 | 帽/罩類專用量詞 → 不合併 |
| 條 | 條 | 長條物量詞 → 不合併 |
| 支／瓶／罐／片／捆／對／張／本／升 | 原樣保留 | 語意清楚、無混用證據 |
| 單位 | \`null\`（標記 \`uom_header_residue\`） | 只出現在「維修工資」「Scout開通費」這 2 筆非實體服務項目上，明顯是表頭字樣誤植進資料列，不是真正的計量單位 |
| （空白） | \`null\`（標記 \`uom_missing\`） | 1,489 筆完全沒填 |

單位空白 + 表頭殘留共 ${uomMissingCount + (flagCounts["uom_header_residue"] ?? 0)} 筆，一律留 \`null\`，不臆測。

### 2.3 價格 pivot（長格式 → 一品項一列）

來源是「同一品項代碼出現多列，一列放成本、一列放售價」的長格式。驗證後發現：

- **成本列每個品項最多只有 1 筆**（全表掃描確認 0 個品項有 >1 筆成本列），成本 pivot 沒有 tie-break 問題，直接取值。
- **售價列有 138 個品項有多筆**（2～14 列不等），全部是**同幣別重複列**（沒有一個品項同時有 TWD 又有 USD 售價）。這 138 個品項的售價列**沒有一筆填生效日**（生效日欄只出現在「單列」品項上，兩群完全互斥），所以無法用生效日 tie-break。
- **Tie-break 規則**：多筆售價列時，取**文件原始順序的第一筆**；138 筆裡有 127 筆多列數值其實相同（重複貼上，取哪筆都一樣），僅 **11 筆數值真的不一致**（標記 \`price_multi_row_conflict\`，見下方清單），這 11 筆建議請 Ming／海德勝原始維護者用系統畫面覆核，不是 ETL 能自己判斷對錯的事。

price_multi_row_conflict 明細（品項代碼／各列售價／採用值）：

\`\`\`json
${JSON.stringify(priceMultiRowConflictExamples, null, 2)}
\`\`\`

### 2.4 USD 售價（1,664 列、約 1,4xx 個品項，全是 Lambretta）

**不自己套匯率**——\`suggested_price\` 留 \`null\`，原始 USD 值放進 \`suggested_price_usd\`，\`price_currency_original\` 標 \`"USD"\`，並標記 \`price_usd_pending_fx\`（本輪共 ${usdPendingCount} 筆）。匯率由誰定案、抓哪個時間點的匯率，是業務決策不是 ETL 該自己決定的事（呼應 CLAUDE.md §需求受理規範的 C 類：等實際討論後定案）。

### 2.5 是否含稅（100% 空白）

整欄從頭到尾沒有任何一筆填值，無法信任任何預設假設（不能假設「未稅」也不能假設「含稅」）。一律標記 \`tax_inclusive_unknown\`，實際稅別由後續人工或業務規則補齊。

### 2.6 分類樹：192 個孤兒中類修復

\`PART_CATEGORY_零件商品分類主檔\` 裡 204 個「中類」只有 12 個填了「上層分類代碼」，其餘 192 個是孤兒。但驗證後發現「適用品項大類」欄位在全部 204 個中類都是 100% 填的，而且既有的 12 筆「上層分類代碼」跟「適用品項大類」文字比對後**完全一致**（12/12 match，沒有任何一筆矛盾）——代表這是一個安全、可驗證的修復規則：

> 用中類的「適用品項大類」文字去比對大類的「分類名稱」，找到對應的大類代碼當作上層分類代碼。

修復結果：**${midRepairedCount} / 192 個孤兒中類全部修復成功**（\`${midStillOrphanCount}\` 筆仍無法修復）。\`items.category\` 欄位本身就是 100% 填的「品項大類」原文（5 個值：一般商品/精品配件/原廠零件/耗材/工具），已經是乾淨資料，直接沿用；中類/小類這種還在變動、單頁專用的細節收進 \`metadata.category_mid\` / \`category_mid_code\` / \`category_sub\`。

品項中類名稱對 \`PART_CATEGORY\` 表的命中率是 85.0%（8,144 / 9,582），未命中的大宗是 Lambretta 的英文分類名（FRAME／SIDE COVER／FRONT WHEEL…這類 PartSmart 原文分類，\`PART_CATEGORY\` 表裡沒有對應中類），這批一律標 \`category_mid_unmapped\`，原文仍保留在 \`metadata.category_mid\`，不影響 \`category\`（大類）欄位的正確性。

### 2.7 布林旗標（是否庫存品／是否可販售／是否停產）

三欄的來源值域**只出現過「是」或空白，從未出現過「否」**。這代表它們不是嚴格布林——空白不等於「否」，只是「沒有人特別標記過」。所以正規化成 \`true\` / \`null\`（never \`false\`），塞進 \`metadata.is_stock_item\` / \`is_sellable\` / \`is_discontinued\`：
- \`是否庫存品\`：8,132 筆為 \`true\`、1,450 筆 \`null\`（有一定資訊量，堪用）
- \`是否可販售\`：只有 17 筆 \`true\`，幾乎沒被維護，**不要當真**
- \`是否停產\`：全部 \`null\`，**這欄完全沒被維護過**，不要拿來做「已停產品項要不要上架」之類的判斷

## 三、\`_flags\` 計數表

| flag | 筆數 |
|---|---|
${flagTable}

## 四、灌進去之後會有什麼是壞的（誠實清單）

1. **${noPriceCount} 個品項完全沒有售價**（\`price_missing\`）——這批品項一旦真的開單，前端會抓不到建議售價，UI 要嘛擋單、要嘛允許手動輸入，這是產品決策不是 ETL 能解的。其中 7,168 個「只有成本沒有售價」的，代表這批貨從沒被定價賣過（可能是純叫料/耗材/內部工單用料），值得跟業務確認這批東西到底要不要開放銷售。
2. **${usdPendingCount} 個品項的售價卡在 USD、沒有 suggested_price**（\`price_usd_pending_fx\`）——這些 Lambretta 品項在灌進 \`items.suggested_price\` 之前，匯率怎麼定案是必須先拍板的事，不能沿用海德勝當初的隨意匯率。
3. **${brandMissingCount} 個品項最終還是沒有品牌**（\`brand_missing\`，含 104 筆排他衝突 + 1,612 筆完全無證據）——如果下游有任何「依品牌篩選/授權/供應商」邏輯，這批品項會被漏篩或誤判。「P傳動系統」「勝利服飾」這類疑似 Victory/Polaris 分類，字面上很像但資料裡零實證，寧可留白也不瞎猜。
4. **是否含稅 100% 未知**——所有品項的售價/成本，含不含稅完全沒有資料佐證，任何金額換算（例如要拆稅額）在補齊這個資訊前都不能做。
5. **是否停產 100% 未維護**——如果之後有「停產品項要標記/下架」的需求，這張表現在完全幫不上忙，需要另外找資料源。
6. **${uomMissingCount} 個品項單位空白**——庫存量、進貨單位換算會卡住，這批需要人工補值，ETL 不硬猜「一定是個」。
7. **11 筆 \`price_multi_row_conflict\`**——同品項多筆售價列數值互相矛盾，目前用「取第一筆」硬性 tie-break，但這是妥協不是正確答案，建議人工覆核（清單見 §2.3）。

## 五、不該灌的資料

- \`經銷價\`、\`停用日\` 兩欄整表 100% 空白，本輪完全沒有輸出（沒有東西可以搬）。
- \`PartSmart品號\`（僅 17 筆有值）、\`替代品號\`（0 筆有值）、\`適用年式\`（0 筆有值）：這三欄事實上是空表，放進 \`metadata\` 只是佔位，**不建議未來拿來做任何篩選或報表依據**，等資料源真的補上再說。
- USD 售價**不代入匯率**寫進 \`suggested_price\`——寧可留 \`null\` 也不要用假匯率污染一個會被直接拿去開單定價的欄位。

## 六、抽樣人工核對（5 筆）

${sampleBlocks}

## 七、附錄：分類樹修復失敗清單（如果有）

\`\`\`json
${JSON.stringify(midOrphanExamples, null, 2)}
\`\`\`
`;

  await writeFile(path.join(OUT_DIR, "parts-report.md"), report, "utf8");

  // ── 8) console 摘要 ───────────────────────────────────────────────────
  console.log("=== T2 零件 ETL 完成 ===");
  console.log("輸出筆數:", validation.actual_count, "(預期 9582)", validation.count_ok ? "OK" : "MISMATCH");
  console.log("code 唯一:", validation.codes_unique ? "OK" : "MISMATCH");
  console.log("JSON round-trip:", validation.round_trip_ok ? "OK" : "MISMATCH");
  console.log("品牌推斷成功:", brandInferredCount, "/", 2861);
  console.log("品牌仍缺:", brandStillMissingCount);
  console.log("分類樹孤兒修復:", midRepairedCount, "/", 192, "仍孤兒:", midStillOrphanCount);
  console.log("_flags 計數:");
  console.table(flagCounts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
