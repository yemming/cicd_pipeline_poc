---
feature: 商品管理權限
slug: item-permissions
date: 2026-05-10
stage: 落地中（用戶授權用預設選項，跳階段 3）
source: docs/DUCATI_庫存管理模組_串接版_20260510_最新版/01_基礎設定_商品管理權限.html
target_route: /parts/setup/item-permissions
---

# 提案：商品管理權限（基礎設定 / 組織與權限 1.3）

## 1. 結構摘要

權限矩陣設定頁：9 個 capability × 4 個 role = 36 個 checkbox。3 個 section（商品基礎資料 / 定價管理 / 序列號批號）+ 一顆「儲存設定」按鈕一次寫回。

## 2. Schema

**完全重用 `business_rules`**（採購權限規則同表）。`rule_kind = 'item_permission'`。

每個 role 一筆 row：

| 欄位 | 值 |
|---|---|
| `brand_id` | 'ducati' / 'indian' |
| `rule_kind` | 'item_permission' |
| `scope_role_code` | warehouse / manager / purchaser / owner |
| `config` (jsonb) | `{ view_items, create_item, update_item, archive_item, view_price, update_store_price, set_special_discount, config_serial_tracking, config_batch_tracking }` 全 boolean |

不新建表、不 ALTER。

### Capability 清單（hardcoded in code）

| key | 中文 | section |
|---|---|---|
| `view_items` | 查看商品清單 | 商品基礎資料 |
| `create_item` | 新增商品 | 商品基礎資料 |
| `update_item` | 修改商品資訊 | 商品基礎資料 |
| `archive_item` | 停用/刪除商品 | 商品基礎資料 |
| `view_price` | 查看售價 | 定價管理 |
| `update_store_price` | 修改門市定價 | 定價管理 |
| `set_special_discount` | 設定特殊折扣 | 定價管理 |
| `config_serial_tracking` | 序列號追蹤設定 | 序列號/批號 |
| `config_batch_tracking` | 批號管理設定 | 序列號/批號 |

### Seed（按 HTML 預設值，雙 brand × 4 role = 8 筆）

| capability | warehouse | manager | purchaser | owner |
|---|---|---|---|---|
| view_items | T | T | T | T |
| create_item | F | T | T | T |
| update_item | F | T | T | T |
| archive_item | F | F | T | T |
| view_price | T | T | T | T |
| update_store_price | F | T | T | T |
| set_special_discount | F | F | T | T |
| config_serial_tracking | F | F | T | T |
| config_batch_tracking | F | F | T | T |

> HTML 上是「倉管/門店主管/區域主管/系統管理員」，對映 roles 表 `warehouse / manager / purchaser / owner`（沿用採購權限規則的對映慣例）。

## 3. Domain Helper

擴充 `src/domain/rules.ts`：

```ts
export type ItemPermissionConfig = Record<string, boolean>;

export const ITEM_PERMISSION_CAPABILITIES: Array<{
  key: string;
  label: string;
  section: '商品基礎資料' | '定價管理' | '序列號/批號';
}> = [...]; // 9 項

export async function listItemPermissionRules(): Promise<BusinessRuleRow[]>;
export async function saveItemPermissionRules(
  inputs: Array<{ id?: string; scope_role_code: string; config: ItemPermissionConfig }>
): Promise<Result<{ saved: number }>>;

export async function getItemPermissionsPageData(): Promise<{
  rules: BusinessRuleRow[];
  roles: RoleRow[];
  canEdit: boolean;
}>;
```

## 4. 副作用

無（純設定頁、純 CRUD `business_rules`、updated_by 寫入即止）。

跨模組消費（PARTS 商品 CRUD 接權限驗證）→ Phase 2 後再做。

## 5. 頁面骨架

- `src/app/(workspace)/parts/setup/item-permissions/page.tsx`（重寫，砍舊 `item_permission_roles` 改走 `business_rules`）
- `_components/item-permissions-board.tsx`（重寫，矩陣式 UI：左欄 capability、上欄 role、cell = checkbox）

UI 結構：

```
<main className="px-6 py-5 space-y-3">
  <header>商品管理權限 1.3 ...</header>
  <Card title="角色權限矩陣" headerAction={<button>儲存設定</button>}>
    <table>
      thead: 功能 / [4 個 role 表頭]
      tbody:
        - section row: 商品基礎資料 (colSpan=5, bg-grey)
        - 4 capability rows
        - section row: 定價管理
        - 3 capability rows
        - section row: 序列號/批號
        - 2 capability rows
    </table>
  </Card>
</main>
```

## 6. nav_nodes（Indian 已掛、Ducati 補）

```sql
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES ('ducati', '<ducati 組織與權限 parent>', 3, 5, '商品管理權限', '🦁', '/parts/setup/item-permissions', 'react_route', true, false);
```

## 7. 默認決策（用戶指定全用預設）

- ✅ Role 來源：roles 表（4 個 = warehouse/manager/purchaser/owner）
- ✅ Scope：全 brand global（scope_store_id NULL）
- ✅ Capability key：hardcoded 9 項
- ✅ 不寫 audit log
- ✅ 不接通知 / 跨模組驗證（Phase 2）

## 8. Verification

1. DB 雙 brand 各 4 筆 `item_permission` rule
2. 頁面渲染 9×4 矩陣、checkbox 預設值對齊 HTML
3. 改 cell → 儲存 → DB config 變更
4. tsc / eslint 0 errors
5. 紀律 grep `from '@/lib/supabase'` in UI = 0
