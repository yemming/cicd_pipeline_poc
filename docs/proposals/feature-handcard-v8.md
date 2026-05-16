# Phase 3A #9 · A10 電子手卡 v8 升級 — 提案（等 Ming 拍板）

**Skill**：spec-to-feature
**對應 v2 文件**：`docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS01_電子手卡_v8.html`
**v2 spec 對照表 row**：A10 — 維持三 route（counter / consultant / closing），內部畫面升級到 v8 style（Q13(b) Ming 已答）
**現有 route**：
- `/sales/card/counter` — 第一階段（到店登記 / 訪客識別 / 客戶判斷 / 來意探詢 / 客戶基本資料）
- `/sales/card/consultant` — 第二階段（現有車輛 / 初步分析 / 購買時機 + 競品 / 意向與級別）
- `/sales/card/closing` — 第三階段（試乘試駕 / 報價紀錄 / 訂單狀態 / 結案記錄）

---

## 1. v8 設計新增的概念（vs 現有 3 頁）

### 1.1 STEP 0：來客身份選擇（新概念）
進手卡第一件事先選身份：**潛客 / 老車主 / 他牌換購**。三條分支：
- **潛客** → 走完整 STEP 1-8
- **老車主** → 帶出車主資料區塊（保險 / 服務紀錄 / VIN）+ 走 STEP 1-8 但部分欄位預填
- **他牌換購** → 顯示他牌換購區塊（現有他牌品牌 / 排氣量 / 換購原因）+ 走 STEP 1-8

**影響**：counter 第一個區塊重做、新增 3 種子表單分支邏輯。

### 1.2 STEP 3：HABC 輔助建議（新概念）
購買時機 + 意向強度 → 系統自動建議 HABC 級別（H/A/B/C/D）+ 文字解釋為什麼建議這個級別。

**現有 consultant 有 grade 按鈕 + 純文字 hint 列表**，v8 是**系統算建議級別 + 顯示推導過程**。

**影響**：consultant 級別區塊重做、需要 `domain/handcard.ts` 加 `suggestGrade(timing, intensity, hasCompetitor, hasTestRide)` helper。

### 1.3 STEP 7：客戶標籤系統（新概念）
分「官方標籤庫」+「RS 自訂標籤」兩區，可勾選多個。

**現有沒有這個 section**。需 reuse `getCustomerTagsPageData` 之類的 helper（A6 客群標籤頁已做過）— 此 spec 跟那邊的標籤資料庫應該是同一份。

**影響**：closing 加新 section、整合既有 customer-tags domain。

### 1.4 STEP 4 / 5：試駕 / 中古車鑑價的跳轉 + 回寫（新交互）
從手卡點按鈕 → 跳 RS02（試駕）/ RS06（鑑價）→ 完成後**回寫結果到手卡**。

**現有 consultant 有「前往置換評估頁面」連結**但沒有回寫；closing 試駕區塊是純 mock。

**影響**：跨頁 state 持久化（用 nav state / query params / 或 server action 寫到 handcard draft 表）— 需要 handcard 在 DB 有 row（目前 3 頁都是純 client-side state，沒落地）。

### 1.5 黃金時刻（試駕後觸發 Modal）
試駕結束時自動跳出報價單 Modal — 「乘勝追擊」設計。

**影響**：closing 加 Modal + 試駕回寫 trigger。

### 1.6 預覽手卡 Modal
頂部新增「預覽」按鈕，跳出彙整三階段所有資料的 Modal。

**影響**：新元件 `<HandcardPreviewModal>`、需要彙整三頁 state。

---

## 2. v8 9 個 sub-step → 現有 3 route 的對映建議

