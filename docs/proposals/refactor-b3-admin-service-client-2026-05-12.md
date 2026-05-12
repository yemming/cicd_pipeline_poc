# Refactor B3 — admin 後台 service client → domain helper（12 個檔）

**Date**：2026-05-12
**Scope**：`src/app/(workspace)/admin/{notifications,navigation,org}` 全部 12 個檔
**Predecessor**：B1（client-side 3 檔）、B2（admin/master-data 8 檔）已完成、累計 41 → 30
**目標**：B3 跑完，41 → **18**

---

## 1. 拍板模式（Ming 已拍板 2026-05-12）

| Q | 方案 | 理由 |
|---|------|------|
| **Q1 權限闸** | **A1 — throw + page try/catch** | helper 沒權限就 throw、page 端 `try/catch` 出 `<AdminForbidden />` / `redirect("/login")`；read 路徑用 Result union 太囉嗦 |
| **Q2 檔案切法** | **三支 helper** | 業務子網域分明（notifications / navigation / org）；不混在 `src/domain/admin.ts` |
| **Q3 既有 repo** | **B3a — 保留 `lib/notifications/repositories/`** | helper 內部 import repo + service client；最小變動 |

### 共通 helper 簽名

```ts
// src/domain/notifications.ts（同樣 pattern 套用 navigation-admin / org-admin）
import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndNotificationAdmin } from "@/lib/notifications";

// React cache：同一 request 內只跑一次 auth check
const requireNotificationAdmin = cache(async () => {
  const ctx = await getCurrentUserAndNotificationAdmin();
  if (!ctx.userId) throw new Error("UNAUTHENTICATED");
  if (!ctx.isAdmin) throw new Error("FORBIDDEN_NOTIFICATION_ADMIN");
  return ctx;
});

export async function getNotificationDashboardData() {
  const ctx = await requireNotificationAdmin();
  const supabase = createServiceClient();
  // ... compose query ...
  return { ctx, stats7d, stats24h, recentFailed, recent };
}
```

Page 端統一處置：

```tsx
try {
  const data = await getNotificationDashboardData();
  // render
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "UNAUTHENTICATED") redirect("/login");
  if (msg.startsWith("FORBIDDEN")) return <AdminForbidden email={null} />;
  throw err;
}
```

> ⚠️ 為什麼 throw `Error("UNAUTHENTICATED")` 而不是自訂 class？POC 階段不引入 error class hierarchy；字串 sentinel + `err.message` 判斷夠用，未來要升級再說。

---

## 2. 12 個檔的 audit + 改寫對照表

| # | 檔 | Admin guard | Helper 落點 | 暴露的 helper API |
|---|---|---|---|---|
| 1 | `admin/notifications/page.tsx` | `getCurrentUserAndNotificationAdmin` | `src/domain/notifications.ts` | `getNotificationDashboardData()` |
| 2 | `admin/notifications/deliveries/page.tsx` | 同上 | 同上 | `listNotificationDeliveriesForAdmin(filters)` |
| 3 | `admin/notifications/subscriptions/page.tsx` | 同上 | 同上 | `getSubscriptionsBoardData()` |
| 4 | `admin/notifications/targets/page.tsx` | 同上 | 同上 | `getTargetsBoardData()` |
| 5 | `admin/notifications/templates/page.tsx` | 同上 | 同上 | `getTemplatesBoardData()` |
| 6 | `admin/navigation/page.tsx`（5 個 inner tab loader） | `getCurrentUserAndAdmin`（feedback-admin） | `src/domain/navigation-admin.ts` | `getNavTabData(brandKey)` / `getBrandTabData(brandKey)` / `getRolesTabData()` / `getPermissionsTabData()` / `getUserAssignmentsTabData()` |
| 7 | `admin/navigation/roles/[id]/page.tsx` | 同上 | 同上 | `getRoleDetail(id)` |
| 8 | `admin/navigation/users/[userId]/[roleId]/page.tsx` | 同上 | 同上 | `getUserAssignmentDetail(userId, roleId)` |
| 9 | `admin/navigation/users/_lib/load-scope-options.ts` | 無（被 client 呼叫） | 同上 | `loadScopeOptionsForAdmin()` |
| 10 | `admin/org/brands/page.tsx` | `getCurrentUserAndAdmin` | `src/domain/org-admin.ts` | `getBrandsBoardData()` |
| 11 | `admin/org/groups/page.tsx` | 同上 | 同上 | `getGroupsBoardData()` |
| 12 | `admin/org/stores/page.tsx` | 同上 | 同上 | `getStoresBoardData()` |

### 兩種 admin guard 並存

