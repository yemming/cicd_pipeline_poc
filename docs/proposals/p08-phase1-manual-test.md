# P-08 部門資料隔離 — 第一階段手測驗收清單

> 落地日期：2026-05-25
> 範圍：銷售（SAL）↔ 售後（SVC）兩部門私房欄位隔離 demo
> 路徑：`/crm/sales/customer-base/[id]` + `/parts/aftersales/appointments/[id]`
> Demo brand：**Indian**（依專案規範 demo 一律 Indian）

---

## 1. 我塞了什麼 demo 資料

三個 Indian 客戶都已備齊 sales + service 兩邊私房資料，可以直接秀給客戶看「同一筆客戶在兩部門眼中長什麼樣」：

| 客戶姓名 | UUID | 銷售私房（紅章） | 售後私房（藍章） |
|---|---|---|---|
| **游婉閔** | `229eeffb-b406-434e-8d73-ce4175d327cc` | credit_limit=**NT$ 800,000** + 折扣談判紀錄（已給 8% 折扣、客戶比 Scout、對手在台中） | 腰椎舊傷、花粉過敏；保養偏好原廠機油（非合成）；客訴 2 筆（輪胎噪音、油門異響） |
| **游硯閔** | `d1d083e9-fefc-4099-9e6a-3fc6007ac304` | 同上 | 同上 |
| **李美玲** | `135e98d5-376e-406d-9fa3-6e3114718437` | 同上 | 同上 |

其餘 17 筆 Indian 客戶只從原 `customers.notes` backfill 了 `sales_notes`（多半是車型 / 駕照備註），**沒有**填 `service_private` — 這正好可以 demo「空 → 點編輯填入」的工作流。

---

## 2. 兩條手測路徑

### A) 銷售視角 — 客戶基盤詳情

```
http://localhost:3000/crm/sales/customer-base/229eeffb-b406-434e-8d73-ce4175d327cc
```

頁面**底部**會多兩個區段卡（在原本的 vehicles / contacts / notes tabs 之下）：

- `▼ 銷售私房資料` + 紅章「P-08 銷售部門可見」
  - 授信額度（credit_limit）
  - 業務私人 note（sales_notes）
- `▼ 售後私房資料` + 藍章「P-08 售後部門可見」
  - 健康 / 敏感狀況（health_notes）
  - 客訴紀錄筆數
  - 售後私人 note（service_notes）

### B) 售後視角 — 預約單詳情

```
http://localhost:3000/parts/aftersales/appointments/{appointment_id}
```

底部只會多 `▼ 售後私房資料` 一個區段（**不會**出現銷售私房 — 售後接待不該看銷售折扣）。

要快速找一個對到上面三人之一的 appointment：

```sql
SELECT id, scheduled_at, customer_id
FROM appointments
WHERE customer_id IN (
  '229eeffb-b406-434e-8d73-ce4175d327cc',
  'd1d083e9-fefc-4099-9e6a-3fc6007ac304',
  '135e98d5-376e-406d-9fa3-6e3114718437'
)
ORDER BY scheduled_at DESC
LIMIT 5;
```

---

## 3. 對拍邏輯 — 不同帳號看到不一樣

| 帳號 email | 部門 | role | 進銷售客戶詳情 (A) | 進售後預約 (B) |
|---|---|---|---|---|
| `yemming.yu@gmail.com`（你自己） | SVC | **app_admin** | 看到兩個區段（紅 + 藍） | 看到藍章 |
| `wu.sal@indian.demo` 吳思妤 | SAL | sales_consultant | **只**看到紅章 | **看不到**藍章 |
| `chang.sal@indian.demo` 張承翰 | SAL | rs_manager | 只看到紅章 | 看不到藍章 |
| `lin.sal@indian.demo` 林佳蓉 | SAL | sales_consultant | 只看到紅章 | 看不到藍章 |
| `huang.sal@indian.demo` 黃柏勳 | SAL | sales_consultant | 只看到紅章 | 看不到藍章 |
| `jasonwang@indian.tw` 王志強 | SVC | workshop_manager | **只**看到藍章 | 看到藍章 |
| `sufenhuang@indian.tw` 黃淑芬 | PRT | parts_manager | **兩個都看不到** | 看不到 |

> **核心 demo 點**：同一個客戶 detail page，不同帳號開出來看到的「私房欄位」不同 — 這就是 P-08「水平橋接、垂直隔離」的真技術落地。話術上可以講「我們的系統把銷售折扣資訊和售後客訴資料做物理隔離，僅在登入身分對應的部門範圍內可見」。

---

## 4. 手測 Checklist

### 4.1 讀（用 Ming 帳號）

- [ ] 開 `/crm/sales/customer-base/229eeffb-b406-434e-8d73-ce4175d327cc` → 紅章 + 藍章區段都顯示
- [ ] 銷售私房內容包含「8% 折扣 / 比 Scout / 對手台中」字樣
- [ ] 售後私房內容包含「腰椎舊傷」+「客訴紀錄 2 筆」
- [ ] 切到對應 appointment detail page → **只**顯示藍章區段（紅章不應出現）

### 4.2 寫（在游婉閔 detail page，仍用 Ming 帳號）

