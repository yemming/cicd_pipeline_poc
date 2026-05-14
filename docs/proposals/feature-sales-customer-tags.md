# 提案：銷售模組 — 客群標籤管理（RS 個人視角）

> 來源：`nav-html/indian/8ad0c9a5-d475-4833-9cd2-e25e7d88c527.body.html`
>   （RS_SET2 客戶標籤管理（銷售端）v2 — DUCATI 銷售管理系統）
> 日期：2026-05-14
> 階段：自決落地（規則：所有設計決策走最佳預設選項自決）
>
> 姊妹分析（先盤過、未落地）：
> - `feature-aftersales-customer-tags-phase1.md`（售後 12 主管視角 — 同字典、不同 owner view）

---

## 1. 結構摘要

「銷售端 RS 個人」的客群標籤管理頁，4 個 tab：
- **標籤庫總覽**：四色（紅黃綠藍）分組顯示官方標籤（🔒 唯讀）+ 我的自訂標籤（可編輯/刪除）；每色 section 底下有 inline「＋ 新增自訂」輸入列
- **我的自訂標籤**：詳列 RS 個人自訂標籤、上限 5 個（dot bar 進度）、編輯/刪除動作
- **使用統計**：本月 / 我的客戶 / 貼標次數排行（前 15）— 暫無 `customer_tag_assignments` 表，先以 placeholder 0 顯示框架
- **主管觀察視角**：全店 RS 自訂標籤聚合（按 brand 群組、依使用熱度排序），給主管做「升為官方」的參考視角；本頁不提供升為官方按鈕，提示去 RS_M3 操作

跟售後 12 共用 `customer_tags`（官方字典）；自訂標籤獨立存 `customer_personal_tags`（**新表**，per-user × brand）。

## 2. Schema 草案（新增 2 表）

### 2.1 `customer_tags`（官方標籤字典）— 售後 12 姊妹頁 owner，本頁唯讀

```sql
CREATE TABLE customer_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  code text,                                -- machine-readable，可選
  label text NOT NULL,                      -- '預算偏低' / 'Panigale 偏好' 等
  color text NOT NULL CHECK (color IN ('red','yellow','green','blue')),
  emoji text,                               -- '🔴'/'🟡'/'🟢'/'🔵'，避免 derive 散落 client
  description text,                         -- HTML 上的 desc 欄
  is_active boolean NOT NULL DEFAULT true,  -- 軟刪除
  sort_order int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (brand_id, label)
);

CREATE INDEX customer_tags_brand_color_active_idx
  ON customer_tags (brand_id, color, is_active, sort_order);

ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_tags_select" ON customer_tags FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY "customer_tags_insert" ON customer_tags FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY "customer_tags_update" ON customer_tags FOR UPDATE USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY "customer_tags_delete" ON customer_tags FOR DELETE USING (user_has_brand(brand_id));
```

### 2.2 `customer_personal_tags`（RS 個人自訂標籤字典）— 本頁 owner

```sql
CREATE TABLE customer_personal_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- typed core
  name text NOT NULL,                       -- 不含 emoji 的純名稱
  color text NOT NULL CHECK (color IN ('red','yellow','green','blue')),
  note text,                                -- 說明備註（HTML 上的 textarea）
  is_active boolean NOT NULL DEFAULT true,
  -- 衍生欄位
  use_count int NOT NULL DEFAULT 0,         -- 被貼到客戶上的次數（後續 assignments 接時自動更新；目前先 0）
  -- jsonb
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, owner_id, name)
);

CREATE INDEX customer_personal_tags_owner_idx
  ON customer_personal_tags (brand_id, owner_id, is_active);
CREATE INDEX customer_personal_tags_brand_active_idx
  ON customer_personal_tags (brand_id, is_active);  -- 主管觀察視角用

ALTER TABLE customer_personal_tags ENABLE ROW LEVEL SECURITY;
-- 用 user_has_brand 限 brand；SELECT 全 brand 可看（主管觀察視角需要），但 INSERT/UPDATE/DELETE 限 owner=self
CREATE POLICY "customer_personal_tags_select" ON customer_personal_tags
  FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY "customer_personal_tags_insert" ON customer_personal_tags
  FOR INSERT WITH CHECK (user_has_brand(brand_id) AND owner_id = auth.uid());
CREATE POLICY "customer_personal_tags_update" ON customer_personal_tags
  FOR UPDATE USING (user_has_brand(brand_id) AND owner_id = auth.uid())
                WITH CHECK (user_has_brand(brand_id) AND owner_id = auth.uid());
CREATE POLICY "customer_personal_tags_delete" ON customer_personal_tags
  FOR DELETE USING (user_has_brand(brand_id) AND owner_id = auth.uid());
```

