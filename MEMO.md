# DealerOS 印第安升級 — 續接 MEMO

> 最後更新：2026-05-07（Phase 0 + 1 + 13 + 2 全部完成，**未 commit**）
> 完整 plan：`~/.claude/plans/humble-noodling-hejlsberg.md`

---

## 0. TL;DR — 一分鐘掌握

把杜卡迪 (`BRAND_KEY=ducati`) 跟印第安 (`BRAND_KEY=indian`) 變成「同一份 codebase + 同一份 DB」但「不同 zeabur 部署」。**印第安 brand 是這次升級主軸**：套用全新 modern shell（53 頁庫存模組設計），杜卡迪 brand 完全不動繼續用舊 shell。

**已完成**：DB schema + 全套 master 複製到 indian + 64 條 parts nav + 53 頁 placeholder + parts/{types,queries,actions} 骨架 + modern shell components + admin shell selector。

**還沒做**：53 頁的 React 化（Phase 3 W1-W6）— 目前所有 parts 頁都是 PlaceholderPage、沒接 DB。Phase 1 的 LINE/ECPay/notification_target indian 配置還等老闆給 input。

---

## 1. 環境 sanity check（新 session 第一件事）

```bash
# 1. git 狀態（預期：未 commit，多很多 untracked + modified）
git status --short

# 2. dev server（CLAUDE.md 用 -H 0.0.0.0；你要 indian brand 必須 set env）
BRAND_KEY=indian NEXT_PUBLIC_BRAND_KEY=indian npm run dev -- -p 3000
#   → http://localhost:3000   （登入後 modern shell + indian-bronze palette）

# 3. 杜卡迪 brand 對照（驗無回歸）
BRAND_KEY=ducati npm run dev -- -p 3000
#   → 同一個 port，看到 classic dual-rail shell + ducati-red

# 4. tsc / build sanity
npx tsc --noEmit       # 應該 0 errors
npx next build         # 應該成功 build 200+ 頁
```

Supabase project: `bykvtcptbirpxyqkfwfl`

---

## 2. 資料串接狀態（你說要測這個）

> 重點：**parts 模組 53 頁全部是 PlaceholderPage，DB 雖然 seed 完整但 UI 一個都沒接**。其他模組大部分維持原本狀態（ducati 既有的串接，複製到 indian 後跟著繼承）。

### 2.1 ✅ 已串接 DB（功能可實際運作）

| 路徑 | DB 表 | 狀態 |
|---|---|---|
| `/admin/navigation` | `nav_nodes` | 完整 CRUD（admin 在 UI 編輯目錄樹會寫回 DB） |
| `/admin/navigation` 主視覺 section | `brand_appearance` | 完整（含這次新加的 shell_layout 欄位） |
| `/feedback/tickets` 列表 + `/new` + 詳情 | `feedback_tickets` / `feedback_comments` / `feedback_canvas_snapshots` | 完整（brand 隔離 ✓ — indian 看不到 ducati 的 ticket） |
| `/admin/notifications/*` 5 頁 | `notification_targets` / `notification_subscriptions` / `notification_deliveries` | 完整（indian 的 notification_targets 還沒 seed，見 §4.3） |
| `/pos` POS 收銀（建單） | `pos_*` 系列表 | 完整（ECPay 真接） |
| `/sales/showroom` | `inventory.vehicles` 整車庫存 | Faithful Clone（W1 milestone v5 做過） |
| `/service/workorders` 等 RO | `service_*` 工單表 | 部分串（v5 milestone 的範圍） |

### 2.2 🟡 部分串/Stitch inline（顯示有畫面但接不到後端）

| 路徑前綴 | 畫面來源 |
|---|---|
| `/sales/*` 大部分 | Stitch inline (`public/stitch/{id}.body.html`) |
| `/service/*` 大部分 | Stitch inline |
| `/delivery/*` /  `/csi/*` / `/d2c/*` / `/admin/approvals/*` | Stitch inline |
| `/usedcar/*` / `/inventory/*` / `/group/*` | Stitch inline |
| `/settings/*` | 多數 Stitch inline，部分 Faithful Clone |
| `/tools/*` | Faithful Clone（小工具獨立寫的） |
| `/dev/*` | 開發中區，混合 |

