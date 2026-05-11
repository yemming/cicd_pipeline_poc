# 提案：售後工單模組 — 預檢單 RO 串接版（Phase 1 結構分析）

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/04_預檢單_RO串接_v3.html`
> 日期：2026-05-11
> 階段：Phase 1（結構分析）— **僅做結構分析，不進 Phase 2-5**
> 適用 brand：Ducati（本模組 nav 僅在 Ducati 樹下；Indian 是否補做待業務點頭，依雙 brand 紀律 schema 仍要做雙 brand seed）
> 姊妹頁：
> - `feature-aftersales-precheck-sa-phase1.md` — **PI 主檔 + 5 子表 schema 主場**（本頁不重複落 schema）
> - `feature-aftersales-overview-phase1.md`（00_導覽總覽）
> - `feature-aftersales-flow-diagram-phase1.md`（00_流程關係圖）
> - `feature-aftersales-appointments-phase1.md`（01_預約管理看板）
> - `feature-aftersales-ro-phase1.md` — **RO 開立 gate page 主場**（前綴選擇 / 流水號 / repair_orders schema）
> - `feature-aftersales-ro-lines-phase1.md`（03_維修項目零件明細）

---

## 0. 頁面定位（最重要）

這個 HTML demo 把 **兩個獨立頁面** 串起來展示同一個 SA 視角的完整動線：

```
畫面一：PI 5 個 tab（同 SA 環檢版，schema 落 precheck-sa-phase1）
    ↓ Tab 5 「確認轉入 RO」
[Transfer Overlay]  ← ⭐ 本提案的核心職責
    - 顯示「將自動帶入 RO」的資料 summary
    - 兩顆 button：[返回修改] / [確認 開立正式工單 RO →]
    ↓ 確認
畫面二：RO 6 個 tab（A 工單資料 / B 維修項目 / C 領料單 / D 電子打卡 / E 竣工複檢 / F 授權簽名）
    （schema 落 ro-phase1 + ro-lines-phase1 + 06 竣工複檢 + 03 維修項目；本提案不重複）
```

**本提案的職責縮減為「PI → RO 之間的 transfer 契約」** — 不重複 PI schema（姊妹 precheck-sa）、不重複 RO schema（姊妹 ro / ro-lines）。

具體要管的就是這四件事：

1. **Transfer Overlay**（PI Tab 5 結束、RO INSERT 之前的人機 gate） — UI / 互動 / banner 副本
2. **資料快照策略**（PI 的哪些欄位是值傳遞、哪些是 reference） — 解決「PI confirm 後事後修預檢單，會不會污染已開立的 RO？」
3. **副作用列表**（confirmRO 這顆 button 按下去，DB / IM / 下游模組 連動什麼？）
4. **流程閘門**（哪些前置條件沒滿足就不准進 transfer overlay？哪些後置動作要原子化？）

⚠️ **PI 與 RO 不能合表**：兩張單據業務語意不同（PI=車況交接紀錄、RO=維修合約）、責任人不同（PI 由 SA 開、RO 由 SA 開且由車主二次簽授權）、生命週期不同（PI 不可逆鎖、RO 可被追加項目擾動）。本頁強化「PI 與 RO 是父子單據、但 schema 拆兩張」這個架構決策。

---

## 1. 結構分析（記憶體結構，照 SKILL §階段 1 第 4 步格式）

### entities（不新增主 entity，本頁是 transfer 契約 + 一張快照 audit 表）

```
（既有，PI 主場）
pre_inspections                 — schema 在 precheck-sa-phase1，本頁只讀
pre_inspection_*                — 5 子表
（既有，RO 主場）
repair_orders                   — schema 在 ro-phase1，本頁只寫一次（INSERT）
ro_lines                        — schema 在 ro-lines-phase1，本頁帶入初始 lines
（新增，本頁負責）
pi_ro_transfers                 — PI→RO 一次轉換的 audit trail（每張 PI 最多一筆有效，可重試）
  - id uuid PK
  - brand_id text
  - pre_inspection_id uuid FK → pre_inspections
  - repair_order_id   uuid FK → repair_orders        # transfer 成功才填
  - status text                  # 'pending' / 'confirmed' / 'reverted' / 'failed'
  - confirmed_at timestamptz
  - confirmed_by uuid FK → employees                  # 點 confirm button 的人（通常 = PI sa_id）
  - reverted_at  timestamptz
  - revert_reason text                                # 取消 RO 後解除 transfer 的理由

  -- ⭐ 快照欄位（key 部分，§3 詳）
  -- 把 transfer 當下會被「值傳遞」的 PI 內容固定下來，方便事後 audit
  snapshot jsonb DEFAULT '{}'::jsonb
  /* 內容（會 promote 成 typed 的優先順序見 §3）：
     {
       pi_code, pi_confirmed_at,
       customer:    { id, name, phone },
       vehicle:     { id, plate, vin, model },
       store:       { id, name },
       mileage_in,
       warranty_snapshot: { ... },                    # 已是 jsonb，原值複製
       purposes:    [...],                             # text[] 原值複製
       customer_complaint: '...',
       tech_diag_summary:   '...',                    # 由 §4.2 規則合成（agree 項串接）
       quote_items_snapshot: [                        # 帶入 RO lines 的「值」
         { source, source_finding_id, name, lu, parts_amount, labor_amount, subtotal, decision }
       ],
       deleted_items_snapshot: [                      # SA 在 PI 上刪掉、但要在 RO Tab F 紅色卡片 reconfirm 的項
         { name, deleteReason }
       ],
       deferred_items_snapshot: [                     # 暫緩 / 拒絕，要落「增項閉環」追蹤
         { finding_id, title, safety_level, decision }
       ],
       totals: { labor, parts, tax, total, lu_rate }
     }
  */

  - metadata jsonb DEFAULT '{}'::jsonb               # has_warranty_concern / 推播 idempotency key 等
  - created_at timestamptz DEFAULT now()

  -- 約束：每張 PI 最多 1 筆 status='confirmed'
  -- partial unique index: (pre_inspection_id) WHERE status='confirmed'
