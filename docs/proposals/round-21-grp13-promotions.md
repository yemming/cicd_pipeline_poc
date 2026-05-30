# 第二十一輪提案 — GRP13 促銷活動管理（`/group/promotions`）

> 集團管理 › 商務管理層第 3 頁。round-20 已上 GRP12（看數據）+ GRP14（訂定價規則），本輪補 **GRP13 促銷活動管理**：建活動 × 折扣授權範圍 × 適用門店 × 門店執行監看 × 活動效益 × LINE 海報。
> spec：`docs/20260529/DealerOS_最終版本/05_集團管理/03_商務管理/GRP13_促銷活動管理_v1.html`（947 行）

## 0. 資料真相校驗（已實測 2026-05-30）

| 查核 | 結果 |
|---|---|
| `promo_campaigns` 表 | **不存在** |
| `push_campaigns` | 是 CRM LINE 推播（kind/template_id/channel/target_habc/sent_count…），**≠ 銷售促銷活動**，不挪用 |
| `business_rules` 欄位 | id, brand_id, rule_kind, scope_role_code, scope_store_id, scope_subsidiary_id, **config jsonb**, metadata jsonb, is_active, sort_order, created_at/by, updated_at/by — **無 `name` 欄** |
| 既有 rule_kind | …`discount_authority`(10), `discount_workflow`(2), round-20 `pricing_policy`(16)/`pricing_deviation`(1) — **無 promo_campaign** |
| `discount_authority` | per-role 折扣權限（業務員可給幾折）≠ 活動級折扣授權範圍 → 不關聯 |
| nav 商務管理群組 | ducati `19000000-…-0001`、indian `…-0002`，各掛 2 子節點（sort 0/1）→ GRP13 掛 **sort_order=2** |

## 1. spec 拆解（要實作的東西）

**List 視圖**（`/group/promotions`）：
- KPI 4 卡：進行中活動數 / 活動業績貢獻 / 平均折扣率 / 折扣越界筆數
- 越界警示橫幅（紅 banner，列出越界門店）
- 狀態 tabs：全部 / 進行中 / 已排程 / 審核中 / 草稿 / 已結束（含 count）
- 活動卡列（每張：狀態點 + 標題 + 期間 + 狀態/類型 badge + 折扣授權範圍 + 適用門店 + 業績貢獻 + 執行單數 + 編輯/海報/下架）
- 門店折扣執行監看表（門店 × 活動：授權範圍 vs 實際折扣，越界紅標）
- 活動效益分析（已結束活動：業績 / 參與店數 / 毛利影響 / 客單價 / 回購率 / 評分）

**Side Panel CRUD**（建立 / 編輯）：
- 基本資料（名稱 / 起迄日 / 類型 / 負責人）
- 折扣授權範圍（下限 / 上限，含 min≤max 驗證）
- 適用門店（多選 checkbox）
- 活動文案（標題 / 折扣標語 / 副標 / 詳細說明 / 封面圖）
- **LINE 海報預覽 × 下載**（3 模板切換 + 表單即時綁定）
- 狀態異動紀錄（時間軸）
- 狀態機：`draft → review → approved → ended → archived`（+ active/scheduled 由日期推導）

## 2. 架構提案

完全沿用 round-20 GRP14 範本（已驗證上線）：

```
src/domain/group-promotions.ts          ← helper：list / get / overview（reads 走 createClient，RLS user_has_brand scope）
src/lib/group/promotion-actions.ts      ← Result 型別 server actions（寫入走 service client + admin gate）
  create / update / submitForReview / approve / takedown(ended) / archive / delete
  每個 mutation 在 config.audit_log append（by / at / from→to）
src/app/(workspace)/group/promotions/page.tsx        ← server，撈 list + overview + 門店監看 + 效益
src/app/(workspace)/group/promotions/_components/promotions-board.tsx  ← client，list + tabs + side panel CRUD + 海報
src/lib/group/group-analytics-labels.ts  ← append PROMO_TYPES / PROMO_STATUS_META 等常數
```

**資料模型（待拍板 Q1）**：
- 方案 A（推薦）：`business_rules` rule_kind=`promo_campaign`。活動全欄位塞 config（name/type/start/end/discMin/discMax/stores[]/owner/poster{}/status/audit_log[]）。狀態用 config.status；is_active 對映「未封存」。
  - 優點：100% 套 GRP14 範本、RLS 現成、0 新 migration、0 新 RLS policy、一個人開發最省。
  - 缺點：date range / store array 是 jsonb 查不了索引（但本頁是集團小量資料、前端篩選即可，非問題）。
- 方案 B：新建 `promo_campaigns` 表（typed core: name/type/start_date/end_date/disc_min/disc_max/status + metadata jsonb）。
  - 優點：更正規、date 可索引。缺點：要寫 migration + 4 條 RLS policy（memory: 新表必帶 RLS）+ 新 typed actions，工 ↑、風險 ↑。

**門店執行監看 + 效益分析**：沿用 round-16~20 group analytics 全 seed 慣例（真 join 需要 promo-tagged 交易資料，DB 沒有）→ seed `kpi_snapshots`（`_seed='round21-promotions'`）。

**海報產出（待拍板 Q2）**：spec 標 Partner html2canvas。三種做法見下方拍板。

## 3. 待拍板

- **Q1 資料模型**：business_rules（推薦）vs 新表
- **Q2 海報範圍**：即時預覽 only / +html2canvas 真產 PNG / +接 LINE 推送
- 其餘沿用 GRP14：寫入 service client + admin gate、reads createClient RLS、demo 全 Indian brand、雙 brand nav。

## 4. 驗證計畫（Deploy-then-Test）

`round21-verify.mjs`：登入正式站 → list（KPI/tabs/活動卡/監看表/效益）斷言 → 開 side panel 建活動（折扣範圍驗證 + 海報即時更新）→ banner → **查 DB business_rules 確認落地 + audit_log[0].by=yemming.yu@gmail.com** → 狀態機（送審→核准）→ 清測試記錄 → 無 console error。截圖存 `docs/test-evidence/round-21/`。