### 2.3 ❌ 完全沒串（這次新加的）

| 路徑 | 為什麼 |
|---|---|
| `/parts/**`（**53 頁全部**） | PlaceholderPage — 等 W1-W6 Faithful Clone 才接 DB |

DB 端 parts 資料已就緒（看 §3.4），但**前端還沒任何 query 在跑**。`src/lib/parts/queries/index.ts` 寫了 8 個 query function（getActiveItems、getStockBalances、getOpenPurchaseOrders…），但**沒有任何 page.tsx 在 import**。

### 2.4 你要驗的測試清單

進印第安 deployment（`http://localhost:3000` with `BRAND_KEY=indian`）：

1. **Login 頁** — 標題應顯示「Indian Motorcycle 經銷商智慧營運平台」
2. **Modern shell 視覺** — 登入後上方應該是 **52px navy `#1A3A5C`** topbar，左側 **220px 白色單層 sidebar**（不是 56+248 雙軌）
3. **`/admin/navigation`** — 主視覺設定區應該多一個「版型樣式」選擇器，可在「雙軌經典 / 單欄現代」間切換（切換後整個 brand 的 shell 跟著變）
4. **Sidebar 內容** — 左側應該看到原本所有模組（銷售/維修/交車/客戶關懷…）+ 新的「庫存管理」（emoji 📦），展開後 10 個 group + 53 個二級頁
5. **Parts 任一頁** — 例 `/parts/purchase/orders` 應該看到 PlaceholderPage 顯示「商品採購」+ breadcrumb「庫存管理 › 採購管理 › 商品採購」
6. **`/feedback/tickets`** — 既有 feedback 模組無回歸；indian 看到的 ticket 應該是 0（資料隔離），可建新單測 LINE 通知（**需先補 §4.3 的 indian notification_target**）
7. **`/admin/navigation/_appearance`** 切換 shell variant 三次（modern → classic → modern）— 確認 CSS var 沒殘留、視覺乾淨

杜卡迪 deployment（`BRAND_KEY=ducati`）：
- 訪問既有的 5 個關鍵頁（dashboard / admin / feedback / pos / sales/showroom）— 確認 classic shell 完全無回歸

---

## 3. 已完成的事（按 Phase 列）

詳細 plan 見 `~/.claude/plans/humble-noodling-hejlsberg.md`。

### 3.1 Phase 0 — Shell layout variant 機制

- **Migration**：`brand_appearance_shell_layout_phase1`
  - 加 `shell_layout text NOT NULL DEFAULT 'classic-dual-rail'`
  - 加 `shell_options jsonb NOT NULL DEFAULT '{}'`
  - check constraint 限定兩個值：`classic-dual-rail` / `modern-single-sidebar`
  - 印第安 row → `modern-single-sidebar`，杜卡迪 default 留 `classic-dual-rail`
- **新檔**：
  - `src/lib/brands/shell-layouts.ts`（兩套 ShellLayout 定義 + getShellLayout / shellLayoutToCssVars / isSidebarThemeCompatibleWithShell）
  - `src/components/shells/classic/classic-shell.tsx`（從原 workspace-shell 1:1 抽出）
  - `src/components/shells/modern/{modern-shell, modern-sidebar, modern-topbar, modern-nav-item}.tsx`
  - `src/components/shells/index.ts` `SHELL_REGISTRY` 派發
  - `src/components/search-context.tsx`（兩 shell 共用搜尋 controls）
- **改檔**：
  - `src/lib/brands/appearance.ts` 載入 shell_layout / shell_options
  - `src/components/appearance-context.tsx` expose `shellLayoutKey` + `shellLayout` + 注入 CSS var
  - `src/app/(workspace)/layout.tsx` 傳兩個 prop 給 AppearanceProvider
  - `src/components/workspace-shell.tsx` 重構 — `<Component key={shellLayoutKey}>` 強制 unmount 切殼乾淨
  - `src/app/(workspace)/admin/navigation/page.tsx` initial 多帶 shell_layout
  - `src/app/(workspace)/admin/navigation/_components/appearance-editor.tsx` 加 `ShellSwatch` + 軟白名單降級
  - `src/lib/appearance-actions.ts` `updateBrandAppearance` 加 shell_layout 驗證 + 自動降級邏輯（modern + 深色 sidebar theme → 自動切 quartz-light）

