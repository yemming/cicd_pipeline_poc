# ① 銷售接待模組 — 實測回填結果（對真 React app 重測）

> 方法：先讀 code（page + _components + @/domain helper + server action），再跑 Playwright live smoke
> （`scripts/verify-sales-reception-scenarios.mjs`，admin 登入 + indian scope）。
> 評級誠實：跨模組連鎖除非在 code 看得到真觸發鏈（after()/server action 串接 DB）才標 ✅，否則 ⚠️。

verify 腳本：**15/15 綠**（所有路由 HTTP 200、實質渲染、無 error/權限 overlay）。

## 場景評級表

| 場景 | 路由 | 評級 | 證據（page + helper、真資料?） | live | 說明 |
|---|---|---|---|---|---|
| RS01-01 首次來店建檔 | `/sales/reception/handcard/new` | ✅ | `handcard-detail-view.tsx`（create mode）→ `createHandcardAction` → `createHandcard` 寫 `sales_handcards`；身份/意向/HABC/標籤全接 DB | 綠 | 5 步 wizard 真建檔、儲存後跳 `[id]` |
| RS01-02 潛客再訪查舊手卡 | `/sales/reception/handcard/[id]` | ✅ | `listRevisitCandidates` 真查 `sales_handcards` + `HandcardPickerModal`，選後 `applyRevisitPick` 帶出舊資料 | 綠 | 身份選「再訪客」開 picker、不重複建檔 |
| RS01-03 老車主帶車況 | `/sales/reception/handcard/[id]` | ✅ | `listOwnerCandidates` 真查 `customers`+`customer_vehicles`+`vehicle_models`，帶出車牌/里程 | 綠 | 身份選「現有車主」開 picker、帶主要車輛 |
| RS01-04 接待轉移 | `/sales/reception/handcard` | ⚠️ | 手卡有 `assigned_rs_name` 可改，但**無「業務間轉移」專屬動作/交接紀錄**，只能編輯欄位 | 綠 | 僅能改接待 RS 文字欄，非正式轉移流程 |
| RS01-05 試乘≠成交車款 | `/sales/reception/handcard/[id]` | ✅ | 意向車款 `intended_models[]`（Step 2 多選）與試乘 `trial_status`（Step 3）為獨立欄位，互不綁定 | 綠 | 意向車款 vs 試駕記錄分開存 |
| RS01-06 儲存+CRM串接+D+3/D+7排程 | `/sales/reception/handcard/[id]` | ⚠️ | `convertHandcardToLead` **真** insert `sales_leads` + 切手卡狀態；但 **D+3/D+7 電訪排程未真建 call_task**，僅存 `metadata.followup_date` + KPI 統計待跟進數 | 綠 | CRM 轉 Lead 真接 DB；電訪排程缺自動建任務鏈 |
| RS02-01 從手卡帶入客戶 | `/sales/reception/test-rides` | ⚠️ | 手卡 Step 4 有「前往 RS02」JumpButton（`href=/sales/reception/test-rides`），但**不帶 handcard_id/客戶參數**；試駕建立靠 `linkToHandcard` 反向綁定 | 綠 | 有跳轉入口但未做 pre-fill 帶入 |
| RS02-02 試乘車防衝突 | `/sales/reception/test-rides` | ⚠️ | `createTestDrive` 直接 insert，**無時段/車輛衝突檢查**；無「即時可用狀態」鎖 | 綠 | 可建單但不防雙開同車同時段 |
| RS02-03 電子簽名（同意書 canvas） | `/sales/reception/test-rides/[id]` | ✅ | `TestRideConsentModal` → `SignatureCanvas` → `startTestDriveWithSignatureAction` 寫 `metadata.signature`(data_url+版本+時間) + 切 in_progress | 綠 | 真手寫簽名 canvas 寫 DB |
| RS02-04 試駕結果回寫手卡 | `/sales/reception/test-rides/[id]` | ⚠️ | `completeTestDrive` 寫 rating/feedback/里程到試駕 metadata + 回傳 handcard_id，**但實際未 UPDATE `sales_handcards.trial_status`**；UI banner「已回寫至手卡」屬誇大 | 綠 | 試駕端有存，回寫手卡那一段沒接 |
| RS03A-01 查可售新車（真庫存） | `/sales/showroom/new-cars` | ✅ | `@/domain/new-car-inventory` 真查 `new_car_inventory`（status/KPI/list），非寫死 | 綠 | live 渲染 11.9K chars 真資料 |
| RS03A-02 配車鎖定（RESERVED 防雙開） | `/sales/showroom/new-cars` | ⚠️ | `setNewCarStatus` 可切 reserved/sold；UI `canQuote` gate（PDI 中/非展示不可報價）；**但 RESERVED 後無 server-side 鎖防他人雙開報價**（不像中古車有 partial unique index） | 綠 | 狀態+UI gate 有，硬鎖防雙開缺 |
| RS03B-01 中古車庫存追蹤（收購→待整備） | `/sales/showroom/used-cars` | ✅ | `@/domain/used-car-inventory` 真查；收購端 `triggerUsedCarAcquisition` 建 `used_car_inventory` status='pending_recon' 進整備 | 綠 | 收購→待整備鏈真接（見 RS06-02） |
| RS04-01 報價單建立（客戶/車輛帶入） | `/sales/quote/new` | ✅ | `createSalesQuoteAction`→`@/domain/sales-quote` 寫 `sales_quotes`，customer_id/vehicle_model 真欄位 | 綠 | 報價單真建 DB |
| RS04-02 折扣審核（超授權核准） | `/sales/orders` | ⚠️ | 訂單有完整送簽鏈：`submitForApproval`→`approveSalesOrder`/`reject`（`/admin/approvals/order`）；**但非「折扣超授權閾值」觸發**，是一律送簽，無 discount threshold 判斷 | 綠 | 審批流真做，折扣門檻邏輯缺 |
| RS04-03 電子簽名（成交三方簽名） | `/sales/orders/[id]` | ❌ | order/quote 的 detail-view + actions **均無 SignatureCanvas / signature 欄位**（不像試乘有）；報價→訂單也無自動轉換函式（僅有 `converted_order_id` 空欄位） | 綠 | 成交簽名完全未實作 |
| RS04-04 成交後連鎖（車SOLD/漏斗/業績） | `/sales/orders` | ⚠️ | `setSalesOrderStatus`：簽約/交車**真**同步中古車 reserved/sold + partial unique index 防二賣 + 交車啟保固 `after()`；**但新車未同步 `new_car_inventory.status='sold'`**；漏斗/業績靠即時 KPI query 非 push | 綠 | 中古車連鎖紮實，新車 SOLD 那條缺 |
| RS05-01 PDI 狀態確認（未完不得交車） | `/sales/delivery` | ⚠️ | 有 PDI status enum（pdi_in_progress/pdi_complete）+ pdiPendingCount KPI；新車庫存頁 PDI 中 `canQuote=false`；**但交車 step 推進無強制 guard「pdi_complete 才能 delivered」** | 綠 | 狀態追蹤有，硬性阻擋交車未見 |
| RS05-02 交車後連鎖（建售後檔/排D+3） | `/sales/delivery` | ⚠️ | 訂單交車 `after()` 觸發 `startVehicleWarranty`（建車輛主檔+啟保固）真做；**但「建售後檔案 + 排 D+3 回訪」未見專屬觸發鏈** | 綠 | 保固鏈有，售後檔/D+3 排程缺 |
| RS06-01 從手卡帶入舊車資料 | `/sales/inventory/used-purchase/new` | ⚠️ | 手卡換購客 Step 5/6 有 RS06 JumpButton，但 detail-view 指向 `/sales/showroom/used-cars`（非收購頁）、舊 form 指向 `/usedcar/evaluations/wizard?customer_name=`；**`used-purchase-wizard` 不吃 from_handcard 參數** | 綠 | 跳轉入口在，帶入未串到 used-purchase |
| RS06-02 確認收購觸發後續 | `/sales/inventory/used-purchase` | ✅ | wizard/detail「確認收購」→`confirmDirectBuyAction`→`triggerUsedCarAcquisition`：①建 `used_car_inventory`(pending_recon) ②建 PD-UC `repair_orders` 整備工單 ③回寫 recon_workorder_id | 綠 | list 最紮實的跨模組鏈，全接 DB |
| RS_EX1-01 新車交車→自動進招攬清單 | `/sales/insurance` | ⚠️ | `@/domain/sales-insurance` 真查 `insurance_policies`/`insurance_attempts`；**但「交車完成自動 insert 招攬線索」的觸發鏈未見**（交車 after() 只啟保固） | 綠 | 招攬工作台真資料，交車→招攬自動鏈缺 |
| RS_EX1-02 續保到期提醒（30/90/180分級） | `/sales/insurance` | ⚠️ | 真查到期：`expiring_30_days` + buckets `0-30/31-60/61-90`（真 query end_date）；**無 180 天分級**、**無主動推送**（僅看板呈現，markReminded 未實作） | 綠 | 30/90 分級真做，180 + 自動提醒缺 |

