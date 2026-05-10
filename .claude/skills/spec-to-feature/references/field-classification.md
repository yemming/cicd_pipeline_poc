# Field Classification — Typed Column vs JSONB Metadata

判斷一個欄位該開 typed column 還是丟 metadata jsonb。階段 1-2 必讀。

## 決策樹

```
這個欄位 ────► 會被 SQL WHERE / ORDER BY / 報表 group by 用？
                  ├─ 是 ──► TYPED COLUMN（要 index）
                  └─ 否 ──► 它是 FK 嗎？
                              ├─ 是 ──► TYPED COLUMN（FK 約束）
                              └─ 否 ──► 它要被 RLS policy 引用嗎？
                                          ├─ 是 ──► TYPED COLUMN
                                          └─ 否 ──► 形狀已穩、不會新增 sub-key？
                                                      ├─ 是 + 會被三頁以上用 ──► TYPED COLUMN
                                                      └─ 否 ──► JSONB METADATA
```

## 必 Typed（沒得商量）

- **Primary Key**：永遠 `id uuid PRIMARY KEY`
- **Tenant 隔離欄位**：`brand_id text`（RLS 會用）、`group_id uuid`、`subsidiary_id uuid`
- **狀態欄位**：`is_active boolean`、`status text`（會被 list filter / 報表 group）
- **時間欄位**：`created_at` / `updated_at` / `applied_at` / `due_date`（排序 / 篩選）
- **金額**：`total_amount numeric(15,0)`、`unit_price numeric`（報表 sum / avg）
- **數量**：`quantity numeric`、`stock_count int`
- **外鍵**：`*_id uuid REFERENCES ...`（任何指向其他表的）
- **業務代碼**：`code text UNIQUE`（list 主索引、人會打）
- **業務名稱**：`name text`（顯示主欄位、會被搜尋）

## 強烈建議 Typed

- **被報表 GROUP BY / SUM 的欄位**：例如「退貨原因」可能要做月度統計 → typed
- **dropdown 選項固定 < 10 個的欄位**：例如「直營/經銷」、「主倉/寄存/保固」→ typed text（不要硬上 enum，未來改名痛苦）
- **時間欄位即使現在沒查也別丟 jsonb**：`created_at` / `updated_at` 是 audit 起點

## 強烈建議 JSONB Metadata

- **單頁專用、純顯示**：例如某張單上的「客服備註」、「老闆批示」
- **形狀還沒長定**：例如還沒決定要不要結構化的「物流資訊」（單號 + 出貨方式 + 預計到貨日 + 簽收照片 URL…）
- **附帶 metadata**：例如「user agent」、「source channel」、「import_batch_id」之類埋點資訊
- **多語系 / 國際化欄位**：`{ "zh-TW": "...", "en-US": "..." }` 結構靠 jsonb 比拆多欄好維護
- **設定 / 選項類**：`{ "allow_email": true, "allow_sms": false }` 這種布林集合，用 jsonb 比 N 個欄位好

## 邊緣案例（提案要列出來、階段 3 問用戶）

- **5-20 個固定選項的 dropdown**：例如「退貨原因」 5 種選項，但會 group by — 這要不要走 lookup table？通常先 typed text，未來真的需要才升 lookup
- **可選的金額 / 數量**：例如「最低訂購量」可選 — typed numeric NULL 即可，別丟 jsonb
- **照片 / 檔案 URL**：單張 → typed text；多張 → `metadata.attachments: []`（jsonb array）
- **長文字描述**：< 500 字 → typed text；長且結構化（多段落 + heading）→ jsonb

## 反例 — 不要這樣做

❌ **全 typed**：
```sql
-- 為了「彈性」加一堆可能沒用的欄位
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS line_oa_id text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS preferred_supplier text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS xxx text;
-- 結果 90% 是 NULL、增加 schema 噪音
```
→ 不確定要不要的全丟 metadata jsonb，等真的有 3 頁要用再 promote

❌ **全 jsonb**：
```sql
-- 連 name / status / brand_id 都丟 jsonb
CREATE TABLE foo (id uuid PRIMARY KEY, data jsonb);
```
→ RLS 寫不出來、報表跑不動、IDE 完全無 type 提示，這是 NetSuite EAV 的痛處重演

❌ **typed + jsonb 重複存**：
```sql
-- typed column 跟 metadata.field_name 都存
ALTER TABLE x ADD COLUMN status text;
INSERT INTO x VALUES (..., '{"status": "active"}');
-- 不一致時誰是真的？
```
→ 一個欄位只放一個地方

## Promote 案例（從 jsonb 升 typed）

當 metadata 某 key 出現在三頁以上：

```sql
-- 1. 加 typed column
ALTER TABLE organizations ADD COLUMN partnership_date date;

-- 2. backfill
UPDATE organizations
   SET partnership_date = (metadata->>'partnership_date')::date
 WHERE metadata ? 'partnership_date';

-- 3. 從 metadata 移除（可選，保留也 OK）
UPDATE organizations
   SET metadata = metadata - 'partnership_date'
 WHERE metadata ? 'partnership_date';

-- 4. domain helper 把它從 rest 拆出來
-- 5. UI 不動
```

## 提案產出格式

階段 2 產提案時，每張表列：

```markdown
### 欄位分類

| 欄位 | 落腳 | 理由 |
|---|---|---|
| return_no | typed text UNIQUE | unique 索引、人會打 |
| original_po_id | typed FK | FK 完整性 |
| supplier_id | typed FK | 報表 group by |
| return_reason | typed text | 5 種固定值，但會 group by 統計 |
| status | typed text | list filter 主軸 |
| total_amount | typed numeric(15,0) | 報表 sum |
| applied_at | typed timestamptz | 排序索引 |
| description | typed text | 純顯示但欄位穩、單一字串 |
| 物流單號 | jsonb metadata | 形狀未定、可能是 array（多家物流） |
| 退款方式 | jsonb metadata | 還在討論要不要做信用卡退款 |
| 客訴照片 URLs | jsonb metadata | array、單頁顯示用 |
```

理由欄要具體寫出「為什麼」，不要 "obvious" 帶過 — 這是用戶 review 的依據。