```

> 為什麼要這張表（不只是把欄位塞到 `repair_orders.metadata`）：
> - 用戶可能在 RO 開立後**取消 RO 重來**（仍是同一張 PI，只是業務類型選錯 P1/P2）。沒有獨立 transfer 表，撤銷的事件會被覆蓋掉。
> - audit 需求：日後追查「這張 RO 開單當下的車況／報價是什麼」要看 snapshot，不能只看當下 repair_orders（已被事後追加 / 編輯擾動）。
> - 跟 RO 拆開、不污染 RO 主表的 metadata（RO 自己已經有 `warranty_status_snapshot` / `estimated_*` 快照，§ro-phase1）。
>
> ⚠️ 如果 Phase 3 用戶覺得這張表 over-engineering、可以接受「快照只存在 `repair_orders.metadata.pi_transfer_snapshot`」，那就把 `pi_ro_transfers` 退成 jsonb sub-tree。本提案推薦獨立表，理由是它是「事件」不是「狀態」 — RO 是 entity、transfer 是 event。

引用 entities（不歸本頁落地）：

- `pre_inspections` / `pre_inspection_*` → 姊妹 precheck-sa
- `repair_orders` → 姊妹 ro-phase1
- `ro_lines` → 姊妹 ro-lines
- `loop_cases`（增項閉環）→ 05_增項閉環
- `appointments` → 01 預約看板
- `notification_subscriptions / notification_targets` → Notification Hub（既有）

### actions

```
buildTransferSummary(pre_inspection_id: string) → Promise<TransferSummary>
  # 計算 overlay 顯示用的 summary（不寫 DB；render-only）
  # 內容 = SA quote_items 數 + 技師 agreed 增項數 + deferred 數 + 預估 total
  # 副作用：無（純讀 + 投影）

verifyTransferEligibility(pre_inspection_id: string) → Promise<{ ok, reasons[] }>
  # 進 overlay 前的閘門（§5）：
  # - PI status 必須 = 'confirmed'
  # - sa_signature_url, customer_signature_url（或 proof_url）至少一組有值
  # - quote_items 至少 1 筆 active（避免空單轉 RO）
  # - 沒有未決的 tech_findings（decision='none' 視為未決，會擋）
  # - 該 PI 沒有現存 transfer.status='confirmed'（防重複開 RO）
  # 副作用：無

confirmTransferToRO(input: {
  pre_inspection_id: string,
  p1_prefix: 'P1A' | 'P1B' | ...,  # ro-phase1 的前綴選擇
  p2_prefix: 'P2A' | 'P2B' | ...,
  warranty_claim_types: WarrantyClaimType[],  # PRED/NORM/ACCE/SPAR/WCRC/4EVR/GWIL/不適用
  youtech_no: string | null,
  receptionist_id: string,
}) → Promise<Result<{ repair_order_id, ro_code }>>
  # ⭐ 本頁的核心 server action。必須是 atomic（單一 DB function 或 server action 包 supabase rpc）
  # 步驟（必須照順序、可中斷後完整 rollback）：
  #   1. 再跑一次 verifyTransferEligibility（防 TOCTOU）
  #   2. INSERT pi_ro_transfers (status='pending', snapshot=...)
  #   3. INSERT repair_orders (帶入快照、ro_code、warranty_status_snapshot...)
  #      流水號 advisory_lock（ro-phase1 §流水號取得策略）
  #   4. INSERT ro_lines（帶 quote_items_snapshot；source 標 'pi-sa' / 'pi-tech'；
  #      pi_quote_item_id 反向 FK）
  #   5. UPDATE pre_inspections.linked_ro_id = repair_orders.id
  #   6. UPDATE pi_ro_transfers SET status='confirmed', repair_order_id=ro_id
  #   7. UPDATE appointments.metadata.linked_ro_id（如有上游預約）
  #   8. （可選）INSERT loop_cases for deferred_items_snapshot — 走 05 增項閉環的 helper
  #   9. after() → notifications.dispatch({ code: 'pre_inspection.transferred_to_ro', ... })
  # 失敗時：整段 rollback（DB function 用 BEGIN/EXCEPTION/ROLLBACK；server action 用 supabase rpc 包）

