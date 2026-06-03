# A-1 · 售後 9 支 HTML 巡檢結果（設計稿新畫面 vs 目前 React）

**產出**：2026-06-02，workflow `aftersales-html-inspection-a1`（3 agent 並行）
**方法**：逐頁讀設計稿 HTML + 異動說明 → 對照 React 路由實作 → grep 驗證 → 輸出可施工差異

> 一句話：售後骨架極成熟，9 頁多數是「在既有頁加區塊/換元件」。**最大新建是 04B/07B 兩頁**（底層表已備）。**簽名重大修正：專案已內建 `src/components/signature-canvas.tsx`（自刻 canvas），包C 不用裝 signature_pad 套件。**

## 逐頁差異摘要

| 設計頁 | 對應路由 | 工作包 | 規模 | DDL | 核心要補的畫面 |
|---|---|---|---|---|---|
| 02 正式工單RO | repair-orders/new・[id] | **B** | L | ✅ | 優先級選擇器(priority)、6態進度條+每態通知鈕、返工RP-FR偵測橫幅、保固過期阻擋+主管授權 |
| 03 維修零件明細 | repair-orders/[id]/lines | **D** | M | ❌ | 庫存三色(綠/橙/紅)、缺料「查跨店庫存」鈕+調撥、料號搜尋 |
| 04 預檢SA環檢 | pre-inspections | **C** | L | 🟡metadata | 車牌查詢API帶入、查無建檔引導、特殊標籤紅框、Step5 真canvas簽名+簽後鎖定 |
| 04 預檢RO串接 | ro-handoff/[id]・transfer | **A** | L | ✅ | Quick Quote 入口面板+三態回帶、Tab5 真canvas簽名、transfer demo→真落地 |
| 07 售後管理 | management/dispatch・bays | **E** | M | ❌ | 技師缺席批次重排（唯一真缺；其餘已對齊甚至超越設計稿） |
| 08 結帳收款 | checkout/[id] | **F** | L | ✅ | Step1B 委託取車授權、Step2 真canvas二簽、Step4 下次保養提醒寫人車檔+CRM |
| 11 取車通知設定 | settings/pickup-notify | **F** | M | ✅ | 全流程5通知節點管理(start/safety/addon/parts/complete)+三態policy+節點2強制 |
| 04B 快速報價(新) | 新頁 → quick-quote | **A** | L | ✅ | 3 tab(套餐查/零件快查/工時)、三色庫存、三結果閉環(同意帶回/暫存/拒絕寫pending) |
| 07B 套餐費率設定(新) | 新頁 → management/service-packages | **A** | L | 🟡audit | 3 tab(套餐CRUD/工時費率inline/稽核日誌)、helper補CRUD、ducati費率seed |

## 關鍵發現
1. **簽名套件不用裝**：`src/components/signature-canvas.tsx` 已存在（checkout kit 用過），包C/04/08 直接接。→ **G-2 只剩 ZXing(庫存掃描) 待定**。
2. **07B 核心零 DDL**：`service_packages`/`labor_rates` 表已備，CRUD 只需補 helper；唯 Tab C 稽核日誌要承載（建議走 business_rules/metadata，免新表）。
3. **07 派工**：技師缺席批次重排是唯一真缺，其餘已超越設計稿（bays 已接真 DB）。
4. **DDL 集中在**：包B(priority)、包A(報價暫存+pending_items)、包F(下次保養+通知節點)。→ 收斂成 G-1 一份提案。

詳細逐點 deltas：見 workflow 原始輸出（每頁 4-8 點具體施工項）。