### 3.2 Phase 1 — LINE 通知 brand-aware

- `src/lib/notifications/templates/kits.ts` 加 `getBrandHeaderColor()`，`buildLineFlex` fallback 從寫死 `DUCATI_RED` 改成這個
- 三個 templates（work-order-created / customer-handover-scheduled / service-request-created）拿掉 explicit `headerColor: DUCATI_RED,`，靠 fallback brand-aware 取色

### 3.3 Phase 13 — Master data 複製到 indian

- **Migration**：`copy_ducati_master_to_indian_phase13`
- 策略：deterministic UUID — `indian_id = (md5('indian|' || ducati_id::text))::uuid`，FK 自動同公式對齊
- 13 表複製到 indian：organizations / accounts / suppliers / customers / motorcycle_models / warehouses / warehouse_zones / warehouse_bins / items / item_motorcycle_compatibility / item_store_prices / document_number_rules / nav_nodes
- FK 完整性：8 條 FK 全部 `bad_count = 0` 零違規
- nav_nodes 從 6 條 → 143 條（6 既有 + 137 ducati 複製）
  - 既有 6 條是你之前手動加的測試 nav，**保留沒清**

### 3.4 Phase 2 — Parts 模組前置

- **Migration `parts_nav_nodes_seed_indian_phase21_v3`**：seed indian parts nav tree
  - 1 module（庫存管理）+ 10 group（導覽/基礎設定/採購/入庫/出庫/庫存作業/盤點/預警/保固/分析）+ 53 page = **64 nodes**
  - 全部 `coming_soon=true`、`page_kind='placeholder'`，W1 Faithful Clone 後改 `react_route`
- **Migration `stock_items_demo_seed_indian_phase24_v2`**：
  - 序列號類料件 × 30 筆 qty=1
  - 批量類料件 × 30 件 qty=20-50
  - 5 件 frozen 示範
  - 3 件寄存（consignment_stocks）
  - 結果：indian 共 **262 筆 stock_items + 3 active consignment**，`v_stock_balances` view 聚合 30 件料件
- **Scripts 改參數化**：`scripts/strip-stitch-chrome.py` / `scripts/extract-stitch-bodies.py` / `src/lib/load-stitch-body.ts` 接受 dir 參數（W1 之後若要 inline parts HTML 用得到）
- **53 HTML** 複製到 `public/parts-stitch/`；`src/proxy.ts` 放行 `/parts-stitch/*`
- **Catch-all page**：`src/app/(workspace)/parts/[[...slug]]/page.tsx`
  - 內含 53 頁的 mapping table（path → name + group + icon）
  - 顯示 PlaceholderPage 帶完整 breadcrumb
  - W1 開工：建 specific route（如 `parts/purchase/orders/page.tsx`）就會自動覆蓋 catch-all
- **TypeScript types autogen**：`src/lib/database.types.ts` (4464 行)
- **Parts skeleton**：
  - `src/lib/parts/types/index.ts`：30+ 個 domain type alias（Item / StockItem / PurchaseOrder…）
  - `src/lib/parts/queries/index.ts`：8 個 query function（getActiveItems / getStockBalances / getPurchaseOrderById…）— **吃 RLS，禁用 service client**
  - `src/lib/parts/actions/index.ts`：8 個 server action stub（receiveStock / issueForRepair / createTransfer 等）— W1 才實作
  - `src/lib/parts/permissions.ts`：17 個 RBAC key 常數（`PARTS_PERMISSIONS.ACCESS` / `.PURCHASE_CREATE` 等）
  - `src/lib/parts/index.ts`：barrel export

---

## 4. 還沒做的工作（按 priority 排）

### 4.1 🔴 Phase 3 W1 — 黃金路徑入庫閉環（優先做）

實作 5 頁，把 plan §C.2 W1 的範圍 Faithful Clone：

