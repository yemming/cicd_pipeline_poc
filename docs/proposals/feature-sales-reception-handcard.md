# 提案：銷售接待 — 電子手卡 (RS01 Handcard)

> 來源：Stitch nav_node `11e38929-91b8-4111-b315-74a1036cb94f`（Indian-only，目錄「展廳接待 › 接待手卡」）
> 設計稿：RS01 電子手卡 v8 (1628 行 HTML)
> 日期：2026-05-14
> 階段：架構提案 → 自決拍板（Ming 預先授權 14 張批次）

## 1. 結構摘要

銷售展廳接待時 RS（Retail Sales）填寫的主表單頁。一張卡記錄一次客戶到店接待，串接後續 RS02 試駕、RS06 中古車鑑價、CRM03A 電訪追蹤、報價單。是**重型表單頁**（8 step、4 種來客身份分支邏輯），不是 list view。

8 個 Step：
1. 來客身份確認（新訪 / 回訪 / 車主 / 換購，影響後續欄位 prefill）
2. 基本接待資訊（接待時間、RS、客戶基本資料、線索來源）
3. 意向車款（車型、年式、顏色、配備）
4. 購買時機評估 × HABC 系統輔助建議（自動推算 H/A/B/C，可手動覆蓋）
5. 試乘試駕（跳 RS02、完成後唯讀回寫）
6. 中古車評估鑑價（跳 RS06、選填）
7. 報價與追蹤（黃金時刻提示、報價狀態、下次追蹤日）
8. 客戶標籤（四色標籤：注意 / 偏好 / 服務備忘 / 溝通費用 + RS 自訂）
9. 備註與競品記錄

## 2. v1 落地範圍（自決）

**只做視覺骨架 + 局部 client state 互動**（不接 DB / 不建表 / 不寫 helper）：

- 4 種身份卡片可切換、視覺正確上色
- HABC grade override button 可點擊切換
- 意向強度 5 顆 emoji 可單選
- 客戶標籤可 toggle、新增/移除自訂標籤
- 表單欄位皆為 controlled input，state 存 React state，不打 Supabase

**v2 後續**（不在本工項範圍）：
- 建 `reception_handcards` 表（含 typed core: id, brand_id, store_id, rs_id, customer_id, visit_type, intent_grade, visit_result + metadata jsonb 存 step-level 細節）
- 建 `src/domain/reception.ts` helper
- 真實連動 customers / customer_tags / quotes / trial_drives / used_car_appraisals
- 試駕完成回寫機制（RS02 → handcard 唯讀區塊）

**理由**：14 張批次工作以視覺骨架落地優先；reception_handcards 涉及 6 張既有表整合（customer / vehicle / quote / trial / used-car / tag），單獨開一輪 spec-to-feature。

## 3. Domain Helper 規劃

**v1**：無 helper。純 client component，state 在 React useState。

**v2 預留簽名**（給後續工項參考、不在本工項落地）：

```ts
// src/domain/reception.ts
export async function listHandcards(filter): Promise<HandcardRow[]>
export async function getHandcardById(id: string): Promise<HandcardDetail | null>
export async function createHandcard(input): Promise<{ ok: true; data: { id } } | { ok: false; error: string }>
export async function updateHandcard(id, patch): Promise<...>
export async function attachTagsToHandcard(id, tagIds): Promise<...>
```

## 4. 副作用清單

v1 無副作用（純前端表單、不寫 DB）。

v2 預期副作用（不在本工項範圍）：
- 儲存後寫入 reception_handcards + handcard_tags m2m
- 推 LINE 給 RS 主管（黃金時刻、HABC=H 級客戶）
- 同步到 CRM03A 電訪工作台（下次追蹤日）
- 試駕完成 trigger 回寫 trial_done_at / trial_response

## 5. 會計事件分析

無 — 本功能屬於接待記錄 / 客戶 CRM 流程，不產生資金流。報價成立、訂單收訂金、交車尾款才是會計事件，由後續 quote / order / delivery 模組處理。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 電子手卡 | `/sales/reception/handcard` | 自訂表單頁（非 DataGrid） | 自製、視覺對齊 Stitch 原稿 |

## 7. nav_nodes（Indian 單 brand）

```sql
UPDATE nav_nodes
   SET page_kind = 'react_route',
       href      = '/sales/reception/handcard'
 WHERE id = '11e38929-91b8-4111-b315-74a1036cb94f';
```

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/app/(workspace)/sales/reception/handcard/page.tsx` |
| 新增 | `src/app/(workspace)/sales/reception/handcard/_components/handcard-form.tsx` |
| 修改 | nav_nodes (UPDATE) |

## 9. Verification

1. `/sales/reception/handcard` 載入無 console error
2. 4 個身份卡片可切換、視覺著色正確
3. 意向強度 5 顆可單選
4. HABC override 4 顆 button 可切換 active
5. 客戶標籤可 toggle 上下
6. tsc / eslint 0 errors
7. grep audit 0 hit on `@/lib/supabase` in this page

## 10. 自動拍板的決策（Ming 預先授權）

1. 路由用 `/sales/reception/handcard`
2. v1 純 client state、不接 DB（同 funnel / 新車庫存策略）
3. 不建 reception_handcards 表
4. 不寫 domain helper
5. Indian 單 brand（parent 只有 Indian）
