// 從 org.json 產生批次0組織骨架 INSERT SQL
// 用法：node scripts/etl-haidesheng/gen-org-skeleton-sql.mjs
//
// 設計（對應 Russell《DealerOS 經銷商層級隔離規則》2026-08-09 + T5 A+ 建議）：
//   level=1 region  = 海德生貿易總代理節點（agency，每個 marque brand 各一筆）
//   level=2 store   = 直接掛在總代理底下的節點：
//                       - node_type='dealer' → store_type='dealer'（11 家經銷商）
//                       - node_type='store' 且 parent_code='HDS'（HDS-TP 台北旗艦）→ store_type='direct'
//   level=3 store   = 掛在某個經銷商底下的實際門店/服務廠 → store_type='direct'
//                       node_type（store/service_center）與其他細節放 metadata（typed store_type 只有 direct/dealer 兩種）
//
// 一個實體節點若服務多個 marque（如敏傑同時賣 indian+lambretta），每個 marque 各生一筆 organizations row
// （brand_id 是單一值、且是這個 repo 現有的隔離主力，不使用共用 org row 跨 brand）。

import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const orgJsonPath = join(__dirname, "out", "org.json");
const outPath = join(__dirname, "out", "00-org-skeleton.sql");

const GROUP_ID = "default";
const SUBSIDIARY_ID = "eff8140d-39d9-4bab-a3bd-50f56a349e9f"; // 海德生貿易股份有限公司（TBA-HDS placeholder）

const BRAND_MARQUE_MAP = [
  { brand_id: "indian-hds", marque: "indian" },
  { brand_id: "lambretta-hds", marque: "lambretta" },
  { brand_id: "polaris-hds", marque: "polaris" },
];

const org = JSON.parse(readFileSync(orgJsonPath, "utf-8"));
const nodesByCode = new Map(org.nodes.map((n) => [n.code, n]));

