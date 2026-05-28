# 提案：交車服務 6-step wizard 接真資料（退役 mock store）

**日期**：2026-05-28　**狀態**：待 Ming 拍板
**範圍**：`(workspace)/delivery/*` 6 個 wizard 步驟頁
**Slug**：feature-delivery-wizard-wiring

---

## 一、現況盤點（不靠印象、逐檔讀過）

交車服務分兩塊，**後端已 100% 完整、前端 wizard 半接**：

| 層 | 檔案 | 狀態 |
|---|---|---|
| 資料表 | `deliveries`（schema 含 pdi_checklist / accessories / 三方簽名 / ceremony_photos…全欄位）| ✅ 完整，Indian 16 筆 + Ducati 15 筆真資料 |
| CRUD helper | `src/lib/deliveries.ts`（list/get/create/update/**updateDeliveryStep**/setStatus/delete）| ✅ 完整 |
| Server actions | `src/lib/delivery/delivery-actions.ts`（Result 型別、含 `updateDeliveryStepAction` 註明「給 wizard 下一步呼叫」、`completeDeliveryAction`）| ✅ 完整 |
| Domain | `src/domain/sales-delivery.ts`（KPI / Kanban / timeline / PDI 狀態）| ✅ 完整 |
| 入口看板 | `/sales/delivery`（real Kanban + 列表，連結 `href=/delivery/confirm-1?deliveryId={id}`）| ✅ 真資料、已連進 wizard |
| **id 流** | `DeliveryFrame` 讀 `?deliveryId=` 跨步驟帶著走；6 個 `page.tsx` 都把 `deliveryId` 傳進 view | ✅ 已串好 |
| **6 wizard view** | `confirm-1 / pdi / pdi-accessories / confirm-2 / warranty-sign / ceremony` | ❌ **仍讀寫 client mock `delivery-store`** |
| Mock store | `src/lib/delivery-store.tsx`（localStorage + 寫死「王大明 / Panigale V4 S」demo）| 🔴 待退役 |

## 二、真正的缺口（也是隱患）

6 個 view 已經拿到真 `deliveryId`、也 import 了真 action，但：

1. **顯示**仍讀 `useDelivery().state`（mock 單例），不是真實交車單 → 從看板點任一筆進來，畫面都顯示「王大明 / Panigale V4 S」，不是該筆客戶。
2. **寫入**把 mock state 的值送進 `updateDeliveryStepAction` → 例：confirm-1 下一步會把「王大明」寫進真實交車單，**用 demo 資料覆蓋掉真客戶**。
3. 勾選 / 簽名 / 配件全存 localStorage，跨裝置不同步、重整才在、不落 DB。

> 結論：這比「純 mock」更糟 —— 半接狀態會污染真資料。必須把 6 個 view 完整接到既有後端。

## 三、提案做法（不動 schema / CRUD / actions，只重接 6 個 view + 退役 mock）

### 3.1 每個 step 頁的標準改法

**`page.tsx`（server）**：
```tsx
const { deliveryId } = await searchParams;
if (!deliveryId) redirect("/sales/delivery");        // 無 id → 回看板
const delivery = await getDeliveryById(deliveryId);   // 走 @/domain（見 §3.3）
if (!delivery) return <main>找不到交車單</main>;
return <XxxView delivery={delivery} />;
```

**`_components/xxx-view.tsx`（client）**：
- 顯示一律讀 `delivery.*`（真欄位），不再 `useDelivery()`。
- 該步驟的勾選/輸入用 **local `useState` 初值 = `delivery.*`**（純該頁編輯緩衝，不跨頁共享）。
- 「下一步 / 儲存」用 `useTransition` 呼叫 `updateDeliveryStepAction(deliveryId, '<step>', payload, <newStatus>)`，payload 取自 local state（**不是 mock**）；pending 鎖 UI + 進行式文案（CLAUDE.md §UX 互動規範）。成功 → `router.push(下一步?deliveryId=)`。
- ceremony 最後一步用 `completeDeliveryAction`（status→`delivered`）。

### 3.2 各步驟 → action payload（欄位已對齊，直接接）

| step | view | 寫入欄位（DeliveryStepPayload）| newStatus |
|---|---|---|---|
| 1 confirm-1 | 訂單覆核 | customer_* / vehicle_* / rs_name / scheduled_delivery_date | `pdi_in_progress` |
| 2 pdi | PDI 完成確認 | pdi_checklist / pdi_work_order_no | `pdi_complete` |
| 3 pdi-accessories | 配件安裝 | accessories_list / accessories_note | `accessories_complete` |
| 4 confirm-2 | 交車確認表 36 項 | delivery_checklist | `delivery_confirmed` |
| 5 warranty-sign | 保固條款 + 三方簽名 | plate_* / warranty_* / warranty_consents / warranty_checklist / sig_technician/rs/customer | `warranty_signed` |
| 6 ceremony | 完成交車 | delivered_at / ceremony_photos / handover_docs_checklist / keys_* / customer_doc_signature | `delivered` |

### 3.3 天條校正

`getDeliveryById` 目前在 `src/lib/deliveries.ts`（domain helper，OK），但 page 屬 UI 層、依天條 UI 只能 import `@/domain/*`。處理：在 `@/domain/sales-delivery.ts` re-export 一支 `getDeliveryForWizard(id)`（內部呼叫 deliveries helper），page 走它。actions 已是 `@/lib/delivery/*`（server action，client 可呼叫，合規）。

### 3.4 退役 mock
- 刪 `src/lib/delivery-store.tsx`、`(workspace)/delivery/layout.tsx` 的 `DeliveryProvider` 包裹（改成單純 pass-through 或移除）。
- `DeliveryFrame` 的 `stepDone` 改吃真 `delivery.step_completion[step]` / status，而非 mock。

## 四、Nav 決策（需拍板，見 §六）

現在「交車服務」模組在側欄是 **6 個獨立 step 連結**（交車儀式 / PDI 檢查表…）。但 step 沒帶 deliveryId 直接點沒有意義（會被導回看板）。合理結構是：**入口是看板、step 是某筆交車單的子流程**。

## 五、不做什麼
- ❌ 不改 `deliveries` schema、不改 CRUD、不改 actions（都已完整）
- ❌ 不重構路由為 `/delivery/[id]/*`（既有 `?deliveryId=` 已能用、看板連結也是這格式，改了反而要動看板）
- ❌ 不補 Indian demo（已有 16 筆）
- ❌ 不碰 `/sales/delivery` 看板（已是真資料）

## 六、待拍板問題
1. **Nav 結構**：交車服務模組的 6 個 step sidebar 連結要怎麼處理？（見問題選項）
2. 是否同意「無 deliveryId 進 step 頁 → redirect 回 `/sales/delivery` 看板」。

## 七、驗證 checklist（落地後）
- `npx tsc --noEmit` + `eslint` 0 error
- 從 `/sales/delivery` 點不同交車單進 wizard → 顯示**該筆**客戶/車輛（非王大明）
- 走完 6 步 → DB `deliveries` row 的 status / 各欄位 / step_completion 正確落地（SQL 驗）
- 重整頁面資料仍在（來自 DB 非 localStorage）
- 無 deliveryId 直接開 `/delivery/pdi` → 導回看板
- `grep -rn "delivery-store" src` = 0（mock 已退役）
