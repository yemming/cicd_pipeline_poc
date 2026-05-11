# 提案：保固索賠舊件管理（11.4）

> 來源：`docs/DUCATI_庫存管理模組_串接版_20260510_最新版/11_保固索賠_舊件管理.html`
> 日期：2026-05-11
> 階段：架構提案（用戶已預先批准 → 直接進落地）

## 1. 結構摘要

保固維修拆下的舊件不計入可用庫存，獨立於「保固暫存倉」管理。本頁負責：
（a）KPI 5 卡（逾期/即將到期/保管中/已寄回/已銷毀），含 alert banner 跳出最近一筆逾期
（b）篩選 + Pills 狀態切換 + 列表（11 欄）
（c）入庫登記 modal、標記銷毀 modal、標記寄回 modal、批次處理
（d）Side panel 詳情（簡版）

## 2. Schema 草案

### 新表 / ALTER
**全部不動**。`old_parts` typed core 已夠，新欄位走 `metadata jsonb`：
- `metadata.claim_no` — Ducati 索賠單號（顯示 + 之後串 warranty_claims）
- `metadata.oem_directive` — 原廠處置指示 label（中文）：`原地保管後銷毀` / `寄回台灣總代理` / `寄回義大利原廠`
- `metadata.tsb_no` — 相關 TSB 編號
- `metadata.defect_desc` — 缺陷描述
- `metadata.keep_days` — 保管期限（天），預設 90
- `metadata.returned_at` — ISO datetime
- `metadata.return_tracking_no`、`metadata.return_carrier`、`metadata.return_recipient`
- `metadata.destroyed_at`、`metadata.destroy_method`

### 欄位分類

| 欄位 | 落腳 | 理由 |
|---|---|---|
| wc_no, item_id, warehouse_id, ro_id, cl_id, serial_no, vin | typed | core / FK / 報表 |
| entry_date, expiry_date, disposal_action, status | typed | 業務狀態流轉 |
| claim_no, oem_directive, tsb_no, defect_desc | jsonb | 變動中 / 純顯示 |
| return / destroy 處置欄位 | jsonb | 多欄一組、單頁專用 |

status enum 沿用：`in_storage` / `warning_60d` / `overdue_90d` / `returned_oem` / `disposed` / `retained` / `cancelled`
> 「逾期天數」用 query time computed（`expiry_date - today`）+ rule（≤0 overdue / ≤7 warning / 其他 ok），不寫死 DB。

## 3. Domain Helper 規劃

檔案：`src/domain/warranty.ts`（既有，追加；不開新檔避免分散）
搭配：`src/domain/warranty.constants.ts`（新建，放 enum mapping 與 disposal/status label）

```ts
// 新增於 warranty.ts
export type OldPartRow = Database["public"]["Tables"]["old_parts"]["Row"];

export type OldPartListItem = OldPartRow & {
  item_code: string | null;
  item_name: string | null;
  warehouse_code: string | null;
  days_remaining: number;        // expiry - today
  derived_status: 'overdue' | 'warn' | 'ok' | 'sent' | 'destroyed';
};

export type OldPartsFilter = {
  status?: string;                // derived_status group
  wc_no?: string;
  ro_no?: string;
  keyword?: string;               // item code / name / serial
  expiry_from?: string;
  page?: number;
  pageSize?: number;
};

export type OldPartsStats = {
  overdue: number;
  warning: number;
  in_storage: number;
  returned: number;
  disposed: number;
  total: number;
  imminentList: { id: string; wc_no: string; item_name: string; days_remaining: number }[];
};

export async function getOldPartsPageData(filter: OldPartsFilter)
  : Promise<{ rows: OldPartListItem[]; totalCount: number; stats: OldPartsStats; canEdit: boolean }>;

export type RegisterOldPartInput = {
  wc_no?: string;            // 留空走 auto
  ro_id?: string | null;
  ro_no?: string;            // 顯示用
  cl_id?: string | null;
  claim_no?: string;         // metadata
  item_id: string;
  serial_no?: string;
  vin?: string;
  warehouse_id?: string | null;
  entry_date: string;
  keep_days: number;
  expiry_date?: string;
  oem_directive: string;     // metadata + 對映 disposal_action enum
  tsb_no?: string;
  defect_desc?: string;
};
export async function registerOldPart(input): Promise<ActionResult<{ id: string; wc_no: string }>>;

export type MarkReturnedInput = {
  returned_at: string;       // date
  return_recipient: '台灣 DUCATI 總代理' | '義大利 Ducati 原廠' | string;
  return_tracking_no: string;
  operator?: string;
};
export async function markOldPartReturned(id, input): Promise<ActionResult<{ id: string }>>;

export type MarkDisposedInput = {
  destroyed_at: string;
  destroy_method?: string;
  operator?: string;
};
export async function markOldPartDisposed(id, input): Promise<ActionResult<{ id: string }>>;

export async function batchMarkOldParts(
  ids: string[], kind: 'returned' | 'disposed', input: MarkReturnedInput | MarkDisposedInput
): Promise<ActionResult<{ updated: number }>>;
```

