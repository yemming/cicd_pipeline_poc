# 提案：組織三層架構 — 拆成 regions / stores / warehouses 三頁

> **來源**：`/Users/ming/Downloads/DUCATI_庫存管理模組_串接版0509 2/01_基礎設定_組織三層架構.html` + 既有 `/parts/setup/org`
> **日期**：2026-05-10
> **階段**：架構提案（待用戶拍板）
> **Skill**：spec-to-feature

## 1. 結構摘要

把現役的 `/parts/setup/org` 一頁三 section（銷售區域 / 門店 / 倉庫）拆成三組獨立的 List View + Page View，套上 design pattern。
- 三個 entity 都是獨立 CRUD、各自有完整詳情頁
- 維持 `/parts/setup/org` 為總覽頁（read-only summary，不再放新增按鈕）
- UI 走 `src/domain/org.ts` 的 helper、不直連 supabase
- DB 表都已存在（`organizations` / `warehouses`），只缺 `metadata jsonb` 欄位

## 2. Schema 變更

### 表已存在（不新建）

- `organizations`（type='region'/'store', level 1/2）— Region & Store 共用
- `warehouses`（FK org_id → organizations）— Warehouse
- `subsidiaries` — 法人，已存在

### 必補欄位（ALTER TABLE）

```sql
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE warehouses    ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE subsidiaries  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
-- brands 是 brand 註冊表本身，不加 metadata（會混淆語意）
```

### RLS（檢查既有 policy 是否完整 + brand-aware）

階段 4 落地時用 supabase advisor 檢查 `organizations` / `warehouses` / `subsidiaries` 是否已有 4 條 brand-aware RLS。如缺補上（沿用 `user_has_brand()` pattern）。

### 欄位分類（typed vs jsonb）

**organizations 既有欄位皆 typed**（不改動）。新欄位策略：

| 欄位 | 落腳 | 理由 |
|---|---|---|
| `id` / `code` / `name` / `type` / `level` | typed | 已存在、必要 |
| `parent_id` / `subsidiary_id` / `group_id` | typed FK | 法人 / 區域歸屬必要 |
| `is_active` / `created_at` / `updated_at` | typed | 報表 / 排序 |
| `notes` | typed text | 區域用作「涵蓋說明」、單欄純文字 |
| `short_name` / `address` / `phone` / `responsible_person` / `bank_account` / `store_type` | typed | 已存在 |
| 區域涵蓋的縣市清單（chip 顯示用） | metadata.coverage_cities (array) | 形狀可變、未來可能擴增區界 |
| 門店營運合作日 | metadata.partnership_date | 還沒決定要不要當報表欄 |
| 客訴照片 / 附件 | metadata.attachments (array) | 形狀未定 |
| 任何頁面臨時加的欄位 | metadata.* | 預設丟這 |

**warehouses 既有欄位皆 typed**（不改動）。新欄位策略相同。

**subsidiaries 既有欄位皆 typed**（不改動）。

## 3. Domain Helper 規劃

檔案：`src/domain/org.ts`（第一批）

```ts
import { createClient } from '@/lib/supabase/client'

// ========== Region（type='region', level=1） ==========
export type RegionRow = { id: string; code: string; name: string; notes: string | null; is_active: boolean; metadata: Record<string, unknown>; created_at: string; updated_at: string }
export type AddRegionInput = { code: string; name: string; notes?: string; subsidiary_id?: string; [key: string]: unknown }

export async function listRegions(filter?: { brand_id?: string; q?: string; is_active?: boolean }): Promise<{ data: RegionRow[]; error: Error | null }>
export async function getRegionById(id: string): Promise<{ data: RegionRow | null; error: Error | null }>
export async function addRegion(input: AddRegionInput): Promise<{ data: { id: string } | null; error: Error | null }>
export async function updateRegion(id: string, patch: Partial<AddRegionInput>)
export async function setRegionActive(id: string, ok: boolean)
export async function deleteRegion(id: string)

// ========== Store（type='store', level=2） ==========
export type StoreRow = { id: string; code: string; name: string; parent_id: string; subsidiary_id: string; store_type: string; address: string | null; phone: string | null; is_active: boolean; metadata: Record<string, unknown>; ... }
export type AddStoreInput = { code: string; name: string; region_id: string; subsidiary_id?: string; store_type: 'direct'|'dealer'; address?: string; phone?: string; [key: string]: unknown }

export async function listStores(filter?: { brand_id?: string; region_id?: string; q?: string; is_active?: boolean })
export async function getStoreById(id: string)
export async function addStore(input: AddStoreInput)
export async function updateStore(id: string, patch: Partial<AddStoreInput>)
export async function setStoreActive(id: string, ok: boolean)
export async function deleteStore(id: string)

// ========== Warehouse ==========
export type WarehouseRow = { id: string; code: string; name: string; org_id: string; type: string; address: string | null; is_active: boolean; metadata: Record<string, unknown>; ... }
export type AddWarehouseInput = { code: string; name: string; org_id: string; type: 'main'|'temporary'|'consignment'|'warranty'|'transit'|'quarantine'|'virtual'; address?: string; notes?: string; [key: string]: unknown }

export async function listWarehouses(filter?: { brand_id?: string; org_id?: string; q?: string; is_active?: boolean })
export async function getWarehouseById(id: string)
export async function addWarehouse(input: AddWarehouseInput)
export async function updateWarehouse(id: string, patch: Partial<AddWarehouseInput>)
export async function setWarehouseActive(id: string, ok: boolean)
export async function deleteWarehouse(id: string)

// ========== Lookup（給 dropdown 用） ==========
export async function listSubsidiaryOptions()  // for Region/Store form
export async function listRegionOptions()       // for Store form
export async function listStoreOptions()         // for Warehouse form
```