- **NotificationAdmin**：`getCurrentUserAndNotificationAdmin`（`NOTIFICATION_ADMIN_EMAILS` allowlist）
- **AppAdmin**：`getCurrentUserAndAdmin`（feedback-admin、`app_admins` 表）

helper 內部各自 wrap、不互相牽動。navigation-admin / org-admin 都吃同一個 `getCurrentUserAndAdmin`，但分別暴露 `requireNavAdmin()` / `requireOrgAdmin()`（複製 5 行 cache wrapper），保 helper 內聚。

### #9 `load-scope-options.ts` 特例

這支不是 page、是個 utility（被 client 端 import），目前 export `loadScopeOptions()`。改寫後：
- 把整支搬到 `src/domain/navigation-admin.ts` 內 export `loadScopeOptionsForAdmin()`
- 原檔 `_lib/load-scope-options.ts` 改成 re-export wrapper 或直接刪、callers 改 import path
- 由於 callers 是 client form（`UserAssignmentsBoard` 的「新增授權」彈窗），改 import path 即可

不加 admin guard 嗎？— 這支只回 lookup 資料（groups / brands / organizations / roles），且被 callers wrap 在已經 admin-only 的 board 內，**不**主動加 guard；保持原行為。

---

## 3. 第一個檔詳列（樣板）— `admin/notifications/page.tsx`

### Before

```tsx
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndNotificationAdmin } from "@/lib/notifications";
import { countDeliveriesByStatus, listDeliveries } from "@/lib/notifications/repositories/delivery.repo";

export default async function NotificationsDashboardPage() {
  const ctx = await getCurrentUserAndNotificationAdmin();
  if (!ctx.userId) redirect("/login");
  if (!ctx.isAdmin) return <AdminForbidden email={ctx.email} />;

  const supabase = createServiceClient();
  const now = Date.now();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const [stats7d, stats24h, recentFailed, recent] = await Promise.all([
    countDeliveriesByStatus(supabase, since7d),
    countDeliveriesByStatus(supabase, since24h),
    listDeliveries(supabase, { status: "failed", limit: 10 }),
    listDeliveries(supabase, { limit: 10 }),
  ]);

  // ... render ...
}
```

### After — `src/domain/notifications.ts`

```ts
import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndNotificationAdmin } from "@/lib/notifications";
import {
  countDeliveriesByStatus,
  listDeliveries,
} from "@/lib/notifications/repositories/delivery.repo";
import type {
  ChannelCode,
  DeliveryStatus,
  EventCode,
  NotificationDeliveryRow,
} from "@/lib/notifications";

const requireNotificationAdmin = cache(async () => {
  const ctx = await getCurrentUserAndNotificationAdmin();
  if (!ctx.userId) throw new Error("UNAUTHENTICATED");
  if (!ctx.isAdmin) throw new Error("FORBIDDEN_NOTIFICATION_ADMIN");
  return ctx;
});

export async function getNotificationDashboardData() {
  const ctx = await requireNotificationAdmin();
  const supabase = createServiceClient();
  const now = Date.now();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const [stats7d, stats24h, recentFailed, recent] = await Promise.all([
    countDeliveriesByStatus(supabase, since7d),
    countDeliveriesByStatus(supabase, since24h),
    listDeliveries(supabase, { status: "failed", limit: 10 }),
    listDeliveries(supabase, { limit: 10 }),
  ]);
  return { ctx, stats7d, stats24h, recentFailed, recent };
}

export interface DeliveryListFilters {
  eventCode?: EventCode;
  channelCode?: ChannelCode;
  status?: DeliveryStatus;
  limit?: number;
}
export async function listNotificationDeliveriesForAdmin(
  filters: DeliveryListFilters,
): Promise<NotificationDeliveryRow[]> {
  await requireNotificationAdmin();
  const supabase = createServiceClient();
  return listDeliveries(supabase, filters);
}

// ... subscriptions / targets / templates 同 pattern ...
```

### After — `admin/notifications/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { getNotificationDashboardData } from "@/domain/notifications";
// ... 其他元件 import ...

