# ④ 庫存管理模組 — 巡檢報告（Phase 0 路徑巡檢 + Phase 1 版本差異分析）

**日期：** 2026-06-01　｜　**巡檢員：** Claude（唯讀）　｜　**模組：** ④ 庫存管理（repo = `parts/*`）
**輸入：** `docs/20260601/08_庫存管理模組_HTML異動檔案包/`（HTML 異動說明 v1 + 概念說明 v1 + 7 改 1 新 HTML）、`07_DealerOS_場景驗證清單_庫存管理模組_v1.docx`（27 場景）
**真庫：** Supabase `bykvtcptbirpxyqkfwfl`，demo 資料 `brand_id='indian'`（已用 `execute_sql` 實查，非靠 migration 推測）

---

## 摘要（給 Ming 三句話）

1. **repo 比設計稿假設的成熟非常多。** 設計稿（老闆 SA 端的靜態假資料 HTML）把整個模組當「儲存只跳 Toast、資料寫死」在評；但 repo 端 `parts/*` 的 **8 條核心路由全部走真 `@/domain/*` helper + 真表 + indian 真 seed**（suppliers 20 / stock_items 220 / stock_issues 277 / thresholds 37 / receipts 39 / counts 11 / transfers 17 / warranty_claims 12 …）。老闆評的 ❌「儲存只跳 Toast」絕大多數**在 repo 端已是 ✅ 真寫入**。
2. **真正的落差不是「沒接後端」，而是「v1 設計稿新加的 7 項增強功能 repo 還沒做」**：PDC 截單倒計時、再訂購點計算輔助器、驗收差異三入口（短收/拒收拍照/CSV 批匯）、待備料工單橫幅+工單號掃描帶入、相機條碼掃描、暫存倉**庫位層級**+RO 觸發舊件入庫、供應商**績效評分**（準時率/短收率/評等）。
3. **唯一「需新建頁面」是 10B 告警儀表板**（跨告警類型的每日總覽 landing），repo 目前沒有對應彙整頁；其底層資料（thresholds / workorder_loop / PO eta / warranty）多半已存在，屬「組裝頁」而非「從零造資料」。

---

## 一、修改過程（設計稿 7 改 + 10B 新增逐條）

設計稿 HTML 異動本質 = 在老闆端的假資料 HTML 上「插入新功能區塊 / 替換假按鈕」。逐條本質：

| # | 設計頁 | 異動類型 | 修改本質（設計稿要什麼） |
|---|--------|---------|----------------------------|
| 1 | `10_預警告警_庫存水位設定` | 🔄替換 | 插入**再訂購點計算輔助器**（日均消耗 × 前置天數 + 安全庫存 → 一鍵套用）＋**可用庫存公式說明**（帳面 − 預留 − 在途出 + 在途入）。Phase1 手動輸入、Phase2 歷史自動。 |
| 2 | `04_採購管理_商品採購` | 🔄替換 | 插入 **PDC 截單倒計時**（DUCATI 17:00 / 代理 15:00），不到 1hr 紅字、截單後顯示加急費；「緊急送單」按鈕。 |
| 3 | `05_入庫管理_採購入庫` | 🔄替換 | 插入**驗收差異三入口**：📉短收 Modal → 採退流程；🔴損壞拒收 Modal（**拍照上傳**）→ 拒收憑證；📋**CSV 批次匯入**比對原廠發貨清單。差異記錄 = 供應商績效來源。 |
| 4 | `06_出庫管理_維修領料` | 🔄替換 | 插入**待備料工單橫幅**（「共 N 張需備料」，緊急紅標，「備料→」直接進出庫）＋**工單號快速帶入**（鍵盤/掃描槍 → Enter 帶出需求零件清單）。 |
| 5 | `08_盤點管理_盤點處理` | 🔄替換 | **替換假掃描按鈕**為**真相機條碼掃描**（getUserMedia 後鏡頭、500ms 截圖、BarcodeDetector/ZXing、無相機降級鍵盤）。 |
| 6 | `11_保固索賠_暫存倉設定` | 🔄替換 | 插入**暫存倉庫位層級設定**（WC-A01~A10、WC保固區/AC事故區分區、各庫位即時數量）＋**RO 工單觸發舊件入庫**（複檢通過清單 → 選庫位 → 確認入庫 → 索賠狀態→待申報）。 |
| 7 | `02_基礎設定_供應商資訊` | 🔄替換 | 插入**供應商績效看板**（交貨準時率/平均前置天數/短收率/退貨率/綜合評分/採購建議；A+/A/B/C 評等；初期假資料、由入庫差異記錄累積）。 |
| 8 | `10B_告警儀表板_v1` | 🆕新增 | 全新 landing：4 KPI 卡（低於最小庫存/低於再訂購點/工單待備料/批號30天到期）＋5 Tab（緊急/預警/待備料/批號到期/採購逾期）＋標題列 PDC 倒計時。設為庫存模組預設首頁。 |

