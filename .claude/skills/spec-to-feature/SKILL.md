---
name: spec-to-feature
description: 把 Stitch HTML / Figma 截圖 / 文字描述的新功能規格，照 DealerOS 的 Domain Helper + Typed Core + JSONB Metadata 架構自動拆解、提案、落地、驗證。觸發語：「把這個頁面照我們架構做」、「新功能：xxx 請用 design pattern + Helper 實現」、用戶拖入 Stitch HTML 檔案、貼 Stitch / Figma URL。5 階段流程：結構分析 → 架構提案 → 拍板 → 落地 → 驗證 checklist。落地前必須由用戶 review 提案，禁止跳過階段 3。**自動偵測 `docs/proposals/feature-{slug}-phase1.md`：有就接手不重分析（大模組批次跑過 Phase 1 的情境），沒有就跑單頁 SA/SD 分析**。也支援批次模式（只跑 Phase 1，給大模組先盤架構用）。
---

# spec-to-feature

DealerOS 把新頁面規格落地的標準工作流。每收到一份新頁面（Stitch HTML、Figma 截圖、純文字描述），都走這條 5 階段流程，輸出品質穩定。

## 何時觸發

✅ 觸發：

- 用戶拖 / 貼 HTML 檔案 + 「照我們架構做」/「實現一下」/「拆出來」
- 用戶貼 Stitch / Figma URL + 類似句
- 用戶貼截圖 + 描述「我要這頁」
- 用戶純文字「新功能：採購退貨單，狀態有待審核 / 退貨中 / 完成⋯⋯」/「幫我做一頁 XXX」
- 用戶說「照 spec-to-feature 走」/「跑一次 skill」
- 用戶說「把 nav_node `<uuid>` 做成 design pattern」/「把目錄管理裡的『<頁面名稱>』做成 design pattern」（從 `nav_nodes` 表 + Supabase Storage 撈 HTML 啟動，見階段 1 input adapter）
- **Refactor mode**：用戶說「把 /xxx 改寫成 Helper 架構」/「audit + refactor /xxx 的 Supabase 直連」/「清這頁的 Helper 違規」/「這頁有沒有符合 Helper 規範」+ 要動工的字眼（見下方「入口 C — Refactor mode」）

❌ 不觸發：

- 用戶只是問「這頁長怎樣」/「這頁的資料結構是什麼」（純解釋、沒要建）
- 用戶要修現有頁面的 bug / 微調樣式（這走 design pattern SOP，不過 skill）
- 用戶在討論架構 / 規格，還沒明確要動工
- 用戶只是要「audit 一下有沒有違規」純查不改 — 直接跑 `grep -rn "@/lib/supabase"` 回報即可，不過 skill

## 三條入口（決定走哪條路）

skill 啟動時**必須先判斷**：用戶意圖是「建/補做新頁面」（A/B）還是「refactor 既有頁面到 Helper 架構」（C）。若是後者，**跳過 5 階段流程**、走 Refactor 4 步流程。

否則掃 `docs/proposals/feature-*-phase1.md`，依結果走 A 或 B：

### 入口 A — 有 phase1.md（大模組批次盤過 Phase 1）

```
有 docs/proposals/feature-{slug}-phase1.md 對應到當前輸入
  ↓
信任 phase1.md 當作 Stage 1 已完成的結論（entity / action / kpi / schema 草案 / 跨頁關係 / open questions）
  ↓
跳過 Stage 1，直接進 Stage 2（把 phase1.md 升級成完整 feature-{slug}.md 提案）
```

判斷「有對應」的依據（任一命中即可）：
1. phase1.md 內文 grep 是否引用當前輸入的 HTML 檔名 / nav_node id / URL
2. phase1.md 檔名 slug 跟用戶描述匹配（例如「人車檔案」→ `feature-aftersales-customers-vehicles-phase1.md`）
3. 用戶直接點名（「用 feature-aftersales-checkout-phase1.md 的分析往下做」）

**新鮮度檢查**：比對 HTML mtime vs phase1.md mtime — HTML 比較新就提示「規格 HTML 在 phase1.md 之後改過，要不要重跑 Stage 1？」，否則信任 phase1.md。

