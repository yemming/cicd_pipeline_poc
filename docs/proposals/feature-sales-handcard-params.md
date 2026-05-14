# 提案：手卡參數設定頁（Sales Handcard Parameters）

> 來源：Stitch nav_node `6062f231-8568-40cd-b89d-ffecfa18699c`（Indian-only）
> 日期：2026-05-14
> 階段：架構提案（已自決拍板、Ming 預先授權）

## 1. 結構摘要

銷售模組的 master settings 集合頁：管理電子手卡 / CRM 電訪 / 保險招攬模組共用的下拉選項、數值閾值、功能開關。是「設定頁 pattern」、非 list view，**不走 DataGrid**。

頁面分三類參數：
- **清單型 8 段**（線索來源、購買方式、接觸判別、付款方式、客戶回應、競品去向、合作保險公司、投保險種）— 可拖曳排序的下拉選單字典
- **數值型 4 個**（第一次跟進天數、第二次跟進天數、休眠天數、保有率計算區間）— 業務閾值
- **開關型 5 個**（試乘預約、LINE 推播、NPS 自動發送、CPO/DPO 分級、RS 個人漏斗）— feature flag

## 2. Schema 草案

### 新表 `sales_dictionary`（對齊既有 `parts_dictionary` pattern）

```sql
CREATE TABLE sales_dictionary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL REFERENCES brands(id),
  kind text NOT NULL CHECK (kind IN (
    'lead_source','purchase_method','contact_type','payment_method',
    'response_code','competitor','insurer','insurance_type'
  )),
  code text NOT NULL,
  label text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (brand_id, kind, code)
);

-- 四條 brand-aware RLS（select / insert / update / delete 都過 user_has_brand）
ALTER TABLE sales_dictionary ENABLE ROW LEVEL SECURITY;
CREATE POLICY sd_select ON sales_dictionary FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY sd_insert ON sales_dictionary FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY sd_update ON sales_dictionary FOR UPDATE USING (user_has_brand(brand_id));
CREATE POLICY sd_delete ON sales_dictionary FOR DELETE USING (user_has_brand(brand_id));
```

### 既有 `business_rules` 新增兩種 rule_kind

- `sales_threshold` — config: `{ key, value, unit, min, max, default_value }`
- `sales_feature_flag` — config: `{ key, enabled, description }`

不動 schema。CHECK constraint 是業務層用 helper 守。

### 欄位分類

| 欄位 | 落腳 | 理由 |
|---|---|---|
| kind / code / label | typed | 多頁查詢、需 unique index、報表會用 |
| sort_order / is_active / is_system | typed | 列表 sort / filter 必用 |
| description | typed | 直接渲染、不會多型 |
| 未來擴充屬性（如 color、icon） | jsonb (metadata) | 變動中、單頁顯示用 |

## 3. Domain Helper 規劃

檔案：`src/domain/sales-settings.ts`（async functions）+ `src/domain/sales-settings.constants.ts`（kind labels / threshold keys / flag keys 等常數）

```ts
// 字典操作
export async function listSalesDictionary(filter?: { kind?: SalesDictKind }): Promise<SalesDictRow[]>
export async function addSalesDictItem(input: SalesDictInput): Promise<Result<{ id: string }>>
export async function updateSalesDictItem(id: string, patch: Partial<SalesDictInput>): Promise<Result<{ id: string }>>
export async function deleteSalesDictItem(id: string): Promise<Result<{ id: string }>>
export async function reorderSalesDictItems(kind: SalesDictKind, orderedIds: string[]): Promise<Result<{ updated: number }>>

// 閾值 & 開關（共用 business_rules）
export async function listSalesThresholds(): Promise<SalesThresholdRow[]>
export async function updateSalesThreshold(key: string, value: number): Promise<Result<{ id: string }>>
export async function listSalesFeatureFlags(): Promise<SalesFlagRow[]>
export async function setSalesFeatureFlag(key: string, enabled: boolean): Promise<Result<{ id: string }>>
```

