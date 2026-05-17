# Feature Proposal — RS_M3「員工評估九宮格」（Manager Staff Grid）

- 建立日期：2026-05-16
- 任務來源：BDN 第三輪 #4 — RS_M3 員工評估九宮格
- spec：`docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html`
  - § 「👥 員工評估九宮格」section（行 404–460 HTML + 行 780–828 JS）
- route：`/sales/manager/staff-grid`
- 範本：`docs/CLAUDE.md` §Design Pattern + `sales-staff.ts` helper（同一張 employees 表）

---

## Phase 1 · 結構分析

### 1. spec 要求

- 9 格 (3×3)：態度軸（X）× 技能軸（Y），各 1–3 級
- 9 格命名（spec § 行 788–796 寫死）：
  | (skill\att) | 1=低 | 2=中 | 3=高 |
  |---|---|---|---|
  | **3=高** | 機會高手 | 安定高手 | 全方位高手 |
  | **2=中** | 很危險 | 中規中矩 | 明日之星 |
  | **1=低** | 難搞定 | 食之無味 | 急需磨練 |
- 每個 RS 是一張頭像卡片，可拖曳到任意格
- 兩種互動：
  - (a) 系統自動依「接待積極度（接觸數）+ 成交台數」算出落點
  - (b) 主管手動拖曳覆蓋（manual_override）
- spec 用累積數字（att/skill 是月份分數）+ 可調閥值；任務 brief 改成 1-3 級 + 簡單啟發式
- spec 點格出現「mc-detail」說明文字（已有命名，沿用顯示）

### 2. DB schema 對齊（reuse BDN #3 audit）

| 表 | 角色 |
|---|---|
| `employees` | 已有 `metadata jsonb`、`brand_id`、`dept_id`、`is_active`，sales 命名空間用 `metadata.sales.{key}` |
| `sales_leads` | 已有 helper `fetchMonthlyMetricsByRsName` 算 contacts / deals by rs_name 月份聚合 |

**新增 metadata 結構**（reuse `metadata.sales` 命名空間、不另開表）：

```jsonc
{
  "sales": {
    "responsible_models": [...],         // 既有
    "grid_position": {
      "attitude": 2,                      // 1–3
      "skill": 2,                         // 1–3
      "manual_override": false,           // true=主管拖曳過、永遠用此位置
      "evaluated_at": "2026-05-16T..."    // ISO timestamp
    }
  }
}
```

### 3. 自動計算公式（brief 預設啟發式）

```ts
function autoSkill(deals: number): 1 | 2 | 3 {
  if (deals >= 3) return 3;
  if (deals >= 1) return 2;
  return 1;
}
function autoAttitude(contacts: number): 1 | 2 | 3 {
  if (contacts >= 10) return 3;
  if (contacts >= 5) return 2;
  return 1;
}
```

未來如 Ming 要改閥值（spec 留了 `th-al/th-ah/th-sl/th-sh` 給主管自訂）→ 再升級 metadata：`brands.metadata.sales.staff_grid_thresholds`，本輪不做。

### 4. 拖曳 UX 決策（brief 拍板）

- HTML5 native drag-and-drop（`draggable={true}` + `onDragStart` / `onDragOver` / `onDrop`）
- 不引入 react-dnd / dnd-kit（POC 不過度工程）
- drag image：瀏覽器內建（拖曳半透明複本）
- drop 行為：
  - 算出落點 `(attitude, skill)`
  - 樂觀更新 local state（卡片立即移動）
  - 同步呼叫 `updateStaffGridPositionAction(rsId, attitude, skill, manual_override=true)`
  - 失敗 rollback + 紅 banner
- 重置策略（brief 拍板）：**manual_override 後永遠用主管的位置**，直到「重置全部為自動」（清掉所有 manual_override → 下次 render 重算）

### 5. 落地檔案清單

| 檔案 | 動作 | 說明 |
|---|---|---|
| `src/domain/sales-staff-grid.constants.ts` | 新增 | 9 格命名表 / 公式 / `getGridPosition` / `writeGridPosition` |
| `src/domain/sales-staff-grid.ts` | 新增 | `listStaffWithGridPositions`（reuse `listSalesStaff` 加上落點）+ server actions |
| `src/app/(workspace)/sales/manager/staff-grid/page.tsx` | 新增 | server component 入口 |
| `src/app/(workspace)/sales/manager/staff-grid/_components/staff-grid-board.tsx` | 新增 | client 互動主畫面 |
| `scripts/verify-staff-grid.mjs` | 新增 | Playwright 截圖驗證 |

