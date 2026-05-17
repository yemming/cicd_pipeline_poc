# 提案：RS_M3 主管設定 — KPI 目標值 + HABC 閾值設定

> 來源：`docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html` § Tab 0「📊 KPI 目標值」
> 日期：2026-05-16
> 階段：架構提案（自動拍板、夜跑直接落地）
> 觸發：BDN 第三輪 #2

## 1. 結構摘要

RS_M3 Tab 0 切三段：Layer 1 結果指標目標（3 個數值）、Layer 2 過程指標目標（6 個數值）、HABC 輔助判斷閾值（4 個天數閾值，對應 H/A/B/C 四級客戶意願）。全部是「數值閾值型」配置，由銷售主管維護、儲存後同步至 RS_M1 漏斗看板的紅 / 黃 / 綠標示與 HABC 自動建議。

不含字典型、不含開關型，純數值閾值 → DB / UI pattern 完全套既有 `sales_threshold`。

## 2. Schema 草案

**完全 reuse `business_rules` 表 + jsonb config，零 DDL。** 新增兩個 `rule_kind`：

- `sales_kpi_target` — Layer 1（3 筆）+ Layer 2（6 筆）= 共 9 筆 KPI 目標值
- `habc_threshold` — H/A/B/C 四級天數閾值 = 4 筆

### config jsonb shape（沿用 `sales_threshold`）

```ts
type KpiTargetConfig = {
  key: string;            // 'monthly_delivery_target' | 'monthly_order_target' | ...
  layer: 1 | 2;            // 區分 Layer 1 結果指標 / Layer 2 過程指標
  label: string;           // 中文 label（「月度成交台數目標」）
  value: number;
  unit: '台' | '%' | '天';
  min: number;
  max: number;
  default_value: number;
  description: string;
  icon?: string;           // emoji，HTML 設計稿沿用
};

type HabcThresholdConfig = {
  key: 'H' | 'A' | 'B' | 'C';
  label: string;          // 「本月」/ 「近期」/ 「中期」/ 「逾期」
  value: number;
  unit: '天';
  min: number;
  max: number;
  default_value: number;
  description: string;     // 來自 HTML 設計稿「購買時機在『本月』內，且已完成試駕」等
};
```

### Seed 資料（13 筆，brand_id='indian'；ducati 同步 seed 一份避免空畫面）

**Layer 1（3 筆 `sales_kpi_target` layer=1）**：

| key | label | default | unit | min | max | desc |
|---|---|---|---|---|---|---|
| `monthly_delivery_target` | 月度成交台數目標 | 15 | 台 | 1 | 200 | 新車成交門檻，低於此值儀表盤顯示紅燈 |
| `monthly_order_target` | 月度訂車台數目標 | 16 | 台 | 1 | 200 | 訂車（未交車）達成門檻 |
| `monthly_close_rate_target` | 整體成交率目標 | 12 | % | 1 | 100 | 成交台數 ÷ 到店人次，衡量全漏斗效率 |

**Layer 2（6 筆 `sales_kpi_target` layer=2）**：

| key | label | default | unit |
|---|---|---|---|
| `build_complete_rate_target` | 建檔完整率目標 | 90 | % |
| `trial_drive_rate_target` | 試乘試駕率目標 | 60 | % |
| `quote_conversion_rate_target` | 報價轉化率目標 | 70 | % |
| `order_conversion_rate_target` | 訂車成交率目標 | 60 | % |
| `gold_moment_quote_rate_target` | 試駕後即時報價率目標 | 80 | % |
| `delivery_revisit_3day_rate_target` | 交車後 3 日回訪率目標 | 90 | % |

**HABC（4 筆 `habc_threshold`）**：

| key | label | default | min | max | desc |
|---|---|---|---|---|---|
| `H` | 「本月」定義 | 30 天 | 7 | 60 | 高度意願：購買時機在「本月」內，且已完成試駕 |
| `A` | 「近期」定義 | 60 天 | 14 | 120 | 中度意願：1–2 個月內決定，或本月但尚未試駕 |
| `B` | 「中期」定義 | 180 天 | 61 | 365 | 低度意願：3–6 個月考慮中，尚未試駕 |
| `C` | 「逾期」門檻 | 180 天 | 61 | 365 | 保留意願：長期考慮，聯絡 3 次以上無明確表態 |

### RLS

沿用 `business_rules` 既有 brand-aware policy，不動。

## 3. Domain Helper 規劃

新檔：`src/domain/sales-kpi-targets.ts` + `src/domain/sales-kpi-targets.constants.ts`（pattern 跟 `sales-settings.ts` 一模一樣）。

```ts
// sales-kpi-targets.ts
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type KpiTargetConfig = { key: string; layer: 1 | 2; label: string; value: number; unit: string; min: number; max: number; default_value: number; description: string; icon?: string };
export type HabcThresholdConfig = { key: 'H'|'A'|'B'|'C'; label: string; value: number; unit: string; min: number; max: number; default_value: number; description: string };

export type KpiTargetRow = { id: string; config: KpiTargetConfig; sort_order: number };
export type HabcThresholdRow = { id: string; config: HabcThresholdConfig; sort_order: number };

export async function listSalesKpiTargets(): Promise<KpiTargetRow[]>;
export async function updateSalesKpiTarget(id: string, value: number): Promise<Result<{ id: string }>>;

export async function listHabcThresholds(): Promise<HabcThresholdRow[]>;
export async function updateHabcThreshold(id: string, value: number): Promise<Result<{ id: string }>>;

export async function getKpiTargetsPageData(): Promise<{
  layer1: KpiTargetRow[];
  layer2: KpiTargetRow[];
  habc: HabcThresholdRow[];
}>;
```

