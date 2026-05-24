# Page Templates — List View / Page View / Setting Page

頁面骨架對應規格 + 範本路徑。階段 4 落地時必查。

完整 design pattern 規格在專案 `CLAUDE.md` 的 `## 🎨 Design Pattern — List View / Page View` 章節。本檔只列「哪種頁面用哪個範本」+ 各自的辨識特徵。

## 頁面類型判斷

從 HTML / 截圖看「主要互動結構」：

| 看到什麼 | 用哪種類型 |
|---|---|
| 上面 filter bar + 中間表格 + 一行一筆資料 + 列尾操作 | **List View**（+ 詳情走 Page View） |
| 表格列點下去進詳情頁 / 麵包屑 + 標題卡 + KV grid + tabs | **Page View** |
| 一頁就是 form：填欄位 → 點儲存（沒有 list） | **Setting Page** |
| 一堆 KPI 卡 + 圖表（沒有 CRUD） | **Dashboard Page**（不在本 skill 範圍） |
| 資料分群（例如左區域、右門店、下倉庫，三層在同頁） | **Multi-section Page**（不一定要拆，先看用戶意圖） |

## List View

**範本**：`src/app/(workspace)/parts/setup/items/_components/items-board.tsx`

**結構**（5 層，照 design pattern）：

```
1. Page Header     ─ 標題 + Sprint chip + 副標
2. Banner（可選）   ─ 操作回饋（成功 / 失敗）
3. Filter Bar      ─ 白卡片：左 4-6 篩選欄、右 [查詢][重置][+ 新增]
4. Toolbar         ─ 左「共 X 筆…」、右次要動作
5. Table           ─ sticky header、列尾 [編輯][停用][刪除]
```

**inline modal**：點「+ 新增」/「編輯」開 modal（同一個 `<Modal>`、依 `formMode` 切標題與 submit）。**不開新頁面**。

**寫入互動**（強制 UX 規範）：

```tsx
const [pending, startTransition] = useTransition()

const handleSubmit = (data) => {
  startTransition(async () => {
    const { data: result, error } = await addStore(data)  // 走 domain helper
    if (error) { /* 紅色 banner */ } else { /* 關 modal + 綠色 banner 2.2s */ }
  })
}
```

按鈕 pending 時 `disabled` + 文字換「儲存中⋯」/「建立中⋯」+ 外層 `pointer-events-none opacity-60`。

## Page View

**範本**：`src/app/(workspace)/parts/setup/items/[id]/_components/item-detail-view.tsx`

**結構**（6 層）：

```
1. Breadcrumb + CRUD Pill Bar       ─ 同列：左麵包屑 + 模式 badge、右 CRUD pill
2. Title Card                       ─ 左標題塊 + chip 列；右 260×120 圖片框
3. ▼ 區段卡片                        ─ 灰底 header + 白底 KV grid（3 欄）× 2-4 段
4. Tabs                             ─ 採購 / 庫存 / 銷售 / 維度對映 等
5. Tab Content                      ─ sectionCard 子卡 2 欄 grid
6. Modals / Banner                  ─ fixed
```

**CRUD Pill Bar**（view mode 從左到右固定順序）：

```
[返回列表（白）] [新增（綠）] [修改（深藍）] [🖨️ 列印（白，可選）] [刪除（紅）] [停用/啟用（白）]
```

`edit mode` 換成 `[儲存變更（綠）][取消（白）]`；`create mode` 換成 `[取消（白）][建立並開啟（綠）]`。

**「新增」一律不開新頁**：點下去 → 同一個 PageView 切到 `creating` state、欄位清空、tabs 隱藏、儲存後 `router.push` 到新 id 的 detail page。

**列印按鈕只在「單據型」頁面出現**：採購單 / 銷售訂單 / 報價單 / 維修工單 / 領料單 / 調撥單 / 進貨單 / 退貨單 / 對帳單。簽核 / 通知 / 設定 / 主檔類頁面**不要加**。完整規格走 §Print Pattern。

## Setting Page

**範本**：暫無 canonical（採購權限規則是第一個落地的 Setting Page）

**結構**（簡單 4 層）：

```
1. Page Header        ─ 標題 + 副標
2. Description Banner  ─ 說明這頁規則的用途、生效範圍
3. Form Card           ─ 整頁的 form：表格（每列一個 role / scope）+ 輸入欄位
4. Action Bar          ─ 右下角：[儲存（綠）][重置（白）]
```

