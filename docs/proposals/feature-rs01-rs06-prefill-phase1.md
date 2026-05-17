# Feature: RS01 電子手卡 → RS06 中古車評估 pre-fill（BDN #15）

**狀態**：Phase 1 完成、Phase 3 自動拍板、進入 Phase 4 落地
**日期**：2026-05-16
**執行者**：sub-agent（夜跑第三輪 BDN）

---

## 1. 規格來源

- `docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS01_電子手卡_v8.html` § 「前往中古車評估鑑價 RS06」
- BDN #15：跳轉時帶 `?from_handcard={id}`、RS06 偵測到後 pre-fill 客戶姓名 + 車牌

---

## 2. 現況探查

### 2.1 RS01 handcard（`src/app/(workspace)/sales/reception/handcard/_components/handcard-form.tsx`）

- **純 client component + useState**，沒接 DB、沒 `id` 概念、沒 server action
- 蒐集欄位：身份、`customerName`、`customerPhone`、意向車款、HABC、報價、標籤、備註
- **沒有「車牌」欄位**（合理：handcard 是新客接待，車牌屬於換購客舊車屬性，RS06 RS 用行照 OCR 填）
- 「前往中古車鑑價 RS06」按鈕在 line 548–561，是個 `<button type="button">` 沒 onClick，視覺存在但無導航邏輯

### 2.2 RS06 evaluation（`src/app/(workspace)/usedcar/evaluation/page.tsx`）

- 2057 行單頁 wizard，5 tab、純 useState
- 有 `customerName`（暫缺，TAB 0 找）、`plate`（line 279）、`vin`、`mileage` 等所有評估欄位
- 已 `import { useRouter } from "next/navigation"`、可平移加 `useSearchParams`

### 2.3 Domain helper

- `src/domain/handcard-suggestions.ts`：純 TS 邏輯（HABC 推算），**沒有 `getHandcardById`**
- 沒有 `sales_handcards` 表、沒有 `@/domain/sales-handcards.ts`

---

## 3. Phase 3 自動拍板（無人決策、預設選項）

| 議題 | 選項 | 拍板理由 |
|---|---|---|
| 跳轉方式 | `router.push("/usedcar/evaluation?...")` | handcard-form 是 client component、router 已 wire 過（雖然目前 form 自己沒 import，可加） |
| from_handcard 帶啥 | **改帶 `customer_name` + `plate` query string，flag 用 `from_handcard=1`** | handcard 沒落 DB、沒 id 可帶。直接帶值最務實；未來 handcard 接 DB 後升級成 `?from_handcard={uuid}` + helper 撈 |
| pre-fill 欄位 | **只 pre-fill 姓名**（不 pre-fill 車牌） | handcard 沒蒐集車牌欄位，硬塞會帶空值蓋掉 RS06 既有預設；plate 留給 RS06 RS 自行用行照 OCR 填 |
| 沒帶 query 怎辦 | 維持原行為（空表） | useEffect early return，零副作用 |
| 跨域 helper | 暫不新建 | 沒 DB row 可撈，純 query string 端對端即可；helper 等 handcard 接 DB 後再蓋 |

### 與 BDN spec 的偏差

- BDN 寫「pre-fill 客戶姓名 + 車牌」→ 實際**只 pre-fill 姓名**，因 handcard 沒蒐集車牌欄位
- BDN 寫「`?from_handcard={id}`」→ 實際用 `?from_handcard=1&customer_name=...`，因 handcard 沒 id
- 這兩個偏差是「資料現況」造成、非設計選擇，回報給 Ming 確認

---

## 4. 落地計畫（Phase 4）

### 改動 1：handcard-form.tsx「前往 RS06」按鈕加導航

- import `useRouter`
- button 加 `onClick={() => router.push(\`/usedcar/evaluation?from_handcard=1&customer_name=${encodeURIComponent(customerName)}\`)}`
- 不擋 `customerName` 空白（即便 RS 沒填姓名也允許跳，不要 force 必填）

### 改動 2：usedcar/evaluation/page.tsx 接 query

- import `useSearchParams`、useEffect
- 偵測 `from_handcard === '1'` 且 `customer_name` 不為空 → `setCustomerName(name)`
- 只在 mount 時跑一次（用 ref guard 或 `[]` deps）、避免使用者改 URL 時又被覆蓋

**注意**：先查 evaluation page 有沒有 `customerName` state（從前面 grep 看沒有，要新增），或者塞進 TAB 0 已有的相關欄位（看狀況決定）。

### 改動 3：驗證 script

- `scripts/verify-rs01-rs06-prefill.mjs`：Playwright headless、開兩個 case、截圖
- `tmp/bdn15-empty.png`、`tmp/bdn15-prefilled.png`

---

## 5. 驗收條件

- [ ] handcard 「前往 RS06」按鈕點下去 → URL 變成 `/usedcar/evaluation?from_handcard=1&customer_name=XXX`
- [ ] RS06 載入時偵測到 query → 客戶姓名欄位帶值
- [ ] 直接打開 `/usedcar/evaluation` 無 query → 空表，不報錯
- [ ] tsc / eslint 0 errors
- [ ] audit grep `@/lib/supabase` 在 (workspace) 內 = 0 hits（本 PR 不應該動到）
