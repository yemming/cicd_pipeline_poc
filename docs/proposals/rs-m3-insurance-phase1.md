# BDN #5 Phase 1 拆題提案 — RS_M3 主管設定 · 保險設定

**任務來源**：第三輪夜跑 BDN #5
**Spec**：`docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html` 行 541–727（Tab 4 保險設定）
**狀態**：純拆題提案、未落地、零 DB 寫入
**寫於**：2026-05-16

---

## 1. Spec 實際盤點（看 HTML，不是看卡片提示）

Tab 4「🔔 保險設定」實際內含 **5 個 section**（卡片預估的「6 個子模組」其實是把 #6 拆成 6 個小參數混算）。完整拆解如下，每個 section 內可再切多個獨立子題：

### Section A · 保險公司清單（行 544–560）

- 介面：簡單 list view，每列「名稱 + 備註 + 系統預設/自訂 chip + 刪除鈕」，頂部「共 N 家」+「＋ 新增」
- Seed 資料（spec 內 `insCoData`）：富邦產險、國泰世紀產險、新光產險、泰安產險、明台產險、兆豐產險、其他 — 都 `sys:true`
- 互動：`prompt()` 新增（demo 級）、`confirm()` 刪除 sys 項目
- 用途：RS_EX1 電訪工作台「原保公司」「出單公司」下拉來源

### Section B · 續保類型（行 562–578）

- 介面：list view，每列「名稱 + 描述 + chip + 刪除鈕」
- Seed（`insTypeData`）：新轉續、續轉續、斷轉續、外轉續、在修未投保 — 都 `sys:true`
- 對應原 Excel「続保类型」欄
- 比 Section A 多一個 `description` 欄位（但 schema 上仍是同款 list view）

### Section C · 電訪結果選項（行 580–618）

**這是 spec 內最複雜的 section** — 一個三欄並排 grid，**內含三個獨立 list**：

| 子分組 | spec 變數 | seed | 配色 |
|---|---|---|---|
| C1 · 調研結果（成功類） | `insContactData` | 電訪成功 / 客忙再聯繫 / 無法接通 / 錯誤號碼 / LINE 留言（待回覆）/ 拒絕電訪 | 綠 `#0F6E56` |
| C2 · 流失去向 | `insLostData` | 電銷直接投保 / 親友介紹投保 / 自行至保險公司 / 抱怨不考慮 / 其他原因 | 紅 `#C8001A` |
| C3 · 報價狀態 | `insQuoteData` | LINE 報價 / 現場報價 / Email 報價 / 已成交並出單 | 琥珀 `#854F0B` |

⚠️ **注意**：spec 子分組標題寫「調研結果」，但 section header 寫「電訪結果選項」、並描述「分『調研成功』『流失去向』『報價狀態』三組」— 卡片預定的「#6 電訪結果選項」其實就是這個 section、不需另外拆。

### Section D · 話術模板管理（行 620–638）

- 介面：每段話術一張卡片（彩色 header 顯示標籤 + 標題 + 「RS 唯讀」chip + textarea 編輯區 + 刪除鈕），加「＋ 新增話術段落」
- Seed（`insScripts`）4 段：
  - A · 開場白（調研破冰）— `#185FA5` 藍
  - B · 尚未續保 → VIP 方案介紹 — `#0F6E56` 綠
  - C · 已在他處續保 → 詢問流失原因 — `#854F0B` 琥珀
  - D · 感謝致意 → 預約明年回店 — `#534AB7` 紫
- 互動：textarea inline edit、`addScriptTemplate()` 用 `prompt()` 蒐集標籤 + 標題 + 內文
- 業務語意：「主管統一撰寫、RS 在 EX1 唯讀使用、不可自行修改」

### Section E · 提醒規則設定（行 640–726）

3 欄 grid，內含 **6 個數值參數** + **3 條 boolean 升報規則**：

| key | spec ID | 預設 | 範圍 | 單位 | 用途 |
|---|---|---|---|---|---|
| 緊急提醒（天前） | `ins-urgent-days` | 30 | 1–60 | 天 | 紅燈緊急、RS_EX1 優先顯示 |
| 一般提醒（天前） | `ins-warn-days` | 90 | 30–180 | 天 | 開始顯示於 RS_EX1 |
| 電訪間隔 | `ins-call-gap` | 7 | 1–30 | 天 | 同客戶兩次電訪最短間隔 |
| 最多電訪次數 | `ins-max-calls` | 3 | 1–10 | 次 | 超過自動升報主管 |
| 目標續保率 | `ins-target-rate` | 70 | 1–100 | % | RS_EX1 業績總覽達成率 |
| 佣金目標（月）| `ins-target-rev` | 20000 | 1000+ | 元 | RS_EX1 業績儀表板 |