**規則類頁面慣例**：

- 一頁通常只設一種規則（例如採購權限規則 vs 盤點回傳規則分開兩頁）
- 整頁是「upsert by scope_role_code + brand」，不是 list+detail
- 走 `src/domain/rules.ts` 的 `upsertRules(rules: BusinessRuleInput[])`
- 儲存時整批 upsert，不是逐筆

範例：

```tsx
// /admin/setup/purchase-authority/_components/authority-rules-form.tsx
import { listRulesByKind, upsertRules } from '@/domain/rules'

const rules = await listRulesByKind('purchase_authority', { brand_id })

const handleSave = () => startTransition(async () => {
  await upsertRules(formState)
  toast.success('已儲存')
})
```

## Print Pattern（單據型頁面附掛）

**Canonical 範本**：採購單 PO（2026-05-24 首版落地）
- Server page：`src/app/print/purchase-order/[id]/page.tsx`
- Printable：`src/app/print/purchase-order/[id]/_components/purchase-order-printable.tsx`
- Domain helper：`src/domain/orders.ts` line 464-630（`PurchaseOrderForPrint` 型別 + `getPurchaseOrderForPrint(id)`）
- Detail pill 整合：`src/app/(workspace)/parts/purchase/orders/[id]/_components/purchase-order-detail-view.tsx` line 225-237

**現役範例**（全部沿用同一套共用元件、看實際業務語意差異）：
| 業務 | PRINT_SLUG | Helper | Detail pill |
|---|---|---|---|
| 採購單 | `purchase-order` | `src/domain/orders.ts::getPurchaseOrderForPrint` | `parts/purchase/orders/[id]` |
| 銷售訂單 | `sales-order` | `src/domain/sales-orders.ts::getSalesOrderForPrint` | `sales/orders/[id]` |
| 報價單 | `quotation` | `src/domain/sales-quote.ts::getSalesQuoteForPrint` | `sales/quote/[id]` |
| 維修工單 | `repair-order` | `src/domain/repair-orders.ts::getRepairOrderForPrint` | `parts/aftersales/repair-orders/[id]` |
| 領料單 | `stock-issue` | `src/domain/issues.ts::getIssueForPrint` | `parts/issue/repair-pick/[id]` |
| 調撥單 | `stock-transfer` | `src/domain/transfers.ts::getTransferForPrint` | `parts/issue/transfer-out/[id]` |
| 進貨單 | `stock-receipt` | `src/domain/receipts.ts::getReceiptForPrint` | `parts/receipt/po-grn/[id]` |

**何時要做**：頁面是「業務單據」型，使用者會需要列印 / 另存 PDF / 簽核蓋章存檔。判斷清單見上方「列印按鈕只在『單據型』頁面出現」。

**架構**（跟 Page View 解耦、獨立路由）：

```
src/app/print/{slug}/[id]/
  ├── page.tsx                          ← server，撈 getXxxForPrint(id) + 權限檢查
  └── _components/{slug}-printable.tsx  ← client，渲染 + 右上 <PrintToolbar />（不 auto window.print）

src/app/api/pdf/[slug]/[id]/route.ts    ← server PDF API（puppeteer-core + @sparticuz/chromium）
                                           ⚠️ 新 slug 必須加進 ALLOWED_SLUGS

src/components/print/
  ├── print-shell.tsx       brand logo + 文件標題 + 單號 + 買賣方區
  ├── print-meta-grid.tsx   上方 KV grid（cols=2/3/4）
  ├── print-table.tsx       表格（thead 跨頁 repeat、斑馬紋）
  ├── print-totals.tsx      金額小計區（含稅 / 未稅 / 折扣 / grand total）
  ├── print-signatures.tsx  簽核欄（可變角色）
  ├── print-toolbar.tsx     螢幕版浮動「下載 PDF」(@media print 自動隱藏)
  └── print.css             @page A4 / @media print 全域規則 + Noto Sans TC @import
```

**技術選擇**：server-side PDF（puppeteer-core + @sparticuz/chromium），**不靠 `window.print()` 出 PDF**（瀏覽器強制塞 URL header / 頁碼 / 時間 footer）。`window.print()` 只當實體列印機 fallback。

**SOP**（每張單據 ~30 分鐘）：

