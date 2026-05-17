# RS_EX1 衍生業務佣金 Workflow — Phase 1 提案

> **狀態**：Phase 1 提案（schema + 狀態機）— 等 Ming review 後拍板，**尚未落地**
>
> **來源**：BDN 第三輪 #9
>
> **Spec**：`docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS_EX1_保險招攬工作台_v1.html`

---

## 1 · Spec 實際 workflow 拆解

### 1.1 Spec 既有流程（HTML 內隱含）

RS_EX1 工作台目前已實作的流程是「**電訪 → 成交出單 → 業績統計**」三段，**沒有**明文寫「報算 → 主管審核 → 入帳」的佣金核發流程：

```
[新增保險件 (Modal)]
        │
        ▼
[續保提醒列表 — 緊急/注意/排程中]
   ├─ 電訪、記錄 (callCount 累計)
   ├─ 達 maxCalls=3 次 → status='escalate' (升報主管，但 spec 只顯示警示，沒 workflow)
   │
   ▼ (saveCall 時報價狀態=「已成交並出單」)
[c.urgency='done', c.status='done', c.result='已成交並出單']
        │
        ▼
[業績 Tab — KPI 顯示「本月佣金收入 $12,600 / 年度累計 $58,400」]
        ↑
   （數字怎麼算、誰核可、什麼時候真的入帳 — spec 沒寫）
```

### 1.2 Spec 與卡片要求的差距

| 卡片要求 | Spec 實際有 | 差距 |
|---|---|---|
| 報算（RS 提出佣金請款） | 只有「成交出單」flag，沒有報算單實體 | **需新增**：成交後自動或手動產 commission claim |
| 主管審核 / 駁回 | 只有 escalate（電訪上限警示），沒佣金審核 | **需新增**：claim 進入 submitted → approved/rejected |
| 入帳 | 業績 KPI 只顯示「佣金收入」總額，沒對應 GL entry | **需新增**：approved → paid + 串接 gl_journal_entries |
| 狀態 chip | 只有續保 urgency chip（緊急/注意/排程中/已續保） | **需新增**：commission claim 自己的狀態 chip |
| Audit log | spec 用 `history` 陣列（前端 mock，未落 DB） | **需新增**：DB-level audit，建議 metadata.history |

### 1.3 觸發點與角色

| 角色 | 動作 | 觸發點 |
|---|---|---|
| **RS（銷售）** | 建 draft → submitted | 保險件 `result='已成交並出單'` 後手動或自動產 claim；亦可手動補建 |
| **主管（Sales Manager）** | approved / rejected（含 reason） | 看「待審核」佇列、批次審核 |
| **RS（駁回後）** | 修正 → 重新 submitted | 看自己的 rejected claim、改 amount/note 再送 |
| **會計（Accountant）** | mark paid | 月底批次入帳、串 gl_journal_entries |

---

## 2 · Schema 設計

### 2.1 主表 `insurance_commission_claims`

```sql
CREATE TABLE insurance_commission_claims (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            text NOT NULL,

  -- 來源關聯
  rs_id               uuid NOT NULL,              -- 報算人，FK employees(id) （現階段不強制 FK，先 nullable check）
  insurance_case_id   uuid NULL,                  -- 對應的保險件（spec 的 insCases.id；目前 spec 用 mock，未來建表後 FK）
  customer_id         uuid NULL,                  -- 對應客戶（CRM 客戶表）
  policy_no           text NULL,                  -- 保單號碼（出單後填）

  -- 業務欄位
  product_type        text NOT NULL,              -- 險種：強制險 / 任意險 / 配件險 / Track Day / 其他
  insurance_company   text NULL,                  -- 出單公司（富邦/國泰/新光/...）
  policy_start_date   date NULL,
  policy_end_date     date NULL,

  amount_premium      numeric(12,2) NOT NULL,     -- 保費（業績基數）
  commission_rate     numeric(5,2)  NOT NULL,     -- 佣金率 % （可被主管調整）
  commission_amount   numeric(12,2) NOT NULL,     -- 佣金金額 = premium × rate / 100；可手 override

  -- 狀態機
  status              text NOT NULL DEFAULT 'draft',  -- draft | submitted | approved | rejected | paid
  rejected_reason     text NULL,

  -- 時間戳
  submitted_at        timestamptz NULL,
  reviewed_by         uuid NULL,                  -- 主管 employee id
  reviewed_at         timestamptz NULL,
  paid_by             uuid NULL,                  -- 會計 employee id
  paid_at             timestamptz NULL,
  gl_journal_entry_id uuid NULL,                  -- 對應的會計分錄（Wave 3 才接）

  -- 彈性
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  /* metadata 預期 keys：
     - history: array<{ at, from, to, by_id, by_name, note }>
     - source: 'rs_ex1_auto' | 'manual_create' | 'batch_import'
     - external_ref: 保險公司報表的對帳號（未來對帳用）
  */

  -- 系統
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_status CHECK (status IN ('draft','submitted','approved','rejected','paid')),
  CONSTRAINT chk_amounts CHECK (amount_premium >= 0 AND commission_rate >= 0 AND commission_amount >= 0)
);

-- Index 策略
CREATE INDEX idx_icc_rs_status         ON insurance_commission_claims(brand_id, rs_id, status, submitted_at DESC);
CREATE INDEX idx_icc_pending_review    ON insurance_commission_claims(brand_id, status, submitted_at DESC)
  WHERE status = 'submitted';
CREATE INDEX idx_icc_approved_unpaid   ON insurance_commission_claims(brand_id, status, reviewed_at DESC)
  WHERE status = 'approved';
CREATE INDEX idx_icc_case              ON insurance_commission_claims(insurance_case_id) WHERE insurance_case_id IS NOT NULL;
```

