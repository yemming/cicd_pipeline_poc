# Schema Proposal — 集團 Phase 2 · G3（GRP20 安全基礎）+ G4（GRP14→04B 定價同步）

**日期：2026-06-01　｜　狀態：⏳ 等 Ming 簽核（簽核前不跑任何 DDL）**
**前置：`group-inspection-report.md` §四之二 ground-truth 修正；Ming 拍板「G3+G4 先行」**

> 規則遵循：§5 安全邊界（動 schema 先確認）+ COA 規則（先 proposal 後 DDL）。
> 本文不含「直接執行」意圖；請逐項 review，回「G3 Go / G4 Go / 全 Go / 要改」。

---

## G4 先講（風險低、加法型、跨模組共用）

### 背景
- GRP14 定價在 repo 已是真 CRUD（`business_rules.rule_kind='pricing_policy'`），但**核准後沒有任何下游動作**。
- 設計稿要求：定價核准 → 同步 07B 服務套餐 → 04B 快速報價即時顯示新價（原子性 transaction）。
- repo 目前**無** `service_packages` / `labor_rates`（只有 sales-quote，非售後套餐）。售後模組 04B/07B 之後也要用 → **這兩張表是售後+集團共用基礎**。

### 新增表 1：`service_packages`（服務套餐主檔，售後 07B + 04B + 集團定價共用）
```sql
CREATE TABLE service_packages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      text NOT NULL,                 -- RLS 用（沿用 user_has_brand）
  code          text NOT NULL,                 -- 套餐碼，brand 內唯一
  name          text NOT NULL,
  pkg_type      text NOT NULL DEFAULT 'standard', -- standard|store_custom|promo
  mileage_interval int,                        -- 6000/10000/20000，原廠標準套餐用
  items         jsonb NOT NULL DEFAULT '[]'::jsonb, -- 工項+零件清單[{kind,sku,name,qty,lu,price}]
  list_price    numeric,                       -- 建議售價（定價核准後同步進來）
  valid_from    date,
  valid_to      date,                          -- 限時促銷套餐到期自動失效
  is_active     boolean NOT NULL DEFAULT true,
  pricing_policy_id uuid,                       -- 連回核准的 pricing business_rule（同步來源）
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_service_packages_brand_code ON service_packages(brand_id, code);
ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;
-- 沿用既有品牌隔離（與全庫 197 表一致）
CREATE POLICY sp_brand_all ON service_packages USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
```

### 新增表 2：`labor_rates`（工時費率，DUCATI/Indian 各自一套）
```sql
CREATE TABLE labor_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    text NOT NULL,
  biz_type    text NOT NULL,        -- MN|RP|WC|AC|PD|Desmo
  rate_per_lu numeric NOT NULL,     -- NT$/LU
  is_active   boolean NOT NULL DEFAULT true,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);
CREATE UNIQUE INDEX uq_labor_rates_brand_biz ON labor_rates(brand_id, biz_type);
ALTER TABLE labor_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY lr_brand_all ON labor_rates USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
```

### 同步邏輯（domain helper，不寫 raw 在 UI）
- `approvePricingPolicyAction`（既有）核准成功後，於同一 server action 內串：
  1. update `business_rules`(pricing_policy).config.status='active'
  2. upsert 對應 `service_packages.list_price`（依 policy 影響的 code）
  3. 寫 audit（先存 pricing_policy.config.audit_log[]，與既有一致；不另開表）
- 04B 報價頁讀 `service_packages`（is_active + valid 範圍內）→ 自然拿到新價。
- 原子性：用單一 Supabase RPC 或 server action 內順序寫 + 失敗回滾（POC 階段以 helper 包裹，不強制 DB transaction，於 helper 註明 TODO）。

### G4 風險
- 低。純加法、沿用 brand RLS。唯一注意：定價 code ↔ 套餐 code 對映規則需與你確認（一個 pricing policy 對應哪些套餐）。

**G4 開放問題**：定價 policy 與 service_package 的對映粒度？（一對一 code / 一對多 / 用 metadata 標記）→ 請示意，我預設「pricing_policy.config 帶 target_package_codes[]」。

---

## G3（GRP20 安全基礎）— 風險高，分階段，先試點不全改

### 現況（已查證）
- 全庫 **197 張表開 RLS，policy 一律 `user_has_brand(brand_id)`** → 只隔離到品牌，**同品牌看光所有門店資料**。
- RBAC 已備好 scope 模型：`user_assignments(scope_type group|brand|store, scope_id)` + `policies.ts` 註解明示「最終 cutover 換 scope-aware」。
- 缺 `system_settings`（org_mode 3/4 無處存）。

