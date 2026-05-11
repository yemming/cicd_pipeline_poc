---
feature: 倉庫 / 庫區 / 庫位 / 擺放設定
slug: warehouse-bins
date: 2026-05-10
stage: Phase 1 已落地（readonly）／ Phase 2 拍板完成 2026-05-11（CRUD）
source: docs/DUCATI_庫存管理模組_串接版_20260510_最新版/02_基礎設定_倉庫庫區庫位設定.html
target_route: /parts/setup/warehouse-bins
---

# 提案：倉庫 / 庫區 / 庫位 / 擺放設定（基礎設定 / 倉庫管理 2.2）

## 1. 結構摘要

兩欄頁：
- **左 sidebar 200px**：倉庫選擇 list、display 倉庫名 + zone/bin count、active 倉庫高亮
- **右 panel**：當前倉庫的庫區（多個 collapsible card），展開後 grid 8-col 顯示庫位、cell 顯示 code + 狀態 chip（已用 teal / 空 grey / 保留 amber）

## 2. Schema（重用既有真表）

| 表 | 欄位 |
|---|---|
| `warehouses` | id, brand_id, code, name, type, is_active, metadata |
| `warehouse_zones` | id, warehouse_id, code, name, control_level, is_active, metadata |
| `warehouse_bins` | id, warehouse_id, zone_id, code, name, capacity, is_active, metadata |
| `warehouse_slots` | (Phase 1 不展示) |

`warehouse_bins.metadata.status`（jsonb）= `"used" | "empty" | "reserved"`，cell 顏色由此決定。沒值預設 `"empty"`。

## 3. Domain Helper

擴 `src/domain/warehouse.ts`：

```ts
export type ZoneRow = Tables['warehouse_zones']['Row'];
export type BinRow = Tables['warehouse_bins']['Row'];
export type ZoneWithBins = ZoneRow & { bins: BinRow[] };

export async function getWarehouseBinsPageData(warehouseId?: string): Promise<{
  warehouses: WarehouseSummary[];      // 左 list（reuse 既有 listWarehousesWithCounts）
  activeWarehouse: WarehouseSummary | null;
  zones: ZoneWithBins[];               // 右 panel 用
}>;
```

UI URL `?w=<warehouse_id>` 控制 active；沒帶就用列表第 1 個。

## 4. 副作用

無（Phase 1 純 readonly 顯示，「+ 庫區」/「+ 庫位」按鈕標 disabled，等 Phase 2 接 modal CRUD）。

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 |
|---|---|---|
| 倉庫 / 庫區 / 庫位 / 擺放設定 | /parts/setup/warehouse-bins | Setting Page（左右分欄） |

## 6. 預設決策

- Phase 1 readonly 展示（CRUD 之後 phase 接）
- 倉庫切換靠 URL query string、server component 重 fetch
- 庫位狀態讀 metadata.status、預設 empty
- 「擺放位 Slot」第 4 層暫不顯示（HTML 也沒展示）
- 至少 seed Indian 主零件倉的 1-2 zone + 4-8 bin 讓 UI 有東西看

## 7. Verification

1. 頁面渲染：左 list 出現 Indian active brand 的倉庫、右 panel 顯示 zones + bins grid
2. 切倉庫（點左 list 換 ?w=<id>）→ 右 panel 重 fetch 對應 zones
3. metadata.status 變 reserved → cell 顏色變 amber
4. tsc / eslint 0 errors / 紀律 grep 0 violations

---

# Phase 2 — CRUD（2026-05-11 拍板）

## P2.1 拍板紀錄

| 議題 | 選項 | 拍板 | 理由 |
|---|---|---|---|
| Q1 CRUD 範圍 | A 完整版 / B 純設定 / C 最小版 | **A 完整版** | bin.metadata.status 100/128 是 null，要人工標 used / reserved；沒 FK 約束、不會影響下游 |
| Q2 批次建 bin | A 個別+批次 / B 只個別 / C 只批次 | **A 個別+批次兩顆按鈕** | 日常微調個別、新庫區初始化批次，都會用 |
| Q3 刪庫區規則 | A 軟刪除 cascade / B 禁止有 bin / C warn-cascade 硬刪 | **A 軟刪除 cascade** | bin code 可能還被歷史單據引用；軟刪可救、又不必處理硬刪邏輯 |
| 權限 | 沿用 / 切細 | **沿用 `PARTS_WAREHOUSE_ARCH_EDIT`** | POC 階段一顆權限夠用 |