### 入口 B — 沒有 phase1.md（單一功能 / 新模組第一筆）

照原本 5 階段流程跑，Stage 1 從零做結構分析（SA/SD）。

### 入口 C — Refactor mode（既有頁面違規、改寫到 Helper 架構）

當用戶請求對應「**已寫好的頁面有 Supabase 直連、要清乾淨**」的情境：

**典型輸入**：
- 「把 /admin/master-data/customers 改寫成 Helper 架構」
- 「audit + refactor /xxx 頁面的 Supabase 直連」
- 「清這頁的 Helper 違規」/「這頁不符合天條、幫我修」
- 「跑 audit、把違規清掉」

**走 Refactor 4 步流程**（不走 5 階段、不寫新 spec、不做 SA/SD）：

#### Step 1 — Audit（自動，不問用戶）

```bash
# 1a) 列出該路徑下所有 supabase 直連點
grep -rn "@/lib/supabase" <target_dir>

# 1b) 看現有 domain helper 涵蓋了什麼（是否有對應 module 可 append）
ls src/domain/

# 1c) 跑一次該頁的 tsc + eslint 確保起點乾淨
npx tsc --noEmit
```

對每個違規處記：
- 檔案 + 行號
- supabase 操作類型（read query / mutation / RPC / auth.getUser 等）
- 涉及的 table 名稱
- 預期歸屬的 domain helper（既有 module append vs 新建 module）

#### Step 2 — Refactor 提案（寫 markdown、給用戶 review）

開檔 `docs/proposals/refactor-{slug}-{yyyy-mm-dd}.md`，內容：