實作策略：Day 1 直連 supabase。`registerOldPart` 內：自動產生 `wc_no = WC-{yyyymmdd}-{seq3}`，自動算 `expiry_date = entry_date + keep_days`。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| registerOldPart | insert old_parts；revalidatePath；不動 stock | 確定 |
| markReturned | UPDATE status='returned_oem' + metadata；不動 GL | 確定 |
| markDisposed | UPDATE status='disposed' + metadata；不動 GL | 確定（POC：費用沖銷之後再做） |
| 批次 | 同上 N 次 transactional update | 確定 |

⚠️ 之後接 GL 沖銷 / LINE 通知都先不做（任務範圍外）。

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 |
|---|---|---|
| 舊件管理列表 | `/parts/warranty/used-parts` | List View (5 卡 + filter + pills + DataGrid + 3 modal + side panel) |

⚠️ 本頁是「處置動作頁」非「單據 CRUD 頁」—— 不做獨立 detail route，用 side panel + modal 已足夠涵蓋 spec。

## 6. nav_nodes

ducati 缺「舊件管理介面」入口（indian 已有）。補一條到既有 parent `0e7e8483-...`（雙 brand 共用）底下 ducati sort_order=3。

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 修改 | `src/domain/warranty.ts` |
| 新增 | `src/domain/warranty.constants.ts` |
| 重寫 | `src/app/(workspace)/parts/warranty/used-parts/page.tsx` |
| 重寫 | `src/app/(workspace)/parts/warranty/used-parts/_components/used-parts-board.tsx` |
| 刪除 | `src/app/(workspace)/parts/warranty/used-parts/_components/register-old-part-form.tsx`（替換成新 board 內含 modal） |
| 棄用 | `src/lib/parts/actions/index.ts` 內 `registerOldPartAction`（保留但 UI 改 import domain helper） |
| 補 nav | INSERT nav_nodes ducati 1 筆 |

## 8. Verification

1. tsc / eslint pass
2. 5 顆 stats 數字 = DB GROUP BY derived_status
3. filter / pills / pagination 都用 URL searchParams
4. 入庫 modal 自動產生 wc_no + 自動算 expiry
5. 標記寄回 / 銷毀後狀態 chip 改變、disabled UI、banner 反饋
6. 既有 register-old-part-form 流程不破

## 9. 拍板（已預先批准 — 默認方案直接進）

- ✅ 不新表、不 ALTER；新欄位走 metadata jsonb
- ✅ 不做獨立 detail route，用 side panel + 3 modal
- ✅ 沿用既有 disposal_action enum + 加 metadata.oem_directive 中文 label 對映
- ✅ derived_status 在 application 層算（不存 DB）