revertTransfer(repair_order_id: string, reason: string) → Promise<Result>
  # 客戶在 RO 第二次簽名前反悔（如選錯 P1/P2 要重開、或客戶取消整單）
  # 步驟：
  #   1. 確認 RO status 還沒進到「已開工」（沒有 ro_lines.actual_start_at、沒有領料雙簽）
  #   2. UPDATE repair_orders.status = 'cancelled'，記 cancellation_reason
  #   3. UPDATE pi_ro_transfers SET status='reverted', reverted_at=now, revert_reason
  #   4. UPDATE pre_inspections.linked_ro_id = NULL
  #   5. 解除 loop_cases（如有從 deferred snapshot 開出來的）
  #   6. PI 重新可進 transfer overlay（buildTransferSummary 再跑一次）
  # ⚠️ 業務規則邊界 [需確認]：RO 被 revert 後 PI 是否要回 'in_progress'？
  #   本提案推薦 PI 仍維持 'confirmed'（PI 本身內容沒問題、是 RO 業務類型選錯）

# 互動：buildTransferSummary 只在 client 端 render-only；
#       verifyTransferEligibility 在「點 PI Tab 5 下一步」當下跑（不是 button 上）；
#       confirmTransferToRO 在「Transfer Overlay 的 [確認] button」按下時跑。
```

### kpis（本頁不直接展示，但會被下游報表用）

```
# 轉 RO 成功率（PI confirm → RO 開立的轉換率）
confirm_to_ro_rate
  = count(pi_ro_transfers.status='confirmed') / count(pre_inspections.status='confirmed')
# 失銷比例（PI confirm 但永遠沒轉 RO）
lost_after_pi_rate
  = count(pre_inspections WHERE status='confirmed' AND linked_ro_id IS NULL) / count(...)
# 重轉率（PI 被 revert 後重新開 RO）
retransfer_rate
  = count(pi_ro_transfers GROUP BY pi_id HAVING count(*) > 1) / count(pi_ro_transfers)
