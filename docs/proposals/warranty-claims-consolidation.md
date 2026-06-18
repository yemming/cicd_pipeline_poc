# 保固理賠追蹤 — 表名衝突合併提案（方案 C）

**提交者**：Partner AI Agent → Russell Hung
**日期**：2026-06-17（撰寫）／2026-06-18（交付）
**回應**：Russell 6/17《warranty_claims 表名衝突裁示》採方案 C，限 3 工作日內書面提案、含 A/B trade-off + 兩項必交付評估
**狀態**：⏳ 等待 Russell review 拍板，**未動任何 schema**

---

## 0. TL;DR（先給結論）

- 現況有 **三張**保固相關表在跑，彼此重疊：`parts_warranty_claims`（25 筆真實、有 RO 關聯/應收/SLA/cron）、`warranty_claims`+`warranty_claim_lines`（2/1 筆 test、有完整 admin CRUD 但**未接 RO**、status enum **與貴方規格一字不差**）、`warranty_claim_receivables`（掛在 parts_warranty_claims 上的應收追蹤）。
- **建議採 Option A：以 `warranty_claims` 為單一「事實記錄表」**。理由集中在兩項必交付評估的結論：
  1. **逐行記帳**：`warranty_claims` 已有結構化 `warranty_claim_lines`（逐行 applied/approved amount），天生支援「原廠逐項部分核准/駁回」；只需補 4 個欄位。Option B 的 `parts_warranty_claims` 明細是 **text label（item_label/hours_label）**，根本沒有逐行結構，要硬加一套，傷設計本質的風險高。
  2. **事實/會計解讀分離**：兩案都有「會計解讀」污染，但性質不同。Option A 的污染是**孤立欄位**（`gl_posted`/`subsidiary_id`，可隔離不接線）；Option B 的污染是**整個 `warranty_claim_receivables` 應收子系統 + 逾期 cron 本身就是 AR 解讀**，與事實層糾纏更深、更難切乾淨。
- 附**明確收斂計畫 + 終止條件**（回應貴方對「逐步收斂無終止條件」的疑慮）：見 §5。

---

## 1. 現況盤點（三張表的真實用途）

> 本節為事實陳述，皆經 codebase + DB 核對。

| 表 | 資料量 | 真實用途 | 已接的 UI / 流程 | RO 自動關聯？ | 明細結構 |
|---|---|---|---|---|---|
| **`warranty_claims`** + `warranty_claim_lines` | 2 / 1（test） | Admin 獨立維護的保固理賠主檔 + 逐行明細 | `/admin/master-data/warranty-claims`（完整 CRUD：`warranty-actions.ts` / `master-data/queries.ts`） | ❌ 只能手填 `ro_id` | ✅ **結構化逐行**：`warranty_claim_lines`(item_id, qty, parts_cost, labor_cost, **applied_amount, approved_amount**) |
| **`parts_warranty_claims`** | 25（真實 seed） | Parts 模組保固索賠核心、走 SLA + 應收 | RO-link 流程：`parts-warranty/ro-link-actions.ts`（submit/approve/reimburse/reject）、`domain/parts-warranty.ts`（normalize/SLA） | 部分（`ro_id` 欄位，4/25 有值） | ❌ **text label**：`item_label` / `hours_label`（無逐行金額） |
| **`warranty_claim_receivables`** | — | 掛在 `parts_warranty_claims` 上的**應收帳款**追蹤（claim_amount/claim_status/paid_at/oem_reference_no） | `domain/warranty-receivables.ts`（財會待結算清單）、`api/cron/inventory-warranty-overdue`（逾期 flag） | 經 `parts_warranty_claims.ro_id` 間接 | 僅 per-claim 金額（無逐行） |

**狀態 enum 對照（關鍵）**：

- `warranty_claims.status`：`draft / submitted / under_review / approved / partial_approved / rejected / received / cancelled`
- 貴方規格：`submitted / under_review / approved / partial_approved / rejected / closed`
- → **幾乎一字不差**（差別僅 `received`↔`closed` 命名、與 `draft/cancelled` 兩個額外態）。強烈顯示 `warranty_claims` 是**先前（6/16 庫存 Gap 修補）即依本規格方向預建**，只差「未接 RO 自動建單」這一步。

---

## 2. 兩案定義

### Option A — 以 `warranty_claims` 為單一事實記錄表（**建議**）

- `warranty_claims` / `warranty_claim_lines` 升格為唯一的保固理賠事實表。
- **補 4 個逐行欄位**到 `warranty_claim_lines`：`source_line_type`('part'/'labor')、`source_line_id`(對應 RO 明細行)、`line_status`('pending'…)、`rejection_reason`。
- **兩個觸發來源**都餵這張表：① RO 進入「已關閉-保固待確認」終態 → 自動建 `warranty_claims` + lines（從 `repair_order_lines` where `is_warranty=true` 逐行帶入）；② `parts_warranty_claims` 建立時自動關聯/鏡射一筆 `warranty_claims`。
- `parts_warranty_claims` + `warranty_claim_receivables` 依 §5 收斂計畫退場。

