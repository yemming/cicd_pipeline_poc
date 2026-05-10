---
name: spec-to-feature
description: 把 Stitch HTML / Figma 截圖 / 文字描述的新功能規格，照 DealerOS 的 Domain Helper + Typed Core + JSONB Metadata 架構自動拆解、提案、落地、驗證。觸發語：「把這個頁面照我們架構做」、「新功能：xxx 請用 design pattern + Helper 實現」、用戶拖入 Stitch HTML 檔案、貼 Stitch / Figma URL。5 階段流程：結構分析 → 架構提案 → 拍板 → 落地 → 驗證 checklist。落地前必須由用戶 review 提案，禁止跳過階段 3。
---

# spec-to-feature

DealerOS 把新頁面規格落地的標準工作流。每收到一份新頁面（Stitch HTML、Figma 截圖、純文字描述），都走這條 5 階段流程，輸出品質穩定。

## 何時觸發

✅ 觸發：

- 用戶拖 / 貼 HTML 檔案 + 「照我們架構做」/「實現一下」/「拆出來」
- 用戶貼 Stitch / Figma URL + 類似句
- 用戶貼截圖 + 描述「我要這頁」
- 用戶純文字「新功能：採購退貨單，狀態有待審核 / 退貨中 / 完成⋯⋯」/「幫我做一頁 XXX」
- 用戶說「照 spec-to-feature 走」/「跑一次 skill」

❌ 不觸發：

- 用戶只是問「這頁長怎樣」/「這頁的資料結構是什麼」（純解釋、沒要建）
- 用戶要修現有頁面的 bug / 微調樣式（這走 design pattern SOP，不過 skill）
- 用戶在討論架構 / 規格，還沒明確要動工

## 5 階段流程

不可跳階段、不可合併。每個階段結束有明確產出。

### 階段 1：結構分析（自動，不問用戶）

**輸入**：HTML / 截圖 / Stitch URL / 文字描述

**動作**：

1. 如果是 URL，先 fetch（用 Read 直接讀 file:// 或 WebFetch fetch http(s)://；Stitch HTML 通常是 file://）
2. 如果是截圖，描述其元素
3. 抽出以下結構（記憶體中，先別寫檔）：

```
entities:
  - <實體名>（例 PurchaseReturn / Region / Store）
    fields: [...]
    relationships: [{ to: <其他實體>, kind: 'fk' | 'm2m' | '1m' }]

actions:
  - <動作名>（例 listPurchaseReturns / approvePurchaseReturn）
    signature: '(input: ...) => Promise<...>'
    suspected_side_effects: [...]   # 從 UI 文案推測（如「審核通過後庫存自動回沖」）

kpis:
  - <KPI 名>（例 待審核 / 本月退貨金額）
    source: <怎麼算>

implied_schema:
  - <table 名>: [...]
  - <relationship>: ...

implied_pages:
  - kind: 'list' | 'detail' | 'setting' | 'dashboard'
    route: <建議路徑>
```

4. 同時讀 `references/architecture.md`、`references/field-classification.md`、`references/side-effect-checklist.md` 三份 reference 校準分析

**不產出檔案**，只在記憶體中組好結構，等階段 2 才寫到 docs/proposals/。

### 階段 2：架構提案（自動產 → 寫 markdown 檔）

**動作**：

1. 開檔 `docs/proposals/feature-{slug}.md`，slug 從 URL / 檔名 / 用戶描述抽
2. 用以下 template 填內容：

```markdown
# 提案：<功能名>

> 來源：<HTML 檔名 / URL / 文字描述>
> 日期：<YYYY-MM-DD>
> 階段：架構提案（待用戶拍板）

## 1. 結構摘要
<2-3 句話描述這個功能在做什麼>

## 2. Schema 草案

### 新表（如有）

\`\`\`sql
CREATE TABLE <table> (
  id uuid PRIMARY KEY,
  brand_id text,
  -- typed core
  <欄位>...
  metadata jsonb DEFAULT '{}'::jsonb,
  ...
);
-- RLS policies (brand-aware)
...
\`\`\`

### 現有表變更（如有）
- ALTER TABLE ... ADD COLUMN ...
- 重用：<table> 的 <欄位>

### 欄位分類（typed vs jsonb）

| 欄位 | 落腳 | 理由 |
|---|---|---|
| <name> | typed | <為何 typed> |
| <name> | jsonb (metadata) | <為何 jsonb> |
| ... | ... | ... |

## 3. Domain Helper 規劃

檔案：`src/domain/<module>.ts`

\`\`\`ts
export async function list<X>(filter): Promise<...>
export async function get<X>ById(id): Promise<...>
export async function add<X>(input): Promise<...>
export async function update<X>(id, patch): Promise<...>
...
\`\`\`

每個函式內部實作策略（Day 1 預設）：<直連 supabase / RPC / server action>

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| <action> | <例：跨表寫入 inventory_adjustments + 推 LINE 給供應商> | [需確認] |

⚠️ [需確認] 項目必須階段 3 跟用戶確認。

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| <name> | /xxx | List View | parts/setup/items/_components/items-board.tsx |
| <name> | /xxx/[id] | Page View | parts/setup/items/[id]/_components/item-detail-view.tsx |

## 6. nav_nodes（雙 brand）

\`\`\`sql
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES ('ducati', '<parent>', 3, <n>, '<中文名>', '<icon>', '<href>', 'react_route', true, false),
       ('indian', '<parent>', 3, <n>, '<中文名>', '<icon>', '<href>', 'react_route', true, false);
\`\`\`

建議擺位：`<group>` / `<parent>` 群組底下、緊接 <鄰居>

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | src/domain/<module>.ts |
| 新增 | src/app/(workspace)/.../page.tsx |
| ... | ... |

## 8. Verification（落地完手測）

1. <SSOT 一致性驗證點>
2. <跨模組共讀驗證>
3. <jsonb metadata 機制驗證>
4. tsc --noEmit / eslint
5. 手測 list filter / inline modal CRUD / detail / 切 tab

## 9. 開放問題（階段 3 拍板）

- [ ] <typed/jsonb 邊緣案例>
- [ ] <副作用 [需確認] 項目>
- [ ] <權限邊界>
- [ ] <名字 / 路徑>
- [ ] <現成可 reuse 的表 / helper>
```

