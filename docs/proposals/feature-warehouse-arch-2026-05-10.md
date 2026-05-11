---
feature: 倉儲四層架構
slug: warehouse-arch
date: 2026-05-10
stage: 落地中（用戶授權跳階段 3 用預設選項）
source: docs/DUCATI_庫存管理模組_串接版_20260510_最新版/02_基礎設定_倉儲四層架構.html
target_route: /parts/setup/warehouse-arch
---

# 提案：倉儲四層架構（基礎設定 / 倉庫管理 2.1）

## 1. 結構摘要

說明頁。上面 4 張色板卡（倉庫/庫區/庫位/擺放位 4 層概念）+ 下面 1 張倉庫總覽表（每倉庫的 zones/bins/slots count + 使用率 bar + 倉庫類型 chip）+ 「進入設定 →」按鈕導下一頁。

## 2. Schema

| 規格 | 走向 |
|---|---|
| 4 層概念說明（icon / title / description / badge） | `business_rules` `rule_kind='warehouse_layer'` 雙 brand × 4 = 8 筆 |
| 倉庫總覽表 | 動態 query 真表：`warehouses` JOIN count of `warehouse_zones` / `warehouse_bins` / `warehouse_slots` |
| 使用率 % | 暫無真實庫存統計、預設用 metadata.utilization_pct 或 mock；標 TODO 等 stock_items 接通後算 |

config jsonb 範例（第 1 層）：
```json
{
  "layer_index": 1,
  "icon": "🏗",
  "layer_title": "第一層",
  "layer_name": "倉庫 Warehouse",
  "description": "整個儲存設施的最大單位...",
  "badge": { "label": "台北直營店共 3 座倉庫", "kind": "navy" },
  "accent": "navy"
}
```

## 3. Domain Helper

擴 `src/domain/rules.ts`（layer rules）+ 新建 `src/domain/warehouse.ts`（倉庫總覽動態查）。

```ts
// rules.ts
export type WarehouseLayerConfig = {
  layer_index: number;
  icon: string;
  layer_title: string;
  layer_name: string;
  description: string;
  badge: { label: string; kind: 'navy' | 'teal' | 'amber' | 'red' | 'gry' };
  accent: 'navy' | 'blue' | 'teal' | 'purple';
};

// warehouse.ts (新)
export type WarehouseSummary = {
  id: string;
  code: string;
  name: string;
  type: string | null;
  zone_count: number;
  bin_count: number;
  slot_count: number;
  utilization_pct: number | null;  // 來自 metadata.utilization_pct (mock 階段)
};

export async function listWarehousesWithCounts(): Promise<WarehouseSummary[]>;
```

`getWarehouseArchPageData` 同時撈兩段、給 page.tsx 用。

## 4. 副作用

無 — 純說明 + 動態 dashboard 查詢。

## 5. nav_nodes

Indian 已掛 react_route、Ducati 補。

## 6. 預設決策

- 4 層卡 readonly seed
- 倉庫總覽動態查實際表（不 mock）
- 使用率 % 暫從 `warehouses.metadata.utilization_pct` 讀；沒值就顯示 "—"

## 7. Verification

1. DB 雙 brand 各 4 筆 warehouse_layer
2. 頁面 4 張卡 + 倉庫表（雙 brand 都有資料）
3. tsc / eslint 0 errors
4. 清孤兒：parts_warehouse_layer_meta 表 + warehouse-arch-actions.ts
