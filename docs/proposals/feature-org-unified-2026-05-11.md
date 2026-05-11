---
feature: 組織三層架構 — 三欄統一頁
slug: org-unified
date: 2026-05-11
stage: 落地中
source: 用戶要求把 /parts/setup/{org, regions, stores, warehouses} 4 頁合一、套 warehouse-bins UI/UX
target_route: /parts/setup/org
---

# 提案：組織三層架構統一頁（三欄式）

## 1. 結構摘要

把現有 4 頁（org 唯讀總覽 + regions list/detail + stores list/detail + warehouses list/detail）**整併成一個三欄式頁面**，類似 macOS Finder 的 column view。

```
┌──────────────────────────────────────────────────────┐
│  H1 組織三層架構  [1.1]  銷售區域 → 門店 → 倉庫        │
├──────┬───────────────┬──────────────────────────────┤
│ 銷售  │ 門店           │ 倉庫                          │
│ 區域  │ (region 篩)    │ (store 篩)                    │
│ ＋區  │ ＋門店         │ ＋倉庫                         │
├──────┼───────────────┼──────────────────────────────┤
│ ▶R-A │ ▢ S-001 高雄  │ ▢ W-001 主零件倉              │
│  R-B │ ▢ S-002 台南  │ ▢ W-002 中央倉                │
│  R-C │               │                                │
└──────┴───────────────┴──────────────────────────────┘
```

選 region → 中欄顯示其 stores、選 store → 右欄顯示其 warehouses；URL `?r=...&s=...` 持久化。

## 2. 拍板紀錄

| Q | 選項 | 拍板 |
|---|---|---|
| Q1 Layout | A 1:1 / B 樹狀 / C 三欄式 | **C 三欄式**（macOS Finder） |
| Q2 既有 3 頁 | A 保留 detail / B 全砍 / C 並存 | **B 全砍**（含 nav） |
| Q3 Cascade | A 兩層 cascade / B 禁刪 / C warn-cascade | **A 兩層軟刪 cascade** |

## 3. Schema

**零變更**。重用：
- `organizations` (type='region' level=1 / type='store' level=2 parent_id=region.id)
- `warehouses` (org_id=store.id)

## 4. Domain Helper

`src/domain/org.ts` 已有 18 個 CRUD helper 全部 reuse。新加 2 支 cascade-soft-delete RPC wrapper：

```ts
// 取代既有 deleteRegion / deleteStore — 改 call RPC（cascade）
export async function deleteRegion(id): Promise<Result>;  // RPC org_soft_delete_region
export async function deleteStore(id):  Promise<Result>;  // RPC org_soft_delete_store
// deleteWarehouse 維持原狀（只軟刪自己、沒下層）
```

## 5. DB（RPC）

```sql
CREATE OR REPLACE FUNCTION public.org_soft_delete_region(p_region_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_brand text;
BEGIN
  SELECT brand_id INTO v_brand FROM organizations WHERE id=p_region_id AND type='region';
  IF v_brand IS NULL THEN RAISE EXCEPTION '區域不存在: %', p_region_id; END IF;
  IF NOT user_has_brand(v_brand) THEN RAISE EXCEPTION '無此 brand 權限'; END IF;
  -- 1. 底下 stores 的 warehouses
  UPDATE warehouses SET is_active=false, updated_at=now()
   WHERE org_id IN (SELECT id FROM organizations WHERE parent_id=p_region_id AND type='store' AND is_active);
  -- 2. 底下 stores
  UPDATE organizations SET is_active=false, updated_at=now()
   WHERE parent_id=p_region_id AND type='store' AND is_active;
  -- 3. region 自己
  UPDATE organizations SET is_active=false, updated_at=now() WHERE id=p_region_id;
END $$;

CREATE OR REPLACE FUNCTION public.org_soft_delete_store(p_store_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_brand text;
BEGIN
  SELECT brand_id INTO v_brand FROM organizations WHERE id=p_store_id AND type='store';
  IF v_brand IS NULL THEN RAISE EXCEPTION '門店不存在: %', p_store_id; END IF;
  IF NOT user_has_brand(v_brand) THEN RAISE EXCEPTION '無此 brand 權限'; END IF;
  UPDATE warehouses SET is_active=false, updated_at=now() WHERE org_id=p_store_id AND is_active;
  UPDATE organizations SET is_active=false, updated_at=now() WHERE id=p_store_id;
END $$;
```

## 6. UI

- `/parts/setup/org/page.tsx` — server component、撈 regions/stores/warehouses（依 `?r` / `?s` 篩）
- `/parts/setup/org/_components/org-board.tsx` — client component（useTransition + modals）

5 個 modal：
- `region-form` (create/edit): code / name / notes / is_active
- `store-form` (create/edit): code / name / region / subsidiary（必填）/ store_type / short_name / address / phone / responsible_person / bank_account
- `warehouse-form` (create/edit): code / name / type / address / notes
- `region-delete-confirm`: 顯示「底下 X 門店 + Y 倉庫將一併停用」
- `store-delete-confirm`: 顯示「底下 N 倉庫將一併停用」

## 7. 孤兒清單（階段 5.2 執行）

```bash
# directories to rm -rf:
src/app/(workspace)/parts/setup/regions/
src/app/(workspace)/parts/setup/stores/
src/app/(workspace)/parts/setup/warehouses/

# nav_nodes: DELETE 雙 brand 那 3 個 href
DELETE FROM nav_nodes WHERE href IN
  ('/parts/setup/regions','/parts/setup/stores','/parts/setup/warehouses');
# 保留：href='/parts/setup/org'（重新標 caption 為「組織三層架構（區域 / 門店 / 倉庫）」）
```

## 8. Verification

1. 預設進去：左欄 regions 全列、中右兩欄空（直到選 region）
2. URL `?r=<id>` → 中欄顯示對應 stores
3. URL `?r=<id>&s=<id>` → 右欄顯示對應 warehouses
4. 三欄各自 ＋ create modal、cell hover 顯示 [改/刪] mini
5. 刪 region (有 2 store, 5 warehouse) → 確認 modal 警告 → cascade → DB 三層都 is_active=false、updated_at 同毫秒
6. 砍 regions/stores/warehouses 3 個 dir 後 tsc / eslint 0 errors
7. nav 左側看不到舊的 3 個入口、組織三層架構入口仍在