| 頁面 | href | 任務 |
|---|---|---|
| 商品採購 | `/parts/purchase/orders` | 列表 + 建單 + 編輯 + 審核 |
| 需求處理 | `/parts/purchase/requisitions` | 看單 + 轉 PO |
| 採購入庫 | `/parts/receipt/po-grn` | GR 開單 + 產生 stock_items + 扣 PO line |
| 庫存查詢 | `/parts/operations/balance` | 讀 `v_stock_balances` + 多維篩選 |
| 入庫查詢 | `/parts/operations/receipts-history` | 跨類型彙整 |

每頁 SOP（plan §C.3）：
1. 讀 `docs/DUCATI_庫存管理模組_正式版/{頁名}.html`
2. JSX 化（用 Tailwind v4 token 對齊既有 modern shell 配色）
3. 接 `src/lib/parts/queries` 跟 `actions`（actions 目前是 stub，W1 實作）
4. UX 規範：寫入 DB 都要 loading + 鎖 UI（CLAUDE.md 強制）
5. 一頁一 commit

**Demo 路徑**：建 PO → 審核 → GR 入庫 → balance 看到數字增加（這是黃金路徑入庫閉環）

W1 完成後 commit msg 範例：`feat(parts-w1): 黃金路徑入庫閉環 5 頁 + actions`

### 4.2 🟠 Phase 3 W2-W6 — 其他 48 頁（按週）

W2 出庫閉環 5 頁 / W3 盤點調撥退貨 8 頁 / W4 基礎設定 17 頁 / W5 採購出庫補完 6-8 頁 / W6 進階模組 17 頁。詳見 plan §6.

### 4.3 🟡 Phase 1 follow-up — Indian 環境配置（**等老闆給 input**）

| 項目 | 缺什麼 | 在哪解決 |
|---|---|---|
| LINE token | indian zeabur deployment 需設 `LINE_BOT_TOKEN_INDIAN` 跟 `LINE_GROUP_ID_INDIAN`（或共用 var name 但部署各自值） | zeabur 環境變數面板 |
| LINE notification_target | indian 還沒 row（ducati 有 3 條） | `/admin/notifications/targets` UI 新增，或 SQL insert |
| ECPay key | 確認 `ECPAY_MERCHANT_ID_*` 等是否分 brand env | zeabur + 看 `src/lib/pos/ecpay-invoice.ts` |
| Mock products | `src/lib/pos/mock-products.ts` 全 Ducati 機型，indian 看到怪 | 等 parts 模組接真資料時自動解決，先放著 |
| Feedback demo | indian 沒有 demo ticket | （optional）SQL insert 一筆 demo ticket |

### 4.4 🟡 Phase 0.6 — 黑箱驗收

需要你親自跑 dev、肉眼驗 modern shell 視覺跟 Ducati shell 無回歸。詳見 §2.4 測試清單。

---

## 5. 關鍵檔案路徑速查

| 用途 | 路徑 |
|---|---|
| 完整 plan | `~/.claude/plans/humble-noodling-hejlsberg.md` |
| Brand registry | `src/lib/brands/{types,registry,current,ducati,indian}.ts` |
| Shell variant 定義 | `src/lib/brands/shell-layouts.ts` |
| Shell components | `src/components/shells/{classic,modern}/*` |
| Workspace shell 派發 | `src/components/workspace-shell.tsx` |
| Appearance Context | `src/components/appearance-context.tsx` |
| Admin appearance editor | `src/app/(workspace)/admin/navigation/_components/appearance-editor.tsx` |
| Parts 模組 | `src/lib/parts/{types,queries,actions,permissions,index}.ts` |
| Parts catch-all | `src/app/(workspace)/parts/[[...slug]]/page.tsx` |
| 53 HTML 設計稿 | `docs/DUCATI_庫存管理模組_正式版/*.html` |
| 53 HTML 預處理產物 | `public/parts-stitch/*.html`（已複製，未跑 strip） |
| Stitch 內嵌工具 | `src/components/stitch-inline.tsx` + `src/lib/load-stitch-body.ts` |
| Stitch 預處理 script | `scripts/strip-stitch-chrome.py` + `scripts/extract-stitch-bodies.py`（接 dir 參數） |
| DB types autogen | `src/lib/database.types.ts`（4464 行） |
| Notifications 模板 | `src/lib/notifications/templates/*.ts` |