### 部分 A：`system_settings` + org_mode（低風險，先做）
```sql
CREATE TABLE system_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES groups(id),
  org_mode    smallint NOT NULL DEFAULT 3 CHECK (org_mode IN (3,4)), -- 3=海德生三層 4=碩文四層
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);
CREATE UNIQUE INDEX uq_system_settings_group ON system_settings(group_id);
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
-- group 設定：admin 可寫，同 group 成員可讀
CREATE POLICY ss_read ON system_settings FOR SELECT USING (true);
CREATE POLICY ss_write ON system_settings FOR ALL USING (is_app_admin()) WITH CHECK (is_app_admin());
```
- GRP20 頁加 org_mode 選擇器 + 紅色「上線前必須」橫幅；寫入走新 `@/domain/org-settings.ts`。
- saveNode：現有 org-structure 是唯讀樹 + 深連結到 `/admin/org` 編輯（既有寫入路徑），**不另造 POST /api/org-nodes**，只補 org_mode 設定。

### 部分 B：組織層級 RLS cutover（高風險 → 分階段試點）

**不一次改 197 表。** 設計 scope-aware SQL helper，先套**少數明確 store-scoped 的表**驗證，再逐步擴。

```sql
-- 新 SQL 函式：使用者能否看到某 org（門店）的資料
CREATE OR REPLACE FUNCTION user_can_access_org(target_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    is_app_admin()                                              -- admin 全看
    OR EXISTS (                                                  -- group/brand scope → 該範圍全看
      SELECT 1 FROM user_assignments ua
      WHERE ua.user_id = auth.uid()
        AND (ua.expires_at IS NULL OR ua.expires_at > now())
        AND ua.scope_type IN ('group','brand'))
    OR EXISTS (                                                  -- store scope → 只看自己被指派的門店
      SELECT 1 FROM user_assignments ua
      WHERE ua.user_id = auth.uid()
        AND ua.scope_type='store' AND ua.scope_id = target_org
        AND (ua.expires_at IS NULL OR ua.expires_at > now()));
$$;
```

**試點順序（每階段你驗收後才下一步）**：
1. **試點表**：`repair_orders`、`sales_orders`、`kpi_snapshots`（都有 org_id/store_id）。
   新增 policy `... AND user_can_access_org(org_id)`（疊加在 user_has_brand 之上，先用 RESTRICTIVE 或替換 PERMISSIVE，待你定）。
2. 用 8 個 e2e persona（sa/店長/集團）驗證隔離正確（SA 只看自店、集團看全部、不破既有功能）。
3. 驗證 OK → 再列「下一批 store-scoped 表」清單給你 → 逐批擴。
4. 無 org_id 的共享表（如品牌主檔）**不套門店隔離**，維持 brand 層。

### G3 風險與護欄
- ⚠️ RLS 改錯 = 全站資料看不到或看太多。故**分階段 + e2e persona 驗證 + 每批簽核**。
- `auth.uid()` vs 既有 `user_has_brand` 的 session 取得方式需先在 1 張表 POC 確認可行再擴。
- 不在本提案一次交付 197 表；本提案只請你核准「部分 A（system_settings）即做 + 部分 B 的試點 3 表 POC」。

### G3 開放問題
1. org_mode 由誰能改？預設 app_admin（你的 yemming 帳號）。
2. 「店長只看本店、集團主管看全部但**不能編輯**門店層操作頁」中的「不能編輯」要做到 RLS（寫入擋）還是 RBAC permission 層即可？建議 RBAC 層（已有 permission 機制），RLS 只管「看得到哪些列」。
3. 試點 3 表的隔離要 PERMISSIVE 取代舊 policy，還是 RESTRICTIVE 疊加？建議疊加 RESTRICTIVE（較安全、舊功能不破）。

---

## 簽核請求

| 包 | 我要做的第一步 | 等你回 |
|---|---|---|
| **G4** | 建 `service_packages`+`labor_rates` + 定價核准同步 helper | G4 Go？對映粒度用 target_package_codes[]？ |
| **G3-A** | 建 `system_settings` + GRP20 org_mode 選擇器 + 橫幅 | G3-A Go？ |
| **G3-B** | scope-aware 函式 + 試點 3 表 RLS POC（含 persona 驗證）| G3-B 試點 Go？疊加 RESTRICTIVE？ |

> 回「全 Go」我就依 G4 → G3-A → G3-B 順序動工（G3-B 每批 RLS 擴張仍會再回報）。
