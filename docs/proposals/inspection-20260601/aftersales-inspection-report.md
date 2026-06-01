# ③ 售後修護模組 — Phase 0 路徑巡檢 + Phase 1 版本差異分析報告

**巡檢日期**：2026-06-01　｜　**範圍**：`src/app/(workspace)/parts/aftersales/*` + `src/domain/*`
**輸入**：HTML異動說明 v1（修改 7 頁 + 新增 2 頁）、概念說明 v1、場景驗證清單 v2（44 場景）
**性質**：唯讀巡檢，無任何 code / DDL 變更
**真庫**：Supabase `bykvtcptbirpxyqkfwfl`（demo 資料在 `brand_id='indian'`）

> **一句話結論**：售後是目前完成度最高的模組之一 —— **全模組零 Stitch 假頁、零天條違規（100% 走 `@/domain/*` helper）**，底層 DB schema 與資料都到位（indian 資料豐富）。異動 v1 的本質是「把已長好的骨架接上真實業務細節」，多數是**欄位補強 / UI 加區塊**而非從零打造。最大的真缺口是 **04B 快速報價、07B 服務套餐設定兩支全新頁**（但 G4 已先建好底層 `service_packages`/`labor_rates` 表 + helper，可直接複用），以及**電子簽名目前是文字 input 非真 canvas**、**庫存三色 + 跨店查詢未實作**、**工單缺 priority 欄位**。

---

## 一、修改過程（巡檢方法）

1. 讀 HTML 異動說明 v1 + 概念說明 v1，抽出 9 支頁面的異動本質與後端串接點。
2. 解析場景驗證清單 docx → 44 場景（SA01-01 ~ SA11-03，跨 9 個頁面群組）。
3. 列出 `parts/aftersales/*` 全部 79 支檔案，逐路由判資料來源。
4. 真庫驗證：38 張相關表存在；逐表查 indian 資料量與關鍵欄位 schema。
5. 讀關鍵實作檔（RO confirm/detail、pre-inspection wizard、checkout wizard、lines view、dispatch、pickup-notify）確認異動點現狀。
6. 44 場景逐條重評（✅ 已支援 / 🟡 部分 / ❌ 缺）+ 證據（file:line / 真庫）。

**關鍵全域發現（影響整份評估）**：

| 檢查項 | 結果 | 意義 |
|---|---|---|
| `loadStitchBody` 在 aftersales | **0 處** | 沒有任何 Stitch 假頁，全是真 React 實作 |
| `@/lib/supabase` 直連違規 | **0 處** | 100% 走 domain helper，符合天條 |
| 相關 domain helper | **40+ 支** | repair-orders / pre-inspections / ro-checkouts / service-packages / labor 全有 |
| indian demo 資料 | **充足** | RO 151、RO lines 259、pre-inspect 8、appointments 94、addons 19… |

---

## 二、路徑巡檢 + 對映表

異動文件用「03_售後修護」HTML 目錄命名；repo 實作在 `parts/aftersales/*`。對映如下（資料來源全部 = `@/domain/*` 真 helper，故下表略「Stitch 假頁」欄）：

