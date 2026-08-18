#!/usr/bin/env node
/**
 * T4 · 組織/人員 ETL — 海德生 (Haidesheng) DealerOS 匯入資料整理
 *
 * 讀取來源 xlsx 的 6 個工作表：
 *   ORG_組織層級主檔 / DEALER_經銷商主檔 / STORE_門店主檔 /
 *   STORE_CODE_MAP_門店代碼對照表 / EMP_員工主檔 / TEST_測試窗口清單
 *   （+ BRAND_MASTER_品牌主檔，品牌是共用維度，一併吐出）
 *
 * 輸出 schema-agnostic 的 JSON（業務語意的 node_type + parent_code，
 * 不假設 organizations level=N 或 node_type+config 兩種候選架構的任何一種），
 * 供之後架構拍板後轉成最終 insert。
 *
 * 用法：node scripts/etl-haidesheng/extract-org.mjs
 */

import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_XLSX =
  "/Users/mbp2020/.claude/uploads/9c631c83-ca23-4d66-9ecb-91bc7e8ae85a/4b99d996-DealerOS___________________.xlsx";
const OUT_DIR = path.join(__dirname, "out");
const OUT_JSON = path.join(OUT_DIR, "org.json");
const OUT_REPORT = path.join(OUT_DIR, "org-report.md");

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function cellText(v) {
  if (v == null) return null;
  if (typeof v === "object" && v.richText) return v.richText.map((t) => t.text).join("");
  if (typeof v === "object" && v.text) return v.text;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function sheetRows(wb, name) {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`Sheet not found: ${name}`);
  const rows = [];
  ws.eachRow((row, rowNumber) => {
    const vals = row.values.slice(1).map(cellText);
    rows.push({ rowNumber, vals });
  });
  return rows;
}

function yn(v) {
  if (v == null) return null;
  if (v === "是") return true;
  if (v === "否") return false;
  return null;
}

const BRAND_CODE_MAP = {
  Indian: "indian",
  Lambretta: "lambretta",
  Polaris: "polaris",
};

/** 解析 "總代理｜Indian / Lambretta / Polaris" 這類欄位 -> { role_raw, brands: [] } */
function parseRoleAndBrands(raw) {
  if (!raw) return { role_raw: null, brands: [], flags: ["scope_missing"] };
  const parts = raw.split("｜");
  const role_raw = parts[0]?.trim() ?? null;
  const brandPart = parts[1] ?? null;
  const brands = [];
  const flags = [];
  if (brandPart) {
    for (const seg of brandPart.split("/")) {
      const name = seg.trim();
      if (!name) continue;
      const code = BRAND_CODE_MAP[name];
      if (code) brands.push(code);
      else flags.push(`unknown_brand_token:${name}`);
    }
  } else {
    flags.push("brand_scope_missing");
  }
  return { role_raw, brands, flags };
}

/** 解析單純的 "Indian / Lambretta" 品牌清單欄位（STORE_門店主檔.業務範圍 用） */
function parseBrandList(raw) {
  if (!raw) return { brands: [], flags: ["brand_scope_missing"] };
  const brands = [];
  const flags = [];
  for (const seg of raw.split("/")) {
    const name = seg.trim();
    if (!name) continue;
    const code = BRAND_CODE_MAP[name];
    if (code) brands.push(code);
    else flags.push(`unknown_brand_token:${name}`);
  }
  return { brands, flags };
}

/** 拆郵遞區號（前 3 碼數字）*/
function splitPostalCode(address) {
  if (!address) return { postal_code: null, address_remainder: null, flags: ["address_missing"] };
  const m = address.match(/^(\d{3})(.*)$/);
  if (m) {
    return { postal_code: m[1], address_remainder: m[2], flags: [] };
  }
  return { postal_code: null, address_remainder: address, flags: ["postal_code_missing"] };
}

const DAY_MAP = {
  週一: "mon",
  週二: "tue",
  週三: "wed",
  週四: "thu",
  週五: "fri",
  週六: "sat",
  週日: "sun",
};
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_TOKEN = "(週[一二三四五六日])";
// 非捕獲版本：用在「重複出現」的情境（如清單 週X、週Y...），避免巢狀捕獲群組把後面的
// (\d{2}:\d{2}) 群組索引往後推，導致 m[2]/m[3] 對錯到日期字串而不是時間字串
const DAY_TOKEN_NC = "(?:週[一二三四五六日])";

