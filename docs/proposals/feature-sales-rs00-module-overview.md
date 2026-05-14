# 提案：銷售模組導覽總覽（RS00）

> 來源：nav_node `2e029972-042a-495f-b610-8c0775cb572e`（Indian brand · static_html · `銷售模組導覽`）
> Stitch URL：`http://43.153.159.135:3000/n/2e029972-042a-495f-b610-8c0775cb572e`（轉跳 login，HTML 從 Supabase Storage `nav-html/indian/2e029972-...body.html` 直抓）
> 日期：2026-05-14
> 階段：架構提案（spec-to-feature subagent 自決拍板）

## 1. 結構摘要

「RS00 銷售模組 導覽總覽 v4」是一張**純靜態導覽 dashboard**，給經銷商員工 / 主管快速跳到 22 個 RS 銷售模組 + 8 個 SA CRM 模組。內容結構：

- **Hero header**：模組總覽標語 + 3 個 stat（22 RS / 8 SA CRM / v4 版本）
- **4 個 KPI 卡片**：RS 前台模組 10、主管/設定模組 5、CRM 全系列 15、RS05→SA 串接 ✅
- **4 個 tabs**：
  1. **模組總覽** — 5 個 panel（RS 前台 / 主管設定 / CRM A 系列 / CRM B 系列 / 店長跨部門），每個 panel 內含 3-col module card grid
  2. **串接關係圖** — SVG flow chart + 串接關係明細表（18 條）
  3. **設計原則** — 2-col grid，6 條原則卡片（P-01～P-06）
  4. **檔案清單** — 18 筆 module file 表格

**沒有任何 CRUD、沒有 DB 寫入、沒有副作用、沒有會計事件**。所有資料皆為內建元資料（模組目錄、串接關係、原則文字、檔案清單）。

## 2. Schema 草案

**無 DB 變更**。所有資料硬編在 domain helper 的 `*.constants.ts`，待未來真的要動態調整（例如主管自定義導覽）再升級成 typed table。

理由：
- 模組清單是「系統定義」、不是用戶資料，不該進 DB
- 14 張兄弟頁批次落地中，把這當靜態元資料一起 ship 是最低風險路徑
- 之後若要動，升級成 `sales_module_registry` table、`metadata jsonb` 放描述/版本

## 3. Domain Helper 規劃

檔案：`src/domain/sales-overview.ts`（async helper，目前只 wrap constants — 未來若改 DB 不動 UI）
搭配檔案：`src/domain/sales-overview.constants.ts`（純常數，避開 `"use server"` export 非 async 的雷）

```ts
// src/domain/sales-overview.constants.ts
export type SalesModuleAccent = "blue" | "teal" | "red" | "amber" | "purple" | "dark" | "green";

export type SalesModuleCard = {
  code: string;           // "RS01"
  name: string;           // "電子手卡"
  description: string;
  fileName: string;       // "RS01_電子手卡_v8.html"
  version: string;        // "v8" / "v2" / "NEW"
  versionTone: "ver" | "new";
  accent: SalesModuleAccent;
};

export type SalesModulePanel = {
  key: string;
  title: string;
  subtitle: string;
  icon: string;             // emoji
  accent: SalesModuleAccent;
  cards: SalesModuleCard[];
  note?: string;            // 例：CRM B 系列 RS05 串接說明
};

export type SalesModuleConnection = {
  from: string;
  to: string;
  description: string;
  status: "live" | "sim" | "p2";
};

export type SalesDesignPrinciple = {
  code: string;             // "P-01"
  title: string;
  description: string;
};

export type SalesModuleFile = {
  code: string;
  fileName: string;
  version: string;
  versionTone: "v2" | "gray" | "new";
  releaseTag: string;       // "v6.2" / "v6.0"
  description: string;
};

export const SALES_OVERVIEW_HERO = {
  title: "DUCATI 全系統模組導覽（RS + SA + CRM）",
  description: "完整覆蓋銷售（RS）與售後（SA）雙側流程：…",
  stats: [
    { value: "22", label: "RS 模組" },
    { value: "8",  label: "SA CRM 模組" },
    { value: "v4", label: "本頁版本" },
  ],
};

export const SALES_OVERVIEW_KPIS = [ /* 4 筆 */ ];
export const SALES_OVERVIEW_PANELS: SalesModulePanel[] = [ /* 5 panel */ ];
export const SALES_OVERVIEW_CONNECTIONS: SalesModuleConnection[] = [ /* 18 條 */ ];
export const SALES_DESIGN_PRINCIPLES: SalesDesignPrinciple[] = [ /* 6 條 */ ];
export const SALES_MODULE_FILES: SalesModuleFile[] = [ /* 18 筆 */ ];
```

