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

**CRUD Pill Bar**（view mode 5 顆固定順序）：

```
[返回列表（白）] [新增（綠）] [修改（深藍）] [刪除（紅）] [停用/啟用（白）]
```

`edit mode` 換成 `[儲存變更（綠）][取消（白）]`；`create mode` 換成 `[取消（白）][建立並開啟（綠）]`。

**「新增」一律不開新頁**：點下去 → 同一個 PageView 切到 `creating` state、欄位清空、tabs 隱藏、儲存後 `router.push` 到新 id 的 detail page。

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