| 異動頁（HTML） | repo 路由 | detail/board 元件 | DB 表 | 完成度 |
|---|---|---|---|---|
| 02_正式工單RO | `repair-orders/new`、`repair-orders/[id]` | `repair-order-confirm-view.tsx`、`repair-order-detail-view.tsx` | `repair_orders` (indian 151) | 🟡 骨架完整，缺 priority/進度條通知/返工偵測 |
| 04_預檢單_SA環檢 | `pre-inspections`、`/[id]` | `pre-inspection-wizard.tsx` | `pre_inspections` (indian 8) | 🟡 wizard 5 步完整，缺車牌查詢/canvas/特殊標籤帶出 |
| 04_預檢單_RO串接 | `pre-inspections`（同 wizard，mode 切換）、`ro-handoff` | `pre-inspection-wizard.tsx`、`handoff-detail-view.tsx` | `pre_inspections` | 🟡 串接機制有（`repair_order_id`/`transferred_at`），缺 Quick Quote 入口 |
| 03_維修項目零件明細 | `repair-orders/[id]/lines` | `repair-order-lines-view.tsx` | `repair_order_lines` (indian 259) | 🟡 有零件 CRUD + 兩色庫存提示，缺三色 + 跨店查詢 |
| 07_售後管理模組 | `management/dispatch`、`management/bays` | `dispatch-dashboard.tsx`、`bays-dashboard.tsx` | `service_bays`(16)、`aftersales_technicians`(13) | 🟡 派工/工位看板有，缺技師缺席批次重排 |
| 08_結帳收款 | `checkout`、`/[id]` | `ro-checkout-wizard.tsx` | `ro_checkouts` (indian 3) | 🟡 三步結帳有 + 簽名(jsonb)，缺委託取車/canvas/下次保養 |
| 11_取車通知設定 | `settings/pickup-notify`、`pickup-notifications` | `pickup-notify-board.tsx`、`pickup-notify-form.tsx` | `pickup_notification_schedules`(4)、`_templates` | 🟡 templates+schedules CRUD 有（trigger_event 機制在），但只圍繞「完工取車」單節點，需擴 5 節點 |
| **04B_快速報價查詢**（新） | **不存在** | — | `service_packages`(indian 3)、`labor_rates`(indian 6) ✅已建 | ❌ 全新頁，**底層表+helper已備** |
| **07B_服務套餐與費率設定**（新） | **不存在** | — | 同上 | ❌ 全新頁，helper 僅 list 無 CRUD，需補 |

**未列入異動但已實作的售後頁（佐證模組成熟度）**：appointments（預約看板 board+detail+new）、final-inspections（竣工複檢 wizard）、followups（D+3 追蹤）、repair-order-addons（追加項）、customer-tags（標籤主檔）、management/staff、management/permissions、management/ro-numbering、management/env-check-items、management/discounts、workorders/pdi、workorders/recon、ro-search。

**關鍵 schema 對照（異動要的欄位 vs 真庫）**：

- `repair_orders`：有 `prefix_p1`/`prefix_p2`（業務類型+付款性質）、`fee_allocation`、`warranty_status_snapshot`(jsonb)、`status`、`lead_technician_id`、`related_new_car_id`/`related_used_car_id`。**缺 `priority` 欄位**（SA03-02 需要）。返工偵測無欄位（可用 query 比對 vehicle_id+30天，免加欄）。
- `pre_inspections`：有 `repair_order_id`/`transferred_at`/`signed_at`、`metadata`(jsonb，現存 `sig_sa`/`sig_customer` 文字)。簽名走 metadata 文字，**非 typed `customer_sig_1`**（異動文件提的 `inspections.customer_sig_1` 名稱對不上，實作放 metadata，合理）。
- `ro_checkouts`：有 `customer_signature`(jsonb)、`fee_summary`(jsonb)、`payment`(jsonb)、`invoice`(jsonb)。**無委託取車欄位**（可進 metadata）、**無下次保養**（需寫 customer_vehicles）。
- `service_packages`：完整（`pkg_type`/`mileage_interval`/`items` jsonb/`list_price`/`valid_from`/`valid_to`/`is_active`）→ 直接支撐 07B 三類套餐 + 有效期自動停用。
- `labor_rates`：有 `biz_type`/`rate_per_lu`/`is_active` → 支撐工時費率表。indian 6 筆。**注意：`labor_rates` 只有 indian 無 ducati 資料**，07B「DUCATI/Indian 分開」需補 ducati seed（非本巡檢動）。

---

## 三、44 場景差異分析表

評級：✅ 已支援｜🟡 部分/骨架在缺細節｜❌ 缺。證據 = file:line 或真庫。

### 01 預約管理看板（本次未修改 HTML，但場景清單列入）