實作策略：直連 supabase（沿用既有 pattern）+ `revalidatePath('/sales/manager/kpi-targets')`。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `updateSalesKpiTarget` | 寫入 business_rules、revalidate 自己頁面 | ✅ |
| `updateHabcThreshold` | 寫入 business_rules、revalidate 自己頁面 | ✅ |
| 串接 `/sales/funnel` 讀這些值 | 後續 BDN 輪次再做 | 🟡 不在本次範圍 |

## 5. 會計事件分析

無 — 純資料維護（業務參數設定）、不產生資金流。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| KPI 目標值設定 | `/sales/manager/kpi-targets` | Setting Page | `(workspace)/sales/settings/handcard-params/_components/handcard-params-view.tsx` 的 `ThresholdSection` |

單頁、無 detail page、無 list view —— 屬於「Setting Page」類型（純閾值面板），不需要 list+detail 雙交付。

## 7. nav_nodes（夜跑不動 DB，列在「下一步」）

```sql
-- 待 Ming 拍板執行（本夜跑不執行）
-- parent_id：主管工作台 (Indian = '447143ca-badc-4c31-b2cd-53d58873cd50'，Ducati 同名節點)
-- 緊接「手卡參數設定」(sort_order=6) 之後
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES
  ('indian', '447143ca-badc-4c31-b2cd-53d58873cd50', 3, 7, 'KPI 目標與 HABC 閾值', 'flag', '/sales/manager/kpi-targets', 'react_route', true, false),
  ('ducati', '<ducati 主管工作台 parent>', 3, 7, 'KPI 目標與 HABC 閾值', 'flag', '/sales/manager/kpi-targets', 'react_route', true, false);
```

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新建 | `src/domain/sales-kpi-targets.constants.ts` |
| 新建 | `src/domain/sales-kpi-targets.ts` |
| 新建 | `src/app/(workspace)/sales/manager/kpi-targets/page.tsx` |
| 新建 | `src/app/(workspace)/sales/manager/kpi-targets/_components/kpi-targets-view.tsx` |
| DB | 13 筆 INSERT business_rules (indian + ducati 雙 brand 共 26 筆) |
| 不動 | `nav_nodes` (列在「下一步」、待 Ming 拍板) |
| 不動 | `/sales/funnel` (後續輪次串接) |

## 9. Verification（落地後手測）

1. `npx tsc --noEmit` 0 errors
2. `npx eslint src/app/\(workspace\)/sales/manager/kpi-targets src/domain/sales-kpi-targets*` 0 errors
3. `grep -rn "@/lib/supabase" src/app/\(workspace\)/sales/manager/kpi-targets` → 0 hit
4. Playwright headless：登入 → /sales/manager/kpi-targets → 截圖 → 改一個 Layer 1 值 → 改一個 HABC 值 → 0 console errors
5. SQL 確認雙 brand 各 13 筆 seed 都在

## 10. 自動拍板紀錄（夜跑場景，無歧義決策）

| 議題 | 選項 | 預設選 | 理由 |
|---|---|---|---|
| 用 business_rules 還是開新表 | reuse vs 新表 | **reuse** | 任務明文指定、且既有 `sales_threshold` config shape 完全 reuse |
| rule_kind 拆一個還是兩個 | 一個 `sales_kpi_setting` vs 兩個 `sales_kpi_target` / `habc_threshold` | **兩個** | 語意差異大（KPI 目標 vs HABC 級別閾值）、未來查詢 filter 清楚 |
| Layer 1 / Layer 2 怎分 | 一個 rule_kind 加 layer 欄位 vs 拆兩個 rule_kind | **一個 + layer in config** | 同類型（都是 KPI 目標）、UI 用同套 ThresholdItem、避免 rule_kind 爆炸 |
| UI 範本 | 仿 handcard-params 還是另起爐灶 | **仿 handcard-params** | ThresholdSection + ThresholdItem 已是 canonical pattern |
| 路由 | 任務指定 `/sales/manager/kpi-targets` | 照辦 | — |
| nav_nodes | 落地當下 INSERT vs 列在下一步 | **下一步** | 夜跑規則明文不動 nav_nodes |
| Brand seed | 只 Indian vs 雙 brand | **雙 brand** | Indian 是 dev session 主用、Ducati 沿用既有 seed 慣例避免空畫面 |

## 11. 下一步（不在本夜跑範圍）

1. Ming review proposal、確認 nav_nodes SQL 後 apply（雙 brand 各一筆）
2. `/sales/funnel` 改吃 `business_rules.sales_kpi_target` 的 value，做紅 / 黃 / 綠閾值判斷
3. RS_M1 漏斗看板的 HABC 自動建議改吃 `business_rules.habc_threshold` 的天數值