# transfer 平均耗時（PI confirmed_at → RO created_at）
avg_transfer_delay = avg(repair_orders.created_at - pre_inspections.confirmed_at)
```

→ 這些 KPI 屬 **07 售後管理模組** 主場（aggregate），本頁不畫面。

### implied_pages

| kind | route | 範本 | 備註 |
|---|---|---|---|
| modal / overlay | （重疊在 `/aftersales/pre-inspections/[id]`） | **無範本**（新建客製 overlay） | 不是獨立 route，是 PI Tab 5 的 inline overlay |
| 後置跳轉 | `/aftersales/repair-orders/[id]` | 由 ro-phase1 / ro-lines 處理 | confirmTransferToRO 成功後 `router.push` |

⚠️ **本頁不是獨立 route**。它是 PI wizard 內的最後一個 confirm gate + 跳轉契約。Phase 4 落地時不需要 nav_nodes、不需要 list view、不需要 detail view template，**只需要寫 Transfer Overlay 元件 + confirmTransferToRO server action**。

---

## 2. 跟姊妹頁 04 SA 環檢版的關係（不重複落 schema）

`feature-aftersales-precheck-sa-phase1.md` §2 已主張：兩頁共享 `pre_inspections` + 5 子表。本頁接受該主張、本頁不再列 PI schema、不再評估 typed vs jsonb PI 欄位。

本頁與 SA 環檢版的 demo 差異是 UI 而非 schema：

| 項目 | SA 環檢版 demo | RO 串接版 demo（本頁） |
|---|---|---|
| Tab 5 「下一步」button | alert + 結束 | **彈 Transfer Overlay** |
| Tab 5 結束後行為 | （無） | overlay → 整頁切到 RO 6 個 tab |
| VIN 欄位 | 隱含在 vehicles | Tab 1 顯式顯示一欄（也是來自 vehicles，UI 差異） |
| 「車間檢查」vs「技師深入檢查」 | 技師深入檢查 | 車間檢查（只是 label，落 DB 同一張 `pre_inspection_tech_findings`） |

→ schema 沒任何差異。**本提案的責任 100% 在 transfer 邏輯**。

---

## 3. ⭐ 資料快照策略（本頁的核心架構決策）

> 用戶任務指令點名要強調這節：**「轉 RO 過程的副作用與資料快照策略」**。

### 3.1 為什麼需要快照（非單純 reference）

PI confirm 後雖然規定 immutable（precheck-sa §0、§3 第 5 點是 [需確認]），但下列情況仍會「上游資料被擾動」：

| 變動來源 | 受影響欄位 | 是否合理擾動 |
|---|---|---|
| 客戶資料事後更新（電話 / 地址） | customers.* | 合理（客戶異動） |
| 車輛資料事後更新（VIN 校正 / 過戶） | vehicles.* | 合理（資料修正） |
| 保固政策事後變更（公報 SRV-SRB-26-014 重發） | warranty 計算邏輯 | 合理（政策變動） |
| LU 單價調整（business_rules rule_kind='lu_rate'） | lu_rate, 報價 | 合理（成本端） |
| 主管手動 unlock PI 補登 | quote_items / tech_findings | 視 [需確認] §5 |
| 客戶標籤變更 | customer_tags | 合理（人不屬單） |

如果 RO 純走 reference（每次 query 動態 JOIN 上游）→ 上游一動，RO 開單當下的「合約內容」就會跟現實不一致，**事後糾紛、保固索賠、稽核都會出問題**。

→ **凡是構成「合約內容」的欄位都要值傳遞快照**；凡是「人 / 車的識別資訊」走 reference。

### 3.2 欄位分類（值傳遞 vs reference）

| PI 欄位（或衍生） | 進 RO 方式 | 落腳 | 理由 |
|---|---|---|---|
| `customer_id` / `vehicle_id` | reference | `repair_orders.customer_id / vehicle_id` (FK) | 識別資訊、客戶異動要追得到 |
| `pi_code` | **值傳遞** | `pi_ro_transfers.snapshot.pi_code` + `repair_orders.metadata.source_pi_code` | 是當下的快照；PI 不會改 code，但鎖死 audit |
| `mileage_in` | **值傳遞** | `repair_orders.mileage_in`（typed column on ro-phase1） | 開單當下的進廠里程，後續結帳要用 |
| `warranty_snapshot` | **值傳遞**（整包複製） | `repair_orders.warranty_status_snapshot`（jsonb） | 開單當下保固狀態鎖死，避免政策變了影響歷史 |
| `customer_complaint` | **值傳遞** | `repair_orders.complaint_text`（typed） | 開單當下車主原話、PI 事後若補登不污染 RO |
| `purposes` | **值傳遞** | `repair_orders.purposes text[]`（typed array） | 同上 |
| `quote_items[]` 的 name / lu / parts_amount / labor_amount / subtotal | **值傳遞** | `ro_lines.*`（typed columns） + `ro_lines.pi_quote_item_id` (FK 反查) | 報價即合約金額；FK 反查只給 audit 用、計算永遠看 RO 端值 |
| `quote_items[]` 的 decision='agree' 才進 RO | **過濾後值傳遞** | 同上 | 暫緩/拒絕進 loop_cases（§4.2） |
| `tech_findings` agree 項的 diagnosis | **值合成傳遞** | `repair_orders.tech_diagnosis_text`（typed） | 多項串接成單一文字 + 技師整體意見 |
| `tech_findings` defer/reject 項 | **值傳遞 + 新建 loop_case** | `loop_cases`（05 增項閉環） + `pi_ro_transfers.snapshot.deferred_items_snapshot` | snapshot 留事件、loop_case 是追蹤主體 |
| `customer_signature_url` | **不複製** | （RO 自有第二次簽名 `customer_signature_2_url`） | PI 第一次簽（車況交接）與 RO 第二次簽（維修授權）性質不同、不可混用（line 838-841） |
| `customer_tags` | reference | 透過 `customers` JOIN | 標籤屬人不屬單、PI / RO 共讀 customer_tags |
| `sa_id` | reference | `repair_orders.sa_id`（FK） | 通常 = PI sa_id；異動是合理的 |
| `lu_rate` | **值傳遞** | `repair_orders.lu_rate`（typed numeric） | 開單當下單價、計算憑這個 |
| `estimated_total / labor / parts / tax` | **值傳遞** | `repair_orders.estimated_*` | 開單當下預估金額；後續 actual 走 RO 端重算 |

### 3.3 雙重快照（pi_ro_transfers.snapshot vs repair_orders.metadata）

兩處快照不冗餘、各有目的：

| 落腳 | 目的 | 變動性 |
|---|---|---|
| `repair_orders.*`（typed） + `warranty_status_snapshot`（jsonb） | **作為合約 SSOT**，後續結帳 / 索賠 / 報表都讀這裡 | RO 可被事後追加 / 編輯（ro-lines）擾動 |
| `pi_ro_transfers.snapshot`（jsonb） | **transfer 當下不可變 audit**，事後 RO 怎麼被改、這份永遠是「轉 RO 當下的真相」 | 永不改（除非 revert + 重來會建新 row） |

→ `pi_ro_transfers.snapshot` 是 **append-only event log**，事件性的；`repair_orders` 是 **mutable entity**，狀態性的。兩者並存。

### 3.4 為什麼不直接把 snapshot 塞 `repair_orders.metadata`

考慮過、否決：

1. RO 可能 cancel + 重開 → 重開後 metadata 被覆蓋、第一次 transfer 的證據就掉了
2. RO 自己 metadata 還有別的用途（領料 sig、追加項目記錄）→ 不該擠
3. transfer 是「一次性事件」，不是 RO 的屬性
4. 業務未來可能擴成「PI 拆成多張 RO」（雖然目前是 1:1，但 RO 重開時其實就是 1:N over time）→ 獨立表 future-proof

---

## 4. 副作用清單（PI→RO transfer 動作的全部連動）

| 觸發 | 副作用 | 類型 | 確定性 |
|---|---|---|---|
| `confirmTransferToRO` | INSERT `pi_ro_transfers` (status=confirmed, snapshot) | A 跨表事務 | 確定 |
| `confirmTransferToRO` | INSERT `repair_orders`（含 warranty_status_snapshot / mileage_in / lu_rate / estimated_*） | A 跨表事務 | 確定 |
| `confirmTransferToRO` | INSERT `ro_lines` × N（agree 項，含 pi_quote_item_id 反查 FK） | A 跨表事務 | 確定 |
| `confirmTransferToRO` | UPDATE `pre_inspections.linked_ro_id = ro.id` | A 跨表事務 | 確定 |
| `confirmTransferToRO` | UPDATE `appointments.metadata.linked_ro_id`（如 PI 有上游 appointment） | A 跨表事務 | 確定 |
| `confirmTransferToRO` | INSERT `loop_cases` × M（deferred / rejected 項） | A 跨表事務 | 高機率正確、需確認推播時機 |
| `confirmTransferToRO` | RO 流水號生成 — `pg_advisory_xact_lock` 鎖 `(brand_id, p1, p2, date)` 再算 sequence | A 跨表事務 | 確定（ro-phase1 §流水號取得策略） |
| `confirmTransferToRO` | `after() → notifications.dispatch('pre_inspection.transferred_to_ro')` 推 LINE 給技師 + 售後主管 | B 通知 | [需確認] 推哪些角色 / 用 event_code |
| `confirmTransferToRO`（含 safety_level=1 reject） | 推 LINE 給售後主管「⚠️ 含🔴安全等級項目」（line 1363） | B 通知 | [需確認] 條件 |
| `confirmTransferToRO`（含 deleted_items） | RO Tab F 顯示「已刪除項目 reconfirm」紅色卡片，留 audit 給車主第二次簽名前確認（line 1370-1378） | UI only | 高機率正確 |
| `confirmTransferToRO`（含「疑似保固」/「公報召回」purpose） | RO Tab A 預設勾選「保固索賠類型」候選（line 367 alert：「均須進入 RO 後由售後主管簽核」） | UI + 業務規則 | [需確認] 是否自動勾選還是僅 hint |
| `revertTransfer` | UPDATE `repair_orders.status='cancelled'` + cancellation_reason | A 跨表事務 | 確定 |
| `revertTransfer` | UPDATE `pi_ro_transfers.status='reverted'` + revert_reason | A 跨表事務 | 確定 |
| `revertTransfer` | UPDATE `pre_inspections.linked_ro_id = NULL` | A 跨表事務 | 確定 |
| `revertTransfer` | DELETE / cancel `loop_cases`（從本次 transfer 開出的） | A 跨表事務 | [需確認] 是 hard delete 還是 soft cancel |
| `revertTransfer` | 推 LINE 給原 SA / 主管 | B 通知 | [需確認] |
| `revertTransfer` | PI status 是否回到 'in_progress' | F cache | [需確認] §1 actions |
| 整段 `confirmTransferToRO` 任一步失敗 | rollback 所有（advisory lock 內 BEGIN/EXCEPTION/ROLLBACK） | A 跨表事務 | 確定（必做） |
| 整段 `confirmTransferToRO` 推播失敗 | `after()` 失敗不影響主事務 commit（hub deliveries 表自己記 failed） | B 通知 | 確定（既有 hub 行為） |

⚠️ **[需確認] 項目（Phase 3）**：

1. **推播 event_code 命名**：`pre_inspection.transferred_to_ro` vs `repair_order.created_from_pi`？兩者皆合理，hub 需要對齊。
2. **推播對象**：轉 RO 後通知（a）技師 / （b）售後主管 / （c）車主 / （d）零件專員，哪些要在 transfer 當下推、哪些要等領料時才推？
3. **保固索賠類型自動勾選**：HTML demo line 631 預設勾「NORM」、其他空白。是否本頁 transfer 時依 PI 的 `has_warranty_concern` + warranty_snapshot 自動 pre-select？
4. **revert 時 loop_cases 處理**：原本 PI deferred 項建出來的 loop_case，revert RO 後是 hard delete 還是維持 follow-up？（保留可能比較合理：客戶就算 cancel RO、暫緩項仍是失銷追蹤標的）
5. **revert 後 PI status**：保持 'confirmed' 還是回 'in_progress' 准許 SA 修 quote_items？
6. **deleted_items 必須在 RO Tab F 再確認**（HTML demo line 1370-1378）：這算 transfer 副作用的一部分（值傳遞 deleted_items_snapshot 進 RO），還是 RO Tab F 自己重抓 PI 上的 deleted 項？建議前者（snapshot 一致性）。

---

## 5. 流程閘門（verifyTransferEligibility 的硬條件）

> 進 Transfer Overlay 前 / 點 [確認] button 後，這些條件必須 client + server 雙重檢查。失敗回 `{ ok: false, reasons: [...] }`，UI 列項顯示，不允許繼續。

| 閘門 | 來源 | 不滿足時的訊息 |
|---|---|---|
| `pre_inspections.status = 'confirmed'` | PI 主場 | 「請先完成預檢單第 5 步雙方簽名」 |
| `sa_signature_url IS NOT NULL` | PI 主場 | 「SA 尚未簽名」 |
| `customer_signature_url IS NOT NULL OR customer_signature_proof_url IS NOT NULL` | PI 主場 | 「車主尚未簽名 / 上傳替代截圖」 |
| `pre_inspection_quote_items` count ≥ 1（active、未 deleted） | PI 主場 | 「報價單為空，無法轉 RO」 |
| 沒有 `tech_findings.decision = 'none'` 的項 | PI 主場 | 「尚有技師檢查項未做車主決策（同意 / 暫緩 / 拒絕）」 |
| 該 PI 沒有現存 `pi_ro_transfers.status = 'confirmed'`（partial unique index） | 本頁 | 「本預檢單已開立 RO（RO-XXX），不可重複轉 RO；如需重開請先取消既有 RO」 |
| `p1_prefix / p2_prefix` 合法組合（11 種） | ro-phase1 業務規則 | 「業務類型與付款性質組合不合法」 |
| 操作者有 RO 開立權限 | RBAC `permissions.code='aftersales.ro.create'` | 「無權限開立工單」 |

⚠️ **[需確認] 灰色情境**：

- 「車主第一次簽名用截圖代替」是否允許 transfer？依 demo 是允許的；但 precheck-sa §11 第 2 點要 Phase 3 決定要不要主管覆核。如果未來決定需主管覆核 → 多一道閘門「`metadata.signature_substitute=true` 時要求 `metadata.supervisor_approved_at IS NOT NULL`」。

---

## 6. Typed vs JSONB 評估（本頁新增表 `pi_ro_transfers`）

| 欄位 | 落腳 | 理由 |
|---|---|---|
| `id / brand_id / pre_inspection_id / repair_order_id / status / confirmed_at / confirmed_by / reverted_at / revert_reason` | typed | 結構穩、會被 query / index、跨頁用 |
| `snapshot`（整包車主/車輛/quote_items[]/deferred_items[]/totals/...） | **jsonb 整包** | 是 event payload、永不 mutate、不 group by 內部 key；schema 演化時不影響歷史 row |
| `metadata` | jsonb | 推播 idempotency key、UI 狀態標記等 |

→ snapshot 不展平成 typed columns 的理由：

1. **形狀會跟 PI / RO schema 一起演化**，每次升 typed 就要寫遷移
2. **不 query 內部 key**（report 直接看 RO 端的 typed columns，不挖 transfer snapshot）
3. **append-only 性質**強烈，jsonb 適合存事件快照

→ 例外：如果 Phase 2 落地後發現 `snapshot.totals.total` 真的會被 dashboard 高頻查，可以 promote 成 `total_amount_at_transfer numeric(12,2)` typed column 並雙寫。Phase 1 先 jsonb。

---

## 7. 跨模組共讀 / 共寫盤點

| 模組 | 用 transfer 什麼 | 方向 |
|---|---|---|
| 01 預約看板 | `confirmTransferToRO` 後 UPDATE `appointments.metadata.linked_ro_id` | 寫 |
| 02 RO 工單 | 接收 `confirmTransferToRO` INSERT 出來的 RO（reverse FK：`repair_orders` 端不直接知道 transfer 存在，需要時透過 `pi_ro_transfers WHERE repair_order_id=...` 反查） | 寫 |
| 03 維修項目 | 接收 transfer 帶入的 `ro_lines`（含 `pi_quote_item_id` 反查 FK 給 audit） | 寫 |
| 05 增項閉環 | `confirmTransferToRO` 順手 INSERT `loop_cases` for deferred 項 | 寫（單向） |
| 06 竣工複檢 | revert RO 時要先檢查「沒進到竣工複檢」 | 讀（gate） |
| 07 售後管理 | KPI: confirm_to_ro_rate / lost_after_pi_rate / retransfer_rate | 讀（aggregate） |
| 08 結帳收款 | 透過 `repair_orders.warranty_status_snapshot / mileage_in / estimated_*` 算折扣 / 索賠 | 讀（透過 RO） |
| 10 工單查詢 | 跨 PI / RO 搜尋「轉換歷史」 | 讀 |
| Notification Hub | `pre_inspection.transferred_to_ro` event subscriptions / targets / deliveries | 寫 |

---

## 8. Schema 草案（Phase 4 才會寫 migration）

```sql
-- 新表（本頁唯一新增）
CREATE TABLE pi_ro_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  pre_inspection_id uuid NOT NULL REFERENCES pre_inspections(id),
  repair_order_id   uuid REFERENCES repair_orders(id),

  status text NOT NULL CHECK (status IN ('pending','confirmed','reverted','failed')),
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES employees(id),
  reverted_at  timestamptz,
  revert_reason text,

  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON pi_ro_transfers (brand_id, status);