底下紅底升報規則 checkbox 3 條：

- `rule-maxcall` — 超過最多電訪次數仍未成交 → 進入「上報主管」清單
- `rule-7day` — 到期 7 天內仍未續保 → 強制升報主管
- `rule-nocontact` — 連續 3 次無法接通 → 列入「更正資訊」清單

---

## 2. DealerOS schema 對應

### 已可直接使用（零 schema 變更）

| Spec section | 對應 schema | 對應做法 |
|---|---|---|
| A 保險公司 | `sales_dictionary kind='insurer'` | ✅ **已存在 4 筆 indian seed**（富邦/國泰/新光/明台），spec 還缺泰安、兆豐、其他 — 升級時補 seed |
| B 續保類型 | `sales_dictionary kind='insurance_renewal_type'`（新 kind 但不開新表） | ✅ 重用既有 sales_dictionary，新 `kind` 值不需 DDL |
| C1 調研結果 | `sales_dictionary kind='insurance_call_result'` | ✅ 同上 |
| C2 流失去向 | `sales_dictionary kind='insurance_lost_reason'` | ✅ 同上 |
| C3 報價狀態 | `sales_dictionary kind='insurance_quote_status'` | ✅ 同上 |
| E (1–6) 數值參數 | `business_rules rule_kind='sales_threshold'` 擴充 6 個 key | ✅ 完全沿用既有 sales_threshold pattern（key/value/min/max/unit/label/description/default_value） |
| E (7–9) 升報規則 | `business_rules rule_kind='sales_feature_flag'` 擴充 3 個 key | ✅ 沿用 sales_feature_flag pattern（key/label/enabled/description） |

### 唯一需要新增（但不開新表）

| Spec section | 策略 | 備註 |
|---|---|---|
| D 話術模板 | `sales_dictionary kind='insurance_script_template'` + 把長 textarea 存 `metadata.body`、`metadata.tag`、`metadata.title`、`metadata.color` | ⚠️ **不開 talk_scripts 新表**。sales_dictionary 已有 `label` 存標題、`code` 存標籤（A/B/C/D），長內文丟 metadata jsonb — 符合 CLAUDE.md「形狀還在變、單頁專用、純顯示 → metadata jsonb」原則。若日後話術要做版本控、多語、權限分流，再 promote。 |

### 不需開新表的理由

`sales_dictionary` 表結構（`id / brand_id / kind / code / label / description / is_system / sort_order / is_active / metadata jsonb`）天生支援多 kind 字典，已驗證的 8 個 kind 共 40 row、無 DDL 即可擴 5 個保險字典 + 1 個話術字典 = 6 新 kind、零 schema 風險。

`business_rules` 表 + `rule_kind='sales_threshold'/'sales_feature_flag'` 配 jsonb config — 既有 4 筆 `sales_threshold` + 5 筆 `sales_feature_flag` 已驗證 pattern，直接擴 6+3 row、零 DDL。

---

## 3. 子模組拆題（按落地單位拆）

依「實作獨立性 + 工作量」拆，每子模組可獨立 PR：

| # | 子模組 | 規格 ref | UI 範本 | Schema 策略 | 工作量 | 預估行數 |
|---|---|---|---|---|---|---|
| 5.1 | 保險公司清單 | spec §A 行 544–560 | `customer-tags-view.tsx` 縮水版（單列表 + 新增/編輯 modal） | `sales_dictionary kind='insurer'`（已有 4 筆）+ 補 3 筆 seed | S | ~250 行 |
| 5.2 | 續保類型字典 | spec §B 行 562–578 | 同 5.1 | `sales_dictionary kind='insurance_renewal_type'` 新 kind | S | ~200 行（可 reuse 5.1 元件） |
| 5.3 | 電訪結果三組字典 | spec §C 行 580–618 | 三欄並排 list view（仿 customer-tags-view 但三欄 grid） | `sales_dictionary` 三個 kind：`insurance_call_result` / `insurance_lost_reason` / `insurance_quote_status` | M | ~400 行（三欄共用同個 list 元件） |
| 5.4 | 話術模板管理 | spec §D 行 620–638 | 自刻：彩色 header card + textarea inline edit | `sales_dictionary kind='insurance_script_template'`，`metadata.body/tag/color/title` | M | ~350 行（textarea 鎖 + 樂觀更新） |
| 5.5 | 提醒天數參數（6 個數值）| spec §E 行 650–705 | `handcard-params-view.tsx` 縮水版（多欄位 form + 還原 button） | `business_rules rule_kind='sales_threshold'` 擴 6 個 key | S | ~250 行 |
| 5.6 | 升報主管規則（3 條 boolean）| spec §E 行 707–724 | 紅底 checkbox 區塊 + 儲存（仿 handcard-params 的 flag 區塊） | `business_rules rule_kind='sales_feature_flag'` 擴 3 個 key | XS | ~120 行 |