```markdown
# Refactor — <頁面/模組名稱> 改 Helper 架構

**日期**：YYYY-MM-DD
**範圍**：<target_dir>
**違規數**：N 處 supabase 直連

## 1. Audit 結果

| 檔案 | 行 | 操作 | 表 | 歸屬 helper |
|---|---|---|---|---|
| ... | ... | SELECT | suppliers | src/domain/suppliers.ts（append） |
| ... | ... | INSERT | customer_contacts | src/domain/customers.ts（新建 fn）|

## 2. 改寫計畫

### A. 既有 helper append
- `src/domain/<X>.ts` + `getXxx()` / `listXxx()` …

### B. 新建 helper（若需要）
- 檔案 / 函式簽名 / 內部實作策略

### C. UI 改 import
- 列出每個檔的 before/after import 對照

## 3. 風險

- 是否動到 server actions（既有 `src/lib/parts/actions/*` 等）
- 是否動到 RBAC（auth.getUser / hasPermission）
- 是否動到 revalidatePath 邏輯
- 是否有跨模組 shared query 被影響

## 4. 不動

- 不刪既有 server actions（spec-to-feature 規定）
- 不改 DB schema（refactor 不涉及）
- 不動 nav_nodes
- 不改視覺 / 業務邏輯（純 layer 替換）

## 5. 驗證

- tsc / eslint 0 errors
- grep -rn "@/lib/supabase" <target> = 0 hit
- Chrome MCP 跑一輪互動主流程確保沒退化
```

寫完告訴用戶「提案存在 docs/proposals/refactor-<slug>-<date>.md，請 review」。

#### Step 3 — 拍板（用 AskUserQuestion）

只問 1-2 題、聚焦真有歧義的決策（不要泛問）：

- 「新增的 helper 命名 / 路徑 OK 嗎？」（若提案有新建 module）
- 「auth.getUser 等 RBAC 邏輯保留在 page level 還是搬進 helper？」
- 「該動既有 server actions 嗎？」（若提案發現 server action 跟 helper 重複）

若 audit 結果單純（只是 append 既有 helper、UI 改 import），可跳問題、直接告訴用戶「沒歧義、直接落地」。

#### Step 4 — 落地（沿用階段 4 SOP 的 §3-6）

1. **Domain Helper**：append / 新建 `src/domain/<module>.ts`，從 page.tsx 拷貝邏輯，包成 async function、加 brand scope、加 try/catch
2. **UI 改 import**：把 `import { createClient } from '@/lib/supabase/...'` 全砍、改 import 對應的 `@/domain/*` helper
3. **Server component 改寫**：原本「createClient + supabase.from(...).select(...)」改成「await getXxxData()」
4. **驗證**：
   - `npx tsc --noEmit` 0 errors
   - `npx eslint <touched-paths>` 0 errors
   - `grep -rn "@/lib/supabase" <target_dir>` **必須 0 hit**
   - Chrome MCP 跑互動主流程

⚠️ **不在 refactor 任務中順手做別的事**：不改視覺、不加欄位、不改業務邏輯、不擴功能。「等比例替換 layer」是唯一目標。要動視覺/業務邏輯走另一輪正常 5 階段。

⚠️ **無腦使用原則**：用戶無論是「新模組進來」、「加一兩個功能」、「改寫既有違規頁面」都用同一條 skill 觸發，**入口判斷由 skill 自動完成**，用戶不需要記是哪條路。

## 批次模式（只跑 Phase 1，給大模組先盤架構用）

當用戶要把整個大模組（10+ 頁）「先搬進系統、先盤結構」時，用「只跑 Phase 1」的批次模式 — 產出一批 phase1.md，後續單頁正式 spec-to-feature 時走入口 A 接手。

**觸發語**：
- 「整個 X 模組跑 spec-to-feature 的 phase 1」
- 「把這個資料夾的所有 HTML 都做 phase 1 分析」
- 「先做結構分析，先不要落地」

**流程**：
- 對每支 HTML 開一個 sub-agent，**只跑 Stage 1**
- 破例把 Stage 1 結構寫到 `docs/proposals/feature-{slug}-phase1.md`（原本 SKILL 規定 Stage 1 不產檔，這個模式破例）
- Stage 1 內容包含：entity / action / kpi / implied_schema / implied_pages + 跟兄弟頁的關係摘要 + 待 Stage 3 拍板的 open questions
- **不要進 Stage 2-5**（用戶之後挑單頁時，skill 走入口 A 接手）

**好處**：
- 一輪掃完知道整個模組的跨頁架構共識（例如「04 SA + 04 RO 共表」「06 拆表」），單頁時不會局部最優
- phase1.md 並行可寫，不阻塞主線
- 用戶可分批挑頁進 Stage 2-5，每次 spec-to-feature 都自動 reuse 已盤好的結論

## 5 階段流程

不可跳階段、不可合併。每個階段結束有明確產出。

### 階段 1：結構分析（自動，不問用戶）

**輸入**：HTML / 截圖 / Stitch URL / 文字描述 / **nav_node ID 或頁面名稱**

**第 0 步（強制先做）：掃 phase1.md**

```bash
ls docs/proposals/feature-*-phase1.md 2>/dev/null
```

如果有對應檔案 → 走上方「入口 A」，本階段直接結束、跳 Stage 2。如果沒有 → 走「入口 B」，繼續下方第 1 步以下流程。

**動作**：

1. **如果是 nav_node 輸入**（用戶給 nav_node UUID 或目錄管理裡的頁面名稱）：
   - 用 `mcp__plugin_supabase_supabase__execute_sql` 查 nav_nodes：
     ```sql
     SELECT id, brand_id, name, html_storage_path, parent_id, level, page_kind
     FROM nav_nodes
     WHERE id = '<uuid>'                         -- 用 ID 精確查
        OR (name ILIKE '%<keyword>%'             -- 或用名稱模糊查
            AND page_kind = 'static_html'
            AND html_storage_path IS NOT NULL);
     ```
   - 如果名稱模糊查命中多筆（雙 brand 各一筆）→ 用 `AskUserQuestion` 問處理哪個 brand（或兩個都做、共用同一個新路由）
   - 用 Supabase Storage API 從 bucket `nav-html` 下載 `html_storage_path` 指向的檔案（路徑格式 `{brand_id}/{nodeId}.body.html`）
   - 把下載到的 HTML 當成標準輸入餵進下方第 2 步以後的分析流程
   - **重要**：把處理中的 `nav_node id`（雙 brand 兩個 ID）記下來，階段 4 落地完要 UPDATE 切成 `react_route`
2. 如果是 URL，先 fetch（用 Read 直接讀 file:// 或 WebFetch fetch http(s)://；Stitch HTML 通常是 file://）
3. 如果是截圖，描述其元素
4. 抽出以下結構（記憶體中，先別寫檔）：

```
entities:
  - <實體名>（例 PurchaseReturn / Region / Store）
    fields: [...]
    relationships: [{ to: <其他實體>, kind: 'fk' | 'm2m' | '1m' }]

actions:
  - <動作名>（例 listPurchaseReturns / approvePurchaseReturn）
    signature: '(input: ...) => Promise<...>'
    suspected_side_effects: [...]   # 從 UI 文案推測（如「審核通過後庫存自動回沖」）

kpis:
  - <KPI 名>（例 待審核 / 本月退貨金額）
    source: <怎麼算>

implied_schema:
  - <table 名>: [...]
  - <relationship>: ...

implied_pages:
  - kind: 'list' | 'detail' | 'setting' | 'dashboard'
    route: <建議路徑>
```

5. 同時讀 `references/architecture.md`、`references/field-classification.md`、`references/side-effect-checklist.md` 三份 reference 校準分析

**不產出檔案**，只在記憶體中組好結構，等階段 2 才寫到 docs/proposals/。

### 階段 2：架構提案（自動產 → 寫 markdown 檔）

**動作**：

1. 開檔 `docs/proposals/feature-{slug}.md`，slug 從 URL / 檔名 / 用戶描述抽
2. **若從入口 A 接手**：把 phase1.md 內容當已完成的 Stage 1 結論，直接擴充成完整提案 —
   - phase1.md 已有：結構摘要、entity / action / kpi、schema 草案、跨頁關係、open questions
   - Stage 2 要補上：§3 Domain Helper API 簽名、§5 頁面骨架表（路徑 + 範本對應）、§6 nav_nodes SQL、§7 Critical Files 清單、§8 Verification checklist
   - **phase1.md 保留為歷史檔不刪** — 跨頁架構決策對兄弟頁未來提案也有參考價值
3. 用以下 template 填內容：

```markdown
# 提案：<功能名>

> 來源：<HTML 檔名 / URL / 文字描述>
> 日期：<YYYY-MM-DD>
> 階段：架構提案（待用戶拍板）

## 1. 結構摘要
<2-3 句話描述這個功能在做什麼>

## 2. Schema 草案

### 新表（如有）

\`\`\`sql
CREATE TABLE <table> (
  id uuid PRIMARY KEY,
  brand_id text,
  -- typed core
  <欄位>...
  metadata jsonb DEFAULT '{}'::jsonb,
  ...
);
-- RLS policies (brand-aware)
...
\`\`\`

### 現有表變更（如有）
- ALTER TABLE ... ADD COLUMN ...
- 重用：<table> 的 <欄位>

### 欄位分類（typed vs jsonb）

| 欄位 | 落腳 | 理由 |
|---|---|---|
| <name> | typed | <為何 typed> |
| <name> | jsonb (metadata) | <為何 jsonb> |
| ... | ... | ... |

## 3. Domain Helper 規劃

檔案：`src/domain/<module>.ts`

\`\`\`ts
export async function list<X>(filter): Promise<...>
export async function get<X>ById(id): Promise<...>
export async function add<X>(input): Promise<...>
export async function update<X>(id, patch): Promise<...>
...
\`\`\`

每個函式內部實作策略（Day 1 預設）：<直連 supabase / RPC / server action>

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| <action> | <例：跨表寫入 inventory_adjustments + 推 LINE 給供應商> | [需確認] |

⚠️ [需確認] 項目必須階段 3 跟用戶確認。

## 5. 會計事件分析（MANDATORY）

> 任何業務動作只要會產生資金 / 庫存 / 收入 / 費用 / AR / AP 變動，**都是會計事件**。
> 透過 `instantiateTransaction(typeCode, ctx)` 接到會計 engine（`src/domain/transactions.ts`），
> **不要在業務模組內 hardcode 分錄邏輯**。完整 spec 見 `docs/proposals/accounting-relations-architecture.md`。

**本功能會產生的會計事件**：<N> 個

| # | 業務動作 | 對應 transaction_type code | 狀態 | cash_flow_section | 觸發位置 |
|---|---|---|---|---|---|
| 1 | <例：採購收料成立> | `PARTS_PURCHASE` | ✅ 已 seed | operating | `src/lib/parts/receipt-actions.ts → completeGrnAction()` 結尾 `after()` |
| 2 | <例：賣零件結帳> | `PARTS_RETAIL_SALE` | ✅ 已 seed | operating | `src/lib/pos/checkout-actions.ts → submitSaleAction()` 結尾 `after()` |
| 3 | <例：交車尾款收款> | 🆕 `VEHICLE_FINAL_PAYMENT` | 待新增 | operating | `src/lib/sales/delivery-actions.ts → confirmDeliveryAction()` |

**目前已 seed 的 transaction_types**（query `transaction_types` 表確認最新清單）：
- `PARTS_PURCHASE`（採購進零件）· `PARTS_RETAIL_SALE`（POS 賣零件）
- `PAYMENT_RECEIPT_BANK`（收銀行匯款沖 AR）· `VENDOR_PAYMENT_BANK`（付供應商沖 AP）

**每個 🆕 待新增 type 必須附**（如有）：

```yaml
code: VEHICLE_FINAL_PAYMENT
name_zh_tw: 交車尾款收款
category: sales            # sales|purchase|service|finance|admin|closing|adjustment
cash_flow_section: operating
required_inputs:
  customer_id: { type: uuid, lookup_table: customers, required: true }
  vehicle_id:  { type: uuid, lookup_table: customer_vehicles, required: true }
  amount:      { type: numeric, min: 0, required: true }
gl_template:
  lines:
    - { line_no: 1, side: D, coa_resolver: {type: system_default, source: default_bank_coa_id}, amount_formula: amount, ... }
    - { line_no: 2, side: C, coa_resolver: {type: master_field, source: 'customers.gl_receivable_coa_id', lookup_via: 'ctx.customer_id'}, amount_formula: amount, ... }
```

**對主檔的 coa binding 影響**：
- 依賴：`<table>.<column>`（若這欄目前空 / 不可信，要先補主檔 UI binding）
- 是否需新增 dim：是 → 加進 `gl_dimensions`；否 → 用既有
- 是否新表：是 → propose schema；否 → reuse

**接點寫法**（業務 action 結尾）：

```ts
import { after } from "next/server";
import { instantiateTransaction, TX_TYPES } from "@/domain/transactions";

// ... business logic 完成、entry/db commit 之後
after(async () => {
  const res = await instantiateTransaction(TX_TYPES.PARTS_PURCHASE, {
    supplier_id, item_id, net_amount, tax_amount, warehouse_id, store_id,
  }, { autoPost: true, userId });
  if (!res.ok) console.error("[accounting] auto-post 失敗：", res.error);
});
```

**不需要會計事件的場景（明確列出）**：
- <例：刪除 draft 採購單 — draft 階段沒過帳，無事件>
- <例：純設定變更 — supplier 改地址、無資金流>

如果這個功能**沒有任何會計事件**，本 section 寫「無 — 本功能屬於純資料維護 / 純查詢、不產生資金流」即可（仍要寫，避免下次又被問）。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| <name> | /xxx | List View | parts/setup/items/_components/items-board.tsx |
| <name> | /xxx/[id] | Page View | parts/setup/items/[id]/_components/item-detail-view.tsx |
| <name>（單據型才有） | /print/<print-slug>/[id] | Print Route | **canonical**：採購單 `src/app/print/purchase-order/[id]/` + `src/domain/orders.ts::getPurchaseOrderForPrint` + `src/components/print/*`。其他現役範例：`sales-order` / `quotation` / `repair-order` / `stock-issue` / `stock-transfer` / `stock-receipt`。規格走 CLAUDE.md §📄 列印 / PDF Pattern |

**單據型判斷**：詳情頁是「會印出來給客戶 / 主管 / 倉管 / 簽核」的單據（採購單 / 銷售訂單 / 報價單 / 維修工單 / 領料單 / 調撥單 / 進貨單 / 退貨單 / 對帳單）→ **必須**加 Print Route。簽核 / 通知 / 設定 / 主檔類頁面不要加。

## 7. nav_nodes（雙 brand）

\`\`\`sql
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES ('ducati', '<parent>', 3, <n>, '<中文名>', '<icon>', '<href>', 'react_route', true, false),
       ('indian', '<parent>', 3, <n>, '<中文名>', '<icon>', '<href>', 'react_route', true, false);
\`\`\`

建議擺位：`<group>` / `<parent>` 群組底下、緊接 <鄰居>

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | src/domain/<module>.ts |
| 新增 | src/app/(workspace)/.../page.tsx |
| 新增（單據型才有） | src/app/print/<print-slug>/[id]/page.tsx |
| 新增（單據型才有） | src/app/print/<print-slug>/[id]/_components/<slug>-printable.tsx |
| 修改（單據型才有） | src/app/api/pdf/[slug]/[id]/route.ts ← ALLOWED_SLUGS 加新 slug |
| 修改（單據型才有） | src/domain/<module>.ts ← 加 `getXxxForPrint(id)` |
| ... | ... |

## 9. Verification（落地完手測）

1. <SSOT 一致性驗證點>
2. <跨模組共讀驗證>
3. <jsonb metadata 機制驗證>
4. tsc --noEmit / eslint
5. 手測 list filter / inline modal CRUD / detail / 切 tab
6. （單據型才有）開 `/print/<print-slug>/<id>` 看 A4 預覽 → 點右上「下載 PDF」走 `/api/pdf/<print-slug>/<id>` 走 server-side chromium 截圖 → 檢查 PDF 內**沒有 URL header / 頁碼 / 時間 footer**、CJK 字體正常、表頭跨頁 repeat、簽核欄不被切斷
6. **會計事件驗證**（若 section 5 列了事件）：跑一次業務動作 → 查 `journal_entries` / `journal_entry_lines` 有沒有自動產出對應分錄、借貸平衡、period 為 OPEN、cash_flow_section 填對

## 10. 開放問題（階段 3 拍板）

- [ ] <typed/jsonb 邊緣案例>
- [ ] <副作用 [需確認] 項目>
- [ ] <權限邊界>
- [ ] <名字 / 路徑>
- [ ] <現成可 reuse 的表 / helper>
```

3. 提案寫完，告訴用戶「提案存在 docs/proposals/feature-<slug>.md，請 review，幾個關鍵問題我用 AskUserQuestion 問你」

### 階段 3：拍板（AskUserQuestion，必須走）

把「9. 開放問題」濃縮成 2-4 題用 AskUserQuestion 問。常見問題類別：

1. **typed vs jsonb 分配**：邊緣欄位（例如「物流單號」、「備註」）要 typed 還是 jsonb？給用戶兩個選項 + 推薦理由
2. **副作用確認**：[需確認] 項目「審核退貨單會不會推通知」/「是否要寫 audit log」
3. **權限邊界**：哪些角色能 create / approve / delete
4. **命名 / 路徑**：路徑路徑可不可以、`src/domain/<module>` 名字 OK 嗎

⚠️ **不要問「方案 OK 嗎」這種泛問題**。每題必須是具體選擇題。

如用戶要改提案 → 改 `docs/proposals/feature-<slug>.md`、再問或直接進階段 4。

### 階段 4：落地（半自動）

執行順序（嚴格）：

1. **DB 先動**：用 `mcp__plugin_supabase_supabase__apply_migration` 建表 + RLS（含 brand-aware policy；參考 memory 的「多品牌 Schema Pattern」 — 4 條 user_has_brand() RLS）
2. **Type 重新生成**：用 `mcp__plugin_supabase_supabase__generate_typescript_types`，覆寫 `src/lib/database.types.ts`
3. **Domain Helper**：建 `src/domain/<module>.ts`，每個函式最簡單實作（Day 1 預設 supabase 直連）
4. **頁面**：拷貝範本（參考 references/page-templates.md 列出的 canonical），改業務欄位 + filter；UI 只 import `@/domain/*`、**不准** import `@/lib/supabase/*`。**包含 `/admin/*` 在內、無例外** — 即使是「ERP 核心模組」、即使只是撈下拉資料、即使是 server component。撈 form 候選清單（suppliers / warehouses / items 等）也要包進 domain helper（例：`getNewPOFormData()`）。
5. **nav_nodes**：用 `mcp__plugin_supabase_supabase__execute_sql`
   - **a. 一般情況（HTML / URL / 文字描述輸入）**：INSERT 雙 brand 新節點
   - **b. nav_node 輸入情況**（階段 1 記下的雙 brand ID）：對既有節點做 UPDATE 切換型態：
     ```sql
     UPDATE nav_nodes
        SET page_kind = 'react_route',
            href      = '/<新路由>'
      WHERE id IN ('<ducati-node-id>', '<indian-node-id>');
     -- html_storage_path 保留當歷史檔，不刪
     -- 退路：失敗時回滾「SET page_kind='static_html', href=NULL」即可恢復原 HTML 渲染
     ```
     落地完打開 sidebar 該節點 chip 應該從 HTML 變成 REACT、點擊進新頁面、不再 hit `/n/[nodeId]` 的 iframe 渲染
6. **驗 build**：`npx tsc --noEmit`、`npx eslint <touched-paths>` — 0 errors 才算落地完成

每步完成 update 對應 task。

### 階段 5：驗證 + 清孤兒

**5.1 驗證**

落地後向用戶輸出 checklist（從提案的「8. Verification」拷出來、加實際操作步驟）。Skill 自己用 Chrome MCP 跑一次互動主流程（建立 / 編輯 / 儲存 / 刪除）+ 查 DB 確認落地，不要替用戶宣告完成、等他點頭。

**Helper 架構 audit（強制、無例外）**：

```bash
grep -rn "@/lib/supabase" "src/app/(workspace)" src/components 2>/dev/null
```

**預期 0 hit**。出現任一行就回階段 4：把該 supabase 呼叫包進 `src/domain/<module>.ts`、UI 改 import `@/domain/*`、tsc + eslint 跑過、然後**才**進 Chrome MCP 驗證。包含 `/admin/*` 在內、沒有「核心模組例外」的說法。

**5.2 清孤兒（強制）— Chrome MCP 驗證通過後立刻執行，不拖到下次 session**

「升級既有頁面」這種情境下，新版會把舊版 code + DB 表晾在一邊。MCP 驗證通過 = 新版確認可用 → **必須主動掃孤兒、列清單給用戶點頭、執行刪除**。

**掃孤兒 SOP**：

1. 0 callers 的舊 server action 檔：
   ```bash
   for f in src/lib/<舊路徑>/<舊檔>.ts; do
     callers=$(grep -rln "$(basename $f .ts)" src/ --include="*.ts" --include="*.tsx" | grep -v "$f" | wc -l)
     echo "$f → $callers callers"
   done
   ```

2. 0 reference 的舊 DB 表（page.tsx / domain helper 是否還 SELECT）：
   ```bash
   grep -rn "from('<舊表名>')" src/ || echo "0 references"
   ```

3. **分類列清單給用戶 review**（先報告、不直接刪）：

   | 類別 | 是孤兒？ | 處理 |
   |---|---|---|
   | HTML 設計稿（`docs/...html`） | ❌ 不是 | 設計來源資產，留著當提案 reference |
   | 新 page 目錄 / 路由 | ❌ 不是 | 重寫的就是它本身 |
   | 舊 server action 檔（0 callers） | ✅ 是 | 可 `rm` |
   | 舊 DB 表（0 reference） | ✅ 是 | 可 `DROP TABLE` |
   | nav_node 從 `static_html` 升 `react_route` 後的 `html_storage_path` 檔 | ❌ 不是 | 保留當歷史檔（skill 階段 4 規定） |

4. **等用戶點頭**才執行（DROP TABLE 不可逆、CLAUDE.md §安全邊界必須先確認）。執行：
   - 檔案：`rm src/lib/<舊路徑>/<舊檔>.ts`
   - DB 表（按 FK 順序、子表先刪）：
     ```sql
     DROP TABLE IF EXISTS <child_table>;
     DROP TABLE IF EXISTS <parent_table>;
     ```

5. 刪完跑 `npx tsc --noEmit` + `npx eslint <touched>` 確認沒爛 import / 殘留 type 引用、回報結果

**不刪清單（白名單）**：
- HTML 設計稿（`docs/DUCATI_*/`、`docs/proposals/*.md`）
- 新 page 的 directory / route
- 跨模組 shared helper（其他模組還在 import）
- nav_node 的 `html_storage_path` 指向的舊 HTML（升級後要保留當歷史檔，跟孤兒不同）

## 紀律 / 禁區

- ❌ 跳階段 3 直接落地（即使你「覺得」自己懂用戶意圖）
- ❌ UI 直接 `import { createClient } from '@/lib/supabase/...'` — **天條、無例外、包含 /admin/* 在內**（admin / ERP 核心模組更要走 helper，不是更可以例外）。階段 4 完成、階段 5 驗證前必跑 `grep -rn "@/lib/supabase" "src/app/(workspace)"` 確認 0 hit；有任一行就回階段 4 把它包進 domain helper、UI 改 import 後再進階段 5。
- ❌ 規則類各開一張表（採購權限 / 盤點 / 告警階層 都走 `business_rules`）
- ❌ 看到「為 role 設定能 / 不能 boolean 授權」的設定頁不要直接走 `business_rules`。先檢查 `permissions` 表 + `PERMISSIONS` 常數，能對映 RBAC 就走 RBAC SSOT 或同步雙寫；`business_rules` 只接「量化規則 / workflow / 業務參數」這類非 boolean 設定。
  判斷三步：
  1. boolean「能 / 不能」？ → RBAC 候選，去 `permissions` 找對應 code、缺就 INSERT 補
  2. 量化值（金額、數量、閾值）？ → `business_rules`
  3. workflow / 流程描述？ → `business_rules`
- ❌ 為了 future-proof 全部欄位 typed（變動中的丟 jsonb）
- ❌ 寫 zod schema（POC 階段不寫；type 靠 supabase generate）
- ❌ 在落地前修改既有 server actions（除非用戶明確要求）
- ❌ 不雙 brand 補 nav_nodes（會至少一個品牌看不到入口）
- ❌ 在 `"use server"` module（如 `src/domain/*.ts` server helper）裡 export 非 async value（陣列、物件、type alias 不算）。Next 16 會跑 `Runtime Error: A "use server" file can only export async functions`。**新建 domain helper 同時建 `*.constants.ts` 放常數**（type alias OK 留 helper 檔，但 const / array / object 一律拆檔）。已踩雷三次（procurement / rules / rbac），是反覆失分點。
- ❌ MCP 驗證通過後不清孤兒（必須當下盤點、列清單、刪掉；拖到下次 session = 累積債）

## References

讀以下檔案校準分析（階段 1-2 必讀，階段 4 落地時查 page-templates 跟 naming-conventions）：

- `references/architecture.md` — Domain Helper + Typed/JSONB 完整規格
- `references/field-classification.md` — typed vs jsonb 判斷準則 + 例子
- `references/page-templates.md` — List View / Page View / Setting Page 骨架引用
- `references/side-effect-checklist.md` — 哪些動作通常有副作用
- `references/naming-conventions.md` — domain / table / route 命名慣例

## 第一個 dogfood 案例（用來驗 skill 自己好不好用）

組織三層架構升級：分析 `/parts/setup/org`、提案 regions / stores / warehouses 三頁、走完 5 階段。詳見 plan `/Users/ming/.claude/plans/image-1-image-2-jolly-bonbon.md` Phase 1。