### 2.3 欄位分類

| 欄位 | typed/jsonb | 理由 |
|---|---|---|
| `brand_id` / `owner_id` / `name` / `color` | typed | 主鍵 / 租戶 / 必查 / CHECK |
| `note` | typed | 簡單字串、HTML 有專屬輸入 |
| `is_active` / `use_count` / `sort_order` | typed | 排序 / 顯示計數 |
| `metadata` | jsonb | tooltip / external_ref / 未來擴充 |

## 3. Domain Helper — `src/domain/customer-tags.ts`

```ts
"use server";

export type CustomerTag = { id, brand_id, code, label, color, emoji, description, is_active, sort_order, ... };
export type PersonalTag  = { id, brand_id, owner_id, name, color, note, is_active, use_count, ... };

// 官方字典（read-only from 本頁）
export async function listOfficialTags(): Promise<CustomerTag[]>;

// 個人字典 — owner CRUD
export async function listMyPersonalTags(): Promise<PersonalTag[]>;
export async function createPersonalTag(input): Promise<Result<{ id }>>;
export async function updatePersonalTag(id, patch): Promise<Result<{ id }>>;
export async function deletePersonalTag(id): Promise<Result<{ id }>>;

// 主管觀察視角（聚合）
export async function listBrandPersonalTagsAggregated(): Promise<Array<{
  name, color, note, total_use, rs_users: Array<{ id, display_name }>, trend
}>>;

// 一站撈 page 所需全部資料
export async function getCustomerTagsPageData(): Promise<{
  officialTags, myTags, brandAggregated
}>;
```

每個寫入 helper：
1. 抓 `getActiveScope()` 取 brand_id（沿用既有 pattern）
2. 抓 `auth.getUser()` 取 owner_id
3. 驗 input（name 1-20 char、color in enum）
4. supabase 直連 INSERT/UPDATE/DELETE
5. 回 Result<T>、`revalidatePath('/sales/settings/customer-tags')`

constants 拆 `src/domain/customer-tags.constants.ts`：

```ts
export const TAG_COLORS = ['red','yellow','green','blue'] as const;
export const TAG_COLOR_EMOJI = { red:'🔴', yellow:'🟡', green:'🟢', blue:'🔵' };
export const TAG_COLOR_LABEL = { red:'注意事項', yellow:'偏好特質', green:'服務備忘', blue:'談判協商' };
export const PERSONAL_TAG_LIMIT = 5;
```

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `createPersonalTag` | INSERT customer_personal_tags | 確定 |
| `updatePersonalTag` | UPDATE；不影響任何下游（assignments 表尚未建） | 確定 |
| `deletePersonalTag` | UPDATE is_active=false（軟刪）— HTML 文案「已貼客戶不受影響」對齊 | 確定 |
| 沒有任何 LINE / cross-table fanout / accounting event | — | — |

## 5. 會計事件分析

**無** — 客戶標籤是純行銷標記，不涉及資金 / 庫存 / 收入 / AR / AP，不產生會計事件。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 客群標籤設定 | `/sales/settings/customer-tags` | Setting page（4 tab + 左 sidenav 篩選） | 兄弟頁 `/sales/settings/handcard-params` |

⚠️ **不做 detail page**（純字典頁、欄位少；明文豁免 — CLAUDE.md SOP §邊界）

### Layout