**內部實作策略（Day 1）**：

- 全部走 `supabase.from(...)` 直連
- `subsidiary_id` / `group_id` / `brand_id` 自動填（從 `getActiveScope()` 拿 brand_id；subsidiary_id 預設 `is_root=false AND is_active=true` 的第一筆，或讓 UI 傳）
- 未指定欄位丟 metadata jsonb（用 spread + rest 拆）
- 不寫 zod、type 靠 supabase generate

**升級路徑**：日後如果 addStore 要連帶建 default warehouse + 推 LINE → helper 內部換 RPC 或呼 `org-actions.ts` 的 server action。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| addRegion | 無（純單表寫入） | Day 1 確定 |
| addStore | 無（Day 1） | Day 1 確定 |
| addWarehouse | 無（Day 1） | Day 1 確定 |
| deleteRegion | 檢查是否還有子 store（要先警告） | 確定 |
| deleteStore | 檢查是否還有子 warehouse（要先警告） | 確定 |
| 任何寫入 | revalidatePath（list 頁要立刻看到） | 確定 |
| 將來：addStore 連帶建 default warehouse | [Phase 2 後再做] | - |
| 將來：addStore 推 LINE 通知主管 | [Phase 2 後再做] | - |

⭐ **Phase 1 全部走純資料 CRUD、無副作用**，跑得起來再回頭加。

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| Region List | `/parts/setup/regions` | List View | items-board.tsx |
| Region Detail | `/parts/setup/regions/[id]` | Page View | item-detail-view.tsx |
| Region New | `/parts/setup/regions/new` | Page View (create-mode) | reuse detail view + initialMode='create' |
| Store List | `/parts/setup/stores` | List View | items-board.tsx |
| Store Detail | `/parts/setup/stores/[id]` | Page View | item-detail-view.tsx |
| Store New | `/parts/setup/stores/new` | Page View (create-mode) | reuse detail view + initialMode='create' |
| Warehouse List | `/parts/setup/warehouses` | List View | items-board.tsx |
| Warehouse Detail | `/parts/setup/warehouses/[id]` | Page View | item-detail-view.tsx |
| Warehouse New | `/parts/setup/warehouses/new` | Page View (create-mode) | reuse detail view + initialMode='create' |

**保留**：`/parts/setup/org` 維持為總覽（server component 讀三張表 server-side render；新增按鈕拿掉、改成「前往 → 區域 / 門店 / 倉庫 各自管理頁」連結）。

**設計 token / 互動**：照 CLAUDE.md design pattern 規格（色票、字級、按鈕順序、pending UI、create-mode 同頁切換）。

## 6. nav_nodes 雙 brand？

⚠️ **不對稱**：經查 nav_nodes 現況：

- **Indian brand**：「組織與權限」群組底下有「組織三層架構」（href=`/parts/setup/org`），sort_order=0
- **Ducati brand**：「組織與權限」群組底下完全沒有「組織三層架構」這條（Ducati 用 `/settings/org` 不同 UI）

依 memory「WMS 範圍 — Ducati 不做」（WMS 只在 Indian nav 樹），判斷 `/parts/setup/*` 整個是 Indian 庫存管理模組的一部分，**只在 Indian 加 nav**。

```sql
-- 目標 parent_id (indian 的「組織與權限"): 414f9635-ac1c-4338-9b4b-fe72db629fc5
-- 既有 sort_order：組織三層架構=0, 採購權限規則=1, 商品管理權限=2, 盤點回傳規則=3, 管控類型定義=4

-- 把後面的往後推
UPDATE nav_nodes SET sort_order = sort_order + 3
 WHERE parent_id = '414f9635-ac1c-4338-9b4b-fe72db629fc5'
   AND sort_order >= 1;

-- 在「組織三層架構」(sort_order=0) 之後 INSERT 三筆
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES
  ('indian', '414f9635-ac1c-4338-9b4b-fe72db629fc5', 3, 1, '銷售區域', 'map',           '/parts/setup/regions',    'react_route', true, false),
  ('indian', '414f9635-ac1c-4338-9b4b-fe72db629fc5', 3, 2, '門店',     'storefront',    '/parts/setup/stores',     'react_route', true, false),
  ('indian', '414f9635-ac1c-4338-9b4b-fe72db629fc5', 3, 3, '倉庫',     'warehouse',     '/parts/setup/warehouses', 'react_route', true, false);
```

