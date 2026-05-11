---
feature: 下拉選單對應 (Dictionaries) 升 design pattern
slug: dictionaries
date: 2026-05-11
stage: 架構提案（待 Ming 拍板）
source: src/app/(workspace)/parts/setup/dictionaries（既有頁面，需升級到 DataGrid + Domain Helper）
target_route: /parts/setup/dictionaries
---

# 提案：下拉選單對應升級到 DealerOS design pattern

## 1. 結構摘要

`/parts/setup/dictionaries` 是 reference data 管理頁、單一頁面 + 3 tabs（品類 / 管控等級 / 單位）、無 detail page 需求。目前是手刻 table + 舊 server actions、UX 規格漂移。

**範圍 = List View only**（reference data、每筆 6-7 欄、不需 detail page；同 §邊界「純資訊頁 → 只做 list」）

雙 brand × 3 kind 共 34 筆全 active；items/page.tsx + items/[id]/page.tsx 直連 supabase 撈 dictionary、有破邊界。

## 2. Schema（不變更）

不動 `parts_dictionary` 表（typed core + metadata jsonb 已齊）。Kind 列舉維持 `category` / `control_level` / `uom` 三類 hard-coded — 動態 kind 留 Phase 2。

| 欄位 | 落腳 | 理由 |
|---|---|---|
| `kind` enum | typed | 三類固定、union type 鎖死 |
| `code` / `label` / `description` | typed | 業務必填、被 items 表 FK 參照（行為上） |
| `accent_color` | typed | chip 顯示用、固定 7 種選項 |
| `sort_order` / `is_active` | typed | 通用控制 |
| `metadata` | jsonb | 未來擴充（圖示、進階 config）保留 |

## 3. Domain Helper 規劃

新建 `src/domain/dictionaries.ts`，取代 `src/lib/parts-setup/dictionary-actions.ts`：

```ts
export type DictionaryKind = "category" | "control_level" | "uom";

export type DictionaryRow = {
  id: string;
  brand_id: string;
  kind: DictionaryKind;
  code: string;
  label: string;
  description: string | null;
  accent_color: string | null;
  sort_order: number;
  is_active: boolean;
};

export async function listDictionaries(filter?: { kind?: DictionaryKind }): Promise<DictionaryRow[]>;
export async function getDictionariesPageData(): Promise<{ rows: DictionaryRow[]; canEdit: boolean }>;
export async function addDictionary(input: DictionaryInput): Promise<Result<{ id: string }>>;
export async function updateDictionary(id: string, patch: Partial<DictionaryInput>): Promise<Result<{ id: string }>>;
export async function setDictionaryActive(id: string, active: boolean): Promise<Result<{ id: string }>>;
export async function deleteDictionary(id: string): Promise<Result<{ id: string }>>;
```

刪除前 reference check 保留（kind=category 看 items.category、kind=uom 看 items.base_uom、kind=control_level 看 items.control_type）— 跟舊 action 同邏輯。

### 3.1 quick-add 相容

`item-detail-view.tsx` 用 `<QuickAddSelect>` + `createDictionaryAction` 做即時新增 — 改成 `addDictionary` （簽名一致）即可、quick-add 行為不變。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| create / update / delete | revalidate `/parts/setup/dictionaries` + `/parts/setup/items` | 確定（沿用舊 action 行為） |
| delete | reference check（被 items 用就擋） | 確定 |
| 規則修改 | audit log / 推 LINE | [需確認] §9 Q3（POC 預設不做） |

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 下拉選單對應 | `/parts/setup/dictionaries` | List View（tab 切 kind） | `(workspace)/parts/setup/items/_components/items-board.tsx` |

### 5.1 List View 結構（依 §List View 規格）

```
1. Page Header     ─ 「下拉選單對應 (Mapping)」+ 「基礎設定」chip + 副標
2. Banner          ─ fixed bottom-right（取代既有 inline）
3. Tabs            ─ 品類 / 管控等級 / 單位（保留現有設計）+ 右上「+ 新增X」+ 副標 hint
4. Table           ─ <DataGrid> 取代手刻 <table>，columns = code / label(chip) / description / sort_order / accent_color / is_active(chip) / rowActions
5. Modal           ─ Create / Edit（取代既有 inline panel）
6. Confirm Modal   ─ 刪除（取代 confirm()）
```

⚠️ Tab 段不變動結構 — 跟 setting page (`/parts/setup/count-rules`) 不同的是 dictionaries 三類有獨立 list、適合 tabs 切；不適合做成 3 張 card 並排（每類筆數會撐爆橫向空間）。

### 5.2 DataGrid columns

