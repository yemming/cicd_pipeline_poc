---
feature: 盤點回傳規則
slug: count-rules
date: 2026-05-10
stage: 落地中（用戶授權跳階段 3 用預設選項）
source: docs/DUCATI_庫存管理模組_串接版_20260510_最新版/01_基礎設定_盤點回傳規則.html
target_route: /parts/setup/count-rules
---

# 提案：盤點回傳規則（基礎設定 / 組織與權限 1.4）

## 1. 結構摘要

設定頁、兩張並排 card：
- **左卡（差異容許區間）**：3 個 input 設 A/B/C 類商品差異容許率（0% / 2% / 5% 預設）+ amber banner + 儲存按鈕
- **右卡（審核流程）**：3 段固定文案 readonly（容許內自動回傳 / 超過容許率走主管審核 / A 類強制區域主管審核）

## 2. Schema（重用 `business_rules`，依正規化心智模型 = 量化規則）

| rule_kind | scope_role_code | config | 數量 |
|---|---|---|---|
| `count_tolerance` | NULL | `{abc_tolerance_pcts: { A: 0, B: 2, C: 5 }}` | 雙 brand × 1 = 2 筆 |
| `count_workflow` | NULL | `{category, label, description, tone, badge}` | 雙 brand × 3 = 6 筆 |

**不切**「A/B/C 各一 row」設計 — 整個 tolerance 是同一張 form 一起儲存、用單筆 jsonb config 比較直觀。

## 3. Domain Helper

擴 `src/domain/rules.ts`：

```ts
export type CountToleranceConfig = {
  abc_tolerance_pcts: { A: number; B: number; C: number };
};
export type CountWorkflowConfig = {
  category: 'within' | 'overflow' | 'a_class_force';
  label: string;
  description: string;
  tone: 'neutral' | 'amber' | 'red';
  badge: { label: string; kind: 'teal' | 'pend' | 'red' };
};

export async function getCountRulesPageData(): Promise<{
  toleranceRule: BusinessRuleRow | null;
  workflowRules: BusinessRuleRow[];
  canEdit: boolean;
}>;

export async function saveCountToleranceRule(
  config: CountToleranceConfig
): Promise<Result<{ id: string }>>;
```

## 4. 副作用

無 — 純設定頁。未來盤點模組做差異審核時讀 `count_tolerance` rule，此頁只設規則。

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 |
|---|---|---|
| 盤點回傳規則 | `/parts/setup/count-rules` | Setting Page（2 卡並排，左可編輯、右 readonly）|

UI 完全照 HTML、套 design tokens。

## 6. nav_nodes

Indian 已掛 react_route，Ducati 補一筆。

## 7. 預設決策

- 左卡 3 % 用一筆 row + jsonb（不拆 ABC 各一 row）
- 右卡 readonly seed（跟 purchase_workflow / item_permission 同模式）
- 不接通知 / audit / RBAC（這次純量化規則、不涉及 boolean 授權，不需要 RBAC 雙寫）

## 8. Verification

1. DB 雙 brand 各 1 筆 count_tolerance + 3 筆 count_workflow（共 8 筆）
2. 改 A 類容許率 0% → 1% → 儲存 → DB config.abc_tolerance_pcts.A 變更
3. tsc / eslint 0 errors / 紀律 grep 0 violations
4. 清孤兒：舊 count-rule-actions.ts + count_tolerance_config / count_review_rules 兩表