| v8 step | 主題 | 建議落在 |
|---|---|---|
| STEP 0 | 來客身份選擇 | **counter**（最前面） |
| STEP 1 | 基本接待資訊（到店 / 接待人員 / 識別 / 客戶判斷 / 基本資料） | **counter** |
| STEP 2 | 意向車款（多選） | **counter**（從來意探詢延伸） |
| STEP 3 | 購買時機 + 意向強度 + HABC 建議 | **consultant** |
| STEP 4 | 試乘試駕跳轉 + 回寫 | **consultant**（跳轉發起）+ closing（回寫顯示） |
| STEP 5 | 中古車鑑價跳轉 + 回寫 | **consultant** |
| STEP 6 | 報價與追蹤 | **closing** |
| STEP 7 | 客戶標籤系統 | **closing** |
| STEP 8 | 備註與競品記錄 | **closing** |
| Modal | 預覽手卡 / CRM 同步 / 報價單黃金時刻 | 共用 — 抽 `src/components/handcard/` |

CardStepBar 仍只有 3 個視覺步驟（counter / consultant / closing），但每個 route 內部有 v8 風格的「STEP X 區段」設計。

---

## 3. 風險與決策點（**需 Ming 拍板**）

### 3.1 是否做「跨頁 state 持久化」（STEP 4 / 5 回寫）
- **要做** → 必須建 `handcard_drafts` 表（用 jsonb metadata 存草稿）、寫 `domain/handcard.ts` helper、所有 3 頁從 helper 載入/儲存 state。**工作量約 1-2 天**。
- **不要做** → STEP 4 / 5 跳轉後回寫只做 client-side mock、刷頁面就掉。**工作量約 4 小時**，但跟 v8 spec 的核心價值（黃金時刻、跨頁累積資料）對不上。
- 🎯 **建議**：先做 client-side mock + 用 URL hash / window.opener postMessage 把回寫資料帶回手卡頁，**不建表**。等真實業務場景跑通再 promote 成 DB 草稿。

### 3.2 HABC 建議邏輯放哪
- domain helper `suggestGrade()` 算 pure function，輸入 timing + intensity + hasCompetitor + hasTestRide → 輸出 grade + reason。
- 🎯 建議：**做**。短 helper，benefit 大（測試易、規則明確）。

### 3.3 客戶標籤整合
- 跟 `/sales/customers/tags`（A6）共用同一份 `customer_tags` 資料嗎？答案應該是 yes。reuse `getBrandCustomerTags()` 撈官方標籤、`listMyPersonalTags()` 撈 RS 自訂。
- 🎯 **建議**：reuse，不重造輪子。

### 3.4 v8 設計裡的「沒落地的概念」
v8 spec 有幾個區塊內容比較 mock（老車主資料帶出、他牌換購區塊、預覽手卡 Modal 的完整資料彙整）— **這些是 design 規格，現有業務資料 / 表 / helper 都還沒對齊**。
- 🎯 建議：UI 先照 spec 做、資料先用 mock 或從 prop 接、待 Q15 之類後續業務題出現再 wire 真資料。

### 3.5 工程量級
- counter 改動 ≈ 30%（加 STEP 0 身份分支 + 重排現有 5 sections）
- consultant 改動 ≈ 50%（HABC 建議 + 跳轉回寫 + 簡化現有 4 sections）
- closing 改動 ≈ 60%（標籤系統新增 + 黃金時刻 Modal + 簡化現有 4 sections）
- 共用元件 `<HandcardPreviewModal>` / `<CrmSyncModal>` / `<HabcSuggestionCard>` — 3 個新元件

**總工程量估計**：1 ~ 1.5 天（一個 session 跑得完，但需要保持專注）。建議**單獨開一個 worktree** 做、commit 前在 Ming 面前 demo 一遍。

---

## 4. 待 Ming 答的 4 題

1. **「跨頁 state 持久化」這版是否做？**（§3.1）建議：先 client-side mock。
2. **HABC 建議邏輯是否做 helper？**（§3.2）建議：做。
3. **客戶標籤是否 reuse A6 的 customer_tags？**（§3.3）建議：reuse。
4. **v8 mock 區塊（老車主資料 / 他牌換購 / 預覽 Modal 內容）資料先 hardcode demo 還是接 helper？**（§3.4）建議：先 demo、後續 wire。

Ming 回覆「OK / 4 題答案」後 → Claude 在 worktree 落地 → 三頁逐頁 verify + 截圖 → Notion log。

---

*Created by Claude 2026-05-15 · 等 Ming 拍板*