CREATE INDEX ON pi_ro_transfers (pre_inspection_id);
CREATE INDEX ON pi_ro_transfers (repair_order_id);

-- 每張 PI 最多 1 筆 confirmed（partial unique）
CREATE UNIQUE INDEX pi_ro_transfers_one_confirmed_per_pi
  ON pi_ro_transfers (pre_inspection_id)
  WHERE status = 'confirmed';

-- RLS（brand-aware，4 條 user_has_brand）
ALTER TABLE pi_ro_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY pi_ro_transfers_select ON pi_ro_transfers FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY pi_ro_transfers_insert ON pi_ro_transfers FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY pi_ro_transfers_update ON pi_ro_transfers FOR UPDATE USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY pi_ro_transfers_delete ON pi_ro_transfers FOR DELETE USING (user_has_brand(brand_id));

-- ro_lines 多一個欄位 pi_quote_item_id（屬 ro-lines-phase1 主場、本頁標出來給姊妹頁認領）
-- ALTER TABLE ro_lines ADD COLUMN pi_quote_item_id uuid REFERENCES pre_inspection_quote_items(id);
```

⚠️ **本提案不寫實際 migration、不執行 DDL、不動 nav_nodes、不動 code、不動 git**。

---

## 9. Domain Helper 規劃（Phase 4 才建檔）

```
src/domain/pi-ro-transfer.ts           -- 主 facade
src/domain/pi-ro-transfer.constants.ts -- TransferStatus enum / RevertReason enum
```

落腳討論：

- 是否併入 `src/domain/pre-inspections.ts`？→ 否。Transfer 是事件 entity、跟 PI 主檔的 CRUD 屬性不同；且 transfer 同時要動 RO / appointments / loop_cases，跨多 entity，獨立 facade 較清晰。
- 是否併入 `src/domain/repair-orders.ts`？→ 否。RO facade 應管 RO 自身 CRUD + 後續編輯（追加項目 / 領料 / 複檢 / 授權），transfer 屬 RO 上游事件。
- 推薦命名：`pi-ro-transfer.ts` 而非 `transfers.ts`（避免將來「庫存調撥 / 跨店轉單」也叫 transfer 撞名）。

API surface：

```ts
'use server';
export async function buildTransferSummary(pi_id: string): Promise<TransferSummary>;
export async function verifyTransferEligibility(pi_id: string): Promise<EligibilityResult>;
export async function confirmTransferToRO(input: ConfirmTransferInput): Promise<Result<{ repair_order_id, ro_code }>>;
export async function revertTransfer(ro_id: string, reason: string): Promise<Result>;
```

⚠️ `pi-ro-transfer.ts` 走 `'use server'` → 所有 const / enum / type 拆到 `.constants.ts`（SKILL 紀律，已踩雷三次）。

---

## 10. nav_nodes（雙 brand）

**本頁不 INSERT nav_node**。Transfer Overlay 不是獨立 route，沒有 sidebar 入口。

售後群組底下的 nav_nodes 由姊妹頁（precheck-sa / ro / ro-lines）共同規劃時統一處理。

---

## 11. Critical Files（Phase 4 才建）

```
DB:
  - migration: create pi_ro_transfers + RLS
  - migration: ALTER ro_lines ADD pi_quote_item_id（屬 ro-lines 主場，本頁標出來給姊妹頁認領）