```ts
// src/domain/sales-overview.ts
"use server";
import {
  SALES_OVERVIEW_HERO,
  SALES_OVERVIEW_KPIS,
  SALES_OVERVIEW_PANELS,
  SALES_OVERVIEW_CONNECTIONS,
  SALES_DESIGN_PRINCIPLES,
  SALES_MODULE_FILES,
} from "./sales-overview.constants";

export async function getSalesOverview() {
  return {
    hero: SALES_OVERVIEW_HERO,
    kpis: SALES_OVERVIEW_KPIS,
    panels: SALES_OVERVIEW_PANELS,
    connections: SALES_OVERVIEW_CONNECTIONS,
    principles: SALES_DESIGN_PRINCIPLES,
    files: SALES_MODULE_FILES,
  };
}
```

⚠️ **雷點預防**：常數一律放 `*.constants.ts` 檔（非 use server），helper 檔只 export async function — 避開 Next 16 `"use server" only async exports` 報錯（CLAUDE.md / skill 提到三次踩雷）。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| 點 module card | 暫時 `console.log` 或不做事（未來 router.push 到對應路由） | 確定 — 14 張兄弟頁尚未落地 |
| 切換 tab | 純 client state | 確定 |

## 5. 會計事件分析

**無 — 本功能屬於純導覽 / 純查詢、不產生資金流**。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 銷售模組導覽 | `/sales/overview` | Dashboard | 參考 `/sales/showroom/page.tsx`（client component + useSetPageHeader） |

> ⚠️ 不走 List View / Page View design pattern — 這頁不是 CRUD 列表也不是實體詳情，是**模組目錄**。Skill 邊界明確列出「純資訊頁不適用 SOP」。

## 7. nav_nodes（升級既有節點，非新增）

```sql
UPDATE nav_nodes
   SET page_kind = 'react_route',
       href      = '/sales/overview'
 WHERE id = '2e029972-042a-495f-b610-8c0775cb572e';  -- indian / 銷售模組導覽
```

**為何不雙 brand**：
- Ducati brand 下沒有對應節點（已查 `nav_nodes WHERE brand_id='ducati' AND name ILIKE '%銷售模組導覽%'` 為 0 筆）
- 既有 parent `4ed45fdb-...` 也只在 Indian brand 下；整個「DUCATI 銷售與客服模組導覽」群組是 Indian only
- 強行雙 brand 補 Ducati 入口會脫離當前 14 張批次的 scope（其他 13 張兄弟頁也都掛 Indian）— 留給未來 Ducati 整批落地時一起處理

`html_storage_path` 保留為歷史檔（skill 規定）。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/sales-overview.constants.ts` |
| 新增 | `src/domain/sales-overview.ts` |
| 新增 | `src/app/(workspace)/sales/overview/page.tsx` |
| 新增 | `src/app/(workspace)/sales/overview/_components/sales-overview-board.tsx` |
| DB 更新 | `nav_nodes` 一筆 UPDATE |

## 9. Verification

1. 頁面 `/sales/overview` 渲染 — Hero / 4 KPI / 4 tabs / 5 panels / SVG flow / 18 條 connection table / 6 principles / 18 files table
2. 4 個 tab 切換正常
3. module card hover 有 elevation / cursor
4. nav_nodes UPDATE 後 sidebar 對 Indian 用戶顯示「銷售模組導覽」chip 從 HTML 變 REACT、href = /sales/overview
5. `grep -rn "@/lib/supabase" "src/app/(workspace)/sales/overview"` = 0 hit
6. `npx tsc --noEmit` / `npx eslint <touched>` 0 errors

## 10. 自決拍板（替代階段 3 user review）

| 開放問題 | 自決 | 理由 |
|---|---|---|
| Route 路徑 `/sales/overview` vs `/sales/modules` vs `/sales`（root） | **`/sales/overview`** | `/sales` 已被 module home `/sales/showroom` 佔；`overview` 語意精確、跟其他 13 張兄弟頁同走 `/sales/<sub>` 形式 |
| domain helper 命名 `sales-overview` vs `sales-modules` vs `sales-navigation` | **`sales-overview`** | 直接對應頁面、跟 route 一致、避開跟既有 `src/lib/navigation*` 命名衝突 |
| 模組清單 typed table vs hardcoded const | **hardcoded const** | 系統元資料、非用戶資料、DB 沒收益（無 query、無 RLS、無 reporting）。未來真的要主管自訂導覽再升級 |
| 是否雙 brand nav_nodes UPDATE | **否，只更新 Indian** | Ducati 下沒對應節點，強行補非當前批次 scope |
| 模組卡片點擊行為 | **`console.info()` placeholder**，不做 router.push | 14 張兄弟頁尚未落地，點擊去也是 404 / placeholder；改 toast 提示「模組規劃中」更誠實 |
| Sidebar 入口同時補到 `src/lib/modules.ts` registry？ | **不補** | nav_nodes 是 SSOT，modules.ts 只在 nav_nodes 為空時 fallback。實際 sidebar 從 DB 渲染。 |
| 視覺色彩 token 用設計稿原色 vs 套 design pattern token | **用 design pattern token + 設計稿 panel accent 色** | header 用 `#1A3A5C` / hero gradient 維持；button / chip / table 套 design pattern token（#EEECE6 邊框、#9A9890 灰、#185FA5 藍 chip 等）以維持站內視覺一致 |
