# Refactor B5 — 跨模組收尾 9 個檔

**Date**：2026-05-12
**Scope**：einvoice 5 + feedback/tickets 2 + me/profile + n/[nodeId]（共 9 個 page）
**Predecessor**：B1-B4 完成、累計 41 → 9
**目標**：B5 跑完、9 → **0**（最後一場）

---

## 1. Audit + 落點對照表

| # | 檔 | 撈表 | Helper 落點 |
|---|---|---|---|
| 1 | `einvoice/page.tsx` | einvoices | **新建** `src/domain/einvoice.ts` |
| 2 | `einvoice/[id]/page.tsx` | einvoices + einvoice_allowances + einvoice_voids | 同上 |
| 3 | `einvoice/allowances/page.tsx` | einvoice_allowances + einvoices (join) | 同上 |
| 4 | `einvoice/number-pools/page.tsx` | einvoice_number_pools | 同上 |
| 5 | `einvoice/voids/page.tsx` | einvoice_voids + einvoices (join) | 同上 |
| 6 | `feedback/tickets/page.tsx` | feedback_tickets + profiles | **新建** `src/domain/feedback-tickets.ts` |
| 7 | `feedback/tickets/[id]/page.tsx` | feedback_tickets + canvas_snapshots + comments + profiles + attachments + storage signed URLs | 同上 |
| 8 | `me/profile/page.tsx` | profiles | **append** `src/domain/users.ts` |
| 9 | `n/[nodeId]/page.tsx` | nav_nodes（service client）+ storage download | **新建** `src/domain/navigation.ts` |

### 新建 3 支 helper、append 1 支既有

| Helper | 性質 | API |
|---|---|---|
| `src/domain/einvoice.ts` | createClient + RLS（同 B2 / B4 模式） | `getEinvoicesListPageData(filter)` / `getEinvoiceDetailPageData(id)` / `getEinvoiceAllowancesPageData(filter)` / `getEinvoiceNumberPoolsPageData()` / `getEinvoiceVoidsPageData(filter)` |
| `src/domain/feedback-tickets.ts` | createClient + RLS | `getFeedbackTicketsListPageData()` / `getFeedbackTicketDetailPageData(id)` |
| `src/domain/users.ts`（append） | createClient + RLS | `getMyProfilePageData(userId)` |
| `src/domain/navigation.ts` | **service client**（bypass RLS、user-facing nav resolver） | `resolveNavNode(nodeId, brandKey)` / `downloadNavHtml(storagePath)` |

`feedback-canvas.ts` 既有、跟 `feedback-tickets.ts` 並列（兩個分別管 canvas / ticket）— 不合併、保持單一職責。

---

## 2. 設計決定（不需要拍板的選擇）

### 2.1 為什麼 navigation 不 append `navigation-admin.ts`？

`navigation-admin.ts` 是 admin only（throw sentinel + admin guard）；`n/[nodeId]` 是 **user-facing nav resolver**（任何登入使用者都可用）。語意衝突 — 各自一支 helper 對稱（一個給 user / 一個給 admin）。

### 2.2 `n/[nodeId]` 用 service client 但不加 admin guard

舊 page 本來就沒任何 admin guard、用 service client 是為了 bypass RLS（nav_nodes 不需 RLS 保護、一般使用者可看自己 brand 的 nav）。helper 沿用此行為、不加 guard。

### 2.3 attachment signed URLs 整段搬進 helper

feedback ticket detail 內含 `supabase.storage.from(...).createSignedUrls(...)`（一小時 TTL）。helper 撈完 attachments 後 inline 產 signed URL、回傳給 page 已包含 `signed_url` 的 attachments — page 完全看不到 storage API。

---

## 3. 落地順序

1. 新建 `src/domain/einvoice.ts`（5 API）→ 改 5 個 einvoice page → tsc/eslint
2. 新建 `src/domain/feedback-tickets.ts`（2 API）→ 改 2 個 feedback page → tsc/eslint
3. append `src/domain/users.ts`（1 API）→ 改 me/profile → tsc/eslint
4. 新建 `src/domain/navigation.ts`（2 API）→ 改 n/[nodeId] → tsc/eslint
5. **最終 audit**：

   ```bash
   grep -rln "@/lib/supabase" "src/app/(workspace)" src/components 2>/dev/null | wc -l
   # 預期：0
   ```

6. Update plan markdown + HANDOFF + 加 commit-time audit 提醒到 CLAUDE.md
7. 不主動 commit（Ming 規矩）

---

## 4. 風險 / 雷點

- ⚠️ **feedback ticket detail 最複雜**：6 條 query + storage signed URLs + 三組 ID map join。整段搬進 helper、不重構
- ⚠️ **einvoice 都用 supabase relation join**（如 `einvoice:einvoices(ecpay_invoice_no)`）— type assert pattern 保留
- ⚠️ **type 從 `_components/*.tsx` import**（B2/B4 心得）— page 沒問題、保持單一事實來源
- ⚠️ **n/[nodeId] storage download** 走 service client 的 `supabase.storage.from(...).download()`，回傳 Blob、需 `.text()` 轉字串
- ✅ **不修業務邏輯 / 視覺**：純 layer 替換

---

## 5. Bonus（HANDOFF 提到的「同場順手做」— 本 batch 不做）

`lib/master-data/queries.ts` 的 `getSupplierPricingById` / `getWorkOrderById` 等整併進 `@/domain/*` — 第一輪先把 9 個檔搞掉、達到 audit=0 的核心目標。整併是 bonus / 不在本 batch 範圍。
