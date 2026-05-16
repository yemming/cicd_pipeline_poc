# 提案：/crm 模組首頁（圖卡式 module home，v2）

> 來源：`docs/DUCATI_v2_output/01_銷售接待/00_模組導覽/CRM00_客服管理模組_導覽總覽_v2.html`
> 日期：2026-05-15
> 階段：架構提案（已自決最佳選項、進落地）

## 1. 結構摘要

把 `CRM00 客服管理模組 導覽總覽 v2` 設計稿做成 React 版 `/crm` 首頁。畫面由 4 區塊組成：
1. **Hero 卡片**（深藍漸層 banner + 標題 + 描述 + 4 小 stat badge）
2. **KPI row**（4 張 KPI 卡片：銷售側 7 / 售後側 6 / 店長報表 1 / 串接點 13）
3. **Tab bar**（3 個 tab — 模組總覽 / 串接關係 / 檔案清單）
4. **Tab 0 模組總覽**：3 大 panel（A 系列藍 / B 系列綠 / 報表深藍），每個 panel 內含 layer-title 分節 + 圖卡 grid（3 欄）

純展示頁、無 DB CRUD、無 server action。後續 A1 `/sales`、C0a `/service`、D1.1 `/parts` 也都是「同樣的 module home 殼 + 不同圖卡內容」，所以這次抽出共用元件 `<ModuleHomeGallery>`。

## 2. Schema 草案

無。本頁不寫 DB、不讀 DB。

## 3. Domain Helper 規劃

無。沒有資料層存取。`/crm/page.tsx` 是 client component，直接 `useSetPageHeader` 設 topbar、render 寫死的 data array。後續 13 個子頁陸續搬家、需要撈資料時才開 `src/domain/crm.ts`。

## 4. 副作用清單

無。圖卡點擊 = `next/link` 切路由，純前端。

## 5. 會計事件分析

無 — 純資料維護 / 純查詢、不產生資金流。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| CRM 模組首頁 | `/crm` | Module Home (新類型) | 自行設計，可重用元件 `<ModuleHomeGallery>` |

新建檔案：

- `src/components/module-home-gallery.tsx` — 共用 module home 元件
- `src/app/(workspace)/crm/page.tsx` — `/crm` 首頁（caller，把 CRM 的 hero/kpi/panels 餵給元件）

### `<ModuleHomeGallery>` API

```ts
type ModuleHomeStat = { value: string | number; label: string };

type ModuleHomeKpi = {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "blue" | "teal" | "amber" | "purple" | "navy"; // 對應 CRM 設計稿 4 色 + fallback
};

type ModuleHomeCard = {
  code: string;             // 如 CRM01A
  name: string;             // 如「銷售客戶基盤」
  desc: string;             // 副標
  href: string;             // 目的路徑（指向現有舊路徑 /sales/crm/customer-base 等）
  tone?: "blue" | "teal" | "navy";  // 圖卡底色
  badge?: { text: string; tone?: "red" | "navy" };  // 右上 chip（如「v2 升版」、「v1」、「串接 RS05」）
};

type ModuleHomeLayer = {
  title: string;            // 如「客戶基盤 × 問卷設定」
  cards: ModuleHomeCard[];
};

type ModuleHomePanel = {
  icon: string;             // material-symbols 圖示名
  iconBg?: string;          // 圖示背景色（hex）
  title: string;            // panel 標題
  subtitle?: string;        // panel 副標
  tone?: "blue" | "teal" | "navy";  // panel header 配色
  badge?: { text: string; tone?: "red" | "green" };  // 右側徽章
  layers: ModuleHomeLayer[];
};

export type ModuleHomeGalleryProps = {
  hero: {
    title: string;          // 含 emoji 也 OK
    description: string;
    stats?: ModuleHomeStat[];
  };
  kpis?: ModuleHomeKpi[];
  panels: ModuleHomePanel[];
};
```

簡化決策（自決）：
- 設計稿 3 個 tab 中，**只實作 Tab 0「模組總覽」**。Tab 1 串接關係 / Tab 2 檔案清單在 module home 場景的價值較低（屬於文件性質、不是日常導航），先省略，避免元件 over-engineered。後續若要補可加 `extraTabs?: ReactNode[]`。
- 全部用設計稿原始 token（CLAUDE.md design pattern 那套配色），不另外換 Tailwind palette。

### 其他 home（A1 / C0a / D1.1）reuse 範例

```tsx
// src/app/(workspace)/sales/page.tsx （之後做）
<ModuleHomeGallery hero={SALES_HERO} kpis={SALES_KPIS} panels={SALES_PANELS} />
```

caller 只需要餵 hero / kpis / panels 三個 props、不用碰版型。

## 7. nav_nodes（雙 brand）

本次**不動**。任務明確邊界：「nav_nodes 表這次不動」。直接打 URL `/crm` 能跑就 OK，sidebar 入口由後續工項補。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/components/module-home-gallery.tsx`（共用元件） |
| 新增 | `src/app/(workspace)/crm/page.tsx`（CRM home caller，含 hero/kpis/panels 資料） |
| 新增 | `scripts/verify-crm-home.mjs`（Playwright CLI 驗證腳本） |
| 新增 | `docs/proposals/feature-crm-home.md`（本檔） |

## 9. Verification

1. `npx tsc --noEmit` = 0 errors
2. `npx eslint src/app/\(workspace\)/crm src/components/module-home-gallery.tsx` = 0 errors
3. `grep -rn "@/lib/supabase" "src/app/(workspace)/crm" src/components/module-home-gallery.tsx` = 0 hit
4. Playwright CLI（headless）跑 `/crm`，截圖 + 算 card 數 ≥ 3
5. 手測：點任一張卡片 → router push 到對應子頁能正確 navigate

## 10. 開放問題（已自決）

| 問題 | 預設選項 | 理由 |
|---|---|---|
| 元件命名 `module-home-gallery` vs `module-card-grid`？ | `module-home-gallery` | 「gallery」包含 hero + KPI + panels 三層，比「card-grid」(僅 cards) 語意更廣 |
| Tab 0 / 1 / 2 都做還是只做 Tab 0？ | 只做 Tab 0 | Tab 1/2 是文件型資訊、日常導航用不到；後續若有需要再加 `extraTabs?` slot |
| 圖卡 href 指向新 `/crm/*` 還是現有舊路徑？ | 現有舊路徑（`/sales/crm/customer-base` 等） | 任務邊界明確 — 子頁本次不搬，等後續工項批次改 |
| 元件放 `src/components/` 還是 `src/components/shells/`？ | `src/components/`（與 `module-rail.tsx` / `topbar.tsx` 同層） | 既有慣例：module-* 系列都在 `src/components/` 根，shells 是 layout 殼專用 |
| CRM07 店長報表也用同一 `<ModuleHomeGallery>` 嗎？ | 是，當第 3 個 panel 渲染 | 設計稿就是這樣分區（A panel + B panel + 報表 panel），不另外切視覺 |