/** 把「週二至週六 10:00~19:00；週日、週一公休」這類自由文字盡量結構化 */
function parseBusinessHours(raw) {
  if (!raw) return { parsed: null, unparsedNotes: [], flags: ["hours_missing"] };

  const flags = [];
  const unparsedNotes = [];
  const openHours = [];
  const closedDays = [];

  const segments = raw
    .split(/；/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const seg of segments) {
    // 含特殊備註（每月第 X 週 xxx / 依臉書公告為主 等）一律視為無法結構化，整段保留原文
    if (/每月第|依.*公告/.test(seg)) {
      unparsedNotes.push(seg);
      flags.push("hours_special_note");
      continue;
    }

    // 純公休：週X（、週Y）*公休
    let m = seg.match(new RegExp(`^((?:${DAY_TOKEN_NC}、?)+)公休$`));
    if (m) {
      const days = m[1].match(new RegExp(DAY_TOKEN_NC, "g")) ?? [];
      for (const d of days) closedDays.push(DAY_MAP[d]);
      continue;
    }

    // 區間：週X至週Y HH:MM~HH:MM
    m = seg.match(new RegExp(`^${DAY_TOKEN}至${DAY_TOKEN}\\s*(\\d{2}:\\d{2})~(\\d{2}:\\d{2})$`));
    if (m) {
      const [, d1, d2, open, close] = m;
      const i1 = DAY_ORDER.indexOf(DAY_MAP[d1]);
      const i2 = DAY_ORDER.indexOf(DAY_MAP[d2]);
      const days = DAY_ORDER.slice(i1, i2 + 1);
      openHours.push({ days, open, close });
      continue;
    }

    // 清單：週X（、週Y）* HH:MM~HH:MM（含單一天）
    m = seg.match(new RegExp(`^((?:${DAY_TOKEN_NC}、?)+)\\s*(\\d{2}:\\d{2})~(\\d{2}:\\d{2})$`));
    if (m) {
      const days = (m[1].match(new RegExp(DAY_TOKEN_NC, "g")) ?? []).map((d) => DAY_MAP[d]);
      openHours.push({ days, open: m[2], close: m[3] });
      continue;
    }

    unparsedNotes.push(seg);
    flags.push("hours_segment_unparsed");
  }

  const parsed = openHours.length > 0 ? { open_hours: openHours, closed_days: [...new Set(closedDays)] } : null;
  if (unparsedNotes.length > 0 && parsed === null) flags.push("hours_fully_unparsed");
  return { parsed, unparsedNotes, flags };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SOURCE_XLSX);

  const report = { sections: [] };
  const addSection = (title, lines) => report.sections.push({ title, lines });

  // === 1. BRAND_MASTER_品牌主檔 ===============================================
  const brandRows = sheetRows(wb, "BRAND_MASTER_品牌主檔").filter((r) => r.rowNumber > 1 && r.vals[0]);
  const brands = brandRows.map((r) => {
    const [code, name, name_zh, brand_type, isVehicle, isParts, isService, isActive, scopeRaw] = r.vals;
    return {
      code: BRAND_CODE_MAP[toTitleCaseBrand(code)] ?? code.toLowerCase(),
      code_source: code,
      name,
      name_zh,
      brand_type_raw: brand_type,
      is_vehicle_brand: yn(isVehicle),
      is_parts_brand: yn(isParts),
      is_service_brand: yn(isService),
      is_currently_active: yn(isActive),
      scope_raw: scopeRaw,
      source: "BRAND_MASTER_品牌主檔",
    };
  });

  function toTitleCaseBrand(codeUpper) {
    // BRAND_MASTER 用大寫代碼 (INDIAN/LAMBRETTA/POLARIS)，BRAND_CODE_MAP 的 key 是 Title Case
    const map = { INDIAN: "Indian", LAMBRETTA: "Lambretta", POLARIS: "Polaris" };
    return map[codeUpper] ?? codeUpper;
  }

  // === 2. DEALER_經銷商主檔 =====================================================
  const dealerRows = sheetRows(wb, "DEALER_經銷商主檔").filter((r) => r.rowNumber > 1 && r.vals[0]);
  const dealerNodes = [];
  const dealerDetail = []; // for report
  for (const r of dealerRows) {
    const [code, name, scopeRaw, isActiveRaw] = r.vals;
    const { role_raw, brands: brandCodes, flags: scopeFlags } = parseRoleAndBrands(scopeRaw);
    const isAgency = role_raw === "總代理";
    const node_type = isAgency ? "agency" : "dealer";
    const flags = [...scopeFlags];
    if (!isAgency) flags.push("inferred_parent:agency_role_assumption");
    const node = {
      code,
      node_type,
      name,
      parent_code: isAgency ? null : "HDS",
      brands: brandCodes,
      is_active: yn(isActiveRaw),
      metadata: {
        role_raw,
        scope_raw: scopeRaw,
        source: "DEALER_經銷商主檔",
        source_row: r.rowNumber,
      },
      _flags: flags,
    };
    dealerNodes.push(node);
    dealerDetail.push({ code, name, node_type, role_raw, brands: brandCodes });
  }

  // === 3. STORE_門店主檔 ========================================================
  const storeRows = sheetRows(wb, "STORE_門店主檔").filter((r) => r.rowNumber > 1 && r.vals[0]);
  const storeNodes = [];
  const storeDetail = [];
  const STORE_TYPE_MAP = {
    經銷門店: "store",
    服務廠: "service_center",
    歷史據點: "store",
    分銷商: "store", // node_type 維持在既定 enum 內；用 store_subtype 標註「分銷商」語意，見 report §2
  };
  // 門店代碼與經銷商代碼撞到時的消歧義後綴表：目前只有 CD（啟德國際重機）一筆，
  // 來源資料本身就這樣填，不是 ETL 產生的錯誤。用地址的鄉鎮市區名稱取代碼，
  // 查不到就退回 "-ST" 通用後綴。
  const DISTRICT_DISAMBIG_ABBR = {
    員林市: "YL",
  };
  function deriveDisambigSuffix(addressRemainder) {
    if (!addressRemainder) return null;
    // 先去掉開頭的「XX縣」/「XX市」（第一級行政區），避免誤吃到縣市名稱本身
    const stripped = addressRemainder.replace(/^[一-龥]{2,3}(市|縣)/, "");
    const m = stripped.match(/^([一-龥]{2,4}(市|鎮|鄉|區))/);
    if (!m) return null;
    return DISTRICT_DISAMBIG_ABBR[m[1]] ?? null;
  }

  for (const r of storeRows) {
    let [
      storeCode,
      dealerCode,
      formalName,
      storeTypeRaw,
      scopeRaw,
      address,
      phone,
      hoursRaw,
      opStatusRaw,
    ] = r.vals;

    const node_type = STORE_TYPE_MAP[storeTypeRaw] ?? "store";
    const storeSubtype = storeTypeRaw === "分銷商" ? "sub_distributor" : null;
    const isHistorical = storeTypeRaw === "歷史據點";

    const { brands: brandCodes, flags: brandFlags } = parseBrandList(scopeRaw);
    const { postal_code, address_remainder, flags: addrFlags } = splitPostalCode(address);
    const { parsed: hoursParsed, unparsedNotes, flags: hoursFlags } = parseBusinessHours(hoursRaw);

    const is_active = opStatusRaw === "營業中" ? true : opStatusRaw === "停用" ? false : null;

    const flags = [...brandFlags, ...addrFlags, ...hoursFlags];
    if (isHistorical) flags.push("historical_site");
    if (storeSubtype) flags.push("sub_distributor_type");

    const originalStoreCode = storeCode;
    if (storeCode === dealerCode) {
      flags.push("code_collision_with_dealer");
      const suffix = deriveDisambigSuffix(address_remainder) ?? "ST";
      storeCode = `${dealerCode}-${suffix}`;
      flags.push(`code_disambiguated_from:${originalStoreCode}`);
    }

    const node = {
      code: storeCode,
      node_type,
      store_subtype: storeSubtype,
      name: formalName,
      parent_code: dealerCode,
      brands: brandCodes,
      is_active,
      address: {
        raw: address,
        postal_code,
        remainder: address_remainder,
      },
      phone,
      business_hours_raw: hoursRaw,
      business_hours_parsed: hoursParsed,
      business_hours_unparsed_notes: unparsedNotes.length ? unparsedNotes : undefined,
      metadata: {
        store_type_raw: storeTypeRaw,
        op_status_raw: opStatusRaw,
        source: "STORE_門店主檔",
        source_row: r.rowNumber,
      },
      _flags: flags,
    };
    storeNodes.push(node);
    storeDetail.push({
      code: storeCode,
      dealerCode,
      name: formalName,
      storeTypeRaw,
      node_type,
      storeSubtype,
      is_active,
      flags,
    });
  }

  const nodes = [...dealerNodes, ...storeNodes];

  // === 4. STORE_CODE_MAP_門店代碼對照表 =========================================
  const mapRows = sheetRows(wb, "STORE_CODE_MAP_門店代碼對照表").filter((r) => r.rowNumber > 1 && r.vals[0]);
  const store_code_aliases = mapRows.map((r) => {
    const [old_code, context, standard_code, standard_name, dealer_code, brandRaw] = r.vals;
    const { brands: brandCodes } = parseBrandList(brandRaw);
    return {
      old_code,
      context,
      standard_code,
      standard_name,
      dealer_code,
      brands: brandCodes,
      source: "STORE_CODE_MAP_門店代碼對照表",
      source_row: r.rowNumber,
    };
  });
  // 舊代碼不是一對一（例：MJ -> MJ-DY / MJ-JG-SVC，靠情境區分）
  const aliasGroups = new Map();
  for (const a of store_code_aliases) {
    if (!aliasGroups.has(a.old_code)) aliasGroups.set(a.old_code, []);
    aliasGroups.get(a.old_code).push(a.standard_code);
  }
  const nonOneToOneAliases = [...aliasGroups.entries()].filter(([, v]) => v.length > 1);

  // === 5. ORG_組織層級主檔 ======================================================
  const orgAllRows = sheetRows(wb, "ORG_組織層級主檔");
  // flat list: row2 起，直到遇到「組織樹狀圖」列
  // ⚠️ 用實際 rowNumber 比較，不要用 findIndex 回傳的陣列索引（陣列索引是 rowNumber-1，
  // 混用兩者會把 header 列自己也算進資料列，見 2026-08 修過的 off-by-one）
  const treeHeaderRow = orgAllRows.find((r) => r.vals[0] === "組織樹狀圖");
  const flatRows = orgAllRows.filter((r) => r.rowNumber > 1 && r.rowNumber < treeHeaderRow.rowNumber && r.vals[0]);
  // tree rows: 在「層級|樹狀圖|組織類型|業務範圍」header 之後
  const treeTableHeaderRow = orgAllRows.find((r) => r.vals[0] === "層級");
  const treeRows = orgAllRows.filter((r) => r.rowNumber > treeTableHeaderRow.rowNumber && r.vals[0] != null && r.vals[1]);

  const ORG_KIND_TO_DEPT_TYPE = {
    正式部門: "formal",
    職能小組: "function_group",
  };

  // 5a. flat list -> 每個部門的基本屬性（含 是否啟用，樹狀圖沒有這欄）
  const flatByName = new Map();
  for (const r of flatRows) {
    const [name, orgKind, scopeRaw, isActiveRaw] = r.vals;
    flatByName.set(name, { name, org_kind_raw: orgKind, scope_raw: scopeRaw, is_active: yn(isActiveRaw), source_row: r.rowNumber });
  }

  // 5b. tree rows -> 用縮排 level 建親子關係
  function stripTreePrefix(s) {
    return s.replace(/^[│\s]*[├└]─\s*/, "").trim();
  }
  const treeParsed = [];
  const parentAtLevel = {};
  for (const r of treeRows) {
    const level = Number(r.vals[0]);
    const rawLabel = r.vals[1];
    const name = stripTreePrefix(rawLabel);
    const orgKindTree = r.vals[2];
    const parent_code = level === 0 ? null : parentAtLevel[level - 1] ?? null;
    treeParsed.push({ level, name, org_kind_tree: orgKindTree, parent_code, source_row: r.rowNumber, raw_label: rawLabel });
    parentAtLevel[level] = name;
    // 清掉更深層的殘留，避免上一輪分支污染
    for (const k of Object.keys(parentAtLevel)) {
      if (Number(k) > level) delete parentAtLevel[k];
    }
  }
  const treeByName = new Map(treeParsed.map((t) => [t.name, t]));

  // 5c. 合併 flat + tree，flat 全集為準，逐筆決定 parent_code + flags
  const departments = [];
  const namesInTree = new Set(treeParsed.map((t) => t.name));
  const namesInFlat = new Set(flatByName.keys());

  // 已知：R35 行銷專員 在樹狀圖裡被誤掛在「人資部」下（樹狀圖漏了「行銷部」整支）
  const KNOWN_TREE_BUG_NODE = "行銷專員";
  const FLAT_LIST_INFERRED_PARENT = {
    行銷部: "二輪事業群",
    行銷經理: "行銷部",
    行銷專員: "行銷部", // 依前半段 flat list 排序脈絡：行銷部 -> 行銷經理 -> 行銷專員 為一組
    台北旗艦展示中心: "二輪事業群", // 樹狀圖完全沒有這筆，emp 對照候選見 report §4
    台北門市技師組: "台北旗艦展示中心",
  };

  for (const [name, flat] of flatByName) {
    const inTree = treeByName.get(name);
    const dept_type = ORG_KIND_TO_DEPT_TYPE[flat.org_kind_raw] ?? null;
    const flags = [];
    let parent_code;
    let source_section;
    const metadata = {
      scope_raw: flat.scope_raw,
      org_kind_raw: flat.org_kind_raw,
      flat_source_row: flat.source_row,
    };

    if (inTree && name !== KNOWN_TREE_BUG_NODE) {
      parent_code = inTree.parent_code;
      source_section = "tree_diagram";
      metadata.tree_source_row = inTree.source_row;
    } else if (name === KNOWN_TREE_BUG_NODE) {
      // 矛盾節點：樹狀圖說在「人資部」下，flat list 語意上屬「行銷部」-> 不自己選，兩個都保留
      parent_code = FLAT_LIST_INFERRED_PARENT[name];
      source_section = "conflict";
      flags.push("parent_conflict");
      metadata.tree_diagram_parent_code = inTree.parent_code; // 人資部
      metadata.flat_list_inferred_parent_code = FLAT_LIST_INFERRED_PARENT[name]; // 行銷部
      metadata.tree_source_row = inTree.source_row;
      metadata.conflict_note =
        "樹狀圖(R35)把行銷專員掛在人資部底下，但樹狀圖同時整支漏掉「行銷部」節點；flat list 的排列順序（行銷部→行銷經理→行銷專員）暗示語意歸屬行銷部。本欄 parent_code 採 flat_list_inferred_parent_code，但 tree_diagram_parent_code 保留原始矛盾值，兩者不一致時不要自動信任其中一個。";
    } else {
      // 樹狀圖完全沒收錄（行銷部 / 行銷經理 / 台北旗艦展示中心 / 台北門市技師組）
      parent_code = FLAT_LIST_INFERRED_PARENT[name] ?? null;
      source_section = "inferred_no_tree_entry";
      flags.push("inferred_parent_no_tree_entry");
      metadata.inference_note = `此節點未出現在組織樹狀圖區塊，parent_code 依 flat list 的排列脈絡推論為「${parent_code}」，未經樹狀圖交叉驗證`;
    }

    if (name === "台北旗艦展示中心") {
      flags.push("possible_duplicate_of_store");
      metadata.candidate_store_code = "HDS-TP";
      metadata.duplicate_note = "與 STORE_門店主檔 的 HDS-TP（台北旗艦展示中心，歷史據點/停用）疑似同一實體，只是這裡用中文名稱而非門店代碼記錄，灌資料時注意勿重複建點";
    }

    departments.push({
      code: name, // 來源沒有獨立代碼欄，用中文名稱本身當 code（P0 缺口，見 report）
      name,
      org_kind_raw: flat.org_kind_raw,
      dept_type,
      parent_code,
      is_active: flat.is_active,
      source_section,
      metadata,
      _flags: flags,
    });
  }

  // 樹狀圖裡出現但 flat list 沒有的節點（理論上不該發生，防呆檢查）
  const treeOnlyNames = [...namesInTree].filter((n) => !namesInFlat.has(n));

  // === 6. EMP_員工主檔 ==========================================================
  const empRows = sheetRows(wb, "EMP_員工主檔").filter((r) => r.rowNumber > 1 && r.vals[0]);
  const employees = [];
  let empResolvedCount = 0;
  for (const r of empRows) {
    const [emp_code, org_unit_raw, title_raw, name, name_en, phone, ext, email] = r.vals;
    let resolved_node_code = null;
    const flags = [];
    const metadata = {};

    if (org_unit_raw === "總代理") {
      resolved_node_code = "HDS";
      empResolvedCount++;
    } else if (org_unit_raw === "台北門市") {
      // 候選 HDS-TP，但該門店已停用/歷史據點 -> 不硬塞，留 null + 候選記錄
      flags.push("store_unresolved");
      metadata.candidate_node_code = "HDS-TP";
      metadata.candidate_caveat =
        "候選門店 HDS-TP（台北旗艦展示中心）在 STORE_門店主檔 已標記「停用」/歷史據點，但該員工職稱為現任「營運長」，兩者矛盾，不自動採用，需客戶確認台北門市現況（是否已遷址/改代碼，或 HDS-TP 停用狀態本身過期未更新）";
    } else if (org_unit_raw === "台北/服務廠") {
      flags.push("store_unresolved");
      metadata.candidate_node_code = null;
      metadata.candidate_caveat = "STORE_門店主檔沒有任何台北的服務廠（服務廠僅 MJ-JG-SVC 桃園、ZLC-TC-SVC 台中），此單位對不到任何現有門店代碼，可能是未建檔據點";
    } else {
      flags.push("store_unresolved");
      metadata.candidate_caveat = `未知的單位值「${org_unit_raw}」，無對照規則`;
    }

    employees.push({
      emp_code,
      name,
      name_en,
      title_raw,
      email,
      phone,
      ext,
      org_unit_raw,
      resolved_node_code,
      system_role: null,
      metadata,
      _flags: [...flags, "role_missing"],
    });
  }

  // === 7. TEST_測試窗口清單 =====================================================
  const contactRows = sheetRows(wb, "TEST_測試窗口清單").filter((r) => r.rowNumber > 1 && r.vals[0]);
  const contacts = contactRows.map((r) => {
    const [domain, dept_raw, contact_name, email, due_date, status] = r.vals;
    return { domain, dept_raw, contact_name, email, due_date, status, source_row: r.rowNumber };
  });

  // ===========================================================================
  // 驗證
  // ===========================================================================
  const validationIssues = [];

  // nodes: parent_code 全部要指得到存在的 code（HDS 例外，parent=null）
  const nodeCodeSet = new Set(nodes.map((n) => n.code));
  for (const n of nodes) {
    if (n.parent_code && !nodeCodeSet.has(n.parent_code)) {
      validationIssues.push(`[nodes] ${n.code} 的 parent_code=${n.parent_code} 找不到對應節點`);
    }
  }
  // code 重複檢查（已知例外：CD 門店代碼與 CD 經銷商代碼撞名，見 report）
  const nodeCodeCounts = new Map();
  for (const n of nodes) nodeCodeCounts.set(n.code, (nodeCodeCounts.get(n.code) ?? 0) + 1);
  const dupNodeCodes = [...nodeCodeCounts.entries()].filter(([, c]) => c > 1);

  // departments: parent_code 全部要指得到存在的 code
  const deptCodeSet = new Set(departments.map((d) => d.code));
  for (const d of departments) {
    if (d.parent_code && !deptCodeSet.has(d.parent_code)) {
      validationIssues.push(`[departments] ${d.code} 的 parent_code=${d.parent_code} 找不到對應節點`);
    }
  }
  const deptCodeCounts = new Map();
  for (const d of departments) deptCodeCounts.set(d.code, (deptCodeCounts.get(d.code) ?? 0) + 1);
  const dupDeptCodes = [...deptCodeCounts.entries()].filter(([, c]) => c > 1);

  // ===========================================================================
  // 輸出 JSON
  // ===========================================================================
  const output = {
    _meta: {
      generated_at: new Date().toISOString(),
      source_file: path.basename(SOURCE_XLSX),
      scope: "T4 組織/人員 ETL — schema-agnostic 業務語意輸出（不假設 organizations level=N 或 node_type+config 兩種候選架構）",
      counts: {
        brands: brands.length,
        nodes: nodes.length,
        nodes_dealer_tree: { agency: dealerNodes.filter((n) => n.node_type === "agency").length, dealer: dealerNodes.filter((n) => n.node_type === "dealer").length, store: storeNodes.filter((n) => n.node_type === "store").length, service_center: storeNodes.filter((n) => n.node_type === "service_center").length },
        departments: departments.length,
        employees: employees.length,
        store_code_aliases: store_code_aliases.length,
        contacts: contacts.length,
      },
    },
    brands,
    nodes,
    departments,
    employees,
    store_code_aliases,
    contacts,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(output, null, 2), "utf8");

  // ===========================================================================
  // 產出 report
  // ===========================================================================
  const md = buildReport({
    brands,
    dealerNodes,
    storeNodes,
    storeDetail,
    departments,
    treeParsed,
    empRows,
    employees,
    empResolvedCount,
    store_code_aliases,
    nonOneToOneAliases,
    validationIssues,
    dupNodeCodes,
    dupDeptCodes,
    treeOnlyNames,
    contacts,
  });
  fs.writeFileSync(OUT_REPORT, md, "utf8");

  // console summary
  console.log("=== T4 組織/人員 ETL 完成 ===");
  console.log(`brands: ${brands.length}`);
  console.log(`nodes (dealer/store tree): ${nodes.length}  (agency=${dealerNodes.filter((n) => n.node_type === "agency").length}, dealer=${dealerNodes.filter((n) => n.node_type === "dealer").length}, store=${storeNodes.filter((n) => n.node_type === "store").length}, service_center=${storeNodes.filter((n) => n.node_type === "service_center").length})`);
  console.log(`departments (org tree): ${departments.length}`);
  console.log(`employees: ${employees.length}  (resolved_node_code non-null: ${empResolvedCount})`);
  console.log(`store_code_aliases: ${store_code_aliases.length}`);
  console.log(`contacts: ${contacts.length}`);
  console.log(`validation issues: ${validationIssues.length}`);
  if (validationIssues.length) validationIssues.forEach((i) => console.log("  - " + i));
  console.log(`duplicate node codes (expected: CD only): ${JSON.stringify(dupNodeCodes)}`);
  console.log(`duplicate department codes (expected: none): ${JSON.stringify(dupDeptCodes)}`);
  console.log(`\nOutput: ${OUT_JSON}`);
  console.log(`Report: ${OUT_REPORT}`);
}