3. 提案寫完，告訴用戶「提案存在 docs/proposals/feature-<slug>.md，請 review，幾個關鍵問題我用 AskUserQuestion 問你」

### 階段 3：拍板（AskUserQuestion，必須走）

把「9. 開放問題」濃縮成 2-4 題用 AskUserQuestion 問。常見問題類別：

1. **typed vs jsonb 分配**：邊緣欄位（例如「物流單號」、「備註」）要 typed 還是 jsonb？給用戶兩個選項 + 推薦理由
2. **副作用確認**：[需確認] 項目「審核退貨單會不會推通知」/「是否要寫 audit log」
3. **權限邊界**：哪些角色能 create / approve / delete
4. **命名 / 路徑**：路徑路徑可不可以、`src/domain/<module>` 名字 OK 嗎

⚠️ **不要問「方案 OK 嗎」這種泛問題**。每題必須是具體選擇題。

如用戶要改提案 → 改 `docs/proposals/feature-<slug>.md`、再問或直接進階段 4。

### 階段 4：落地（半自動）

執行順序（嚴格）：

1. **DB 先動**：用 `mcp__plugin_supabase_supabase__apply_migration` 建表 + RLS（含 brand-aware policy；參考 memory 的「多品牌 Schema Pattern」 — 4 條 user_has_brand() RLS）
2. **Type 重新生成**：用 `mcp__plugin_supabase_supabase__generate_typescript_types`，覆寫 `src/lib/database.types.ts`
3. **Domain Helper**：建 `src/domain/<module>.ts`，每個函式最簡單實作（Day 1 預設 supabase 直連）
4. **頁面**：拷貝範本（參考 references/page-templates.md 列出的 canonical），改業務欄位 + filter；UI 只 import `@/domain/*`、**不准** import `@/lib/supabase/*`
5. **nav_nodes**：用 `mcp__plugin_supabase_supabase__execute_sql` INSERT 雙 brand
6. **驗 build**：`npx tsc --noEmit`、`npx eslint <touched-paths>` — 0 errors 才算落地完成

每步完成 update 對應 task。

### 階段 5：驗證 checklist

落地後向用戶輸出 checklist（從提案的「8. Verification」拷出來、加實際操作步驟），讓用戶手測。**不要替用戶宣告完成**，等他驗。

## 紀律 / 禁區

- ❌ 跳階段 3 直接落地（即使你「覺得」自己懂用戶意圖）
- ❌ UI 直接 `import { createClient } from '@/lib/supabase/...'`
- ❌ 規則類各開一張表（採購權限 / 盤點 / 告警階層 都走 `business_rules`）
- ❌ 為了 future-proof 全部欄位 typed（變動中的丟 jsonb）
- ❌ 寫 zod schema（POC 階段不寫；type 靠 supabase generate）
- ❌ 在落地前修改既有 server actions（除非用戶明確要求）
- ❌ 不雙 brand 補 nav_nodes（會至少一個品牌看不到入口）

## References

讀以下檔案校準分析（階段 1-2 必讀，階段 4 落地時查 page-templates 跟 naming-conventions）：

- `references/architecture.md` — Domain Helper + Typed/JSONB 完整規格
- `references/field-classification.md` — typed vs jsonb 判斷準則 + 例子
- `references/page-templates.md` — List View / Page View / Setting Page 骨架引用
- `references/side-effect-checklist.md` — 哪些動作通常有副作用
- `references/naming-conventions.md` — domain / table / route 命名慣例

## 第一個 dogfood 案例（用來驗 skill 自己好不好用）

組織三層架構升級：分析 `/parts/setup/org`、提案 regions / stores / warehouses 三頁、走完 5 階段。詳見 plan `/Users/ming/.claude/plans/image-1-image-2-jolly-bonbon.md` Phase 1。