---

## 6. 已踩過的坑（避免再撞）

| 坑 | 解 |
|---|---|
| `nav_nodes_level_check` 限定 `level IN (1,2,3)` 不是 0/1/2 | module=1 / group=2 / page=3 |
| `nav_nodes_page_kind_check` 限定 `'static_html' / 'react_route' / 'iframe' / 'placeholder'`（**不是 `'page'`**） | parts seed 用 `placeholder`，W1 wire 後改 `react_route` |
| `consignment_stocks.status` 限定 `'active' / 'partial_converted' / 'fully_converted' / 'returned' / 'expired' / 'cancelled'`（**不是 `'on_consignment'`**） | 用 `'active'` |
| `stock_items` 欄位是 `serial_no` / `batch_no`（**不是 `serial_number` / `lot_number`**） | 看 `src/lib/database.types.ts` 確認 |
| Cross-brand FK 對齊用 deterministic UUID | `(md5('indian|' || ducati_id::text))::uuid` — 簡潔且不需 mapping table |
| MCP `generate_typescript_types` output 是 `[{type, text}]` 兩層 JSON | jq 用 `.[0].text \| fromjson \| .types` 才能拿到 raw TS |
| Modern shell sidebar 主題白名單 | `compatibleSidebarThemes` 列 light theme 5 套，深色 4 套用軟警告（不阻擋） |
| Plan 原本的 INSERT INTO brand_appearance 會蓋掉 user 已設的 frost / indian-bronze | 改成只 UPDATE shell_layout 不碰其他欄位 |
| 53 HTML 的 sidebar 用 inline CSS class（`.sidebar`、`.hdr`），既有 strip script 偵測 Tailwind class 不會 match | 暫時不用 inline；parts 53 頁全用 PlaceholderPage |

---

## 7. 下個 session 啟動 prompt 範例

```
讀 MEMO.md。Phase 0+1+2+13 都完成了，但都沒 commit。

當前重點：先驗收 — 我會跑 BRAND_KEY=indian 的 dev server 看 modern shell 有
沒有問題，順便看 §2.4 的測試清單。修完視覺問題就直接動 Phase 3 W1 黃金路徑：
寫 5 頁的 React 化、wire src/lib/parts/queries 跟 actions（actions 目前都是
stub）。

在動 W1 之前先 commit 一個 milestone 把 Phase 0+1+2+13 的東西凍結。
```

或如果你修一些 bug 後想直接動 W1：
```
讀 MEMO.md §4.1 W1 範圍。先 commit 一次當前所有改動，然後動 W1：
1. parts/actions/index.ts 的 createPurchaseOrder / receiveStock 等 stub 寫實作
2. parts/queries/index.ts 補 W1 missing query
3. 5 個 page.tsx 從 catch-all 升級成 specific route + Faithful Clone
4. 每頁一 commit
```

---

## 8. 進度狀態快表

| Phase | 狀態 | 備註 |
|-------|------|------|
| 0.1-0.5 Shell variant 機制 | ✅ 完成 | TS 0 error / build 通過 |
| 1 LINE template hardcode | ✅ 完成 | DUCATI_RED → brand-aware |
| 1 Indian env / target seed | 🟡 等 input | 老闆給 LINE token / channel ID 後做 |
| 13 Master copy ducati→indian | ✅ 完成 | 13 表 + nav_nodes，FK 零違規 |
| 2.1 nav_nodes parts seed | ✅ 完成 | 64 nodes |
| 2.2 53 HTML 預處理 + scripts | ✅ 完成 | 改參數化，HTML 已複製，未跑 strip |
| 2.3 Types + parts skeleton + RBAC | ✅ 完成 | 5 個檔案 + 17 個 permission key |
| 2.4 stock_items demo seed | ✅ 完成 | 262 筆 stock + 3 consignment |
| 0.6 黑箱驗收 | 🟡 等你跑 | §2.4 測試清單 |
| 3 W1 黃金路徑 5 頁 | 🔜 next | 5-7 個工作天 |
| 3 W2-W6 其他 48 頁 | 🔜 待 | 4-5 週 |