**工作量總計**：~1570 行（含 server actions、page.tsx、_components、seed migration）

---

## 4. 落地優先序建議

依「依賴關係 + 風險」排：

```
Wave 1（純字典、零依賴、最低風險）
  → 5.1 保險公司清單
  → 5.2 續保類型字典
  （兩個是 RS_EX1 工作台下拉的資料源，先做就解鎖後續業務頁的 mock → 真實切換）

Wave 2（依賴 sales_dictionary 已驗 pattern）
  → 5.3 電訪結果三組字典
  → 5.4 話術模板管理（schema 用 metadata jsonb，須跟 Ming 確認 metadata 形狀）

Wave 3（純參數，跟字典解耦）
  → 5.5 提醒天數參數
  → 5.6 升報主管規則
  （兩個是 RS_EX1 排程邏輯的輸入，但設定頁本身不依賴其他子模組）
```

**首發建議**：先做 5.1（已有 4 筆 seed、補 3 筆即可看到完整畫面、是最快的甜頭），再做 5.5（純參數 UI 範本明確、handcard-params 一字不改）— 兩單合一個 PR 半天可收。

---

## 5. BDN #5.1 ~ #5.6 條目（給主 agent 後續輪次排程）

### #5.1 — RS_M3 保險公司清單

- **規格**：`docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html` 行 544–560
- **DB**：`sales_dictionary kind='insurer'`（已存在 4 筆 indian seed），補 `泰安產險` `兆豐產險` `其他` 3 筆
- **UI 範本**：list view 仿 `src/app/(workspace)/sales/settings/customer-tags/_components/customer-tags-view.tsx`（縮成單字典、無 color/emoji）
- **路由建議**：`/sales/settings/insurance-companies` 或合併進「保險設定」單頁 tab
- **預估**：~250 行 / 工作量 S

### #5.2 — RS_M3 續保類型字典

- **規格**：spec 行 562–578
- **DB**：`sales_dictionary` 新 `kind='insurance_renewal_type'`，seed 5 筆（新轉續/續轉續/斷轉續/外轉續/在修未投保）全部 `is_system=true`
- **UI 範本**：reuse 5.1 的 list view 元件（只換 kind constant）
- **預估**：~200 行 / 工作量 S

### #5.3 — RS_M3 電訪結果三組字典

- **規格**：spec 行 580–618
- **DB**：`sales_dictionary` 新 3 個 kind：
  - `insurance_call_result`（6 筆：電訪成功 / 客忙再聯繫 / 無法接通 / 錯誤號碼 / LINE 留言待回覆 / 拒絕電訪）
  - `insurance_lost_reason`（5 筆：電銷直接投保 / 親友介紹投保 / 自行至保險公司 / 抱怨不考慮 / 其他原因）
  - `insurance_quote_status`（4 筆：LINE 報價 / 現場報價 / Email 報價 / 已成交並出單）
- **UI 範本**：三欄並排 grid，每欄 reuse 5.1 list view（傳 `kind` + `accentColor` prop）
- **預估**：~400 行 / 工作量 M

### #5.4 — RS_M3 話術模板管理

- **規格**：spec 行 620–638 + seed `insScripts` 行 1000–1009
- **DB**：`sales_dictionary kind='insurance_script_template'`，4 筆 seed：
  - `code=A`, `label=開場白（調研破冰）`, `metadata={ body:'...', color:'#185FA5' }`
  - `code=B`, `label=尚未續保 → VIP 方案介紹`, `metadata={ body:'...', color:'#0F6E56' }`
  - `code=C`, `label=已在他處續保 → 詢問流失原因`, `metadata={ body:'...', color:'#854F0B' }`
  - `code=D`, `label=感謝致意 → 預約明年回店`, `metadata={ body:'...', color:'#534AB7' }`