| id | header | 欄寬 | hideable | sortValue | inline editable | 備註 |
|---|---|---|---|---|---|---|
| code | 代碼 | 130 | false | r.code | ❌ Modal 改 | 代碼是主鍵概念，禁止隱藏 |
| label | 顯示名稱 | 200 |  | r.label | ✅ text | chip 套 accent_color |
| description | 說明 | flex |  | r.description | ✅ textarea | 純字串 OK inline 改 |
| sort_order | 排序 | 80 | defaultHidden? | r.sort_order | ❌ Modal 改 | 數字、改錯影響顯示順序、走 Modal |
| accent_color | 顏色 | 100 |  | r.accent_color | ❌ Modal 改 | dropdown、不支援 inline |
| is_active | 狀態 | 90 |  | r.is_active | ❌ button toggle | 走 stop/啟用 button |

`persistKey = "parts/setup/dictionaries"`、`exportFileName = "dictionaries"`、**不傳 `onImport`**（master data 不開放 Excel 匯入 — 跟 supplier-pricing / coa 一致）。

## 6. nav_nodes（不動）

`/parts/setup/dictionaries` 已是 react_route、雙 brand 都已建立、入口已通。

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/dictionaries.ts`（取代舊 action） |
| 改寫 | `src/app/(workspace)/parts/setup/dictionaries/_components/dictionaries-board.tsx`（DataGrid + Modal） |
| 改寫 | `src/app/(workspace)/parts/setup/dictionaries/page.tsx`（用 `getDictionariesPageData`） |
| 改寫 | `src/app/(workspace)/parts/setup/items/page.tsx`（dictionary 撈走 domain helper） |
| 改寫 | `src/app/(workspace)/parts/setup/items/[id]/page.tsx`（同上） |
| 改寫 | `src/app/(workspace)/parts/setup/items/[id]/_components/item-detail-view.tsx`（quick-add 換 import 來源） |
| 處置 | `src/lib/parts-setup/dictionary-actions.ts`（[需確認] §9 Q2：刪 or 保留當 thin re-export） |

## 8. Verification（落地完手測）

1. `/parts/setup/dictionaries` 200、3 tab 顯示正確筆數、tab 切換不刷頁
2. DataGrid column 選擇器（右上齒輪）能隱藏「排序 / 顏色」、刷頁後狀態持久
3. DataGrid header 點擊 code / label / sort_order 能 asc / desc / none 三段切
4. DataGrid Excel 匯出按下載出 .xlsx 含當前 tab 全部 row（chip 變純 label 文字）
5. 點 row「編輯」→ Modal 彈出、改 label → 儲存 → fixed bottom-right banner「✓ 已儲存」+ 持久化
6. Inline edit label（雙擊）→ Enter 儲存、Esc 取消、空值報錯
7. 點「+ 新增品類」→ Modal 開、duplicate code → DB 23505 → banner「此品類代碼已存在」
8. 點「刪除」→ Confirm Modal、引用 0 → 刪除成功；如該 dictionary 被 items 引用 → banner「無法刪除：尚有 N 筆商品使用」
9. items list page filter / items detail page dropdown 仍正常運作（消費端切換 domain helper 後不破）
10. quick-add（item detail page 在 dropdown 旁的 `+`）仍正常運作
11. `npx tsc --noEmit` + `npx eslint <touched>` 0 errors
12. Chrome MCP 跑 step 5-9 一輪 screenshot 為證

## 9. 開放問題（Stage 3 拍板）

### Q1. DataGrid sort_order / accent_color 預設隱藏嗎？

- **選項 A**：兩欄都顯示（資訊密、admin 偏好）— 跟現況一致
- **選項 B（推薦）**：sort_order + accent_color 兩欄 `defaultHidden=true`（user 可手動開）— 表格更清爽、focus 在 code/label/description；改 sort/color 走 Modal 比 inline 直觀

### Q2. 舊 `src/lib/parts-setup/dictionary-actions.ts` 處置？

- **選項 A（推薦）**：domain helper 落地後直接刪舊檔（item-detail-view.tsx 的 import 改成 `@/domain/dictionaries`），孤兒清乾淨
- **選項 B**：舊檔保留為 thin re-export（`export { addDictionary as createDictionaryAction } from "@/domain/dictionaries"`）— 不破 backward compat 但留 hack 痕跡

### Q3. 規則修改要不要寫 audit log / 推 LINE？

- **選項 A（推薦）**：POC 不做、跟 count-rules / serial-tracking 一致

### Q4. inline edit 開哪些欄？

- **選項 A（推薦）**：只開 `label` 和 `description`（純字串、無 FK 風險、與 items canonical 範本一致）
- **選項 B**：再加 `sort_order`（數字 input）— 一致性比較高但跟 §List View 規格寫的「sort_order 走 Modal」衝突