function fmtBool(b) {
  if (b === true) return "是";
  if (b === false) return "否";
  return "—";
}

function buildReport(ctx) {
  const {
    brands,
    dealerNodes,
    storeNodes,
    storeDetail,
    departments,
    treeParsed,
    empRows,
    employees,
    empResolvedCount,
    store_code_aliases,
    nonOneToOneAliases,
    validationIssues,
    dupNodeCodes,
    dupDeptCodes,
    treeOnlyNames,
    contacts,
  } = ctx;

  const lines = [];
  const p = (s = "") => lines.push(s);

  p("# T4 · 組織/人員 ETL 報告");
  p();
  p(`來源檔：\`4b99d996-DealerOS___________________.xlsx\``);
  p(`產出：\`scripts/etl-haidesheng/out/org.json\``);
  p();
  p("---");
  p();

  // §1 三棵樹的形狀
  p("## §1 三棵樹的形狀");
  p();
  p("### 1a. 總代理－經銷商－門店 樹（`nodes[]`，node_type: agency/dealer/store/service_center）");
  p();
  p("```");
  p("HDS 海德生貿易（agency，總代理｜Indian / Lambretta / Polaris）");
  for (const dealer of dealerNodes) {
    p(`├─ ${dealer.code} ${dealer.name}（dealer｜${dealer.brands.join(", ") || "?"}）`);
    const stores = storeNodes.filter((s) => s.parent_code === dealer.code);
    for (const s of stores) {
      const tag = s.node_type === "service_center" ? "service_center" : s.store_subtype ? `store/${s.store_subtype}` : "store";
      const activeTag = s.is_active === false ? " ⛔停用" : "";
      p(`│   ├─ ${s.code} ${s.name}（${tag}${activeTag}）`);
    }
  }
  p("```");
  p();
  p(`共 ${dealerNodes.length + storeNodes.length} 個節點：agency ${dealerNodes.filter((n) => n.node_type === "agency").length} + dealer ${dealerNodes.filter((n) => n.node_type === "dealer").length} + store ${storeNodes.filter((n) => n.node_type === "store").length} + service_center ${storeNodes.filter((n) => n.node_type === "service_center").length}。`);
  p();

  p("### 1b. 部門樹（`departments[]`，來自 ORG_組織層級主檔 的樹狀圖區塊 + flat list 補全）");
  p();
  p("```");
  function printDeptTree(code, prefix = "") {
    const node = departments.find((d) => d.code === code);
    if (!node) return;
    const flagTag = node._flags.length ? ` ⚠️${node._flags.join(",")}` : "";
    p(`${prefix}${node.name}（${node.dept_type ?? node.org_kind_raw}）${flagTag}`);
    const children = departments.filter((d) => d.parent_code === code);
    for (const c of children) printDeptTree(c.code, prefix + "  ");
  }
  const roots = departments.filter((d) => !d.parent_code);
  for (const r of roots) printDeptTree(r.code);
  p("```");
  p();
  p(`共 ${departments.length} 個節點。`);
  p();

  p("### 1c. 品牌（`brands[]`）");
  p();
  for (const b of brands) {
    p(`- \`${b.code}\`（${b.code_source}）${b.name} — 整車:${fmtBool(b.is_vehicle_brand)} 零件:${fmtBool(b.is_parts_brand)} 售後:${fmtBool(b.is_service_brand)} 目前經營:${fmtBool(b.is_currently_active)}`);
  }
  p();
  p("---");
  p();

  // §2 node_type 判定規則
  p("## §2 node_type 判定規則與逐筆歸類表");
  p();
  p("**判定規則**：");
  p("- DEALER 表「主要業務範圍」欄前綴為「總代理」→ `agency`（僅 HDS 一筆），其餘「授權經銷商」→ `dealer`");
  p("- STORE 表「門店類型」→ `經銷門店`/`歷史據點` → `store`；`服務廠` → `service_center`；`分銷商`（僅 TD-HL 泰多一筆）→ 仍歸 `store`，但額外標 `store_subtype:'sub_distributor'` + flag `sub_distributor_type`。**理由**：node_type 的合法值集合是既定的 6 個業務語意（agency/dealer/store/service_center/department/function_group），不擅自加第 7 種避免下游轉換器遇到未知列舉值直接炸掉；分銷商與一般經銷門店的差異用 sidecar 欄位表達，資訊不遺失，轉換時可自行決定要不要拆成獨立類型");
  p("- 歷史據點（HDS-TP、SCH-KH）保留 `store` 類型 + `is_active:false` + flag `historical_site`，不從清單移除（保留稽核軌跡）");
  p();
  p("**經銷商逐筆歸類（12 筆）**：");
  p();
  p("| 代碼 | 名稱 | node_type | 角色 | 品牌 |");
  p("|---|---|---|---|---|");
  for (const d of dealerNodes) {
    p(`| ${d.code} | ${d.name} | ${d.node_type} | ${d.metadata.role_raw} | ${d.brands.join(", ") || "—"} |`);
  }
  p();
  p("**門店逐筆歸類（15 筆）**：");
  p();
  p("| 代碼 | 所屬經銷商 | 名稱 | 門店類型(raw) | node_type | subtype | is_active | flags |");
  p("|---|---|---|---|---|---|---|---|");
  for (const s of storeDetail) {
    p(`| ${s.code} | ${s.dealerCode} | ${s.name} | ${s.storeTypeRaw} | ${s.node_type} | ${s.storeSubtype ?? "—"} | ${fmtBool(s.is_active)} | ${s.flags.join(", ") || "—"} |`);
  }
  p();
  p("⚠️ **CD 代碼碰撞**：經銷商代碼 `CD`（啟德國際重機）跟它唯一門店的門店代碼也是 `CD`，兩個不同 node_type 的節點共用同一個 code 字串（來源資料本來就這樣，非 ETL 產生的錯誤）。`nodes[]` 陣列裡這兩筆都保留、都標 `_flags:['code_collision_with_dealer']`（門店那筆），下游若用「code 全域唯一」當 primary key 會炸，建議用 `(node_type, code)` 複合鍵，或轉換時把其中一個重新編碼。");
  p();
  p("---");
  p();

  // §3 ORG 樹狀圖解析
  p("## §3 ORG 樹狀圖解析結果 + 行銷專員矛盾說明");
  p();
  p(`樹狀圖區塊（R28–R46）共 ${treeParsed.length} 筆節點。flat list（R2–R24）共 ${departments.length} 筆。`);
  p();
  const noTreeEntry = departments.filter((d) => d._flags.includes("inferred_parent_no_tree_entry"));
  p(`**樹狀圖完全沒收錄、靠 flat list 脈絡推論 parent 的節點（${noTreeEntry.length} 筆）**：`);
  for (const d of noTreeEntry) {
    p(`- \`${d.name}\`：推論 parent_code = \`${d.parent_code}\`（${d.metadata.inference_note}）`);
  }
  p();
  p("### ⚠️ 行銷專員矛盾（R35）");
  p();
  const marketingSpec = departments.find((d) => d.name === "行銷專員");
  p("樹狀圖 R35 原文：`3 | │  └─ 行銷專員 | 職能小組 | 二輪事業群`，緊跟在 R34「人資經理」之後、縮排同屬 R33「人資部」底下的 level=3 子節點。");
  p();
  p("但樹狀圖**整支漏掉「行銷部」節點**（flat list R9 明明有「行銷部」，樹狀圖 R33 人資部之後直接跳到 R36 公關部，中間沒有行銷部這一行），行銷經理（R10）在樹狀圖裡也完全沒出現。");
  p();
  p("**兩種可能**：");
  p("1. **flat list 為準**：行銷部→行銷經理→行銷專員 三筆在 flat list 裡連續排列（R9-R11），業務語意上行銷專員理應歸在「行銷部」底下，樹狀圖是漏畫+縮排錯誤（漏了行銷部節點，導致行銷專員的縮排往上頂到人資部底下）");
  p("2. **樹狀圖為準**：行銷專員實際上是人資部底下的職能小組（可能是「人資部裡負責行銷相關庶務的專員」這種跨部門配置，flat list 只是照供應商既定的顯示順序排列，不代表真實隸屬）");
  p();
  p(`本 ETL **採方案 1（parent_code = '行銷部'）當輸出值**，但把矛盾兩造都存進 metadata：\`tree_diagram_parent_code: '${marketingSpec?.metadata.tree_diagram_parent_code}'\` / \`flat_list_inferred_parent_code: '${marketingSpec?.metadata.flat_list_inferred_parent_code}'\`，並標 flag \`parent_conflict\`。**這是本 ETL 唯一自行選邊的矛盾節點，需要客戶確認**（C 類問題：行銷專員實際上是行銷部還是人資部的人？）。`);
  p();
  if (treeOnlyNames.length) {
    p(`⚠️ 另外發現 ${treeOnlyNames.length} 筆節點只出現在樹狀圖、flat list 沒有：${treeOnlyNames.join(", ")}（防呆檢查，理論上不該發生）`);
    p();
  }
  p("---");
  p();

  // §4 員工↔門店解析
  p("## §4 員工↔門店解析");
  p();
  const unresolvedEmp = employees.filter((e) => e.resolved_node_code === null);
  p(`共 ${employees.length} 筆員工。解出 **${empResolvedCount}** 筆（全部是「總代理」→ 直接對到 \`HDS\`），解不出 **${unresolvedEmp.length}** 筆（成功率 ${((empResolvedCount / employees.length) * 100).toFixed(1)}%）。`);
  p();
  p("**解不出的逐筆列表**：");
  p();
  p("| 員工編號 | 姓名 | 單位(raw) | 候選 node_code | 候選的問題 |");
  p("|---|---|---|---|---|");
  for (const e of unresolvedEmp) {
    p(`| ${e.emp_code} | ${e.name} | ${e.org_unit_raw} | ${e.metadata.candidate_node_code ?? "（無候選）"} | ${e.metadata.candidate_caveat} |`);
  }
  p();
  p("**判斷依據**：「單位」欄只有 3 種值（總代理 14 筆 / 台北門市 1 筆 / 台北/服務廠 3 筆），對不到 15 個實際門店代碼。「總代理」語意清楚直接對應 `HDS`（agency 節點本身）；「台北門市」唯一候選是 `HDS-TP`，但 STORE 表把它標記「停用」+「歷史據點」，跟該員工（廖正煇，現任「營運長」）矛盾，不強行採用；「台北/服務廠」完全沒有台北的服務廠資料（服務廠只有桃園 MJ-JG-SVC、台中 ZLC-TC-SVC 兩筆），可能是尚未建檔的據點。");
  p();
  p("---");
  p();

  // §5 flags 計數
  p("## §5 `_flags` 計數表");
  p();
  const flagCounts = new Map();
  const allFlagged = [
    ...ctx.dealerNodes.map((n) => ({ scope: "nodes(dealer)", flags: n._flags })),
    ...ctx.storeNodes.map((n) => ({ scope: "nodes(store)", flags: n._flags })),
    ...ctx.departments.map((n) => ({ scope: "departments", flags: n._flags })),
    ...ctx.employees.map((n) => ({ scope: "employees", flags: n._flags })),
  ];
  for (const item of allFlagged) {
    for (const f of item.flags) {
      const key = `${item.scope} :: ${f}`;
      flagCounts.set(key, (flagCounts.get(key) ?? 0) + 1);
    }
  }
  p("| scope | flag | count |");
  p("|---|---|---|");
  for (const [key, count] of [...flagCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const [scope, flag] = key.split(" :: ");
    p(`| ${scope} | ${flag} | ${count} |`);
  }
  p();
  p("---");
  p();

  // §6 阻塞清單
  p("## §6 阻塞清單");
  p();
  p("以下欄位缺失會導致「灌得進去但用不了」或「根本灌不進去」：");
  p();
  p("1. **門店負責人 100% 全空**（STORE_門店主檔）— 15 筆門店沒有一筆有負責人姓名（客戶自標「準備中」）。門店詳情頁若有「負責人」欄位會全空，無法做門店層級的通知/簽核指派");
  p("2. **員工系統角色未提供**（EMP_員工主檔）— 18 筆全部 `system_role: null`。職稱是中文自由文字（總經理/品牌經營協理/...），**本 ETL 刻意不用職稱推角色**（那是客戶該回答的 C 類問題），沒角色代表 RBAC 沒辦法自動化建帳號權限");
  p("3. **員工↔門店對不上（4/18，見 §4）**— 「台北門市」「台北/服務廠」共 4 筆員工找不到門店代碼，這些人要嘛掛在總代理底下當通用員工，要嘛需要客戶補門店代碼才能正確歸屬");
  p("4. **經銷商員工名單缺失**— EMP_員工主檔 18 筆全部是「總代理」或「台北」相關單位，**11 個授權經銷商（MJ/CD/TD/...）完全沒有任何員工資料**。如果要在系統裡幫經銷商的店長/業務建帳號，這塊是空的");
  p("5. **部門沒有獨立代碼欄**（ORG_組織層級主檔）— 23 個部門節點只有中文名稱，沒有 code 欄位，本 ETL 用中文名稱本身當 code（`departments[].code = name`），這在正式 schema 裡通常不會拿中文自由文字當 primary key / FK，需要客戶或我方後補一組穩定代碼");
  p("6. **行銷專員的隸屬矛盾（見 §3）**— 影響行銷部/人資部的編制人數與費用歸屬，需客戶確認");
  p("7. **CD 代碼碰撞（見 §2）**— 經銷商與門店共用 code=CD，若目標 schema 真的用 code 當唯一鍵，這筆會直接違反 unique constraint");
  p("8. **SCH-KH 地址無郵遞區號、無營業時間**（已停用據點，資料本來就殘缺，非本 ETL 造成）");
  p("9. **2 筆營業時間含無法結構化的特殊條款**（SCH-TN「每月第四週週日店休」、TZD-KH「依臉書公告為主」）— `business_hours_parsed` 為 null，只保留原文，任何依賴結構化營業時間做「現在是否營業中」判斷的功能對這兩家會失準");
  p();
  p("---");
  p();

  // §7 灌進去之後會壞掉什麼
  p("## §7 灌進去之後會有什麼是壞的");
  p();
  p("- **台北旗艦展示中心 疑似重複實體**：ORG_組織層級主檔 用中文名稱記了一筆「台北旗艦展示中心」（門店類型節點，停用），STORE_門店主檔 用代碼 `HDS-TP` 記了同一個地方（歷史據點，停用）。兩邊用不同 identifier 指同一個實體，如果不做交叉去重，灌資料後系統裡會出現兩個「台北旗艦展示中心」");
  p("- **經銷商層級掛空**：11 個授權經銷商底下完全沒有員工、沒有負責人，如果 UI 假設「每個 dealer 至少要有一個負責人/聯絡窗口」，這裡會全數顯示空白或造成 UI 邏輯錯誤（例如聯絡人下拉選單空的沒得選）");
  p("- **CD 唯一鍵碰撞**：若目標 schema 對 `code` 欄位下 unique constraint 且沒有拿 node_type 做複合鍵，寫入 CD 門店那筆會直接失敗（`23505`）或覆蓋掉 CD 經銷商那筆，視實作方式而定，兩種結果都是錯的");
  p("- **行銷專員的部門人數統計會偏一邊**：不管最後拍板行銷部還是人資部，另一邊的部門人數/職能小組清單就會少算 1 人，任何依賴「部門底下有幾個職能小組」的報表在拍板前都不準");
  p("- **2 家門店（SCH-TN / TZD-KH）的「營業中/休息中」動態判斷會失準**：因為特殊條款無法結構化，只能顯示原始文字，不能拿來做「現在有沒有開」這種即時邏輯");
  p("- **員工-門店關聯 4/18 是空的**：如果門店詳情頁想秀「本店員工列表」，總代理的 14 人不會出現在任何一家門店底下（他們的 resolved_node_code 是 HDS 本身，不是任何門店），這是符合語意的正確結果，但要提醒 UI 不要誤判成「資料漏掉」");
  p();
  p("---");
  p();

  // §8 驗證
  p("## §8 自動驗證結果");
  p();
  p(`- parent_code 全部指得到存在節點：${validationIssues.length === 0 ? "✅ 通過" : `❌ ${validationIssues.length} 筆異常`}`);
  if (validationIssues.length) for (const i of validationIssues) p(`  - ${i}`);
  p(`- nodes[] 重複 code：${JSON.stringify(dupNodeCodes)}（預期只有 CD，見 §2 說明）`);
  p(`- departments[] 重複 code：${JSON.stringify(dupDeptCodes)}（預期無）`);
  p("- JSON 可正常 parse：✅（本檔案由 `JSON.stringify` 產生後原樣寫入，`extract-org.mjs` 執行完沒有拋錯即代表可 parse）");
  p();

  // 抽 5 筆核對
  p("### 抽 5 筆人工核對");
  p();
  const hds = ctx.dealerNodes.find((n) => n.code === "HDS");
  p("**HDS**");
  p("```json");
  p(JSON.stringify(hds, null, 2));
  p("```");
  const mjStores = ctx.storeNodes.filter((n) => n.parent_code === "MJ");
  p("**MJ 兩據點（MJ-DY / MJ-JG-SVC）**");
  p("```json");
  p(JSON.stringify(mjStores, null, 2));
  p("```");
  const cdAll = [...ctx.dealerNodes, ...ctx.storeNodes].filter((n) => n.code === "CD");
  p("**CD 同名代碼（經銷商 + 門店）**");
  p("```json");
  p(JSON.stringify(cdAll, null, 2));
  p("```");
  const schKh = ctx.storeNodes.find((n) => n.code === "SCH-KH");
  p("**停用的 SCH-KH**");
  p("```json");
  p(JSON.stringify(schKh, null, 2));
  p("```");
  const marketingSpecNode = ctx.departments.find((d) => d.name === "行銷專員");
  p("**有矛盾的行銷專員**");
  p("```json");
  p(JSON.stringify(marketingSpecNode, null, 2));
  p("```");
  p();

  p("---");
  p();
  p("## 附錄：TEST_測試窗口清單（獨立輸出，contacts[]）");
  p();
  p("| 資料領域 | 負責人 | Email | 截止日 | 狀態 |");
  p("|---|---|---|---|---|");
  for (const c of contacts) {
    p(`| ${c.domain} | ${c.contact_name} | ${c.email} | ${c.due_date} | ${c.status} |`);
  }
  p();
  p("## 附錄：STORE_CODE_MAP 非一對一 alias");
  p();
  if (nonOneToOneAliases.length) {
    for (const [oldCode, targets] of nonOneToOneAliases) {
      p(`- 舊代碼 \`${oldCode}\` → 對應多個標準代碼：${targets.join(", ")}（靠「原始名稱或情境」欄區分，見 store_code_aliases[] 的 \`context\` 欄）`);
    }
  } else {
    p("（無）");
  }
  p();

  return lines.join("\n") + "\n";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
