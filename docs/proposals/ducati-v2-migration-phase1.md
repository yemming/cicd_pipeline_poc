# DUCATI v2 Phase 1 Migration — nav_nodes (Indian brand)

> **產出時間**：2026-05-15
> **對應問答表**：https://www.notion.so/36166adeb1d381439abad2f0af175983
> **對應對照表**：`docs/proposals/v2-page-mapping.md`
> **工序追蹤卡**：BrainDump → DUCATI v2 工序追蹤卡

---

## 目的

依 Ming 18 題拍板結論，產出 **Indian brand** nav_nodes 一次性 SQL migration，做：

1. **新增 9 個 nav routes**（先 `page_kind='placeholder'` + `coming_soon=true`，等 Phase 3 上畫面後 ALTER 成 `react_route`）
2. **合 nav**（4 個原本獨立的 v2 條目併到既有 route 同頁，DB 上不長 row、只在文件記錄）
3. **「店長」第 8 角色**：DB 已存在，不需 RBAC migration
4. **C 模組路徑統一（Q16）**：**Phase 2 才做**（升級畫面時逐頁 cutover，Phase 1 不一次性 redirect 全部，避免 blast radius）

---

## A. 現況 snapshot（2026-05-15）

```
Indian brand nav_nodes 統計
  L1=21（active=7：銷售接待 / 客服管理 / 售後修護 / 庫存管理 / 會計財務設定 / 電子發票 / 核心進銷存模組）
  L2=56
  L3=246
總 active row：323
```

**Phase 1 動的 L2 group**（parent_id 已實證）：

| L1 模組 | L2 group | UUID | 既有 L3 數 | Phase 1 加入 |
|---|---|---|---:|---|
| 銷售接待 | 主管工作台 | `447143ca-badc-4c31-b2cd-53d58873cd50` | 4 | +2（Q1, Q2） |
| 銷售接待 | 展廳接待 | `743bdde8-bf90-46f7-b29f-14335241d0cb` | 8 | +1（Q17） |
| 售後修護 | 主管工作檯 | `879bf699-f950-4323-b17c-48497aa1df8f` | 2 | +4（Q12, Q15×3） |
| 庫存管理 | 商品管理 | `05c5dddf-b75d-4224-9e10-cb4dcd7bad17` | 10 | +1（Q6） |
| 庫存管理 | 盤點管理 | `6108ffed-4e80-4486-b9ff-4832a32f2e2a` | 6 | +1（Q8） |

**RBAC**：`roles` 表已有 8 個角色（owner / CEO / **manager（店長）** / 倉管 / 技師 / 採購主管 / 服務顧問 / 只讀使用者）— 與 Q18(a) 對齊，無需 migration。

---

## B. 9 個新 nav routes（INSERT）

每筆都用 `page_kind='placeholder'` + `coming_soon=true`，sidebar 顯示「即將推出」灰底。Phase 3 落地畫面後再 `UPDATE nav_nodes SET page_kind='react_route', coming_soon=false WHERE href=...`。

