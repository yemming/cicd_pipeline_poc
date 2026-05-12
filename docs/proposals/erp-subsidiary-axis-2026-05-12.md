# ERP — SUBSIDIARY 軸補齊 + PARTS_RETAIL_SALE engine 接入

**Date**: 2026-05-12
**Branch**: main (commit `20b42b7`)
**Author**: Ming + Claude
**Status**: 待 Ming review → 動工

---

## 0. TL;DR

HANDOFF 寫的「SUBSIDIARY 軸架構工程 ~半天」實際**只需要 1–2 小時**，因為現況比 HANDOFF 描述的好：

| HANDOFF 寫的 | 實際現況 | 結論 |
|---|---|---|
| organizations / warehouses / items / suppliers 沒 `subsidiary_id` FK | `organizations.subsidiary_id` 已 NOT NULL；`warehouses.org_id` 已 NOT NULL | warehouse→org→subsidiary chain **已就緒** |
| Master rebinding（items / suppliers 綁錯 L5）需要做 | Indian items 31 筆全綁 `1210201 原廠零件` + revenue/cogs 也都齊；Indian 零件 supplier (MOTUL/PIRELLI/BREMBO) 全綁 `2170102 零件 AP` | **不用 rebind**，測試時選對 supplier 即可 |
| Indian subsidiary 還沒 seed | 現況 Indian organizations 都指 `8236672c-...`（彥明國際貿易，short_name 寫 "DealerOS Ducati"）| **決策題**（見 §3） |
| engine ctx + dim_sources 沒含 SUBSIDIARY | 同 | **真的要做** — engine 加 chain resolver |

真正的工作只剩三條：
1. engine 加 SUBSIDIARY chain resolver（warehouse_id → org → subsidiary_id）
2. UPDATE `transaction_types.gl_template` 兩筆（PARTS_PURCHASE / PARTS_RETAIL_SALE）`dim_sources` 補 SUBSIDIARY
3. PARTS_RETAIL_SALE engine hook 掛 `createInternalSale`

---

## 1. SUBSIDIARY chain resolver — 設計選項

**Option A：domain 端 resolve**（每個 hook 自己撈 subsidiary_id）
- 改動：`receipts.ts` / `issues.ts` 等各業務 helper 加 `lookupSubsidiaryFromWarehouse(warehouse_id)` 幾行
- 優：engine 不動
- 缺：每個 hook 重複（DRY 違反）；接到第 5 個 type 開始痛

**Option B：engine DSL 擴 chain lookup**（`dim_sources: { SUBSIDIARY: "chain.warehouses.org_id.subsidiary_id" }`）
- 改動：engine 改 ~80 行（fetchMasters 階段做 chain fetch、resolveDimensions 階段解析 chain DSL）
- 優：generic、未來加任意 chain 都 OK
- 缺：DSL 設計成本高（POC 還不需要）

**Option C（建議）：engine 寫死 SUBSIDIARY chain fallback**
- 改動：engine 在 `resolveDimensions` 階段加邏輯：「遇到 dim_sources 寫了 `SUBSIDIARY` 但 ctx 沒對應值 → 自動從 ctx.warehouse_id 兩跳補」
- 改動範圍：engine ~30 行（多 fetch 一次 warehouses + organizations）+ template `dim_sources` 補 `"SUBSIDIARY": "chain.warehouse.subsidiary_id"`（or 任何 placeholder）
- 優：hook 不用改、所有 type 都 cover、未來 generic 化再 refactor 成 Option B
- 缺：寫死 chain（warehouse→org→subsidiary）；換 source（如改從 store_id 兩跳）需改 engine

→ **建議 Option C**。

---

## 2. PARTS_RETAIL_SALE engine hook — 接 `createInternalSale`

**Hook 位置**：`src/domain/issues.ts:977 createInternalSale()` 結尾，仿照 `receipts.ts:283` 的 `after()` 非阻塞模式。

**ctx 來源**：
```ts
after(async () => {
  const res = await instantiateTransaction(TX_TYPES.PARTS_RETAIL_SALE, {
    item_id: previewRes.data.lines[0].item_id, // POC 限制：取第一筆
    customer_id: input.customer_id ?? null,
    warehouse_id: input.warehouse_id,
    net_amount: computedAmountTotal,             // 售價合計
    tax_amount: Math.round(computedAmountTotal * 0.05 * 100) / 100,
    cost_amount: sum(preview.lines[].picks[].qty × unit_cost), // 從 preview 累計
  }, { autoPost: true, entryDate });
});
```