### 2.2 欄位升降級規則（遵循 §資料存取架構）

- **typed core**：`brand_id` / `rs_id` / `status` / `commission_amount` / `submitted_at` / `reviewed_by` 等（會被 RLS、報表、index 用 → 必 typed）
- **metadata jsonb**：`history` 陣列、`source`、`external_ref`、保險公司給的 raw 對帳資料（變動中、單頁專用 → 丟 jsonb；某 key 被 3 頁以上用時再 promote）

### 2.3 預設不強制 FK 的原因

`rs_id` / `reviewed_by` / `paid_by` 對 `employees` 表現階段不加 FK，原因：employees 表是 CRM-bound 而 commission 是 sales-bound、加 FK 會卡 dev seed。改用 application-level 驗證（helper 裡 check exists）。**Phase 2 視情況補 FK**。

---

## 3 · 狀態機

### 3.1 狀態圖

```
            ┌──────────────────────────────────┐
            │                                  │
   ┌────────▼────────┐                         │
   │     draft       │  (RS 建立未送出，可改可刪)
   └────────┬────────┘                         │
            │ submit() — RS                    │
   ┌────────▼────────┐                         │
   │   submitted     │  (進入主管 review queue)
   └────┬────────────┘                         │
        │                                      │
        ├─ approve() — 主管 ──┐                │
        │                     ▼                │
        │              ┌────────────┐          │
        │              │  approved  │          │
        │              └─────┬──────┘          │
        │                    │ markPaid()      │
        │                    ▼ — 會計          │
        │              ┌────────────┐          │
        │              │    paid    │ ← 終態   │
        │              └────────────┘          │
        │                                      │
        └─ reject(reason) — 主管 ──┐           │
                                   ▼           │
                            ┌────────────┐     │
                            │  rejected  │     │
                            └─────┬──────┘     │
                                  │ resubmit() │
                                  └────────────┘ — RS 修正後重送 → 回 submitted
```

### 3.2 Transition 權限矩陣

| Transition | From → To | 角色 | 條件 |
|---|---|---|---|
| `create()` | – → draft | RS 本人 | 自動（保險件成交時觸發）或手動 |
| `submit()` | draft → submitted | RS 本人 | amount_premium > 0 & policy_no 必填 |
| `approve()` | submitted → approved | Sales Manager | （可微調 commission_amount / rate） |
| `reject(reason)` | submitted → rejected | Sales Manager | reason 必填 |
| `resubmit()` | rejected → submitted | RS 本人 | 改完欄位後重送，history 累加 |
| `markPaid()` | approved → paid | Accountant | 串 gl_journal_entry_id（Wave 3）；Wave 1 先允許不串 |
| `cancel()` | draft → (deleted soft) | RS 本人 | metadata.deleted_at 標記 |
| `void()` | paid → (voided) | Sales Manager + Accountant 雙簽 | 反轉 GL；Phase 2 再做 |

### 3.3 預設 RBAC（接 §sales-permissions 既有架構）

```ts
// src/domain/sales-permissions.constants.ts 新增
export const INSURANCE_COMMISSION_PERMISSIONS = {
  CLAIM_VIEW_OWN:     'sales.insurance.commission.view_own',    // RS 看自己的
  CLAIM_VIEW_ALL:     'sales.insurance.commission.view_all',    // 主管 / 會計
  CLAIM_CREATE:       'sales.insurance.commission.create',      // RS
  CLAIM_SUBMIT:       'sales.insurance.commission.submit',      // RS
  CLAIM_REVIEW:       'sales.insurance.commission.review',      // 主管
  CLAIM_MARK_PAID:    'sales.insurance.commission.mark_paid',   // 會計
} as const;
```