---

## 二、路徑巡檢 + 設計頁 ↔ repo 對映表

**全部 8 條核心路由的 `page.tsx` 均 import `@/domain/*` helper（無一支走 `loadStitchBody`）→ 資料來源皆「真」。**

| 設計頁 | repo 路由 | 資料來源 | route 狀態 | 評級 | 證據 |
|--------|-----------|---------|-----------|------|------|
| 02 供應商資訊 | `parts/setup/suppliers` (+`[id]`) | `@/domain/suppliers` ✅真 | 列表+detail+new 完整 | 🟡 | base 完整、**績效評分欄缺**（`getSupplierMetrics` 只算 PO 件數/金額/合作天數，無準時率/短收率/評等）。`src/domain/suppliers.ts:573`；`suppliers/[id]/_components/supplier-detail-view.tsx:837`（perf tab 存在但「尚無績效資料」placeholder） |
| 04 商品採購 | `parts/purchase/orders` (+`[id]`,`new`) | `@/domain/orders` ✅真 | wizard 完整 | 🟡 | PO 真寫入、有 `eta_date`/`status`；**PDC 截單倒計時/緊急送單未做**（全 repo grep 無「截單/PDC/cutoff/緊急送單」於採購頁）。`purchase_orders` 24 筆(indian 12) |
| 05 採購入庫 | `parts/receipt/po-grn` (+`[id]`,`new`) | `@/domain/receipts` ✅真 | GRN 完整 | 🟡 | 入庫真寫入、有 void/notes；**三入口驗收差異（短收/拒收拍照/CSV批匯）未做**：`stock_receipt_lines` 只有 `qty_received`，無 `qty_ordered`/`discrepancy`/`photo` 欄；board 僅 notes placeholder。`stock_receipts` 74(indian 39) |
| 06 維修領料 | `parts/issue/repair-pick` (+`[id]`,`new`) | `@/domain/issues` ✅真 | RO 串接出庫完整 | 🟡 | 已「依 RO 工單查詢、倉管正式出庫、觸發告警」(`repair-pick-board.tsx:221-234`)；**待備料橫幅 / 工單號掃描帶入 UI 未做**。`stock_issues` 279(indian 277) |
| 08 盤點處理 | `parts/count/sessions` (+`[id]`,`new`)；計畫`count/plans`；報損溢`count/loss-overflow` | `@/domain/count` / `loss-overflow` ✅真 | 計畫+執行+報損溢三頁齊 | 🟡 | 盤點真寫入、`inventory_count_lines` 有 `qty_first_count`/`qty_second_count`/`variance`（二盤欄位**已存在**）；**相機條碼掃描未做**（grep 無 getUserMedia/BarcodeDetector）；二盤「不同人」後端強制**待查**。counts 14(indian 11)/plans 16(indian 8) |
| 10 庫存水位設定 | `parts/alerts/thresholds` (+`[id]`) | `@/domain/parts-thresholds`+`alerts` ✅真 | inline-edit + 90天曲線 | 🟡 | `stock_thresholds` 有 `reorder_point`/`safety_stock`/`max_stock`/`abc_class`/`alert_priority`，可 inline 編輯；**再訂購點計算輔助器（日均消耗×前置+安全）未做**，且表**無 `avg_daily_consumption`/`lead_time_days` 欄**。thresholds 67(indian 37) |
| 11 保固暫存倉 | `parts/warranty/staging-warehouse`；舊件`warranty/used-parts`；費用`warranty/cost-recovery`；RO串接`warranty/ro-link` | `@/domain/parts-warranty-staging`/`warranty` ✅真 | 暫存倉標示+舊件清單+費用回收齊 | 🟡 | 倉「標示為暫存隔離倉」+庫齡視覺化已做；舊件 `parts_warranty_used_parts_items` 有 `ro_no`/`inbound_date`/`status`/`barcode`；**但無 `storage_location`/`bin_id`（庫位層級缺）**；**RO 觸發舊件入庫 pending_storage 流程未做**。used_parts 6(indian 2)/claims 25(indian 12) |
| **10B 告警儀表板** | **（無對映 landing）** | — | **需新建** | ❌ | `parts/overview/` 只有 `flow`（流程圖），`parts/page.tsx` 是圖卡導覽首頁、非告警彙整。`alerts/*` 下有 thresholds/escalation/rules/work-order-loop 但**無跨類型 KPI 總覽頁**。`alert_events` 0 筆、`alert_rules` 5(indian 0) |