**Template 已存在**（transaction_types.code='PARTS_RETAIL_SALE'）：5 行
- DR 1110101 現金（net + tax）
- CR items.gl_revenue_coa_id 銷貨收入（net）
- CR 2230XXX 銷項稅額（tax）
- DR items.gl_cogs_coa_id 銷貨成本（cost）
- CR items.gl_inventory_coa_id 存貨減少（cost）

**dim_sources 需補**：每行加 `SUBSIDIARY` placeholder（同 PARTS_PURCHASE）。

---

## 3. 待 Ming 決策

### Q1. Indian subsidiary：共用 Ducati subsidiary，還是 seed 新的？

現況 `subsidiaries` 表只有 2 筆：
- `f0981b30-...` 控股 root（虛擬）
- `8236672c-...` 彥明國際貿易（tax_id=60373106；short_name "DealerOS Ducati"）

Indian 的 2 個 organizations（台北直營店 + 台灣北區）**全部指向 `8236672c-...`**。

選項：
- **(a) 借用 Ducati subsidiary 跑通 demo**（最快；ctx 直接吃現有 subsidiary_id）— Multi-subsidiary demo 留到以後做
- **(b) 新 seed Indian subsidiary**（需要 Ming 提供統編 / legal_name）+ backfill Indian organizations

→ **建議 (a)** 先跑通；ERP 接 5–6 個 type 後再回頭做 (b) 補多公司 demo。

### Q2. SUBSIDIARY resolver 選 Option C？

如上 §1。

### Q3. 同頁附帶 cleanup：HANDOFF 過時項要不要動？

HANDOFF 的「3E master rebinding」實際上不用做（Indian items/suppliers 已綁對）。但 **Ducati 那邊**呢？要不要順手 audit Ducati items/suppliers 的 GL binding？

→ **建議先不動 Ducati**（dev 全在 Indian、Ducati 是業務範例）。等 Ducati 做 demo 那天再 audit。

---

## 4. 動工計劃（Ming 拍板後）

### Phase A — Engine + template（30 min）
1. `instantiate-engine.ts`：`resolveDimensions` 加 SUBSIDIARY chain fallback（fetch warehouses + organizations，補 ctx.subsidiary_id）
2. SQL: UPDATE `transaction_types.gl_template` 兩筆（PARTS_PURCHASE / PARTS_RETAIL_SALE），每行 `dim_sources` 加 `"SUBSIDIARY": "ctx.subsidiary_id"`

### Phase B — PARTS_PURCHASE 升 autoPost（15 min）
3. `receipts.ts:293`：`autoPost: false → true`
4. 跑 `scripts/pw-test-grn-autopost.mjs` 驗端到端：JE-PART-* 應該直接 posted（不停在 draft）

### Phase C — PARTS_RETAIL_SALE engine 接入（30 min）
5. `issues.ts:createInternalSale` 結尾加 `after()` hook
6. 寫 `scripts/pw-test-retail-autopost.mjs`（仿 grn 版）— 建內售單跑通、產 JE
7. 驗證：跑 `scripts/pw-smoke-accounting.mjs` 7/8 維持 pass

### Phase D — 收尾（15 min）
8. `npx tsc --noEmit` → 0 errors
9. 清測試資料（內售單 + JE + GR）
10. commit + 寫新 HANDOFF（如需要）

**總時間預估**：1.5 小時（vs HANDOFF 寫的「半天」）

---

## 5. 不做什麼（明確）

- ❌ 不擴 engine DSL（不做 Option B）
- ❌ 不動 master rebinding（已綁對）
- ❌ 不動 Ducati seed（保留業務範例）
- ❌ 不 seed Indian subsidiary（先借 Ducati subsidiary）
- ❌ 不接其他 transaction_type（VENDOR_PAYMENT_BANK / PAYMENT_RECEIPT_BANK 留下一輪）

---

## 6. 驗證 checklist

- [ ] `npx tsc --noEmit` 0 errors
- [ ] `pw-test-grn-autopost.mjs` 跑通、JE 直接 posted
- [ ] `pw-test-retail-autopost.mjs` 跑通、JE 5 行借貸平衡
- [ ] `pw-smoke-accounting.mjs` 7/8 pass + 1 skip
- [ ] DB 清乾淨（測試資料不殘留）
