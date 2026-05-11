---
feature: 管控類型定義
slug: control-types
date: 2026-05-10
stage: 落地中（用戶授權跳階段 3 用預設選項）
source: docs/DUCATI_庫存管理模組_串接版_20260510_最新版/01_基礎設定_管控類型定義.html
target_route: /parts/setup/control-types
---

# 提案：管控類型定義（基礎設定 / 組織與權限 1.5）

## 1. 結構摘要

設定頁、3 張並排卡片（A/B/C 類）+ 底下一張「商品類型分佈」readonly bar。每張類別卡顯示 6 個業務參數：金額基準 / 盤點頻率 / 序列號追蹤 / 出庫審核 / 告警容許率 / 範例料號。Phase 1 readonly 顯示（HTML 上看 user 不可編輯三類本身的設定，這頁是規格參考頁）。

## 2. Schema（重用 `business_rules`）

| rule_kind | scope | config | 數量 |
|---|---|---|---|
| `control_type` | NULL | `{ class_label, tier_label, accent, amount_basis, count_frequency, serial_tracking, issue_approval, tolerance_pct, examples }` | 雙 brand × 3 (A/B/C) = 6 筆 |

config jsonb 範例（A 類）：
```json
{
  "class_label": "A 類",
  "tier_label": "高價值・嚴格管控",
  "accent": "red",
  "amount_basis": "單價 > NT$ 5,000",
  "count_frequency": "每月全盤",
  "serial_tracking": { "label": "必須", "kind": "red" },
  "issue_approval": { "label": "必須主管審核", "kind": "red" },
  "tolerance_pct": 0,
  "examples": "引擎組件、電子控制單元"
}
```

底下「商品類型分佈」cart 暫用 mock（HTML 數字：A 18%/243、B 42%/568、C 40%/541）寫死在 board.tsx，標 TODO 等 items 表有 control_type 欄位後再接動態 group by。

## 3. Domain Helper

擴 `src/domain/rules.ts`：

```ts
export type ControlTypeConfig = {
  class_label: string;
  tier_label: string;
  accent: 'red' | 'amber' | 'teal';
  amount_basis: string;
  count_frequency: string;
  serial_tracking: { label: string; kind: 'red' | 'pend' | 'gry' | 'done' };
  issue_approval: { label: string; kind: 'red' | 'pend' | 'gry' | 'done' };
  tolerance_pct: number;
  examples: string;
};

export async function getControlTypesPageData(): Promise<{
  controlTypes: BusinessRuleRow[];
}>;
```

Phase 1 純 readonly、不開 save。Phase 2 真要開編輯時加 `saveControlType`。

## 4. 副作用

無 — 純 readonly 顯示頁。

## 5. nav_nodes

Indian 已掛 react_route、Ducati 補一筆。

## 6. 預設決策

- A/B/C readonly seed（不可改、跟 HTML 一致）
- 分佈 bar 用 hardcoded mock（之後串 items 表）
- Phase 1 不開編輯介面

## 7. Verification

1. DB 雙 brand 各 3 筆 control_type
2. 頁面渲染 3 張卡 + 1 個分佈 bar
3. tsc / eslint 0 errors / 紀律 grep 0 violations
4. 清孤兒：舊 control-type-actions.ts + parts_control_types 表