實作策略：Day 1 直連 supabase + getActiveScope() + requirePermission。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| 任何 dictionary CRUD | revalidatePath `/sales/settings/handcard-params` | 確定 |
| feature_flag 切換 LINE 推播 | 未來會影響 notification dispatch（目前 notification_subscriptions 是另一個 SSOT，這裡先當顯示用 flag，不接 dispatch） | [自決：當顯示 flag、不接 dispatch] |
| feature_flag 切換 NPS 自動 | 未來會影響 cron / after() trigger，POC 階段先當 flag 落地、不接邏輯 | [自決同上] |

POC 階段：flag 純落地、業務模組目前不讀 — 等後續工項串。

## 5. 會計事件分析

**無** — 純資料維護 / 純設定頁、不產生任何資金 / 庫存 / 收入 / AR / AP 流。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 手卡參數設定 | `/sales/settings/handcard-params` | Setting Page（折疊 section 列表） | 自製、非 list view、非 detail view |

頁面結構：
- Workspace shell（dual-rail，自動套）
- `useSetPageHeader({ title: '手卡參數設定', hideSearch: true })`
- main 內：
  - 規範說明 blue rule-box
  - Section 1-8（清單型 8 段）— 每段一個 `<DictSectionCard kind={...}>` client component
  - Section 9（數值型）— `<ThresholdSection>` client component
  - Section 10（開關型）— `<FlagSection>` client component
- 每個 section 折疊 + 自己的 banner + pending state（不做「全頁統一儲存」、改 per-section 即存即生效，更符合 §UX 互動規範）

## 7. nav_nodes（Indian-only — 節點本來就只有 Indian）

```sql
UPDATE nav_nodes
   SET page_kind = 'react_route',
       href      = '/sales/settings/handcard-params'
 WHERE id = '6062f231-8568-40cd-b89d-ffecfa18699c';
```

Ducati 對應節點不存在 — 此設定頁是 Indian-only 業務功能（觀察 sibling 節點同樣 Indian-only）。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/sales-settings.ts` |
| 新增 | `src/domain/sales-settings.constants.ts` |
| 新增 | `src/app/(workspace)/sales/settings/handcard-params/page.tsx` |
| 新增 | `src/app/(workspace)/sales/settings/handcard-params/_components/handcard-params-view.tsx` |
| 新增 | `src/app/(workspace)/sales/settings/handcard-params/_components/dict-section-card.tsx` |
| 新增 | `src/app/(workspace)/sales/settings/handcard-params/_components/threshold-section.tsx` |
| 新增 | `src/app/(workspace)/sales/settings/handcard-params/_components/flag-section.tsx` |
| 重生 | `src/lib/database.types.ts` |

## 9. Verification

1. `npx tsc --noEmit` 0 errors
2. `npx eslint <touched paths>` 0 errors
3. `grep -rn "@/lib/supabase" "src/app/(workspace)/sales/settings"` = 0 hit
4. Playwright CLI：headless 進 `/sales/settings/handcard-params`、截圖、確認 8 個清單 section + threshold + flag section 都渲染、點開新增 modal 渲染
5. SQL 驗證 seed：`SELECT kind, count(*) FROM sales_dictionary WHERE brand_id='indian' GROUP BY kind` = 8 種 / each ≥ 3 筆
6. nav_node 升級成 `react_route`、html_storage_path 保留

## 10. 自決決策（Ming 已預先授權）

- [x] dictionary 用獨立表（不擠 business_rules），對齊 `parts_dictionary` pattern
- [x] threshold / flag 用 `business_rules` + 新 rule_kind
- [x] **per-section 即存即生效**（不做「全頁統一儲存」）— 更符合 DealerOS §UX 規範（pending + 鎖 UI）、減少 dirty state 心智負擔
- [x] 拖曳排序 v1 不做、用「↑↓」button 暫代（拖曳 UX 在 setting page 並非必需、後續再升級）
- [x] 「匯出/匯入設定 JSON」v1 不做（spec demo only）
- [x] feature flag 在 POC 純落地、業務模組暫不讀（避免越界改既有 dispatch）
- [x] 只動 Indian brand（節點本來就 Indian-only）
- [x] seed 用 Stitch HTML 的範例值（6 個線索來源 + 7 個競品等）