- **UI 範本**：自刻彩色 header card + textarea inline edit；可參考 `customer-tags-view.tsx` 的 modal 模式做 CRUD
- ⚠️ **需 Ming 拍板**：`metadata.body` 還是 promote 成 typed column `description_long text`？目前提案先 metadata、若日後話術要做版本控再 promote
- **預估**：~350 行 / 工作量 M

### #5.5 — RS_M3 提醒天數參數（6 個）

- **規格**：spec 行 650–705
- **DB**：`business_rules rule_kind='sales_threshold'`（已有 4 筆 indian seed）擴 6 筆：
  ```json
  { "key":"insurance_urgent_days",   "label":"保險到期緊急提醒",   "value":30,    "min":1,    "max":60,   "unit":"天",   "default_value":30 }
  { "key":"insurance_warn_days",     "label":"保險到期一般提醒",   "value":90,    "min":30,   "max":180,  "unit":"天",   "default_value":90 }
  { "key":"insurance_call_gap_days", "label":"電訪間隔（天）",     "value":7,     "min":1,    "max":30,   "unit":"天",   "default_value":7 }
  { "key":"insurance_max_calls",     "label":"最多電訪次數",       "value":3,     "min":1,    "max":10,   "unit":"次",   "default_value":3 }
  { "key":"insurance_target_rate",   "label":"目標續保率",         "value":70,    "min":1,    "max":100,  "unit":"%",    "default_value":70 }
  { "key":"insurance_target_rev",    "label":"佣金目標（月）",     "value":20000, "min":1000, "max":999999,"unit":"元",  "default_value":20000 }
  ```
- **UI 範本**：仿 `src/app/(workspace)/sales/settings/handcard-params/_components/handcard-params-view.tsx`（多欄位 form + 還原 button + dirty tracking + 樂觀更新）
- **預估**：~250 行 / 工作量 S

### #5.6 — RS_M3 升報主管規則（3 條 boolean）

- **規格**：spec 行 707–724
- **DB**：`business_rules rule_kind='sales_feature_flag'`（已有 5 筆 indian seed）擴 3 筆：
  ```json
  { "key":"insurance_escalate_on_max_calls",  "label":"超過最多電訪次數仍未成交 → 升報主管",      "enabled":true,  "description":"自動進入「上報主管」清單" }
  { "key":"insurance_escalate_on_7day",       "label":"到期 7 天內仍未續保 → 強制升報主管",        "enabled":true,  "description":"高優先級緊急案件" }
  { "key":"insurance_escalate_on_no_contact", "label":"連續 3 次無法接通 → 列入「更正資訊」清單",  "enabled":true,  "description":"由主管確認聯絡方式" }
  ```
- **UI 範本**：紅底 checkbox 區塊，可獨立或合併進 5.5 同一頁
- **預估**：~120 行 / 工作量 XS

---

## 6. 給主 agent 的執行建議

1. **合併排程選項**：5.5 + 5.6 業務邏輯緊耦合（都是 RS_EX1 排程輸入），可合一個 PR 一次出。5.1 + 5.2 schema 同款（單 list view），元件可抽 generic、合一 PR。
2. **路由設計待 Ming 拍板**：6 個子模組是要 6 個獨立 page，還是合在 `/sales/settings/insurance/` 一頁 tab？建議走 **單頁 + section 折疊**（仿 spec 原貌），減少 sidebar 入口爆炸。
3. **無新表、無 DDL**：6 個子模組落地全程 zero schema migration、全靠 `apply_migration` 寫 seed insert 即可，risk profile 比過去的 master-data 升級還低。
4. **唯一決策點**：5.4 話術 body 存 metadata 還是 promote typed column — Ming 拍板後落地。

---

## 7. 不需確認、直接照做的事

- 用既有 `sales_dictionary` + 新 `kind` 值（無 enum/check constraint 限制）
- 用既有 `business_rules rule_kind='sales_threshold'/'sales_feature_flag'`
- UI 範本：list view → `customer-tags-view.tsx`；參數頁 → `handcard-params-view.tsx`
- seed brand 一律 `indian`（CLAUDE.md MANDATORY）
- 全部走 `@/domain/*` helper、UI 禁直連 supabase（CLAUDE.md MANDATORY）
