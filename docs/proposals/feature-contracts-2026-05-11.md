# Feature: 採購合約 `/parts/setup/contracts` Phase 2 補完

**Date**: 2026-05-11
**Author**: Ming + Claude
**Status**: 拍板完成 / 落地中
**Spec**: `docs/DUCATI_庫存管理模組_串接版_20260510_最新版/02_基礎設定_採購合約.html`
**前置**: Phase 1 已交付 list view 殼（KPI / filter / DataGrid），按鈕 disabled、無 detail page

## 0. 為什麼是 Phase 2

Phase 1（2026-05-10）跑 spec-to-feature 跳了階段 3 拍板，留下:
- 「＋新增合約」disabled (`title="Phase 2 開放"`)
- 列尾「詳細 / 展延」disabled
- 沒有 `[id]/page.tsx` / `new/page.tsx` / detail view
- `src/domain/contracts.ts` 只有讀 helper

Phase 2 把這些補齊、跑完整 SOP（domain CRUD + detail page + 拍板 + proposal doc + 驗證）。

CRUD 邏輯**已存在**但在 `src/domain/suppliers.ts:428-502`（上一個 session 為 supplier detail tab 寫的）。本次搬到 `src/domain/contracts.ts` 共用，supplier-detail-view 改 import 路徑、不 dup logic。

## 1. 階段 3 拍板紀錄

| Q | 議題 | 決議 | 理由 |
|---|---|---|---|
| Q1 | CRUD helper 位置 | **搬到 `contracts.ts`** | 單一事實來源；supplier detail tab 改 import；未來 contract 邏輯只改一個地方 |
| Q2 | 「展延」按鈕行為 | **新開一筆 row，舊 row 標 inactive** | 歷史完整、各期 effective_to 都留得到；舊 row contract_no 加 `-{seq}` 後綴避開 unique constraint |
| Q3 | detail page sections / tabs | **1 section（合約基本資料）+ 1 tab（變更歷史）** | KV 欄少（~9 欄），不用切多 section；變更歷史 tab 列舊 row 與 metadata.extensions |
| Q4 | 刪除策略 | **軟刪除（`status='inactive'`）** | 跟 supplier 軟刪一致；hard delete 未來 PO 引用會被 PG FK 擋；不增 schema（status 欄位已有） |
| Q5 | 列表頁「＋新增合約」 | **強制先選 supplier**（modal 第一步） | 避免孤兒合約；選好 supplier 才 router.push 到 `/new?supplier_id=...` |

## 2. 落地範圍

### 2.1 `src/domain/contracts.ts`（重構）

新增/搬遷 helpers:

| Helper | 來源 | 行為 |
|---|---|---|
| `createContract(input)` | 從 suppliers.ts 搬 | 不變；revalidate list + supplier detail |
| `updateContract(id, patch)` | 從 suppliers.ts 搬 | 不變 |
| `softDeleteContract(id)` | **新增** | `update {status:'inactive'}`；不真 delete |
| `extendContract(id, new_effective_to)` | **新增** | 在 transaction 內：① 舊 row `status='inactive'`、contract_no 加 `-{n}` 後綴；② insert 新 row 帶原 contract_no、新 effective_from（=舊 to + 1 天）、新 effective_to；③ 把舊 row id push 到新 row `metadata.previous_versions[]` |
| `getContractById(id)` | **新增** | join supplier name + metadata 解 contract_type/amount_limit |
| `getSupplierOptionsForContract()` | **新增** | active suppliers id+code+name dropdown 用 |
| `getContractHistory(contract_no)` | **新增** | 變更歷史 tab 用：列出同 contract_no（含後綴）的所有 row 按 effective_from desc |

`ContractWriteInput` 擴充: 加 `contract_type`（annual/framework/one_off）+ `amount_limit`（number\|null）寫進 `metadata` jsonb。

`deleteContract` 維持 hard delete export（supplier-detail-view 舊邏輯用，不破壞），但新 detail view 走 `softDeleteContract`。

### 2.2 `src/domain/suppliers.ts`

- 刪除 contract CRUD 區塊（行 388–502）
- 從 contracts.ts re-export `createContract` / `updateContract` / `deleteContract` / `ContractWriteInput` 給 supplier-detail-view（向下相容；可選做）
  → **直接讓 supplier-detail-view 改 import 路徑**，不留 re-export，乾淨

### 2.3 `src/app/(workspace)/parts/setup/contracts/`

- 新建 `[id]/page.tsx`（server, ~50 行）
- 新建 `[id]/_components/contract-detail-view.tsx`（client, ~600 行）
  - Breadcrumb + 5 顆 CRUD pill bar（view mode）/ 3 顆（edit/create mode）
  - Title card: 合約編號 + supplier name + 狀態 chip + 合約類型 chip
  - **▼ 合約基本資料** section: supplier(readonly link) / contract_no / contract_type / effective_from / effective_to / amount_limit / payment_terms / status / notes
  - **變更歷史 tab**: 列同 contract_no 的所有 row，包含 metadata.extensions（如果有寫到）
  - **展延 modal**: 預填新 effective_to = 舊 + 1 年，可改；submit 走 extendContract
- 新建 `new/page.tsx`（reuse detail view + `initialMode='create'` + supplier_id 從 query string 帶入）

### 2.4 `_components/contracts-board.tsx`

- 加 `SupplierPickerModal`（dropdown + 確認）；點「＋新增合約」開
- 啟用列尾「詳細 / 展延」按鈕 → `router.push('/parts/setup/contracts/${id}')`
- Banner（樂觀更新風格）

### 2.5 DB

- **不加 RPC**（軟刪除直接 update status='inactive'，跨欄位 cascade 不需要）
- **不改 schema**（metadata jsonb 已存在；contract_type / amount_limit 寫 metadata）
- 唯一 schema 風險: 展延把舊 contract_no 改 `-{n}` 後綴後，新 row 用原 contract_no 才不會撞 unique `(brand_id, contract_no)`。Transaction 內 update 先發、insert 後發即可。

## 3. 邊界

- **多筆同 contract_no 的展延鏈**: contract_no 後綴 `-{seq}` 是用 SELECT count + 1 算的；同 supplier 同 contract_no 並發展延有 race condition、但 POC 階段 single-user 不處理（未來需要 row lock 或 PG SEQUENCE）
- **PO 引用合約**: 目前無 PO 表，未來實作要在 softDeleteContract 內檢查；先不擋
- **權限**: 維持 `SUPPLIER_VIEW` / `SUPPLIER_EDIT`（合約跟 supplier 同權限組，不另建）

## 4. 驗證 checklist

- [ ] tsc --noEmit = 0 errors
- [ ] eslint contracts/ + contracts.ts = 0 errors
- [ ] 紀律 check: contracts/ 下 grep `from "@/lib/supabase` = 0 hit
- [ ] 手測: list 新增（先選 supplier）→ 跳 /new + supplier 帶入 → 填欄位 → 建立 → router push /[id]
- [ ] 手測: detail edit / 軟刪除 / 啟用 / 展延（看新舊兩筆都在變更歷史 tab）
- [ ] 手測: supplier detail 內合約 modal（reuse 共用 CRUD）仍正常運作

## 5. 拍板後不再回頭討論的決定

- 軟刪除不加 RPC、直接 update status
- 展延後綴用 `-{seq}` 算的、不用 timestamp
- 變更歷史 tab 不需要 audit log 表（用 contract_no 自然連動）
- detail view 不重做 supplier 那種 5 顆 CRUD pill；合約 detail 4 顆（返回 / 修改 / 軟刪 / 展延）