1. 在對應 domain helper 加 `getXxxForPrint(id)` + `XxxForPrint` 型別 — reuse `getXxxById` 拿單頭 + 明細，補撈 subsidiary letterhead / 客戶 contact / supplier contact / warehouse 地址
2. 建 `src/app/print/{SLUG}/[id]/page.tsx`（拷 `purchase-order/page.tsx`，改 permission constant + helper import）
3. 建 `_components/{slug}-printable.tsx`（拷 PO printable，改業務欄位 + 文件標題 + 簽核欄）
4. detail-view CRUD pill bar 加列印按鈕：`window.open('/print/{SLUG}/${id}', '_blank')`
5. **把新 slug 加進** `src/app/api/pdf/[slug]/[id]/route.ts` 的 `ALLOWED_SLUGS`（少這步 PDF 會 400）
6. 開 `/print/{SLUG}/{id}` 看 A4 預覽 → 點右上「下載 PDF」→ 檢查 PDF **沒有 URL header / 頁碼 / 時間 footer**、CJK 字體正常、多頁 thead 跨頁 repeat

**業務語意差異提醒**：

- 內部單據（領料 / 調撥）**無金額** → 省略 `<PrintTotals>` 或改印「數量合計」
- buyer / vendor 概念在不同單據不一樣（採購單 buyer=公司 / vendor=供應商；銷售訂單 buyer=客戶 / vendor=公司；領料單兩端都是內部部門/倉）— `<PrintShell>` 的 `buyer` 槽永遠擺「公司本體 letterhead」，對手方在 `<PrintMetaGrid>` 區塊內表達
- 簽核欄角色由業務決定（採購 = 請購人/採購主管/財務/供應商簽收；報價 = 業務員/業務主管/客戶簽收；領料 = 領料人/倉管/倉管主管…）

**完整規範**（每行都要照）：`CLAUDE.md` §📄 列印 / PDF Pattern。

**禁止項**：

- ❌ print route 留 Topbar / Sidebar
- ❌ print route 有 server action / 寫資料庫
- ❌ 用 px 標尺寸（用 pt）
- ❌ 編輯欄位 / 折疊互動（列印頁是 snapshot）
- ❌ 沒做 `getXxxForPrint` helper、直接在 print page 拼 query
- ❌ printable 裡 auto `window.print()`（預覽歸預覽、列印歸列印；user 自己點 toolbar）
- ❌ 沒加 ALLOWED_SLUGS 就上線（PDF API 會 400）
- ❌ 自己換字體沒 `@import` Google Fonts（chromium 不含 CJK 字體）

## Multi-section Page（謹慎使用）

例如截圖中的「組織三層架構」一頁同時顯示 區域 / 門店 / 倉庫 三 section。

**判斷要不要拆**：

- 三個 section 各自是獨立 entity、各自有完整 CRUD → **建議拆成三頁** + 保留總覽頁
- 三個 section 強耦合（例如同一單據的 header / lines / attachments）→ 維持同頁，下層用 Tab 結構

組織三層架構屬於前者，Phase 1 拆成 regions / stores / warehouses 三頁、保留 `/parts/setup/org` 為總覽。

## Design Tokens（必照規格、不要漂移）

完整色票 / 字級在 `CLAUDE.md` 的 Design Tokens 區。常用提醒：

```
按鈕 height: 30px (主) / 26px (次)
字級階梯: H1=16, section=13, table cell=12.5, KV label=11
深藍主色: #1A3A5C    新增綠: #0F6E56
危險紅: #CC0000      編輯模式 amber: #FDF3E3 / #854F0B
邊框灰: #EEECE6 (卡片) / #D5D3CB (input)
```

## Pending UI（強制 — CLAUDE.md MANDATORY）

任何寫入互動：

1. spinner + 文字換進行式（「儲存中⋯」/「建立中⋯」）
2. 該區塊 disabled + pointer-events-none + opacity 半透
3. 完成後：成功 → 關 modal + toast 2.2s；失敗 → 紅 banner（不自動關）+ 維持 form 內容

樂觀更新：樂觀項目標 `pending: true` + 視覺半透明 + spinner。

## 既有 SOP 互動

本 skill 跟專案既有的「把 X 做成 design pattern」SOP 有重疊：

- 既有 SOP 是 type A（master/dimension CRUD 升級）的詳細步驟
- 本 skill 是更上層的工作流，cover type A + B（規則類）+ 業務單據

**重疊處以 skill 為準**（skill 走完階段 4，自然涵蓋既有 SOP 的 7 步）。
