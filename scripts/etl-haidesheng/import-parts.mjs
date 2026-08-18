// 海德生零件主檔匯入 — 語意等同 bulkImportItemsAction（500筆/批陣列 insert，
// 23505 衝突才逐筆重試找出真正重複的那幾筆），只是繞過瀏覽器 textarea（9,582 行貼上不切實際）。
// 執行：node scripts/etl-haidesheng/import-parts.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const BRAND_MAP = {
  indian: "indian-hds",
  lambretta: "lambretta-hds",
  polaris: "polaris-hds",
};

const parts = JSON.parse(
  readFileSync(new URL("./out/parts.json", import.meta.url), "utf-8"),
);

const skippedNoBrand = [];
const rows = [];
for (const p of parts) {
  const brand_id = BRAND_MAP[p.brand];
  if (!brand_id) {
    skippedNoBrand.push(p.code);
    continue;
  }
  rows.push({
    brand_id,
    code: p.code,
    name: p.name,
    name_en: p.name_en,
    category: p.category,
    base_uom: p.base_uom || "個", // 空值一律套 schema 預設「個」，原始值留在 metadata.uom_raw / _flags.uom_missing 供之後回頭核實
    standard_cost: p.standard_cost,
    suggested_price: p.suggested_price,
    is_active: true,
    external_source: "haidesheng_etl_20260810",
    metadata: { ...p.metadata, _flags: p._flags ?? [] },
  });
}

console.log(`total=${parts.length} importable=${rows.length} skipped_no_brand=${skippedNoBrand.length}`);

const BATCH = 500;
let inserted = 0;
let skipped = 0;
const errors = [];

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const { error } = await supabase.from("items").insert(batch);
  if (!error) {
    inserted += batch.length;
    console.log(`batch ${i}-${i + batch.length}: ok (+${batch.length})`);
    continue;
  }
  if (error.code === "23505") {
    for (const row of batch) {
      const { error: rowError } = await supabase.from("items").insert(row);
      if (rowError) {
        skipped++;
        errors.push(`${row.code}: ${rowError.code === "23505" ? "已存在" : rowError.message}`);
      } else {
        inserted++;
      }
    }
    console.log(`batch ${i}-${i + batch.length}: conflict, retried individually`);
  } else {
    skipped += batch.length;
    errors.push(`批次 ${i + 1}-${i + batch.length}: ${error.message}`);
    console.log(`batch ${i}-${i + batch.length}: FAILED ${error.message}`);
  }
}

console.log(JSON.stringify({ inserted, skipped, skippedNoBrand: skippedNoBrand.length, errors: errors.slice(0, 20) }, null, 2));

writeFileSync(
  new URL("./out/import-parts-result.json", import.meta.url),
  JSON.stringify({ inserted, skipped, skippedNoBrandCount: skippedNoBrand.length, errors }, null, 2),
);