| 場景 | 評 | 落差 | 證據 |
|---|---|---|---|
| SA01-01 今日預約總覽 | ✅ | board 已串 `@/domain/appointments`，真庫 indian 94 筆 | `appointments/_components/appointments-board.tsx`；`appointments` 表 |
| SA01-02 今日即時插單 | 🟡 | 有 new 建立，是否「立即進廠跳過時間」需確認 UI flag | `appointments/new/page.tsx` |
| SA01-03 同客戶多工單 | 🟡 | 以 RO/appointment 為主軸（非 customer），結構支援；UI 是否提示「MN/RP 分開」未驗 | `repair_orders` 以 ro_code 為主鍵 |
| SA01-04 取消/改期+原因 | 🟡 | board 有狀態，取消原因必填代碼需確認 | appointments `status`/`notes` 欄 |
| SA01-05 預約確認提醒 | ❌ | 無前一天掃描提醒機制 | 無對應 cron/helper |

### 04 預檢單（SA環檢 + RO串接）

| 場景 | 評 | 落差 | 證據 |
|---|---|---|---|
| SA02-01 掃車牌帶人車資料 | ❌ | wizard 車牌為手填 `<input>`，無 `GET vehicles?plate` 查詢按鈕帶出 | `pre-inspection-wizard.tsx:596` 純 input |
| SA02-02 新客戶快速建檔引導 | ❌ | 查無車牌時無建檔 Modal 引導 | 同上，無 lookup 分支 |
| SA02-03 電子簽名 canvas | 🟡→❌ | **簽名是文字 `<input>` 非 canvas**（Step5Sign body line37/59 為 input）；有存（metadata.sig_*）但非繪製、無「簽名後鎖定車況」 | `pre-inspection-wizard.tsx:1256` Step5Sign 用 `<input>` |
| SA02-04 特殊標籤帶出 | ❌ | 標籤未從 `customer_tags`(indian 27) 依 customer_id 動態帶、無頂部紅色警示框 | wizard 無 tag fetch |
| SA02-05 預檢→RO 完整帶入 | ✅ | 真串接：`pre_inspections.repair_order_id`/`transferred_at`，confirm-view 吃 draft.warranty 等 | `repair-order-confirm-view.tsx:34,92`；schema |

### 02 正式工單RO（進度條）

| 場景 | 評 | 落差 | 證據 |
|---|---|---|---|
| SA03-01 業務類型+付款性質 | ✅ | P1/P2 選擇器完整，PD→自動鎖 IN，confirm 真寫入；保固預設 WC+WR | `repair-order-confirm-view.tsx:35-55,281-327` |
| SA03-02 工單優先級 | ❌ | **`repair_orders` 無 priority 欄位**；confirm/detail 無優先級選擇器；派工看板無 priority 排序 | schema 無 `priority` 欄 |
| SA03-03 施工進度條+通知節點 | 🟡 | detail 有 status 推進（`updateRepairOrderStatusAction` + 4 段進度視覺 line420-433），但**各節點旁無「通知客戶」按鈕**、無通知記錄 | `repair-order-detail-view.tsx:97-108,420-433` |
| SA03-04 返工 RP-FR 偵測 | ❌ | confirm 無「30天同類型比對」query、無返工橫幅 | confirm-view 無 rework 邏輯 |
| SA03-05 保固期限驗證 | 🟡 | 有 `warranty_status_snapshot` + amber 提示（draft.warranty.is_valid line202-209），但**無「過保需主管授權」阻擋流程** | `repair-order-confirm-view.tsx:202-209` |

### 04B 快速報價查詢（新增頁）

| 場景 | 評 | 落差 | 證據 |
|---|---|---|---|
| SA04B-01 套餐快查 | ❌ | 頁面不存在；但 `listServicePackages` helper + `service_packages`(indian 3) 已備 | `src/domain/service-packages.ts:83` |
| SA04B-02 三種結果（同意/暫存/拒絕） | ❌ | 無頁、無 apply-to-inspection / pending-items 串接 | — |
| SA04B-03 零件+工時快查 | ❌ | 無頁；零件需接 `item_vehicle_compatibility`/庫存，工時接 `listLaborRates`(已備) | `service-packages.ts:110` |

### 07B 服務套餐與費率設定（新增頁）