```sql
BEGIN;

-- ============================================================
-- 銷售接待 → 主管工作台（+2）
-- ============================================================

-- Q1 / A4 業績報表
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES (
  'indian',
  '447143ca-badc-4c31-b2cd-53d58873cd50',  -- 主管工作台
  3,
  (SELECT COALESCE(MAX(sort_order),0)+1 FROM nav_nodes WHERE parent_id='447143ca-badc-4c31-b2cd-53d58873cd50'),
  '業績報表', 'assessment', '/sales/manager/reports',
  'placeholder', true, true
);

-- Q2 / A5 手卡參數設定
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES (
  'indian',
  '447143ca-badc-4c31-b2cd-53d58873cd50',  -- 主管工作台
  3,
  (SELECT COALESCE(MAX(sort_order),0)+1 FROM nav_nodes WHERE parent_id='447143ca-badc-4c31-b2cd-53d58873cd50'),
  '手卡參數設定', 'tune', '/sales/manager/card-config',
  'placeholder', true, true
);

-- ============================================================
-- 銷售接待 → 展廳接待（+1）
-- ============================================================

-- Q17 / A8 RS 視角新車庫存看板
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES (
  'indian',
  '743bdde8-bf90-46f7-b29f-14335241d0cb',  -- 展廳接待
  3,
  (SELECT COALESCE(MAX(sort_order),0)+1 FROM nav_nodes WHERE parent_id='743bdde8-bf90-46f7-b29f-14335241d0cb'),
  '新車庫存（RS 視角）', 'two_wheeler', '/sales/showroom/stock',
  'placeholder', true, true
);

-- ============================================================
-- 售後修護 → 主管工作檯（+4）
-- ============================================================

-- Q12 / C14 客戶標籤主管設定
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES (
  'indian',
  '879bf699-f950-4323-b17c-48497aa1df8f',  -- 主管工作檯
  3,
  (SELECT COALESCE(MAX(sort_order),0)+1 FROM nav_nodes WHERE parent_id='879bf699-f950-4323-b17c-48497aa1df8f'),
  '客戶標籤主管設定', 'sell', '/service/manager/customer-tags',
  'placeholder', true, true
);

-- Q15a / C13a 車間管理看板
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES (
  'indian',
  '879bf699-f950-4323-b17c-48497aa1df8f',
  3,
  (SELECT COALESCE(MAX(sort_order),0)+1 FROM nav_nodes WHERE parent_id='879bf699-f950-4323-b17c-48497aa1df8f'),
  '車間管理看板', 'precision_manufacturing', '/service/manager/workshop',
  'placeholder', true, true
);

-- Q15c / C13c 員工人員名冊
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES (
  'indian',
  '879bf699-f950-4323-b17c-48497aa1df8f',
  3,
  (SELECT COALESCE(MAX(sort_order),0)+1 FROM nav_nodes WHERE parent_id='879bf699-f950-4323-b17c-48497aa1df8f'),
  '員工人員名冊', 'badge', '/service/manager/employees',
  'placeholder', true, true
);

-- Q15d / C13d 工單前綴碼設定
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES (
  'indian',
  '879bf699-f950-4323-b17c-48497aa1df8f',
  3,
  (SELECT COALESCE(MAX(sort_order),0)+1 FROM nav_nodes WHERE parent_id='879bf699-f950-4323-b17c-48497aa1df8f'),
  '工單前綴碼設定', 'tag', '/service/manager/ro-prefix',
  'placeholder', true, true
);

-- ============================================================
-- 庫存管理 → 商品管理（+1）
-- ============================================================

-- Q6 / D1.16 序列號追蹤
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES (
  'indian',
  '05c5dddf-b75d-4224-9e10-cb4dcd7bad17',  -- 商品管理
  3,
  (SELECT COALESCE(MAX(sort_order),0)+1 FROM nav_nodes WHERE parent_id='05c5dddf-b75d-4224-9e10-cb4dcd7bad17'),
  '序列號追蹤', 'qr_code_2', '/parts/setup/serial-tracking',
  'placeholder', true, true
);

-- ============================================================
-- 庫存管理 → 盤點管理（+1）
-- ============================================================

-- Q8 / D6.3 報損報溢（主管審核獨立頁）
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES (
  'indian',
  '6108ffed-4e80-4486-b9ff-4832a32f2e2a',  -- 盤點管理
  3,
  (SELECT COALESCE(MAX(sort_order),0)+1 FROM nav_nodes WHERE parent_id='6108ffed-4e80-4486-b9ff-4832a32f2e2a'),
  '報損報溢審核', 'rule', '/parts/count/loss-overflow',
  'placeholder', true, true
);

COMMIT;
```

---

## C. 不在 Phase 1 做（明確聲明）

下列項目雖然 Ming 已拍板，但**不在 Phase 1 SQL 處理**，避免一次動太多：

### C-1. C 模組路徑統一（Q16）— Phase 2

`/aftersales/*`（14 page.tsx） + `/parts/aftersales/*`（32 page.tsx）→ `/service/*` 是 **50+ row 的批次 UPDATE href**，且需要 Next.js redirect 規則同步。建議：

- **Phase 1 不動**舊路徑，照常存活
- **Phase 3 升級畫面時**：每升級一頁，就同步 (1) 改新檔到 `/service/...` (2) UPDATE 對應 nav_node href (3) 在舊路徑 page.tsx 改 `redirect()` 到新路徑