**額外發現（設計稿 27 場景提及、repo 已有但設計 HTML 未列的頁）：**
`parts/purchase/replenishment`(補貨計畫)・`requisitions`(需求處理)・`returns`(採購退貨)・`alerts/escalation`(告警階層,真表 `parts_alert_escalation_rules`)・`alerts/work-order-loop`(增項閉環,真表 `parts_workorder_loop_entries` 31筆/indian16,board 有「✓解除待料」動作)・`operations/balance`(庫存查詢,`v_stock_balances` view)・`operations/consignment`(寄存,`consignment_stocks` 4筆)・`operations/adjust`(備件調整,`inventory_adjustments` 58筆)・`analytics/abc`(`abc_classification_results` 30筆)・`analytics/stale`(`v_stale_inventory`)・`analytics/turnover`(`v_inventory_turnover`)・`setup/contracts`(採購合約)・`setup/compatibility`(適配設定)・`issue/transfer-out`+`operations/transfers-in-transit`(調撥+在途)。**這些在設計稿被評 ❌/⚠️「假資料/只Toast」，但 repo 端皆走真 helper + 真表/視圖。**

---

## 三、27 場景差異分析表

評級：✅repo 真支撐｜🟡 base 已實作、設計稿新增的增強功能未做｜❌ repo 確實缺。