| 場景 | 評 | 落差 | 證據 |
|---|---|---|---|
| SA07B-01 套餐主檔 CRUD | ❌ | 無頁；`service_packages` 表完整（三類 pkg_type + valid_to 有效期自停），但 helper **只 list 無 create/update/setActive** | `service-packages.ts`（無 CRUD）；表 schema |
| SA07B-02 工時費率表 | ❌ | 無頁；`labor_rates` 表有（biz_type/rate_per_lu），**ducati 無資料需補 seed**；無稽核日誌表 | `labor_rates` 真庫僅 indian 6 |

### 03 維修項目零件明細 / 04 追加項目

| 場景 | 評 | 落差 | 證據 |
|---|---|---|---|
| SA05-01 零件庫存即時查詢 | 🟡 | lines-view 有零件 CRUD + 庫存提示，但**兩色（✓/⚠️）非三色、無「缺料紅+跨店按鈕」、無 all_stores 查詢** | `repair-order-lines-view.tsx:860,906,595` |
| SA05-02 追加項通知閉環 | 🟡 | `repair_order_addons`(indian 19) + addons board/detail 有；安全等級「強制通知」與系統提醒 SA 需確認 | `repair-order-addons` 表 + `addons/*` |
| SA05-03 拒絕追加→人車待處理 | ❌ | 無 `vehicle_pending_items` 表、無下次回廠自動帶出 | 真庫無 pending_items 表 |
| SA05-04 超時費用處理 | ❌ | 無「工時>預估×150% 提醒主管」機制 | 無對應 helper |

### 05 增項閉環 / 06 竣工複檢

| 場景 | 評 | 落差 | 證據 |
|---|---|---|---|
| SA06-01 D+3/D+10 追蹤 | 🟡 | followups 模組存在（`followup_cases`/`followup_events`），D+3/D+10 計時器是否真算需確認 | `followups/*` + `followup_*` 表 |
| SA07-01 複檢職級授權 | 🟡 | final-inspections wizard 有；**後端「施工 Tech 不可複檢自己」雙重驗證**需確認 | `final-inspection-wizard.tsx` |
| SA07-02 複檢不通過退回重工 | 🟡 | wizard 是否有「不通過→改回施工中+必填原因」需驗 | `final-inspections/*` |
| SA07-03 WC 舊件自動登錄 | 🟡 | `parts-warranty-staging.ts` helper 存在；複檢通過是否自動觸發 warranty_parts 需驗 | `src/domain/parts-warranty-staging.ts` |
| SA07-04 等待原廠確認狀態 | ❌📌 | 無 `waiting_oem_approval` 狀態（文件標「待與海德生洽談」） | RO status 無此值 |

### 08 結帳收款

| 場景 | 評 | 落差 | 證據 |
|---|---|---|---|
| SA08-01 費用明細自動帶入 | 🟡 | checkout 有 `fee_summary`(jsonb)，是否從工單真實算（vs 假值）需驗；折扣 SA 唯讀未確認 | `ro_checkouts.fee_summary`；wizard |
| SA08-02 第二次簽名 canvas | 🟡→❌ | 有 sign step + `customer_signature`(jsonb) 存，但**SignStep 是 onClick 觸發非 canvas 繪製**；簽後鎖費用需確認 | `ro-checkout-wizard.tsx:126,616-639` onClick |
| SA08-03 委託取車 | ❌ | 無「本人/委託」選項、無取車人欄位、無委託人簽名 | `ro_checkouts` 無委託欄位 |
| SA08-04 下次保養提醒 | ❌ | 結帳後無「依里程算下次回廠」寫入 customer_vehicles | wizard 無 next-service step |
| SA08-05 電子發票 | ❌📌 | `invoice`(jsonb) 為展示，無政府 API（文件標第四波） | `ro_checkouts.invoice` |
| SA08-06 工單關閉連鎖動作 | 🟡 | 有 close/status；人車履歷/CRM01B/D+3 自動更新的原子連鎖需驗 | checkout wizard |

### PDI整備（本次未修改，場景清單列入）