**不動**：
- `nav_nodes` — 列出主管設定建議 SQL，等 Ming 拍 sidebar 入口位置
- `employees` rows — 沿用 BDN #3 audit 結果（Indian brand 沒 RS、空狀態提示）

---

## Phase 2 · 架構提案（自動拍板，依任務指示）

### A. UI 結構（單頁 list-only，非 list+detail 規格）

> 註：本頁不適用 §Design Pattern 的 list+detail SOP（不是表格頁、不是 master data CRUD），是 **dashboard 風格** 的視覺化頁面。沿用 design tokens（色碼 / 字級 / button 規格）。

```
┌─────────────────────────────────────────────────────────┐
│ Page Header — 員工評估九宮格 + Sprint chip + caption    │
├─────────────────────────────────────────────────────────┤
│ Toolbar — 「共 N 位 RS」 │ [重置全部為自動] (右靠齊)    │
├─────────────────────────────────────────────────────────┤
│ ┌── 3×3 grid ──────────┐  ┌── 圖例 / 說明 ─────────┐  │
│ │ [機會][安定][全方位]  │  │  RS 列表 + 該格名稱     │  │
│ │ [很危險][中規][明日]   │  │  點格出現說明文        │  │
│ │ [難搞定][食][急需]    │  └─────────────────────────┘  │
│ └────────────────────┘                                 │
└─────────────────────────────────────────────────────────┘
```

- 每格白卡片，內含格名標題 + 該格的 RS 卡片（多張並列、wrap）
- 每格作為 drop target；hover 時邊框變 `#1A3A5C`
- RS 卡片 64×64，圓形頭像（initial 字）+ 姓名小字 + 「接N/成M」徽章

### B. Domain helper API

```ts
// sales-staff-grid.ts
export type StaffGridRow = SalesStaffRow & {
  grid_attitude: 1 | 2 | 3;
  grid_skill: 1 | 2 | 3;
  grid_manual_override: boolean;
  grid_cell_key: string;          // "{attitude}-{skill}"
};

export async function listStaffWithGridPositions(): Promise<StaffGridRow[]>;
export async function updateStaffGridPositionAction(
  employeeId: string,
  attitude: 1 | 2 | 3,
  skill: 1 | 2 | 3,
): Promise<ActionResult<{ id: string }>>;
export async function resetAllStaffGridAction(): Promise<ActionResult<{ count: number }>>;
```

### C. 邊界 / 不做的事

- ❌ 「歷史軌跡」「月份切換」（spec 沒寫、後續再做）
- ❌ 「批次評估」「matrix 計算引擎」（過度設計）
- ❌ 動 `nav_nodes`（列 proposal）
- ❌ INSERT employees seed（沿用空狀態）

### D. sidebar 入口建議（等 Ming 拍）

```sql
-- 提案位置：sales / 主管工作台 / 員工評估九宮格
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES
  ('ducati', '<sales-manager-parent>', 3, {?}, '員工評估九宮格', 'grid_view', '/sales/manager/staff-grid', 'react_route', true, false),
  ('indian', '<sales-manager-parent>', 3, {?}, '員工評估九宮格', 'grid_view', '/sales/manager/staff-grid', 'react_route', true, false);
```

---

## Phase 3 · 拍板（由 sub-agent 依 brief 自動拍）

- 自動計算閥值：`skill: deals≥3=3, ≥1=2, 0=1` ・ `attitude: contacts≥10=3, ≥5=2, <5=1`
- 拖曳：HTML5 native（不引套件）
- manual_override 後永遠用主管位置（直到 reset all）
- list-only：不做 detail page（dashboard 風格）

---

## Phase 4 · 落地（已執行）

見 commit / git diff。

## Phase 5 · 驗證

- `npx tsc --noEmit` — 0 errors
- `npx eslint` — 0 errors
- audit `grep -rn "@/lib/supabase" "src/app/(workspace)/sales/manager/staff-grid"` — 0 hits
- Playwright 截圖 → `tmp/bdn4-*.png`、DB 更新斷言通過