## 本輪修了哪些 bug

**無**。15/15 路由 live 全綠、無 render crash / 型別錯 / 天條違規，無需修改任何 code。
天條檢查：`grep @/lib/supabase` 掃 sales/{delivery,reception,showroom,quote,orders,insurance,inventory/used-purchase} = **0 hit**（全合規走 domain helper）。
（`sales/delivery/page.tsx` import `@/lib/deliveries` 是 server-only domain helper，非 UI 直連 supabase，合規。）

## verify 腳本 pass 數

`node scripts/verify-sales-reception-scenarios.mjs` → **15/15 綠**。

## 評級分佈

- ✅ 9：RS01-01, RS01-02, RS01-03, RS01-05, RS02-03, RS03A-01, RS03B-01, RS04-01, RS06-02
- ⚠️ 13：RS01-04, RS01-06, RS02-01, RS02-02, RS02-04, RS03A-02, RS04-02, RS04-04, RS05-01, RS05-02, RS06-01, RS_EX1-01, RS_EX1-02
- ❌ 2：RS04-03（成交三方簽名完全未實作）；外加報價→訂單無自動轉換函式

## 跨模組缺口總表（給回填 Word 用）

1. **試駕結果回寫手卡**（RS02-04）：completeTestDrive 沒 UPDATE sales_handcards.trial_status，UI banner 誇大
2. **新車 SOLD 同步**（RS04-04）：訂單交車只同步中古車，新車 new_car_inventory.status 不變
3. **成交電子簽名**（RS04-03）：order/quote 無 SignatureCanvas（試乘有，可複用）
4. **折扣超授權審核**（RS04-02）：審批流有但無 discount threshold 觸發判斷
5. **PDI 硬阻擋交車**（RS05-01）：有狀態追蹤、無強制 pdi_complete→delivered guard
6. **交車→售後檔/D+3**（RS05-02）：只啟保固，售後建檔 + D+3 回訪排程缺
7. **D+3/D+7 電訪排程**（RS01-06）：只存 followup_date 欄位，未自動建 call_task
8. **交車→保險招攬自動進清單**（RS_EX1-01）：招攬台真資料，自動觸發鏈缺
9. **續保 180 天分級 + 主動推送**（RS_EX1-02）：只到 90 天 buckets、純看板無推送
10. **RS02 從手卡帶入 + 試乘車防衝突**（RS02-01/02）：跳轉不帶參數、建單不防雙開
11. **配車 RESERVED 防雙開報價硬鎖**（RS03A-02）：有 UI gate 無 server-side 鎖
12. **RS06 從手卡帶入 used-purchase**（RS06-01）：跳轉入口指向錯頁、wizard 不吃 from_handcard