| 場景 | 評 | 落差 | 證據 |
|---|---|---|---|
| SA09-01 到港自動觸發 PDI | 🟡 | `workorders/pdi`+`pdi-workorder.ts`+`vehicle_arrivals` 表有；到港→PDI 自動鏈需驗（vehicle-import 模組相關） | `workorders/pdi/*`、`vehicle_arrivals` |
| SA09-02 中古車整備工單 | 🟡 | `workorders/recon`+`recon-workorder.ts` 有；RS06→PD-UC 自動鏈需驗 | `workorders/recon/*` |

### 07 車間管理

| 場景 | 評 | 落差 | 證據 |
|---|---|---|---|
| SA10-01 工位看板即時狀態 | 🟡 | bays-dashboard + `service_bays`(16) + technicians(`started_at`/計時欄位) 有；計時是否即時算 vs 假值需驗 | `bays-dashboard.tsx`、`aftersales_technicians` |
| SA10-02 技師缺席批次重排 | ❌ | dispatch-dashboard **無「標記缺席」/batch-assign** | `dispatch-dashboard.tsx`（grep 0 hit） |
| SA10-03 NADA 人效統計 | 🟡 | technicians 有 sold/actual/available_minutes 欄位，可算三指標；是否真算 vs 假值需驗 | `aftersales_technicians` schema |
| SA10-04 工單前綴碼設定 | ✅ | `management/ro-numbering` 已實作；RO 有 prefix_p1/p2 + sequence_no | `ro-numbering/*`；`repair_orders` schema |

### 查詢與設定（本次未修改，列入）

| 場景 | 評 | 落差 | 證據 |
|---|---|---|---|
| SA11-01 人車檔案 | ✅ | `customers/[id]` detail + `customer_vehicles`(indian 80) 真資料 | `customers/[id]/_components/customer-detail-view.tsx` |
| SA11-02 工單查詢+月底對帳 | 🟡 | `ro-search` 有；月底「費用 vs 出庫對帳」報表需確認 | `ro-search/*` |
| SA11-03 客戶標籤主管設定 | ✅ | `management/customer-tags` board + `customer_tags`(indian 27) CRUD | `management/customer-tags/*` |

**統計**：✅ 6｜🟡 22｜❌ 16（共 44）。多數 🟡 = 「骨架/表都在，缺最後一哩業務細節」，非從零開發。

---

## 四、Phase 2 工作包

依「可複用程度 + 業務優先級（文件 🔴/🟡/🟢）」分包。**強調 04B/07B 雖是新頁但底層 `service_packages`/`labor_rates` 表 + `service-packages.ts` helper 由 G4 已建好，可直接複用、不用碰 schema。**

### 包 A — 服務套餐生態（04B + 07B，最大價值、底層已備）🔴
- **A1 · 07B 服務套餐與費率設定頁**（`management/service-packages`，走 SOP list+detail design pattern）
  - 複用：`service_packages`/`labor_rates` 表（不動 schema）、`service-packages.ts` 既有 `listServicePackages`/`listLaborRates`
  - 需補：`service-packages.ts` 加 `create/update/setActive/delete` CRUD（Result 型別）；labor_rates inline edit 儲存
  - Tab A 套餐主檔（三類 pkg_type）、Tab B 工時費率表、Tab C 稽核日誌（需新 audit 表或用 metadata）
  - 補 ducati labor_rates seed（目前僅 indian 6）
- **A2 · 04B 快速報價查詢頁**（`quick-quote` 或 `repair-orders/quick-quote`）
  - Tab A 套餐查（吃 A1 helper，依車型+里程建議）、Tab B 零件快查（接庫存+`item_vehicle_compatibility`）、Tab C 工時費率
  - 三結果按鈕：同意→帶入預檢單 Tab4 / 暫存 / 拒絕→寫 pending_items（依賴包 D 的 pending_items 表）

### 包 B — 工單核心強化（02 RO）🔴/🟡
- **B1 · 工單優先級**：`repair_orders` 加 `priority` 欄位（🔴/🟡/🟢）；confirm/detail 加選擇器；dispatch 看板依 priority 排序置頂
- **B2 · 進度條通知節點**：detail 各 status 節點旁加「通知客戶」按鈕（人工發，記錄通知時間，不自動外發）
- **B3 · 返工偵測**：confirm 前查 `repair_orders` 同 vehicle_id + 同 prefix_p1 + 30 天 → 橫幅提示 → 選返工自動 P2=FR/IN
- **B4 · 保固過期阻擋**：WC + 過保 → 紅警示 + 主管授權才可繼續（現只有 amber 提示不阻擋）