| 場景 | 角色/頁 | 老闆原評 | repo 重評 | 落差/證據 |
|------|---------|---------|-----------|-----------|
| INV01-01 基礎設定地基 | 組織/倉儲/商品/供應商 | ❌只Toast | ✅ | 全套真表+helper：org/warehouse-arch/warehouse-bins/items(220)/suppliers(20) 皆真寫入。`setup/*` 各 board 走 `@/domain/*` |
| INV01-02 供應商績效 | 02供應商 | ⚠️假資料 | 🟡 | 供應商真寫入；**績效評分欄缺**（無準時率/短收率/評等，`getSupplierMetrics` 只算 PO 統計）。需差異記錄累積後算 |
| INV01-03 適配設定 | 03適配 | ❌只Toast | ✅ | `parts/setup/compatibility`+`@/domain/compatibility` 真寫入（設計 HTML 此頁未在 8 改內，repo 已先做） |
| INV02-01 缺料自動補貨 | 04需求處理 | ⚠️框架未串 | 🟡 | `purchase/requisitions`(需求)+`replenishment`(補貨計畫) 真表存在；**「出庫後自動比對水位→產生 demand」事件鏈未串** |
| INV02-02 PDC緊急補貨 | 04商品採購 | ⚠️只Toast | 🟡 | PO 真寫入；**PDC 截單倒計時/緊急單標記未做**（grep 無） |
| INV02-03 採購合約展延 | 02採購合約 | ⚠️只Toast | 🟡 | `setup/contracts`+`@/domain/contracts` 真寫入、有到期欄；**展延工作流/到期 cron 提醒未做** |
| INV02-04 再訂購點計算 | 10水位設定 | ⚠️套用只Toast | 🟡 | thresholds 各欄 inline-edit 真存；**計算輔助器未做**、表無日均消耗/前置天數欄 |
| INV03-01 到貨驗收差異 | 05採購入庫 | ⚠️只Toast | 🟡 | GRN 真寫入；**三入口差異(短收/拒收拍照/CSV)未做**，line 表無差異欄 |
| INV03-02 入庫自動解工單待料 | 05採購入庫 | ❌未串 | 🟡 | `alerts/work-order-loop` 真表+「解除待料」動作存在(`work-order-loop board:146`)；**但「入庫完成→掃 SKU→批次解待料」自動鏈未串**，現為手動 |
| INV03-03 維修領料出庫 | 06維修領料 | ⚠️只Toast | ✅ | RO 串接、倉管正式出庫真扣庫、觸發告警檢查（`repair-pick-board.tsx:221-234`）。stock_issues 277(indian) |
| INV03-04 跨店調撥 | 06調撥出庫/07在途 | ⚠️假資料只Toast | ✅ | `issue/transfer-out`+`operations/transfers-in-transit`+`@/domain/transfers` 真寫入。stock_transfers 34(indian17) |
| INV04-01 商品庫存查詢 | 07庫存查詢 | ❌寫死假資料 | ✅ | `operations/balance`+`@/domain/parts-balance` 走 `v_stock_balances` 真視圖；可用庫存有 `inventory_reservations` 表支撐 |
| INV04-02 寄存管理 | 07寄存 | ⚠️未分客戶/廠商 | 🟡 | `operations/consignment` 真表(4筆)；**consignment_type 客戶/廠商區分 + 寄售出售觸發應付款 待確認** |
| INV04-03 備件庫存調整 | 07備件調整 | ⚠️只Toast | 🟡 | `operations/adjust`+`inventory_adjustments`(58筆) 真寫入+`_lines`；**主管審核工作流/稽核欄位 待確認深度** |
| INV05-01 循環盤點計畫 | 08盤點計畫 | ⚠️只Toast | ✅ | `count/plans`(16筆)+`@/domain/count` 真寫入、ABC 頻率 |
| INV05-02 實地盤點掃描 | 08盤點處理 | ⚠️掃描只Toast | 🟡 | 盤點真寫入；**相機條碼掃描未做**（grep 無 getUserMedia/BarcodeDetector） |
| INV05-03 二盤複核 | 08盤點處理 | ⚠️不同人未強制 | 🟡 | `inventory_count_lines` 已有 `qty_first_count`/`qty_second_count`/`variance` 欄；**「二盤≠一盤人」後端強制驗證 待查** |
| INV05-04 報損報溢審批 | 08報損報溢 | ⚠️只Toast | 🟡 | `count/loss-overflow`+`@/domain/loss-overflow` 真頁；**財務主管審批+金額閾值升級 待查深度** |
| INV06-01 每日告警儀表板 | 10B告警儀表板 | ❌全假資料 | ❌ | **repo 無此 landing**（需新建）。底層 thresholds/loop/PO-eta/warranty 多已有 |
| INV06-02 告警階層設定 | 10告警階層 | ⚠️只Toast | ✅ | `alerts/escalation`+`parts_alert_escalation_rules`+`parts_alert_receivers` 真寫入；**N小時未處理自動升級 cron 未做** |
| INV06-03 工單增項閉環 | 10增項閉環 | ❌全Toast斷鏈 | 🟡 | `alerts/work-order-loop` 真表(31筆/indian16)+解除待料動作；**跨模組事件鏈(SA確認→預留→備料→解待料→通知)端到端未串**，目前各節點獨立 |
| INV07-01 保固舊件入庫確認 | 11暫存倉 | ⚠️只Toast | 🟡 | 暫存倉標示+舊件清單真寫入；**庫位層級(storage_location/bin)缺、RO觸發pending_storage 未做** |
| INV07-02 稽核快速找件 | 11舊件管理 | ⚠️假資料 | 🟡 | `warranty/used-parts`+`parts_warranty_used_parts_items` 真寫入(有 barcode/ro_no)；**「精確到庫位」缺欄、稽核快查模式未做** |
| INV07-03 保固費用回收 | 11費用回收 | ⚠️假資料 | ✅ | `warranty/cost-recovery`+`parts_warranty_claims`(25/indian12)+`@/domain/warranty` 真寫入、狀態追蹤；**逾期 cron 提醒未做**（屬增強） |
| INV08-01 ABC分類報表 | 12 ABC | ❌假資料 | ✅ | `analytics/abc`+`abc_classification_results`(30,全indian)+`abc_classification_config` 真算 |
| INV08-02 呆滯庫存 | 12呆滯 | ❌假資料 | ✅ | `analytics/stale`+`v_stale_inventory` 真視圖 |
| INV08-03 庫存周轉率 | 12周轉率 | ❌假資料 | ✅ | `analytics/turnover`+`v_inventory_turnover` 真視圖 |