### Option B — 以 `parts_warranty_claims` 為單一表

- 沿用最成熟、有 25 筆真實資料 + RO-link + 應收 + SLA + cron 的系統。
- status 從現行 5 段 normalize 擴成貴方的 8 段。
- **新建一套逐行明細結構**（現況只有 text label），或把 `warranty_claim_lines` 改 FK 指向 `parts_warranty_claims`。
- 淘汰孤兒 `warranty_claims`。

---

## 3. A/B Trade-off 列表

| 面向 | Option A（建 warranty_claims） | Option B（建 parts_warranty_claims） |
|---|---|---|
| 與規格表名一致 | ✅ 完全一致 | ❌ 表名不符（需在文件解釋 mapping） |
| status enum 對齊 | ✅ 已是 8 段、含 partial_approved | ⚠️ 需 5→8 段擴充，動 normalizeStatus + 所有讀取點 |
| 逐行明細 | ✅ 已有結構化 lines | ❌ 只有 text label，需新建 |
| 既有真實資料 | ⚠️ 僅 2 筆 test，需遷移 25 筆 parts 進來 | ✅ 25 筆原地不動 |
| RO 自動建單 | ➕ 需新增 hook（兩案都要做） | ➕ 需新增 hook |
| 既有應收/SLA/cron | ⚠️ 在另一張表，需決定去留（見 §5） | ✅ 原地可用，但**那正是會計解讀污染源**（見 §4.2） |
| admin CRUD 頁 | ✅ 已存在，改吃自動建單即可 | ⚠️ 需把現有 parts-warranty UI 與之整併 |
| 改動規模 | 中（ALTER 4 欄 + 2 hook + 遷移 25 筆 + 收斂） | 大（擴 enum + 建逐行表 + 改 normalize/UI/讀取點 + 淘汰孤兒） |
| 傷及既有邏輯風險 | 低（孤兒表，少人依賴） | 中高（動到 25 筆在跑的金流 + cron） |

---

## 4. 必交付評估

### 4.1 逐行記帳影響評估

> 問題：A/B 各會不會影響「原廠審核逐項進行、可能部分核准部分駁回」的逐行記帳能力？哪個更乾淨保留？

**結論：Option A 明顯更乾淨保留逐行記帳能力。**

- **Option A**：`warranty_claim_lines` **本來就**是逐行結構，每行已有獨立的 `applied_amount` 與 `approved_amount`（可 = 申請額、可更低、可為 0）。原廠逐項部分核准/駁回，直接落在各行的 `approved_amount` + 新增的 `line_status`/`rejection_reason`。主檔 `warranty_claims` 的核准總額由各行加總得出（符合貴方「總額由明細加總、非人工填」的設計）。**只需補 4 欄，零結構性重構**。
- **Option B**：`parts_warranty_claims` 明細是 `item_label` / `hours_label` 兩個 **text 欄位**，是「一句話描述」而非可逐項核銷的資料行。要支援逐項部分核准，必須**從零新建一套逐行明細表**並回填 25 筆既有資料的明細（而原始資料只有 text label，無法精確拆回逐行金額 → 遷移失真風險）。`warranty_claim_receivables` 只記 per-claim 的 `claim_amount`，更無法表達逐行。**等於把貴方「逐行記帳」這套設計硬塞進一個 header-only 的舊結構**，正是貴方擔心的「傷及設計本質」。

### 4.2 事實／會計解讀分離影響評估

> 問題：本次原則是「DealerOS 只記錄與原廠之間實際發生的事實，不判斷何時認列收入/算哪個科目」。A/B 各會不會讓既有 `parts_warranty_claims` 應收 cron 邏輯，把「會計解讀」摻進事實記錄層？具體風險點？

**結論：兩案都有污染，但 Option A 的污染是孤立、可隔離的；Option B 的污染是結構性、難切割的。**

**共同事實**：「應收帳款（AR）」這個框架本身就是一層**會計解讀**——它把「原廠尚未付款」解讀成「一筆已認列的應收 + 帳齡」。貴方明令不得加 `settled_at` 等「已入帳」欄位，正是要把這層解讀擋在事實層之外。

**Option A 的污染點（孤立、可隔離）**：

- `warranty_claims` 現有 `gl_posted` / `gl_posted_at` / `subsidiary_id` 三個欄位 —— `gl_posted` **正是一個「已入帳」旗標**，與貴方「不要 settled_at」的指示同類。
- **風險點**：若讓 `gl_posted` 參與 `claim_status='closed'` 的判定，就是把會計解讀摻進事實層。
- **可隔離**：這 3 欄是**孤立欄位**，本次事實記錄流程**完全不寫、不讀**它們即可。`claim_status='closed'` 嚴格由 `warranty_claim_lines` 加總（全行 approved/rejected 定案）計算，與 `gl_posted` 解耦。未來會計系統要用 `gl_posted`，自己去寫，不反向影響事實。**護欄明確、成本低。**

**Option B 的污染點（結構性、難切割）**：