export default async function NotificationsDashboardPage() {
  let data: Awaited<ReturnType<typeof getNotificationDashboardData>>;
  try {
    data = await getNotificationDashboardData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") redirect("/login");
    if (msg.startsWith("FORBIDDEN")) return <AdminForbidden email={null} />;
    throw err;
  }
  const { stats7d, stats24h, recentFailed, recent } = data;
  // ... 完全照舊 render ...
}
```

> ⚠️ **AdminForbidden 的 email 引數**：原本 page 內可從 `ctx.email` 拿到 email 顯示在禁止頁。helper throw 出去後 email 就遺失了。權衡：
> - 拍板 A1 後，**接受 email 顯示為 null**（fallback 顯示「目前帳號不在 allowlist」即可）— 簡單
> - 或讓 helper throw 帶 email 的 Error：`throw Object.assign(new Error("FORBIDDEN_..."), { email: ctx.email })`、page 端 `(err as any).email`
>
> **建議走前者**（簡單）；email 顯示對 admin debug 不關鍵、AdminForbidden 文字改成「請聯絡管理員把你的 email 加進 `NOTIFICATION_ADMIN_EMAILS`」即可。

---

## 4. 其餘 11 檔改寫摘要（不展開 full diff、跑落地時直接套樣板）

### `notifications/deliveries/page.tsx`
- helper 新增 `listNotificationDeliveriesForAdmin(filters)`
- page 改 `try/catch await listNotificationDeliveriesForAdmin({ eventCode, channelCode, status, limit })`

### `notifications/subscriptions/page.tsx`
- helper 新增 `getSubscriptionsBoardData()` — 回所有 subscriptions list + lookup
- page 改 `try/catch await getSubscriptionsBoardData()`

### `notifications/targets/page.tsx` / `templates/page.tsx`
- 同 pattern：helper 新增 `getTargetsBoardData()` / `getTemplatesBoardData()`

### `admin/navigation/page.tsx`（5 個 inner loader）
- helper（`src/domain/navigation-admin.ts`）暴露 5 支 tab data：
  - `getNavTabData(brandKey)` → `NavNodeRow[]`
  - `getBrandTabData(brandKey)` → `{ appearance, brands, allModules, brandModules }`
  - `getRolesTabData()` → `RoleRowWithCounts[]`
  - `getPermissionsTabData()` → `{ roles, permissions, rolePermissions }`
  - `getUserAssignmentsTabData()` → `{ brands, roles, assignments, groups, stores }`（含 `sb.auth.admin.listUsers` 邊路徑）
- page 端 5 個 inner async 元件 try/catch 包外層 main 即可（或統一一個 try/catch 包 5 個 await）

### `admin/navigation/roles/[id]/page.tsx`
- helper：`getRoleDetail(id)` → `{ role, rolePerms, assignmentCount, permissions }`
- page try/catch

### `admin/navigation/users/[userId]/[roleId]/page.tsx`
- helper：`getUserAssignmentDetail(userId, roleId)` → `{ assignments, role }`
- page try/catch

### `admin/navigation/users/_lib/load-scope-options.ts`
- 整個搬到 `navigation-admin.ts` export `loadScopeOptionsForAdmin()`
- 原檔 → 改 re-export 或刪除、callers 改 import path
- **不加 admin guard**（保留原行為，被 admin-only board 包著）

### `admin/org/brands/page.tsx` / `groups/page.tsx` / `stores/page.tsx`
- helper（`src/domain/org-admin.ts`）暴露：
  - `getBrandsBoardData()` → `{ brands, groups, groupBrands, organizations }`
  - `getGroupsBoardData()` → `{ groups, organizations, groupBrands }`
  - `getStoresBoardData()` → `{ stores, brands, groups, storeBrands }`
- page 端統一 try/catch 模板

---

## 5. 落地順序

1. `src/domain/notifications.ts` — 寫完
2. 改 5 個 notifications page → tsc / eslint → grep audit notifications
3. `src/domain/navigation-admin.ts` — 寫完
4. 改 4 個 navigation page → tsc / eslint → grep audit navigation
5. `src/domain/org-admin.ts` — 寫完
6. 改 3 個 org page → tsc / eslint → grep audit org
7. **累計 audit**：

   ```bash
   grep -rln "@/lib/supabase" "src/app/(workspace)" src/components 2>/dev/null | wc -l
   # 預期：18（41 - 3 B1 - 8 B2 - 12 B3 = 18）
   ```
8. Smoke：手點 12 個 page 確認都能正常 render（dev server 3000 還在）
9. Update plan markdown：`docs/proposals/helper-debt-cleanup-plan-2026-05-12.md` B3 標 ✅
10. 不主動 commit（Ming 規矩）

---

## 6. 風險 / 雷點

- ⚠️ **navigation/page.tsx 結構複雜**：5 個 inner async 元件，try/catch 要包外層；inner 元件不要各自 try/catch 否則 throw 路徑亂
- ⚠️ **`sb.auth.admin.listUsers`** 在 `getUserAssignmentsTabData` 內，service client 才能跑（一定要在 helper 內呼叫、不可外漏）
- ⚠️ **email 顯示**：A1 拍板後 AdminForbidden 拿不到 email、文案改通用即可（見 §3 的權衡說明）
- ⚠️ **載到此 page 才被 admin block 的 UX**：page tree 的 layout / loading 不變、try/catch 在 page level 處理；不需要動 error boundary
- ✅ **不修業務邏輯 / 視覺**：純 layer 替換、其他改動走另一輪 5 階段