**重評統計：** ✅ 真支撐 11｜🟡 base 已實作+增強未做 15｜❌ 真缺 1（10B）。
老闆原評 ❌ 8 條中，repo 端 7 條其實已 ✅/🟡（僅 10B 真缺）；⚠️ 多為「base 已做、設計稿新增的增強功能未做」。**老闆是對著假資料 HTML 評的，與 repo 真實落差屬可預期的視角差。**

---

## 四、Phase 2 工作包

> 原則：base 全在、helper 全在、indian seed 全在 → Phase 2 = **加增強功能**，多數是「在既有 board/helper 上加區塊 + 少量 schema」，**唯 10B 是新頁**。

| 工作包 | 內容 | 表/欄變更 | helper | 頁面 | 規模 | 需 schema proposal? |
|--------|------|-----------|--------|------|------|---------------------|
| **WP-A 10B 告警儀表板（新頁）** | 4 KPI 卡 + 5 Tab(緊急/預警/待備料/批號到期/採購逾期) + PDC 倒計時。多為**彙整既有資料** | 無新表（讀 thresholds/loop/PO.eta/warranty/批號）；批號到期需確認 `stock_receipt_lines.warranty_end`/批號欄可用 | 新 `@/domain/parts-alerts-dashboard`（聚合查詢） | 新 `parts/overview` 或 `parts/alerts/dashboard` landing | **L** | 否（純讀）；若要 summary 快取表才需 |
| **WP-B 供應商績效** | 準時率/平均前置天數/短收率/退貨率/綜合評分/A+~C 評等 | 依賴 WP-C 差異記錄；可先在 `suppliers.metadata` 存算好的指標，或新 view | 擴 `getSupplierMetrics`→加績效計算 | 改 `supplier-detail-view` perf tab（已有殼） | M | 視「指標存哪」而定，建議 view，**可不改表** |
| **WP-C 驗收差異三入口** | 短收 Modal / 拒收拍照 / CSV 批匯比對；差異 → 餵 WP-B | `stock_receipt_lines` 加 `qty_ordered`/`discrepancy_qty`/`damage_level`/`photo_url`（或 metadata） | 擴 `@/domain/receipts` | 改 `receipts board`+`detail` | M | **是**（加欄或定 metadata schema） |
| **WP-D 再訂購點計算輔助器** | 日均消耗×前置+安全 → 一鍵套用；可用庫存公式說明 | `stock_thresholds` 加 `avg_daily_consumption`/`lead_time_days`（或 metadata）；可用庫存讀 `inventory_reservations`+在途 | 擴 `@/domain/parts-thresholds` | 改 `thresholds board`(插輔助器) | S–M | 是（加欄或 metadata） |
| **WP-E 暫存倉庫位 + RO 觸發舊件入庫** | 庫位層級(WC-A01)、分區、各庫位數量；複檢通過→選庫位→確認入庫→索賠待申報 | `parts_warranty_used_parts_items` 加 `storage_location`/`bin_id`；pending_storage 狀態 | 擴 `parts-warranty-staging`/`warranty` | 改 `staging-warehouse`+`used-parts` board | M | 是（加欄+狀態值） |
| **WP-F 待備料橫幅 + 工單號掃描帶入** | 橫幅「共N張需備料」、緊急紅標、工單號 Enter/掃描帶出清單 | 讀既有 RO/`workorder_loop`，多為 UI；無新表 | 擴 `@/domain/issues`（pending_parts 查詢） | 改 `repair-pick board` | S–M | 否 |
| **WP-G 相機條碼掃描** | getUserMedia + BarcodeDetector/ZXing；無相機降級 | 無 | 無（前端） | 改 `count/sessions detail`；需 HTTPS（prod 已是） | M（前端含 ZXing 依賴） | 否；**需確認加 ZXing 套件**（觸 §5 安全邊界，先問 Ming） |
| **WP-H PDC 截單倒計時 + 緊急送單** | 倒計時(17:00/15:00)、緊急單標記+加急費 | `purchase_orders` 可加 `is_urgent`（或 metadata/`purchase_type`） | 擴 `@/domain/orders` | 改 `purchase/orders board` | S | 視 urgent 標記存法；metadata 可免 proposal |
| **WP-I 事件鏈閉環（跨模組）** | 出庫→比對水位→建 demand；入庫→掃 SKU→批次解待料→通知 SA；增項→預留→備料→解待料 | 多為事件串接（`after()` + 既有表） | 跨 `issues`/`receipts`/`work-order-loop`/`notifications` | 無新頁（串既有） | **L**（跨模組、需測） | 否（用既有表）；屬最高業務價值但工最重 |