- `parts_warranty_claims` + `warranty_claim_receivables` + `inventory-warranty-overdue` cron **整套就是一個 AR 子系統**：`warranty_claim_receivables.claim_status` 有 `paid` 態、有 `paid_at`、cron 依 `sla_days` 把 claim flag 成「逾期應收」。這些**都是會計解讀**（把對原廠的索賠當成已認列、會帳齡化的應收）。
- **風險點**：在這套之上建事實記錄層，事實（申請/核准/駁回）與 AR 解讀（paid/逾期/帳齡）**從第一天就綁在同一條流程**（ro-link-actions 的 `syncReceivable` 在每次狀態轉換時同步寫 receivables）。要「事實歸事實」就得把這條同步鏈拆掉，等於否定 Option B 沿用成熟系統的初衷。
- **難切割**：`paid_at` / `sla_days` / 逾期 cron 是 parts-warranty 流程的核心既有行為，移除會牽動 25 筆在跑的資料與財會待結算清單。

**小結**：Option A 把會計解讀關進「不接線的孤立欄位」這個盒子裡（一道明確護欄即可）；Option B 的會計解讀是流程主幹的一部分，要分離得動筋骨。**就「事實/會計解讀分離」這條原則，Option A 風險顯著較低。**

---

## 5. 建議方案與收斂計畫（含明確終止條件）

> 直接回應貴方對「逐步收斂無終止條件」的疑慮：本計畫給**可量測的終止條件 + 目標時程**，不留無限期並存。

**採 Option A**，分三步，每步有 Definition of Done：

**Step 1 — 補欄 + 接 RO 終態自動建單**（事實層落地）
- `ALTER warranty_claim_lines` 增 `source_line_type` / `source_line_id` / `line_status` / `rejection_reason`。
- RO 進入「已關閉-保固待確認」→ 自動建 `warranty_claims` + lines（從 `repair_order_lines` where `is_warranty=true` 逐行帶入；總額由 lines 加總）。
- **護欄**：`gl_posted`/`subsidiary_id` 本流程不寫；`claim_status='closed'` 由 lines 加總計算。
- **DoD**：新關閉的保固 RO 100% 自動產生 `warranty_claims`，財會/店長可在「保固理賠待結算」清單看到、按 `審核中天數 = today − submitted_at` 分級（30–60 正常、>90 升級，門檻常數化）。

**Step 2 — parts_warranty_claims 建立時自動關聯**（第二觸發來源）
- `parts_warranty_claims` 建立時自動鏡射/關聯一筆 `warranty_claims`（不再靠人工另開）。
- **DoD**：新建 parts 索賠 100% 帶出對應 `warranty_claims`，兩者 `ro_id` 對齊。

**Step 3 — 收斂退場（明確終止條件）**
- 遷移 25 筆 `parts_warranty_claims` 進 `warranty_claims`（text label → 盡力拆為 lines，無法拆的整筆掛一行並註記）。
- Admin `/admin/master-data/warranty-claims` 改為只讀 `warranty_claims`。
- `warranty_claim_receivables` + `inventory-warranty-overdue` cron 的「AR 解讀」職責**凍結**，標記為「待未來會計系統接手」，不再是事實層的一環。
- **終止條件（可量測）**：① cutover 日後 `parts_warranty_claims` **新增 0 筆**；② 25 筆 legacy 全數有對應 `warranty_claims`；③ admin 頁不再讀 `parts_warranty_claims`。三者達成即宣告收斂完成、`parts_warranty_claims` 設為唯讀（或 drop）。
- **目標時程**：Step 1+2 於拍板後約 3–4 工作日；Step 3 遷移+凍結於再 +2 工作日內。

---

## 6. 若拍板後的 schema 變更草案（**尚未執行**）

```sql
-- Step 1：warranty_claim_lines 補逐行欄位（對齊貴方規格）
ALTER TABLE warranty_claim_lines
  ADD COLUMN source_line_type text,          -- 'part' / 'labor'
  ADD COLUMN source_line_id   uuid,          -- 對應 repair_order_lines.id
  ADD COLUMN line_status      text NOT NULL DEFAULT 'pending',
  ADD COLUMN rejection_reason text;
-- 註：claimed/approved 金額沿用既有 applied_amount / approved_amount，不重複加欄。
-- 註：刻意不加 settled_at / 任何「已入帳」欄位（依貴方指示，交未來會計系統）。
```

- 觸發點 ①：`src/lib/aftersales/final-inspection-actions.ts` 或 RO 狀態轉換 hook（進入「已關閉-保固待確認」時）。
- 觸發點 ②：`parts_warranty_claims` 建立的 action。
- 影響範圍：售後（RO 終態）＋ 倉管（保固件）＋ 財會（待結算清單）三邊；admin warranty-claims 頁；通知（待結算逾期升級）。
- **不影響**：本提案不動正在平行進行的「部分出庫 / 內售應收 / 付費RO升級」三項。

---

## 7. 等待簽核

```
⚠️ 本提案未執行任何 schema 變更。
請 Russell review §4 兩項評估與 §5 收斂計畫；
拍板採 Option A（或指示調整）後，再進入 Step 1。
```

— Partner AI Agent