Domain:
  - src/domain/pi-ro-transfer.ts
  - src/domain/pi-ro-transfer.constants.ts

UI 元件（隸屬 PI wizard）:
  - src/app/(workspace)/aftersales/pre-inspections/[id]/_components/transfer-overlay.tsx
    （顯示 summary、兩顆 button、跑 verifyTransferEligibility → confirmTransferToRO → router.push RO）
  - src/app/(workspace)/aftersales/pre-inspections/[id]/_components/tab5-signature.tsx
    （SA 環檢版 + RO 串接版共用，內含 button「下一步」→ overlay）

跨頁影響:
  - src/app/(workspace)/aftersales/repair-orders/[id]/_components/ro-tab-f-signature.tsx
    需新增「⚠️ 已刪除項目 reconfirm」紅卡片區塊（從 pi_ro_transfers.snapshot.deleted_items_snapshot 拉）
  - src/app/(workspace)/aftersales/repair-orders/[id]/page.tsx
    「revert」操作 button（取消 RO + 解除 transfer）— 屬 ro-phase1 範疇，本頁標出需求
```

---

## 12. Verification（Phase 4 落地完手測；Phase 1 先列）

1. **PI 沒 confirmed 不可 transfer**：手動把 PI 改回 draft 試打 confirmTransferToRO → 應 reject
2. **Atomicity**：在 `confirmTransferToRO` 第 3 步（INSERT repair_orders）人為製造失敗（如違反 RO unique constraint），驗證 transaction rollback、`pi_ro_transfers` 沒留 row、`pre_inspections.linked_ro_id` 不變
3. **流水號併發**：兩個 session 同時對同一個 PI 打 confirmTransferToRO → 一個成功、一個被 partial unique 擋
4. **快照不變性**：transfer 完後事後改 `pre_inspections.customer_complaint`，`pi_ro_transfers.snapshot.customer_complaint` 應保持原值
5. **revert 後可重轉**：cancel RO → revertTransfer → 同 PI 重新跑 confirmTransferToRO 應成功（新 transfer row、新 RO id）
6. **deferred 項自動入 loop_cases**：PI 有 2 個 defer / 1 個 reject → transfer 後 `loop_cases` 多 3 筆，且 reject + safety=1 推 LINE 給主管
7. **第二次簽名不污染 PI 簽名**：RO Tab F 簽名後 `repair_orders.customer_signature_2_url` 有值、`pre_inspections.customer_signature_url` 不變
8. **跨 brand 隔離**：以 Ducati 使用者試 SELECT Indian 的 pi_ro_transfers → RLS 應擋
9. `npx tsc --noEmit` / `npx eslint <touched>` — 0 errors

---

## 13. 開放問題（Phase 3 拍板）

1. **`pi_ro_transfers` 獨立表 vs 塞 `repair_orders.metadata`**：本提案推薦獨立表（§0 / §3.4）。用戶要不要這個 audit 級別？
2. **推播 event_code 命名 + 對象**：`pre_inspection.transferred_to_ro` 對哪些 target（技師 / 售後主管 / 車主 / 零件專員 / SA 自己）？safety=1 reject 的條件式推播？
3. **保固索賠類型自動勾選**：依 PI `has_warranty_concern + warranty_snapshot` 預設勾選、還是只 hint 由 SA 手動勾？
4. **revert RO 時 PI 狀態**：保持 `confirmed`（推薦）vs 回 `in_progress` 准許 SA 修報價？
5. **revert RO 時 loop_cases**：hard delete（推薦：cancel + revert_reason）vs 保留（暫緩追蹤仍有效）？
6. **deleted_items 在 RO Tab F 的紅色 reconfirm 卡片**：來源是 `pi_ro_transfers.snapshot.deleted_items_snapshot` 還是即時查 `pre_inspection_quote_items WHERE deleted=true`？推薦前者（snapshot 一致性）。
7. **transfer overlay 顯示 LU 工時 vs 分鐘**：HTML demo 寫 「LU × 6 分鐘 × NT$1,650/小時」（line 494），公式進 transfer overlay 還是只顯示金額？
8. **重複 confirm 防抖**：除了 partial unique index，前端 button 是否要在 pending 期間 lock？應該要（CLAUDE.md §UX 互動規範強制）。

---

## 14. 邊界（不歸本頁）

| 不歸本頁 | 歸屬 |
|---|---|
| PI 5 個 tab 內容 / schema | precheck-sa-phase1 |
| RO 6 個 tab 內容 / schema / 前綴 / 流水號 | ro-phase1 + ro-lines-phase1 |
| 領料雙簽 / 出庫流程 | 03 維修項目 / 06 領料子模組 |
| 電子打卡 | 06 / 工時追蹤模組 |
| 竣工複檢簽核 | 06_竣工複檢 |
| 車主第二次簽名 / 取車通知設定 | ro-phase1 Tab F + 11 取車通知設定 |
| 增項閉環 D+3 / D+10 追蹤排程 | 05_增項閉環（loop_cases 主場） |
| 推播 hub 訂閱管理 | Notification Hub |

⚠️ **本提案只負責 PI → RO 之間的 transfer 契約**。Transfer 完成後，後續任何 RO 端操作都不歸本頁；revert RO 的「能不能 revert 的閘門」屬 ro-phase1，但 revert 觸發的「解除 transfer / PI 狀態 / loop_cases 處理」歸本頁。

---

## 15. Phase 1 自評（依 SKILL 五階段紀律）

- ✅ 走完 Phase 1（讀 HTML / 讀 references / 抽 entities / actions / kpis / implied_pages）
- ✅ 雙 brand RLS 提醒（§8）
- ✅ 接續姊妹頁結論、不重複 PI schema（§2、§14）
- ✅ 聚焦在用戶指定的「副作用」（§4）與「資料快照策略」（§3）
- ✅ 流程閘門明確（§5）
- ✅ 跨模組共讀盤點完整（§7）
- ✅ 標出 `[需確認]` 給 Phase 3 拍板（§13）
- ❌ 不寫 code / DB migration / 不動 git / 不動 nav_nodes / 不動 Notion（依用戶指示）

---

**Phase 1 終點。本頁職責 = 「PI→RO transfer 契約 + 快照表 `pi_ro_transfers` + transfer overlay 元件 + confirmTransferToRO/revertTransfer 兩支 server action」。等用戶 review 後決定是否進 Phase 2。**