**較小的增強（可併入對應 WP 或當 backlog）：** 寄存 customer/vendor 區分(INV04-02)、二盤≠一盤人後端強制(INV05-03)、報損溢金額閾值升級(INV05-04)、各類 cron 到期/逾期提醒（合約展延/費用回收/告警升級）。

---

## 五、給 Ming 拍板的範圍選項

**選項 1 — 只補「真缺」（最小）：** 只做 **WP-A（10B 告警儀表板）**。這是 27 場景唯一 repo 真缺、且老闆點名「使用頻率最高、設為首頁」的頁。多為彙整既有資料，**幾乎不動 schema**。規模 L、1 個工作包交付即可關掉設計稿 ❌。

**選項 2 — 補齊 v1 設計稿全部新增（對齊老闆這版設計）：** WP-A~H 八包全做，schema 變更集中在 WP-C/D/E/H（建議一次提一份 `coa`-style schema proposal 把加欄/metadata 規範定清楚，避免散彈）。WP-G 觸套件安裝邊界需先點頭。規模：~2–3 個 sprint。

**選項 3 — 業務價值優先（推薦）：** 先 **WP-A（儀表板，看得到全貌）+ WP-I（增項閉環事件鏈，最高業務痛點 INV03-02/INV06-03）+ WP-C（差異記錄，因它同時餵 WP-B 績效）**，其餘（D/E/F/G/H）排第二批。理由：閉環與差異記錄是「資料的源頭」，先補源頭，儀表板與績效才有真數據可顯示；UI 糖（倒計時/掃描/橫幅）後補不影響資料正確性。

**需先決策的卡點（動工前要 Ming 一句話）：**
- WP-C/D/E/H 的新增資料**走 typed column 還是 metadata jsonb**？（依天條：形狀穩+報表用→typed；單頁顯示→metadata。差異記錄/庫位建議 typed，倒計時設定建議 metadata）→ 牽涉是否要 schema proposal。
- WP-G **是否同意引入 ZXing.js 套件**（觸 CLAUDE.md §5 安全邊界「安裝新套件」）。
- 10B landing **放 `parts/overview` 還是 `parts/alerts/dashboard`**、是否設為 `parts` 模組 home（要動 `nav_nodes` 雙 brand）。

---

*巡檢全程唯讀：未改任何 `src/` 檔、未跑任何 DDL/migration，僅以 `execute_sql` 讀 information_schema 與 count。本報告為唯一寫入檔。*
