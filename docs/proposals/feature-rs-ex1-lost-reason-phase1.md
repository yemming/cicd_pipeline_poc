# RS_EX1 流失原因 ROOT CAUSE 編碼 — Phase 1 提案

> BDN 第三輪 #14 / 2026-05-16 / 自動化夜跑 sub-agent

## 一、需求

規格：`docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS_EX1_保險招攬工作台_v1.html` § 「流失原因分析」

現況：保險招攬工作台的「電訪卡片展開區」已有一個 `LOST_REASONS` dropdown，但語義是「流失**去向**」（客戶跑去哪裡投保了）：

```
電銷直接投保 / 親友介紹投保 / 自行至保險公司 / 抱怨，不考慮 / 其他原因
```

BDN 第三輪 #14 要求補一個 **ROOT CAUSE 編碼**，回答「為什麼會流失」這個業務問題：

```
客戶決策者已投保他家 / 價格太高 / 服務滿意度低 / 保單需求改變 / 其他
```

兩者語義不同、不互相取代——「去向」是事實描述（流到哪），「ROOT CAUSE」是因果分析（為何流），都要存。

## 二、現況盤點

| 物件 | 位置 | 狀態 |
|---|---|---|
| 既有 LOST_REASONS 字典 | `src/app/(workspace)/sales/insurance/_components/insurance.constants.ts:79` | 5 筆寫死陣列 |
| 既有 dropdown | `insurance-board.tsx:530-538` | 「流失去向」綁 `formState[].lost` |
| 既有 PerfBox「流失原因分析」 | `insurance-board.tsx:662-666` | hardcoded `PERF_LOST_REASONS` 4 筆 |
| 保險件 case state | 純 in-memory `InsCase[]` | 沒接 DB |
| `sales_dictionary` 表 | Supabase / 已有 8 個 kind | competitor / insurer / insurance_type 都在裡面 |
| `business_rules` 路線 | 不適用 | 這是 enum 字典、不是規則 |

## 三、Phase 1 架構提案（自動拍板，不阻塞 user）

### 1. 字典存放（**sales_dictionary** + 新 kind）

新增 kind `insurance_lost_reason`：

```sql
-- 1. 擴 CHECK constraint
ALTER TABLE sales_dictionary DROP CONSTRAINT sales_dictionary_kind_check;
ALTER TABLE sales_dictionary ADD CONSTRAINT sales_dictionary_kind_check
  CHECK (kind = ANY (ARRAY[
    'lead_source','purchase_method','contact_type','payment_method',
    'response_code','competitor','insurer','insurance_type',
    'insurance_lost_reason'      -- NEW
  ]));

-- 2. seed 雙 brand 各 5 筆（10 筆）
INSERT INTO sales_dictionary (brand_id, kind, code, label, sort_order, is_active, is_system)
VALUES
  ('ducati','insurance_lost_reason','already_insured', '客戶決策者已投保他家', 10, true, true),
  ('ducati','insurance_lost_reason','price_too_high',   '價格太高',              20, true, true),
  ('ducati','insurance_lost_reason','service_quality',  '服務滿意度低',          30, true, true),
  ('ducati','insurance_lost_reason','needs_changed',    '保單需求改變',          40, true, true),
  ('ducati','insurance_lost_reason','other',            '其他',                  90, true, true),
  ('indian','insurance_lost_reason','already_insured', '客戶決策者已投保他家', 10, true, true),
  ('indian','insurance_lost_reason','price_too_high',   '價格太高',              20, true, true),
  ('indian','insurance_lost_reason','service_quality',  '服務滿意度低',          30, true, true),
  ('indian','insurance_lost_reason','needs_changed',    '保單需求改變',          40, true, true),
  ('indian','insurance_lost_reason','other',            '其他',                  90, true, true);
```

對應更新 `src/domain/sales-settings.constants.ts`：
- `SalesDictKind` union 加 `"insurance_lost_reason"`
- `SALES_DICT_KINDS` 陣列補一筆
- `SALES_DICT_LABELS` 補一筆（group: `"RS_EX1 保險招攬"` / accent: purple / icon: 🔎）

這樣本字典自動出現在 `/sales/settings/handcard-params` 後台維護介面（沿用既有 helper、零新 UI）。

### 2. UI 改動（最小侵入）

`insurance-board.tsx`：
- 既有「流失去向」select 保留不動
- 在它隔壁新增一個 select「流失原因（ROOT CAUSE）」，綁 `formState[].lostReasonCode`
- options 從 prop `lostReasons: { code, label }[]` 來（page.tsx server component 撈 `sales_dictionary`）
- `saveCall` 把 code 寫進 case 的 `lostReasonCode`
- PerfBox「流失原因分析」改用 `lostReasons` label 群聚 cases，hardcoded fallback 保留

### 3. 資料持久化策略（不開新表）

現役頁面整個是 in-memory state（沒 DB schema 存 insurance case）。本輪**不**為了一個欄位開 `insurance_cases` table，依照天條：
- UI 端把 `lostReasonCode` 加進 `InsCase` 型別
- 等未來建 `insurance_cases` table 時，這欄就是 typed core column；型別已就位、零搬遷成本
- BDN #14 的驗收門檻是「能選、有顯示、能反映到分析面板」，不是「跨 session 持久化」

### 4. Domain Helper（reuse 既有）

`src/domain/sales-settings.ts` 的 `listSalesDictionary({ kind: 'insurance_lost_reason' })` 已現成可用，不需新檔。

新增一個極簡 server fn 在 `page.tsx`：先把 board 升級成 server component wrapper 撈 dictionary → 傳 prop → client component。

## 四、不做的事

- ❌ 開 `insurance_cases` 新表（範圍外）
- ❌ 改既有「流失去向」select 的語義
- ❌ 後台「流失原因」獨立 admin 編輯介面（`/sales/settings/handcard-params` 自動吃，零工）
- ❌ 改 PERF_LOST_REASONS 的 hardcoded fallback

## 五、驗收門檻

1. `npx tsc --noEmit` 0 errors
2. `npx eslint src/app/(workspace)/sales/insurance src/domain/sales-settings*` 0 errors
3. Audit `grep -rn "@/lib/supabase" "src/app/(workspace)/sales/insurance"` 預期 0 hit
4. Playwright headless 截圖 `tmp/bdn14-*.png`：登入 → /sales/insurance → 展開 case → 看到「流失原因（ROOT CAUSE）」dropdown 有 5 個 options
5. DB 驗證 `SELECT count(*) FROM sales_dictionary WHERE kind='insurance_lost_reason'` 預期 10

## 六、自動拍板紀錄

授權範圍：BDN 第三輪、Ming 已授權夜跑、不阻塞詢問。本提案符合天條（domain helper 唯一入口、不開新表、reuse `sales_dictionary` + `business_rules` 雙軸）→ 直接進 Phase 4 落地。
