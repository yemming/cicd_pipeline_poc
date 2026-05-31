# Round-23 提案 — GRP15 技師效率診斷 + GRP19 品牌認證中古車能效

**日期**：2026-05-31
**範圍**：集團管理模組「最後 2 頁」收尾（00–04 五大模組與集團 GRP07–14/16–20 皆已完成）
**Stitch 規格**：
- `docs/20260529/.../05_集團管理/02_個人能效/GRP15_技師效率診斷_v1.html`
- `docs/20260529/.../05_集團管理/03_商務管理/GRP19_品牌認證中古車能效_v1.html`
**沿用 pattern**：round-16~19 的 D3 散佈圖 dashboard（KPI 卡 + 4 散佈圖 + 排名表 +〔GRP19〕庫存清單），可重用 `src/components/charts/d3-scatter.tsx`（已支援 size/trail）。

---

## §1 GRP15 技師效率診斷 `/group/tech-efficiency`

**等同 GRP08 SA 能效診斷的技師版**。四張散佈圖（每點 = 一位技師）：

| 圖 | X 軸 | Y 軸 | 資料來源 |
|----|------|------|---------|
| T1 工時效率 | 月接單台數 | 工時效率 % | 台數=真算(repair_orders.lead_technician_id) / 效率=seed |
| T2 品質風險 | 月接單台數 | 返修率 % | 台數=真 / 返修率=seed（>8% 標紅 + 告警橫幅） |
| T3 完工準時 | 工時效率 % | 完工準時率 % | 皆 seed |
| T4 資歷成長 | 技師年資（年） | 工時效率 % | 年資=hire_date 真算(缺則 seed) / 效率=seed |

+ 4 張 KPI 卡（技師人數 / 效率達標 / 需關注 / 均值工時效率）+ 綜合排名表（返修率>8% 標紅）。

**資料策略**（照 GRP08「能算就算、算不出讀 seed」）：
- **真算**：月接單台數（repair_orders 依 lead_technician_id 聚合，7 人有單）、年資（employees.hire_date）。
- **seed**（`kpi_snapshots`，`staff_role='tech'`，org_id NULL，單期）：metric_key = `labor_efficiency`、`rework_rate`、`on_time_rate`、`tenure_years`(fallback)、`grade`。10 位 indian 技師各一組。
- helper `getTechEfficiencyScatter(brandId)` 仿 `getSAEfficiencyScatter`，對無資料安全（回空陣列）。

## §2 GRP19 品牌認證中古車能效 `/group/usedcar-efficiency`

**真資料驅動**（與 round-19 相反，本頁 `used_car_inventory` 真實且豐富）。四張散佈圖（每點 = 一門店，圓圈大小 = 現有庫存台數）：

| 圖 | X 軸 | Y 軸 | 資料來源（全真算自 used_car_inventory）|
|----|------|------|------|
| U1 收購能力 | 本季收購台數 | 收購價差率 % | count + (listing_price−acquisition_price)/acquisition_price |
| U2 售出效率 | 本季售出台數 | 售出毛利率 % | count(sold) + margin/listing_price |
| U3 庫存周轉 | 本季收購台數 | 平均翻車天數 | count + avg(sold_date−acquisition_date)，未售用 today−acq |
| U4 綜合獲利 | 收購價差率 % | 售出毛利率 % | 同上組合 |

+ 4 張 KPI 卡（本季收購/售出台數、均值翻車天數、現有庫存）+ 門店綜合排名表（翻車>60 天標警示）+ **庫存清單**（車牌/車型/年式/里程/收購價/售價/收購日/在庫天數/認證狀態/銷售狀態，皆 used_car_inventory 真欄位）。
- helper `getUsedCarEfficiency(brandId)` + `listUsedCarInventory(brandId, storeId?)`。
- benchmark 集團均值 → `org_benchmarks`（scope='national'）少量 seed 或就用集團自身均值線。

---

## §3 共同設計決策（需拍板）

真資料集中在單一門店（中古車 13 台在台北 + 10 台無門店；10 位技師全在同一 dept），但規格是 **5 門店散佈圖 + 門店 Tab**。要讓 demo 有料需重分佈：

- **Q1 GRP15 技師跨店**：把 10 位 indian 技師的 `dept_id` 重指到 5 店各 ~2 位（散佈圖點分散、店 Tab 有料）？還是全留單店（店 Tab 只有台北）？
- **Q2 GRP19 中古車跨店**：把 23 台 `used_car_inventory.organization_id` 重分佈到 5 店 + 補到每店 ~8 台（散佈圖 5 點、庫存清單跨店豐富、純真資料）？還是只填補 10 台 null org？
- **Q3 brand**：一律 indian（守 demo 全 indian MANDATORY）；技師 seed + 中古車重分佈皆只動 indian。Ducati 不碰。

---

## §4 Batch（拍板後執行）

- **A 資料層**：依拍板 (a) seed 技師 kpi_snapshots（staff_role='tech'）；(b) 重分佈/補 used_car_inventory org_id（含 `_seed` marker 於 metadata 便於清理）。
- **B helper**：`src/domain/group-analytics.ts` append `getTechEfficiencyScatter` + `getUsedCarEfficiency` + `listUsedCarInventory`；label 常數進 `group-analytics-labels.ts`。
- **C 頁面**：`/group/tech-efficiency` + `/group/usedcar-efficiency` 各 page.tsx + `_components/*-board.tsx`（client，複用 `<D3Scatter>` + 門店 Tab + 排名表/庫存表，照既有 dashboard 視覺 token）。
- **D nav**：`nav_nodes` 雙 brand 各補 2 筆（個人能效層掛 GRP15、商務管理層掛 GRP19），`page_kind='react_route'`、`is_admin_only` 比照同層。
- **E 驗證**：`tsc --noEmit` 0 err → `npm run build` → push → Zeabur → **Deploy-then-Test**（Playwright 打正式站，截圖證據）→ 清測試殘留。

## §5 已驗 schema 雷
- `repair_orders` 有 `lead_technician_id`(真 FK) + `related_used_car_id`；無 store_id 對 tech 工單（store 推導靠 employee.dept_id，同 GRP08）。
- 無 `technicians` 表 → 技師 = employees（role_codes 含 'technician'，indian 10 人）。
- `used_car_inventory` 欄位齊全（見 §2）；status ∈ {available, reserved, sold, pending_inspection, pending_recon}。
- seed 一律進 `kpi_snapshots`（staff_role 區分）+ `org_benchmarks`，與 round-16~19 同表，清理 SQL 比照 memory。