## P2.2 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `createZone` | INSERT warehouse_zones | 確定 |
| `updateZone` | UPDATE warehouse_zones（code/name/control_level/notes/is_active） | 確定 |
| `deleteZone` | RPC：UPDATE zone.is_active=false + UPDATE 該 zone 所有 bin.is_active=false（atomic） | 確定 |
| `createBin` | INSERT warehouse_bins（含 metadata.status） | 確定 |
| `createBinsBatch` | 多筆 INSERT warehouse_bins（prefix-NN ~ prefix-NN，padding=2） | 確定 |
| `updateBin` | UPDATE warehouse_bins（code/name/capacity 或 metadata.status） | 確定 |
| `deleteBin` | UPDATE bin.is_active=false（軟刪） | 確定 |

## P2.3 DB

新 RPC（一支，因為 zone 軟刪要 cascade、需要 atomic）：

```sql
CREATE OR REPLACE FUNCTION public.warehouse_soft_delete_zone(p_zone_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand text;
BEGIN
  SELECT brand_id INTO v_brand FROM warehouse_zones WHERE id = p_zone_id;
  IF v_brand IS NULL THEN
    RAISE EXCEPTION '庫區不存在: %', p_zone_id;
  END IF;
  IF NOT user_has_brand(v_brand) THEN
    RAISE EXCEPTION '無此 brand 權限';
  END IF;

  UPDATE warehouse_bins
     SET is_active = false, updated_at = now()
   WHERE zone_id = p_zone_id AND is_active = true;

  UPDATE warehouse_zones
     SET is_active = false, updated_at = now()
   WHERE id = p_zone_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_soft_delete_zone(uuid) TO authenticated;
```

其他 mutation 直接走 supabase from('...').insert/update（在 domain helper 內），不需要 RPC。

## P2.4 Domain Helper 擴增

`src/domain/warehouse.ts` 加 7 個 server action：

```ts
export async function createZone(input: {
  warehouseId: string;
  code: string;
  name: string;
  controlLevel?: 'normal' | 'high_value' | 'hazardous';
  notes?: string;
}): Promise<ActionResult<{ id: string }>>;

export async function updateZone(
  id: string,
  patch: Partial<{ code: string; name: string; controlLevel: string; notes: string; is_active: boolean }>,
): Promise<ActionResult<{ id: string }>>;

export async function deleteZone(id: string): Promise<ActionResult<{ id: string }>>;  // RPC cascade

export async function createBin(input: {
  warehouseId: string;
  zoneId: string;
  code: string;
  name?: string;
  capacity?: number;
  status?: 'used' | 'empty' | 'reserved';
}): Promise<ActionResult<{ id: string }>>;

export async function createBinsBatch(input: {
  warehouseId: string;
  zoneId: string;
  prefix: string;           // 例 "A-"
  fromN: number;            // 例 1
  toN: number;              // 例 8
  padding?: number;         // 預設 2 → 01..08
  capacity?: number;
  status?: 'used' | 'empty' | 'reserved';
}): Promise<ActionResult<{ created: number }>>;

export async function updateBin(
  id: string,
  patch: Partial<{ code: string; name: string; capacity: number; status: 'used' | 'empty' | 'reserved' }>,
): Promise<ActionResult<{ id: string }>>;

export async function deleteBin(id: string): Promise<ActionResult<{ id: string }>>;  // 軟刪除
```

`ActionResult<T>` 沿用 master-data SOP 慣例（`{ ok: true, data } | { ok: false, error }`）。

## P2.5 UI 改造

`warehouse-bins-board.tsx` 從 server component 變成 **client component**（`"use client"`），改用 useTransition + modal pattern。

新增的互動：
- **＋ 庫區**（右上）→ 開 modal：code / name / control_level / notes
- **＋ 庫位**（右上）→ 開 modal：先選 zone + 單筆 code/name/capacity/status
- **＋ 批次**（右上多一顆）→ 開 modal：選 zone + prefix + fromN + toN + padding + 預設 status
- **每個 zone header** 右邊加 `⋯` menu：`改名 / 改管控等級 / 刪除`（軟刪 cascade、確認 modal）
- **每個 bin cell** 點擊 → 開 modal：code/name/capacity/status + 刪除按鈕（軟刪）

頁底原本的「💡 CRUD 操作 Phase 2 開放」hint 拿掉。

## P2.6 Verification

1. ＋庫區 → 寫入 warehouse_zones、列表立刻看到新區
2. ＋庫位（個別）→ 寫入 warehouse_bins、grid 立刻看到
3. ＋批次（A- / 1 / 8）→ 一次 8 個 A-01 ~ A-08
4. 點 cell → modal 切 status=reserved → cell 變 amber
5. 改 bin code → grid 文字立刻更新
6. 刪 bin → 從 grid 消失（is_active=false、不從畫面看不到）
7. 刪 zone → 整個 zone card 消失、底下 bin 全部 is_active=false（DB 驗證）
8. 重複 code 應該被 unique 約束擋下、banner 顯示錯誤
9. tsc --noEmit / eslint 0 errors
10. UI 紀律：grep `from '@/lib/supabase` 應該 0