function sqlStr(v) {
  if (v === null || v === undefined) return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sqlBool(v) {
  if (v === null || v === undefined) return "true"; // 未知一律預設 active，原始未知狀態記進 metadata
  return v ? "true" : "false";
}
function sqlJsonb(obj) {
  return `${sqlStr(JSON.stringify(obj))}::jsonb`;
}

const rows = []; // { sql, brand_id, code, level }
const idMap = new Map(); // `${brand_id}:${code}` -> uuid
const warnings = [];

for (const { brand_id, marque } of BRAND_MARQUE_MAP) {
  // level=1 agency
  const agency = nodesByCode.get("HDS");
  const agencyId = randomUUID();
  idMap.set(`${brand_id}:HDS`, agencyId);
  rows.push({
    brand_id,
    code: "HDS",
    level: 1,
    sql: `(${sqlStr(agencyId)}, ${sqlStr(GROUP_ID)}, ${sqlStr(brand_id)}, ${sqlStr(SUBSIDIARY_ID)}, NULL, 1, 'region', NULL, 'HDS', ${sqlStr(agency.name)}, NULL, NULL, ${sqlBool(agency.is_active)}, 'manual', ${sqlJsonb({ node_type: "agency", source: "org.json batch-0" })})`,
  });

  // level=2：dealer 節點 + HDS-TP 直營節點
  const level2Nodes = org.nodes.filter(
    (n) => n.parent_code === "HDS" && n.code !== "HDS",
  );
  for (const n of level2Nodes) {
    if (!n.brands.includes(marque)) {
      if (n.brands.length === 0) {
        warnings.push(
          `跳過 ${n.code}（${n.name}）於 brand ${brand_id}：來源資料 brands[] 為空（flag: brand_scope_missing），無法判斷歸屬哪個 marque，不猜測。此節點已停用/歷史據點，暫不影響上線，待客戶確認實際服務品牌後補建`,
        );
      }
      continue;
    }
    const isDealer = n.node_type === "dealer";
    const id = randomUUID();
    idMap.set(`${brand_id}:${n.code}`, id);
    rows.push({
      brand_id,
      code: n.code,
      level: 2,
      sql: `(${sqlStr(id)}, ${sqlStr(GROUP_ID)}, ${sqlStr(brand_id)}, ${sqlStr(SUBSIDIARY_ID)}, ${sqlStr(agencyId)}, 2, 'store', ${sqlStr(isDealer ? "dealer" : "direct")}, ${sqlStr(n.code)}, ${sqlStr(n.name)}, ${n.address ? sqlStr(n.address.raw) : "NULL"}, ${n.phone ? sqlStr(n.phone) : "NULL"}, ${sqlBool(n.is_active)}, 'manual', ${sqlJsonb({ node_type: n.node_type, brands: n.brands, flags: n._flags ?? [], source: "org.json batch-0" })})`,
    });
  }

  // level=3：掛在某個經銷商底下的門店/服務廠
  const level3Nodes = org.nodes.filter(
    (n) =>
      (n.node_type === "store" || n.node_type === "service_center") &&
      n.parent_code !== "HDS",
  );
  for (const n of level3Nodes) {
    if (!n.brands.includes(marque)) continue;
    const parentKey = `${brand_id}:${n.parent_code}`;
    const parentId = idMap.get(parentKey);
    if (!parentId) {
      warnings.push(
        `跳過 ${n.code}（${marque}）：找不到父經銷商 ${n.parent_code} 在 brand ${brand_id} 下的節點（該經銷商可能不服務此 marque，資料需人工複核）`,
      );
      continue;
    }
    const id = randomUUID();
    idMap.set(`${brand_id}:${n.code}`, id);
    rows.push({
      brand_id,
      code: n.code,
      level: 3,
      sql: `(${sqlStr(id)}, ${sqlStr(GROUP_ID)}, ${sqlStr(brand_id)}, ${sqlStr(SUBSIDIARY_ID)}, ${sqlStr(parentId)}, 3, 'store', 'direct', ${sqlStr(n.code)}, ${sqlStr(n.name)}, ${n.address ? sqlStr(n.address.raw) : "NULL"}, ${n.phone ? sqlStr(n.phone) : "NULL"}, ${sqlBool(n.is_active)}, 'manual', ${sqlJsonb({ node_type: n.node_type, store_subtype: n.store_subtype ?? null, brands: n.brands, business_hours: n.business_hours_parsed ?? null, flags: n._flags ?? [], source: "org.json batch-0" })})`,
    });
  }
}

const uniqueWarnings = [...new Set(warnings)];

const header = `-- 批次0：海德生組織骨架（1 agency + 11 dealer + 15 store/service_center，跨 3 個 marque brand）
-- 由 scripts/etl-haidesheng/gen-org-skeleton-sql.mjs 從 org.json 產生，請勿手改此檔——改 org.json 或產生器後重跑
-- 產出列數：${rows.length}（level1=${rows.filter((r) => r.level === 1).length}, level2=${rows.filter((r) => r.level === 2).length}, level3=${rows.filter((r) => r.level === 3).length}）
${uniqueWarnings.length ? `-- ⚠️ 警告（${uniqueWarnings.length}）：\n${uniqueWarnings.map((w) => `--   ${w}`).join("\n")}\n` : ""}
INSERT INTO organizations (
  id, group_id, brand_id, subsidiary_id, parent_id, level, type, store_type,
  code, name, address, phone, is_active, external_source, metadata
) VALUES
${rows.map((r) => r.sql).join(",\n")};
`;

writeFileSync(outPath, header, "utf-8");
console.log(`產出 ${rows.length} 筆 organizations insert → ${outPath}`);
console.log(`  level1=${rows.filter((r) => r.level === 1).length}  level2=${rows.filter((r) => r.level === 2).length}  level3=${rows.filter((r) => r.level === 3).length}`);
if (warnings.length) {
  console.log(`\n⚠️ ${warnings.length} 筆警告：`);
  warnings.forEach((w) => console.log(`  - ${w}`));
}