---

## 4 · Audit log 策略

**選定方案：metadata.history 陣列**（首選，理由：簡單、不開新表、查詢頻率低、跟既有 §資料存取架構 §3 jsonb metadata 規則一致）

### 4.1 Schema

```jsonc
// insurance_commission_claims.metadata.history
[
  {
    "at": "2026-05-12T14:30:00Z",
    "from": "draft",
    "to": "submitted",
    "by_id": "uuid-rs-001",
    "by_name": "林佳蓉",
    "note": "電訪後客戶確認富邦續保 $22,500"
  },
  {
    "at": "2026-05-13T09:15:00Z",
    "from": "submitted",
    "to": "approved",
    "by_id": "uuid-mgr-002",
    "by_name": "陳店長",
    "note": null
  }
]
```

### 4.2 寫入時機

Helper `transitionClaimStatus(claim_id, to_status, by, note?)` 內部：

1. 讀 current claim
2. push 新 history 物件
3. update status + reviewed_by/at（or paid_by/at）+ metadata
4. 全在同一個 supabase RPC / domain helper transaction 內

### 4.3 為什麼不開獨立 audit_log 表

- 查詢都是「看這張 claim 的歷史」，跟 claim 本體強耦合 → 寫一起更直觀
- 不會跨單做趨勢分析（流失率 / 平均審核時間在 Wave 2 報表用 SQL 直接 select metadata.history）
- 開新表會多一道 join；POC 階段不值得
- **未來升級路徑**：若 history 開始有「報表跨表 query」需求（e.g. 月平均審核時長），ALTER TABLE add `commission_claim_audit_log` 表，由 helper 雙寫過渡

---

## 5 · UI / Route 規劃

### 5.1 路由

| Route | 角色 | 描述 |
|---|---|---|
| `/sales/insurance/commissions` | RS | 列表 — 三個 tab（我的報算 / 已核可 / 已入帳）；list view 走 DataGrid |
| `/sales/insurance/commissions/[id]` | RS / 主管 / 會計 | Detail — 標準 design pattern page view（含狀態機 CRUD pill bar） |
| `/sales/insurance/commissions/new` | RS | 同 [id] 但 create mode（同頁切，不開新頁） |
| `/sales/manager/commissions` | 主管 | 待審核佇列 — 批次審核 UI；不走標準 list view（看「批次」需求是否強到要客製） |

### 5.2 List view 欄位（DataGrid columns）

| id | header | width | 備註 |
|---|---|---|---|
| `submitted_at` | 報算日 | 110 | sortable，預設 desc |
| `rs_name` | 報算人 | 100 | RS 列表時隱藏 |
| `customer_name` | 客戶 | 130 | |
| `policy_no` | 保單號 | 130 | mono |
| `product_type` | 險種 | 100 | chip：強制險/任意險/配件險 |
| `insurance_company` | 保險公司 | 110 | |
| `amount_premium` | 保費 | 100 | align right、formatCurrency |
| `commission_rate` | 佣金率 | 80 | % |
| `commission_amount` | 佣金金額 | 110 | align right、bold |
| `status` | 狀態 | 90 | chip（見 §5.3） |
| `reviewed_at` | 核可日 | 110 | nullable |
| `paid_at` | 入帳日 | 110 | nullable |

### 5.3 狀態 chip 顏色（用 §Design Pattern token）

| status | bg | text | label |
|---|---|---|---|
| `draft` | `#F2F2F2` | `#6B6A68` | 草稿 |
| `submitted` | `#FDF3E3` | `#854F0B` | 待審核 |
| `approved` | `#EAF4FB` | `#185FA5` | 已核可 |
| `rejected` | `#FDECEA` | `#CC0000` | 已駁回 |
| `paid` | `#EAF3DE` | `#3B6D11` | 已入帳 |

### 5.4 CRUD pill bar 對應狀態

| 當前 status | CRUD pills（從左到右） |
|---|---|
| `draft`（RS） | [返回列表] [修改] [刪除] [✅ 送審] |
| `submitted`（RS 看） | [返回列表] [取消送審→draft]（其他鎖死） |
| `submitted`（主管看） | [返回列表] [❌ 駁回] [✅ 核可] |
| `approved`（會計看） | [返回列表] [💰 標記已入帳] |
| `rejected`（RS 看） | [返回列表] [修改後重送] |
| `paid` | [返回列表]（純檢視） |

---

## 6 · 落地優先序