**銷售私房編輯流程**：
- [ ] 點銷售私房區段標題列「編輯」按鈕
- [ ] header 的按鈕變成兩顆：「儲存變更」(綠) + 「取消」(白)
- [ ] credit_limit 改為 `900000`
- [ ] 點「儲存變更」→ 按鈕文字變「儲存中⋯」、整區半透明 + disabled
- [ ] 儲存成功後 → 右下角綠色 banner「✓ 已儲存銷售私房欄位」、2.2 秒自動消失
- [ ] reload 頁面 → 金額仍顯示 `NT$ 900,000`（DB 真的寫進去）

**售後私房編輯流程**：
- [ ] 同樣的編輯 → 儲存 → banner → reload 流程，但 banner 文字是「✓ 已儲存售後私房欄位」

**錯誤情境**：
- [ ] credit_limit 輸入「abc」非數字 → 紅色 banner「授信額度必須為數字」、不消失（要使用者讀完才動）

### 4.3 對拍（如果有其他 persona 帳號密碼能登入）

- [ ] 登出 Ming、用 `wu.sal@indian.demo` 登入
- [ ] 開游婉閔 detail → **看不到**藍章（service_private）區段
- [ ] 紅章區段內容應該還是看得到（吳思妤是 SAL 部門）

- [ ] 登出、改用 `jasonwang@indian.tw` 登入
- [ ] 開游婉閔 detail → **看不到**紅章（sales_private）區段
- [ ] 只看得到藍章

- [ ] 登出、用 `sufenhuang@indian.tw`（PRT 零配件部）登入
- [ ] 開游婉閔 detail → **兩個區段都不應該出現**（PRT 既非 SAL 也非 SVC）

### 4.4 跨部門 admin 視角

- [ ] 用 Ming 帳號（已掛 `app_admins`，跨部門全有）
- [ ] 同一頁同時看到紅章 + 藍章
- [ ] 兩邊都能點編輯、都能存

---

## 5. 還沒做的事（客戶問你可以這樣回）

| 客戶可能問 | 你的答 |
|---|---|
| 「跨部門誰看了哪一筆有記錄嗎？」 | 第二階段做 audit log（`customer_access_audit` 表），這版先把**隔離本身**蓋起來，這是技術門檻最高、收益最大的一段。 |
| 「業務想看售後客訴可以申請嗎？」 | 第三階段做跨部門「申請查看」工作流；目前以 app admin（店長 / 老闆 / CEO 自動全有）作為跨部門協調人。 |
| 「個人標籤的可見性怎麼測？」 | DB 已支援三級（`owner_only` / `department` / `cross_department`），RLS policy 也都掛好了，UI 還沒給切換選項；下階段 `/sales/settings/customer-tags` 升級時加。 |
| 「為什麼路徑是 `/crm/sales/customer-base` 不是 `/sales/customers`？」 | `/sales/customers` 還是 Stitch 設計稿嵌入頁，這次 demo 直接走真實 React 頁面；下階段把 Stitch 入口也升上來。 |
| 「跟一般 CRM 的權限有什麼差別？」 | 一般 CRM 只做 brand-level / store-level RLS（看得到 vs 看不到整筆）。P-08 是**同一筆客戶**底下做欄位級隔離 + 跨部門匿名 tag bridging — 這是中大型集團 SI 才會做的設計，不是 SaaS 套件級別。 |

---

## 6. 開 dev server

```bash
npm run dev -- -H 0.0.0.0 -p 3000
```

直接開：
```
http://localhost:3000/crm/sales/customer-base/229eeffb-b406-434e-8d73-ce4175d327cc
```

---

## 7. 技術側欄（給 IT 主管問細節時的小抄）

**Schema 層**：
- `customers.assigned_rs_user_id` (uuid, FK → auth.users)
- `customer_sales_private(customer_id PK, brand_id, credit_limit, sales_notes, discount_history jsonb, ...)`
- `customer_service_private(customer_id PK, brand_id, health_notes, complaint_history jsonb, service_notes, ...)`
- `customer_personal_tags.visibility` ∈ `owner_only / department / cross_department`

**RLS 層**（混合策略）：
- Private 表 RLS 只擋 `brand_id`（用既有 `user_has_brand()`）
- 部門隔離走 application-layer：`src/lib/rbac/department.ts` 的 `canViewSalesPrivate()` / `canViewServicePrivate()`
- Tag visibility 是純 RLS（personal_tag 的 owner_id 是 auth.uid()，可直接判）
- 未來員工帳號齊備（補完 `employees.user_id`）→ 可平滑升級到全 RLS

**Permission**：
- `customer.sales_private.view / edit`
- `customer.service_private.view / edit`
- DB-driven via `role_permissions` 表，22 條 seed 已掛勾

**Domain helper（單一入口紀律）**：
- 讀：`@/domain/customer-private` (`getSalesPrivate` / `getServicePrivate` / 批次版)
- 寫：`@/lib/customer-private/actions` (`upsertSalesPrivateAction` / `upsertServicePrivateAction` / `assign*OwnerAction`)
- UI 一律 import 這兩支、不直連 supabase
