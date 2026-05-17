# RS01 電子手卡 — CRM01A 同步回寫 Phase 1

> BDN #16 · 2026-05-16 · spec ref: `docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS01_電子手卡_v8.html` § 「⇅ CRM01A 同步設定」

## 現況

- `src/app/(workspace)/sales/reception/handcard/_components/handcard-form.tsx` 是 client-only `useState` 表單，**沒接 DB**（BDN #15 已確認）
- 底部有「儲存後此卡將自動同步至客戶 360 視圖…」的 CRM 同步 banner，但兩顆「儲存並送出」按鈕 onClick 都沒實作
- 客戶主檔 `public.customers` 已有 `metadata jsonb` 欄位，可承接 `last_handcard_snapshot`
- `src/domain/customers.ts` 是 `server-only`，沒有 client-callable 的 upsert 接口
- 既有 server-action pattern：`src/domain/adjustments.ts` 那種 `"use server"` 檔 + `Result<T>` 回傳

## 目標

讓 handcard 表單 onSave 後（demo 階段是兩顆「儲存並送出」按鈕的點擊）：

1. 把 handcard 重點欄位序列化成 `handcardSnapshot`
2. 試著寫進對應 customer row 的 `metadata.last_handcard_snapshot`
3. 成功 → toast「✓ 已同步至 CRM 360」
4. customer 找不到（demo 模式，沒對應 row）→ toast「✓ 已同步（demo mode）」、不報錯
5. DB / 表結構出問題 → toast warning「⚠️ CRM 同步失敗（demo 階段）」、**不擋 onSave 流程**

## 架構選擇

### Helper 拆兩層（server action 必須走 "use server" 檔）

| 檔案 | 角色 |
|------|------|
| `src/domain/crm-sync.ts`（新建，`"use server"`） | server action 端：實際寫 DB、用 `getActiveScope()` 拿 brand_id、查 customers by name/phone、upsert metadata |
| handcard-form.tsx onSave 流程 | client 端：await `upsertCustomer360()`、依 Result 切 toast |

API（client 看到的契約）：

```ts
export type HandcardSnapshot = {
  at: string;                       // ISO timestamp
  identity?: string;                // new/revisit/owner/switcher
  customer_name?: string;
  customer_phone?: string;
  lead_source?: string;
  intent_model?: string;
  intent_year?: string;
  intent_color?: string;
  buy_timing?: string;
  habc_grade?: string;
  intent_level?: number;
  quote_status?: string;
  quote_amount?: string;
  follow_date?: string;
  follow_method?: string;
  tags?: string[];
  visit_note?: string;
  visit_result?: string;
};

export type CrmSyncResult =
  | { ok: true; mode: 'db'; customer_id: string }
  | { ok: true; mode: 'demo'; reason: string }
  | { ok: false; error: string };

export async function upsertCustomer360(
  snapshot: HandcardSnapshot,
): Promise<CrmSyncResult>;
```

### 查找 customer 的策略

handcard 沒有 customer_id 欄位（client-only 表單沒選過 customer）。所以查找走 fallback chain：

1. 有 `customer_phone` → `WHERE brand_id=<scope> AND phone=<normalized>` 取第一筆
2. 沒 phone 但有 `customer_name` → `WHERE brand_id=<scope> AND name=<trim>` 取第一筆（demo 階段 OK）
3. 都沒有或查無 → 回 `{ ok: true, mode: 'demo', reason: 'no matching customer' }`（不報錯）

寫入：`UPDATE customers SET metadata = jsonb_set(coalesce(metadata,'{}'::jsonb), '{last_handcard_snapshot}', <snapshot>::jsonb), updated_at=now() WHERE id=<id>`

### 同步點

兩顆「儲存並送出」按鈕（header line 245 + sticky footer line 866）：

- 加 `useTransition` `isPending` → 兩顆都鎖、文字換「同步中⋯」
- 統一走一個 `handleSubmit` async fn → build snapshot → call sync → setBanner → router 不動（demo 階段不跳轉）

### Toast UI

用 BDN 系列已成熟的 fixed bottom-right banner pattern（feedback-actions 那種）。state：

```ts
const [banner, setBanner] = useState<
  | null
  | { kind: 'ok' | 'demo' | 'warn'; msg: string }
>(null);
```

- `ok` → 綠底 2.2s 自動關
- `demo` → 藍底 2.2s 自動關（區別「真的寫進去」跟「demo 模式」）
- `warn` → amber 底，需點 × 才關（不擋使用者繼續操作）

## 不做

- ❌ 不開新欄位（只用 metadata jsonb）
- ❌ 不動 customers schema
- ❌ 不做反向同步（CRM 改 → handcard 拉）
- ❌ 不做真正的 handcard insert（那是 BDN 另一張要做的事，本任務只 sync side effect）
- ❌ 不擋 onSave 流程（sync 是 side effect，即使失敗也讓使用者覺得「儲存了」）
- ❌ 不 commit

## 驗證

1. `npx tsc --noEmit` → 0
2. `npx eslint src/domain/crm-sync.ts "src/app/(workspace)/sales/reception/handcard/**"` → 0
3. audit: `grep -rn "@/lib/supabase" "src/app/(workspace)/sales/reception/handcard"` → 0
4. Playwright headless：登入 → /sales/reception/handcard → 填客戶姓名「測試客戶」+ phone 隨機 → 按「儲存並送出」→ 截圖 toast → 因為查不到對應 customer，預期 demo mode toast
5. （bonus）插一筆 indian brand 的 fake customer name=`測試客戶 XXX` → 再跑一次 → 預期 db mode toast → SELECT metadata->'last_handcard_snapshot' 確認寫進去 → 清掉測試 row

## 自動拍板（無需 Ming 確認）

- customer 表 = `customers`（5 張表裡只有這張是主檔；其他都是 contact/tag/vehicle 衍生）
- snapshot key = `metadata.last_handcard_snapshot`
- 失敗 UX = toast warning，不擋流程
- 查找策略 = phone first → name fallback → demo mode