| Wave | 範圍 | 預估 |
|---|---|---|
| **Wave 1（BDN #9.1）** | schema + domain helper + RS list view + detail page（draft/submit/edit/cancel）— 不含主管審核 UI | 中 |
| **Wave 2（BDN #9.2）** | 主管審核工作台 `/sales/manager/commissions` + approve/reject transition + 通知 RS（接 notifications hub） | 中 |
| **Wave 3（BDN #9.3）** | 會計入帳 — markPaid + 串 gl_journal_entries + 月結對帳 view（依賴會計模組成熟度，可能延後） | 大 |

### 6.1 串接點

- **RS_EX1 工作台**：保險件 `result='已成交並出單'` 時，提供「📝 建立佣金報算」按鈕（不自動建，避免誤觸；Wave 1 先手動）
- **Notification Hub**：Wave 2 接 `commission_claim.submitted`（推主管）+ `commission_claim.approved/rejected`（推 RS）+ `commission_claim.paid`（推 RS + 會計）
- **gl_journal_entries**：Wave 3 markPaid 寫一筆 `Dr 佣金費用 / Cr 應付佣金`（科目待確認 COA）

---

## 7 · BDN 子條目拆分

| BDN # | 內容 | 依賴 |
|---|---|---|
| **#9.1** | `insurance_commission_claims` 表落地 + `src/domain/insurance-commissions.ts` helper（create/submit/update/cancel/list/getById）+ `/sales/insurance/commissions` list view + `/sales/insurance/commissions/[id]` detail page（含 view/edit/create 三 mode）+ 從 RS_EX1 工作台「📝 建立佣金報算」入口 | 本提案拍板 |
| **#9.2** | `/sales/manager/commissions` 主管審核工作台（批次審核 UI）+ approve/reject transition + 接 notification hub | #9.1 完成 |
| **#9.3** | 會計 markPaid + 串 `gl_journal_entries`（依 COA 設定）+ 月結對帳 view | #9.2 完成 + 會計模組 ready |

---

## 8 · 待 Ming review 的關鍵決策點

> **沒收到 Ming 回覆前不要動工。**

1. **「報算單」要不要等保險件成交後才自動建一張 draft？還是 RS 完全手動？**
   - 自動建：UX 友善但容易產生「殭屍 draft」；
   - 全手動：報算單與保險件可能脫鉤、但操作清楚。
   - **預設建議**：保險件 `result='已成交並出單'` 後在 RS_EX1 卡片內顯示「📝 建立佣金報算」按鈕（半自動），不背景自動建。

2. **佣金率（commission_rate）誰決定？**
   - 方案 A：依險種固定（強制 5%、任意險 15%、配件險 10%…，存 `business_rules.rule_kind='insurance_commission_rate'`）
   - 方案 B：每張 claim 自由填、主管審核時調整
   - **預設建議**：A + B 並存 — RS 建單時帶入 business_rules 預設值、主管可在 approve 前 override

3. **rejected → resubmit 是不是要保留前次 amount/rate 的 snapshot？**
   - 預設方案：metadata.history 已記錄 from/to，但 amount 改動沒記入 history → 需要在 history.note 寫「commission_amount: 5000 → 4500」
   - **預設建議**：transitionClaimStatus helper 增加 `field_changes: { commission_amount: { from, to }, ... }` 寫入 history

4. **是否要支援「跨月 claim」？（保單在 5/30 出單、6/3 才報算）**
   - 影響業績統計歸屬月份（KPI 卡片「本月佣金收入」）
   - **預設建議**：歸屬日採 `submitted_at`（不是 created_at、不是 paid_at）— RS 真正「報請款」的那天算業績

5. **gl_journal_entries 串接 — 哪個 COA 科目？**
   - 借：銷售費用-佣金（5xxx）
   - 貸：應付佣金（2xxx）
   - **延後 Wave 3 決定**，需 review 現有 COA seed

6. **是否要做「voided」狀態？**（paid 後反轉）
   - 影響稅務、需主管+會計雙簽
   - **預設建議**：Phase 1 不做、預留 metadata.voided_at 欄位、Wave 3 後評估

---

## 9 · 不在本提案範圍

- ❌ 不寫 code（Phase 1 只做提案）
- ❌ 不 apply DDL（等 review 通過再開 BDN #9.1 落地）
- ❌ 不做 Playwright 驗證
- ❌ 不動 `business_rules` 表（佣金率規則 Wave 1 暫時 hard-code，Wave 2 再 promote 到 business_rules）
- ❌ 不接 Notification Hub（Wave 2 才接）
- ❌ 不串 gl_journal_entries（Wave 3 才接）

---

**Phase 1 完成標準**：本文件被 Ming review、§8 關鍵決策 1–6 拍板、子條目 #9.1 / #9.2 / #9.3 進 BDN 排序 → Phase 1 結案、勾掉 BDN #9 phase1。