### 包 C — 電子簽名升級（跨 04/08，文件標⚠️測試前必須）🔴
- **C1 · 真 canvas 簽名元件**（signature_pad）取代現有文字 `<input>`/onClick：pre-inspection Step5（SA+車主第一次）、checkout Step2（車主第二次）
- **C2 · 簽名後鎖定**：簽完鎖車況描述 / 費用明細不可改
- **C3 · 圖像存後端**（base64 進既有 metadata/customer_signature jsonb，無需加 typed 欄）

### 包 D — 零件 / 庫存 / 追加閉環 🔴/🟡
- **D1 · 庫存三色 + 跨店查詢**：lines-view 兩色→三色（綠足/橙低/紅缺），缺料顯示「查跨店庫存」按鈕（all_stores query + transfer-request）
- **D2 · 拒絕追加→人車待處理**：新建 `vehicle_pending_items` 表；下次預檢自動帶出
- **D3 · 04 預檢車牌查詢 + 新客建檔引導**：Tab1 加 `GET vehicles?plate` 查詢按鈕 + 查無建檔 Modal + 特殊標籤紅框（接 `customer_tags`）

### 包 E — 車間管理 🟡
- **E1 · 技師缺席批次重排**：dispatch 加「標記缺席」→ 列該技師工單 → 選接替 → batch-assign → 受影響客戶進 SA 待辦
- **E2 · 工位/NADA 真算驗證**：確認 bays 計時器與三指標吃真資料（technicians 欄位已備）非假值

### 包 F — 結帳 / 通知 🟢
- **F1 · 委託取車授權**：checkout 加 Step1B（本人/委託 + 取車人欄位 + 委託簽名，存 metadata）
- **F2 · 下次保養提醒**：結帳後依里程算 → 寫 customer_vehicles → 同步 CRM01B
- **F3 · 11 取車通知擴 5 節點**：現有 schedules CRUD 擴 trigger_event 到 5 節點（開始維修/安全疑慮強制/一般追加/待料/完工）

### 待釐清（文件標 📌，先不做）
- SA07-04 等待原廠確認狀態（待海德生洽談）
- SA08-05 電子發票（第四波模組）

---

## 五、給 Ming 拍板的選項

1. **優先序**：建議 **包 A（套餐生態）先做** —— 底層 G4 已備、是「整個售後最大隱形缺口」（SA04B-01 文件原話）、且 07B→04B→預檢單→工單資料流一通就盤活半個模組。其次 **包 C（簽名）+ 包 B（工單強化）** 因文件多處標⚠️測試前必須。

2. **schema 變更範圍**（需你點頭才動 DDL）：
   - 必加：`repair_orders.priority`（包 B1）、新表 `vehicle_pending_items`（包 D2）、可能新 `service_package_audit_logs`（07B Tab C，或用 metadata 省一張表）
   - 補 seed：`labor_rates` 的 ducati 資料（07B 雙品牌費率表）
   - 其餘（簽名圖像、委託取車、下次保養）全進既有 jsonb metadata，**不加 typed 欄**

3. **04B/07B 路由命名**：07B 屬「主管後台設定」建議放 `management/service-packages`（與 dispatch/bays 並列）；04B 屬「SA 接待工具」建議放 `repair-orders/quick-quote` 或獨立 `quick-quote`。請你定。

4. **要不要把「本次未修改但場景列入」的 PDI/竣工複檢/工位 NADA 的『真算 vs 假值』也納入這輪驗證**？這些評 🟡 是因為「表/頁都在，但沒實跑確認數字是真算還假寫」—— 要徹底排除需起站手測，可獨立一個驗證小包。

---

*巡檢人：repo 巡檢 agent｜全程唯讀，無 code/DDL 變更*