「組織三層架構」原本那條（`/parts/setup/org`）保留為總覽，可選擇改名為「組織總覽」或維持原名。

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| **改 DB** | `organizations` / `warehouses` / `subsidiaries` 補 `metadata jsonb` |
| **改 DB** | `nav_nodes` indian 補 3 筆 |
| **重新生成** | `src/lib/database.types.ts`（用 supabase generate types） |
| **新增** | `src/domain/org.ts` |
| **新增** | `src/app/(workspace)/parts/setup/regions/{page.tsx, [id]/page.tsx, [id]/_components/region-detail-view.tsx, _components/regions-board.tsx, new/page.tsx}` |
| **新增** | `src/app/(workspace)/parts/setup/stores/{page.tsx, [id]/page.tsx, [id]/_components/store-detail-view.tsx, _components/stores-board.tsx, new/page.tsx}` |
| **新增** | `src/app/(workspace)/parts/setup/warehouses/{page.tsx, [id]/page.tsx, [id]/_components/warehouse-detail-view.tsx, _components/warehouses-board.tsx, new/page.tsx}` |
| **改** | `src/app/(workspace)/parts/setup/org/page.tsx` 拿掉新增按鈕、改成連結到三頁 |
| 範本參考 | `src/app/(workspace)/parts/setup/items/_components/items-board.tsx` |
| 範本參考 | `src/app/(workspace)/parts/setup/items/[id]/_components/item-detail-view.tsx` |
| 既有（不刪） | `src/lib/master-data/org-actions.ts`（未來副作用階段 reuse） |

## 8. Verification

1. `/parts/setup/regions` 新增區域 → DB `organizations where type='region'` 看得到
2. 新增的門店在 `/admin/accounting/dimensions` STORE 維度按「反查」看得到 → **SSOT 沒分裂**
3. 新增的門店在會計分錄 `BANK / STORE / SUBSIDIARY` 必填維度 dropdown 出得來 → **跨模組共讀**
4. 在 add form 隨手加一個 `partnership_date: '2025-08-15'` 欄位（透過 metadata） → reload 詳情看得到 → **jsonb metadata 機制可用**
5. `grep -r "from '@/lib/supabase" src/app/\(workspace\)/parts/setup/{regions,stores,warehouses}` → 應為 0（**紀律**）
6. `npx tsc --noEmit` 0 errors / `npx eslint src/app/\(workspace\)/parts/setup` 0 errors / `npx eslint src/domain` 0 errors
7. 手測 9 步：list filter / 新增 modal / 編輯 / 同頁 create mode（detail page 「+ 新增」）/ tab 切換（store detail 內的倉庫 tab 顯示子倉庫）/ 刪除（含子節點警告）/ 啟停用 / 麵包屑導航 / 三頁 SSOT 一致

## 9. 開放問題（階段 3 拍板）

### Q1：subsidiary_id 預設策略
`organizations.subsidiary_id` 是 NOT NULL 欄位。目前只有 1 筆非 root 法人（彥明國際）。Region / Store form 要怎麼處理？

選項 A：**自動帶入唯一非 root subsidiary**（Day 1 簡單），form 不顯示這欄位。未來多法人時再加 dropdown
選項 B：**form 顯示 dropdown 讓 user 選**，預選非 root active 的第一筆
選項 C：region 自動帶、store 顯示 dropdown（因為門店比較可能跨法人）

### Q2：Ducati nav 處理
現況 Ducati 沒有 `/parts/setup/org` 對應的 nav，走 `/settings/org` 不同 UI。新拆的三頁要：

選項 A：**只在 Indian 加 nav**（保持現有不對稱、最省事）
選項 B：兩個 brand 都加（會跟 Ducati 既有 `/settings/org` 衝突，可能要先確認 `/settings/org` 是否還在用）

### Q3：倉庫 type 清單
既有 `org-actions.ts` 列了 7 種：main / temporary / consignment / warranty / transit / quarantine / virtual
HTML 截圖只看到 3 種：主倉 / 寄存 / 保固

選項 A：**保留全部 7 種**（form dropdown 顯示全部）
選項 B：UI 只顯示 3 種，其他 type 純資料層支援（給未來自動建倉用）

### Q4：總覽頁 `/parts/setup/org` 改造程度
現況一頁三 section + 三個新增按鈕。三頁拆出來後：

選項 A：**改成連結頁**（三張卡片，每張連到對應管理頁）
選項 B：保留三 section 顯示但拿掉新增按鈕（純 read-only 總覽）
選項 C：直接 redirect 到 `/parts/setup/regions`（讓總覽頁退役）

### Q5：metadata 補完範圍
這次 ALTER TABLE 加 metadata jsonb：

選項 A：**只加 organizations / warehouses / subsidiaries**（這次會用到的 3 張）
選項 B：把整個專案有業務語意的表全加（一次到位、未來不用一張一張改）