```
<main className="px-6 py-5 space-y-3">
  <PageHeader title="客群標籤設定" sprint="銷售 #RS_SET2" caption="..." />

  <Tabs value={tab}>
    <TabsList>標籤庫總覽 / 我的自訂標籤 / 使用統計 / 主管觀察視角</TabsList>
    <TabsContent value="lib">
      <InfoBanner>標籤庫說明：官方標籤由主管設定（🔒）⋯</InfoBanner>
      <SidebarPanel>顏色 filter (5) + 來源 filter (2)</SidebarPanel>
      <ColorSections>4 個 color section</ColorSections>
    </TabsContent>
    <TabsContent value="custom">
      <LimitBar>5 點 dot / 已用 N 個</LimitBar>
      <PersonalTagList>每筆 card + 編輯 / 刪除</PersonalTagList>
    </TabsContent>
    <TabsContent value="stat">
      <StatTable>排名 / 標籤 / 類別 / 次數 / 佔比</StatTable>
    </TabsContent>
    <TabsContent value="obs">
      <ObsCardList>全店聚合卡片</ObsCardList>
    </TabsContent>
  </Tabs>

  <CreateModal />
  <EditModal />
  <Banner fixed bottom-right />
</main>
```

互動全部對應 HTML、按 CLAUDE.md §UX 互動規範（useTransition、pending UI、按鈕鎖、文字換進行式）。

## 7. nav_nodes — UPDATE 既有 indian 節點

```sql
-- 階段 1 查到的 ID：8ad0c9a5-d475-4833-9cd2-e25e7d88c527
UPDATE nav_nodes
   SET page_kind = 'react_route',
       href      = '/sales/settings/customer-tags'
 WHERE id = '8ad0c9a5-d475-4833-9cd2-e25e7d88c527';
-- html_storage_path 保留，當歷史備份
```

⚠️ 此 parent「主管工作台」只在 indian brand 存在（前 3 張兄弟頁同理），ducati 不動。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/customer-tags.ts` |
| 新增 | `src/domain/customer-tags.constants.ts` |
| 新增 | `src/app/(workspace)/sales/settings/customer-tags/page.tsx` |
| 新增 | `src/app/(workspace)/sales/settings/customer-tags/_components/customer-tags-view.tsx` |
| Migration | 建 `customer_tags` + RLS |
| Migration | 建 `customer_personal_tags` + RLS |
| Migration | seed 22 筆官方標籤（HTML 寫死）+ 5 筆個人標籤 demo（Indian brand） |
| DB UPDATE | nav_nodes 切 react_route |

## 9. Verification

1. 4 個 tab 切換正常
2. 新增個人標籤 → 立即出現在「標籤庫總覽」對應 color section
3. 編輯 / 刪除個人標籤 → 樂觀更新、banner 提示
4. 達到 5 個上限時 dot bar 全亮、額外新增有友善錯誤
5. 主管觀察視角顯示全 brand 聚合
6. `npx tsc --noEmit` 0 errors
7. `npx eslint <touched>` 0 errors
8. `grep -rn "@/lib/supabase" src/app/(workspace)/sales/settings/customer-tags` 0 hits
9. Playwright headless 截圖 + element check

## 10. 自決紀錄（規則：所有設計決策走最佳預設選項、不回頭問）

| 開放問題 | 自決 | 理由 |
|---|---|---|
| 跟售後 12 共用字典還是分開？ | 共用 `customer_tags`，本頁唯讀 | phase1.md §1 明示「跨模組共用」 |
| 自訂標籤獨立表還是塞 `customer_tag_assignments.metadata`？ | 獨立 `customer_personal_tags` 表 | HTML 顯示自訂標籤需 id / use_count / 「主管觀察視角」全店聚合，必須 entity 化 |
| 是否做主管 dictionary CRUD？ | **不做**（留售後 12 owner） | 本頁是 RS 個人視角；官方字典僅做 read |
| 個人標籤上限怎麼存？ | constants `PERSONAL_TAG_LIMIT = 5`，DB 不存 | HTML hard-code、業務規則簡單、不值得 business_rules |
| RBAC 守 page？ | 不另開 permission；任何登入 sales 都可進 | HTML banner 沒 RBAC 文案；簡化、不污染 permissions 表 |
| 主管觀察視角資料 | 暫用 personal_tags 聚合（owner_id 加 join 拿 display_name） | assignments 表尚未建；後續接上時改 fancy aggregate |
| 使用統計（個人）資料 | 暫用 `personal_tag.use_count` + `official_tag` 假 usage 顯示框架 | assignments 表尚未建 |
| seed 官方標籤 | 把 HTML 22 筆 hard-code seed 進 indian brand | 跟 ducati 共享同 schema、之後可 copy |
| nav_nodes 是否雙 brand | 只動 indian（既有節點 UPDATE） | parent「主管工作台」只在 indian，跟前 3 張兄弟頁同 pattern |