### C-2. /crm/* CRM 模組合併（Phase 2）— B 模組 13 頁

`/sales/crm/*` + `/aftersales/crm/*` 13 routes → `/crm/*`。同樣是大批次 nav 改動 + 路徑搬家。Phase 2 專門處理。

### C-3. 5 個合 nav（沒新 row、沒舊 row 移動）

下列只是文件層說明，SQL 不動：

| v2 條目 | 動作 | 落實方式 |
|---|---|---|
| D1.5 商品管理權限 | 合到 `/admin/master-data/items` 編輯權限分頁 | Phase 3 在 items detail view 加 tab |
| D1.8 倉儲四層架構 | 合到 D1.9 同頁 | Phase 3 在 `/parts/setup/warehouses` 加說明區塊 |
| D5.4 庫存盤點作業 | 合到 D6.2 `/parts/count/sessions` | 已是同 route，nav 顯示時用同一條 |
| D8.2 舊件出入庫邏輯 | 合到 D8.1 `/parts/warranty/flow` | Phase 3 在 flow 頁加說明區塊 |
| C13b 售後人效統計 | 合到 `/group/dashboard` KPI 區 | Phase 3 在 dashboard 加 KPI 卡片 |

### C-4. Phase 3 才建畫面的 9 個新 route

Phase 1 SQL 把 nav 入口先掛好（`page_kind='placeholder'`），實際 page.tsx 留 Phase 3 用 `spec-to-feature` skill 5 階段做。Phase 1 跑完 Ming 切 Indian 帳號可以看到 sidebar 9 個新項目（灰底「即將推出」），點下去走 placeholder page。

---

## D. 驗收 checklist（Phase 1）

Apply 完跑：

```sql
-- 1) 確認 9 個新 row 都 in 對的 L2 group
SELECT p.name AS l2_group, c.name AS new_item, c.href, c.page_kind, c.coming_soon
FROM nav_nodes c
JOIN nav_nodes p ON c.parent_id = p.id
WHERE c.brand_id='indian'
  AND c.href IN (
    '/sales/manager/reports', '/sales/manager/card-config',
    '/sales/showroom/stock',
    '/service/manager/customer-tags', '/service/manager/workshop',
    '/service/manager/employees', '/service/manager/ro-prefix',
    '/parts/setup/serial-tracking', '/parts/count/loss-overflow'
  )
ORDER BY p.name, c.sort_order;

-- 2) 確認 Indian brand 總 active row 數從 323 增加到 332
SELECT count(*) FROM nav_nodes WHERE brand_id='indian' AND is_active=true;
```

開 dev server `npm run dev -- -H 0.0.0.0 -p 3000` → 登入 Indian 帳號 → 逐個展開：
- 銷售接待 → 主管工作台：應看到「業績報表」「手卡參數設定」（灰底）
- 銷售接待 → 展廳接待：應看到「新車庫存（RS 視角）」（灰底）
- 售後修護 → 主管工作檯：應看到「客戶標籤主管設定」「車間管理看板」「員工人員名冊」「工單前綴碼設定」（灰底 4 個）
- 庫存管理 → 商品管理：應看到「序列號追蹤」（灰底）
- 庫存管理 → 盤點管理：應看到「報損報溢審核」（灰底）

點任何一項都會走 placeholder page。

---

## E. Rollback（萬一）

```sql
DELETE FROM nav_nodes
WHERE brand_id='indian'
  AND href IN (
    '/sales/manager/reports', '/sales/manager/card-config',
    '/sales/showroom/stock',
    '/service/manager/customer-tags', '/service/manager/workshop',
    '/service/manager/employees', '/service/manager/ro-prefix',
    '/parts/setup/serial-tracking', '/parts/count/loss-overflow'
  );
```

---

## F. 等 Ming 點頭 → Apply

**Ming 看完本文件回「Phase 1 SQL 動工」** → Claude 用 supabase MCP `apply_migration` 一次跑完 B 段 SQL → 跑 D 段驗收 query → 截圖貼 BDN 工序追蹤卡 → 勾掉對應 checkbox。

---

*Created by Claude 2026-05-15 / 對應 plan `/home/ming/.claude/plans/glistening-toasting-whisper.md`*
