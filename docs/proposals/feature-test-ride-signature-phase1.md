# Feature Proposal — 試乘電子簽名（客戶簽試乘同意條款）

> spec-to-feature **Phase 1（結構分析）+ Phase 2（架構提案）**。本文只提案、不改 code、不跑 migration。
> 任務代號：**G3**（第十二輪）。背景：第十一輪 E2E 發現 test-rides 模組缺「客戶電子簽名」；第十二輪 G1 已把 `/sales/reception/test-rides` 接上 DB-backed board（`sales_test_drives` 表）。本案規劃簽名功能。

---

## 一、現況分析（既有元件 / 表 / flow，精確路徑）

### 1. 簽名 canvas 元件（已存在，可直接 reuse）

- **`src/components/signature-canvas.tsx`** — client component `<SignatureCanvas onSigned={(dataUrl) => ...} />`
  - 滑鼠 + 觸控雙支援（`onMouseDown/Move/Up` + `onTouchStart/Move/End`）。
  - 內部 `<canvas width={640} height={240}>`，畫筆 `#1a1a1a` / lineWidth 2.2 / round cap。
  - 自帶「清除重簽」「確認簽名」兩顆按鈕；按確認時呼叫 `onSigned(canvas.toDataURL("image/png"))`。
  - **API 就一個 prop：`onSigned: (dataUrl: string) => void`**。沒有 disabled / pending prop，外層要鎖 UI 得在父層包一個 `pointer-events-none opacity-60` 容器。
  - **產出**：`image/png` 的 base64 dataURL（`data:image/png;base64,...`），640×240 黑線白底，實測約 **5–30 KB**（簽名筆畫稀疏，多半落在 8–15 KB）。

### 2. 試乘表 schema（已用 supabase information_schema 校對）

`public.sales_test_drives`：

| column | type | null |
|---|---|---|
| id | uuid (PK) | NO |
| brand_id | text | NO |
| customer_id / vehicle_model_id / lead_id / sales_consultant_id / handcard_id | uuid | YES |
| scheduled_at | timestamptz | NO |
| completed_at | timestamptz | YES |
| status | text（`'scheduled'` default） | NO |
| notes | text | YES |
| **metadata** | **jsonb（`'{}'` default）** | NO |
| created_by | uuid | YES |
| created_at / updated_at | timestamptz | NO |

→ **已有 `metadata jsonb`**，符合架構天條三件套的 JSONB metadata 慣例。`completeTestDrive()` 已往 metadata 寫 `rating / feedback / mileage_before / mileage_after / route_taken`。

### 3. 既有 flow（狀態機 + UI 整合點）

狀態機：`scheduled → in_progress → completed`（另有 `cancelled / no_show`）。

- **List board**：`src/app/(workspace)/sales/reception/test-rides/_components/test-rides-board.tsx`
  - 列尾：status=`scheduled` 時有「開始試駕」按鈕 → `changeStatus(r, "in_progress")`（呼叫 `setTestDriveStatusAction`）。
  - status=`in_progress` 時列尾連結 `→ {id}?complete=1`（跳 detail view 觸發完成 modal）。
- **Detail view**：`src/app/(workspace)/sales/reception/test-rides/_components/test-ride-detail-view.tsx`
  - `Mode = "view" | "edit" | "complete"`。
  - view mode CRUD pill：`scheduled` 顯示「開始試駕」(`changeStatus("in_progress")`)；`in_progress` 顯示「完成試駕」(切 `mode="complete"`)。
  - `?complete=1` deep-link 自動進 complete mode（`useEffect` + 初始 state）。
  - complete mode 是一段 inline `<section>`（不是獨立 modal），填 rating / 里程 / 路線 / 回饋 → `submitComplete()` → `completeTestDriveAction` → 成功跳「黃金時刻」modal。
- **Domain helper**：`src/domain/sales-test-drives.ts`（`completeTestDrive()`、`updateTestDrive()`、`setTestDriveStatus`…；UI 不直連 supabase，全走此 helper ✅ 合天條）。
- **Server actions**：`src/lib/sales/test-drives-actions.ts`（`Result<T>` pattern、`gate()` 用 `PERMISSIONS.CUSTOMER_EDIT`、revalidatePath）。
- **Client-safe types**：`src/domain/sales-test-drives.constants.ts`（`CompleteTestDriveInput` 等型別在此，client 從這裡 import）。

### 4. 簽名儲存的既有 precedent（重要發現）

- `<SignatureCanvas>` 在多處被 import（delivery / final-inspections / ro-checkout / ro-handoff…），**但這些 sign-off flow 實際存 DB 的是 `signature_text`（手打姓名字串），不是 canvas 畫出來的 dataURL 圖**。
- 換言之：**canvas 影像 dataURL 目前全站沒有任何「存進 DB」的先例**，本案是第一個落地此 pattern 者 → 需自己定調存法（決策 1/2）。
- 既有 storage 上傳基建：`src/lib/image-upload/actions.ts` 的 `uploadEntityImageAction(entity, entityId, FormData)` + `src/lib/image-upload/config.ts` 的 `ENTITY_CONFIGS`（bucket / column / permission / maxBytes）。**但它吃 `File` 物件 + 預設 column，不吃 dataURL string、也沒有「寫進 jsonb 子鍵」模式** → 走 storage 需要小幅改造或繞道。

---

## 二、架構提案（6 決策，每個含推薦）

### 決策 1 — 簽名存哪

| 選項 | 說明 | 評估 |
|---|---|---|
| **A** | `sales_test_drives.metadata.signature`（jsonb 子物件） | 純顯示、單頁專用、不進報表、5–30KB、單筆一次簽 → **完全命中 JSONB metadata 慣例**；零 migration |
| B | 新增 typed column `signature_url text` | 只有「會被 RLS / FK / 報表 / index 用」才升 typed。簽名不會被報表查、不 join、不 index → 過度設計 |
| C | 新表 `test_drive_signatures` | 只有「一張試乘多次簽名 / 需簽名審計鏈」才需要。本案語意是「客戶簽一次同意條款」單筆單簽 → 殺雞用牛刀，多一張表 + RLS + FK |

**推薦：A（存 `metadata.signature`）。** 理由：簽名是單頁專用純顯示資料、單筆只簽一次、不進報表不被 query，正中架構天條「形狀還在變 / 單頁專用 / 純顯示 → metadata jsonb」。零 migration、零 RLS 改動，最符合 POC「簡單為先」。未來真有「審計多簽」需求再 promote。
建議的 metadata 子結構：
```jsonc
metadata.signature = {
  data_url: "data:image/png;base64,...",   // 決策2 選 inline 時放這
  // storage_url: "https://.../sig.png",   // 決策2 選 storage 時改放這
  signed_at: "2026-05-25T10:30:00.000Z",   // UTC（顯示時轉 Asia/Taipei）
  consent_version: "test-drive-v1",         // 同意條款版本（未來條款改版可辨識）
  signer_name: "陳先生"                      // 可選：冗餘存客戶名，免 join 即可顯示
}
```

### 決策 2 — inline base64 in jsonb vs 上傳 Supabase Storage

| 選項 | 評估 |
|---|---|
| **inline base64 dataURL 直接塞 jsonb** | 5–30KB / row，量級小到可忽略（一筆試乘 row 本來就幾百 bytes，加 15KB 影響微乎其微，且試乘量級不大）。零基建、零 bucket 設定、零 RLS storage policy、讀取免額外 round-trip（隨 row 一起回來）。**最簡單** |
| 上傳 storage bucket 存 URL | row 不肥，但要：建 bucket、設 storage RLS、把 dataURL 轉 File/Blob 上傳、改造 `image-upload` 基建（它吃 File 不吃 dataURL）。多 ~1 個 round-trip + 多一層失敗點 |

**推薦：inline base64 in jsonb。** 理由：POC 階段簡單為先；簽名圖 5–30KB 對 jsonb row 是可忽略的肥。Postgres jsonb 上限 ~1GB、單欄即使存幾十 KB 也毫無壓力。等真有「簽名要對外發 URL / 嵌進 PDF 走 server chromium fetch / 量大到要 CDN」的需求，再做一支 helper 把 metadata.data_url 搬 storage、UI 不動（domain helper 抽象的好處）。
⚠️ 注意：`getTestDriveStats()` 撈 metadata 算 KPI、`listTestDrives()` 的 SELECT 也含 metadata → **每列都會帶回簽名 base64**。15KB × 50 列 = 750KB payload，列表頁可接受但非最佳。**建議在 `listTestDrives` / `getTestDriveStats` 的 SELECT 排除 / 不依賴 signature**（list 不需要顯示簽名圖，只 detail 需要）。若要保險可把簽名放 `metadata.signature` 子物件、list 端用 row 時忽略它即可（不需改 SELECT，前端不渲染就好；payload 體感可接受）。落地時看一眼 payload 大小再決定要不要精修 SELECT。

### 決策 3 — 簽名時機（開始前 / 完成時 / 兩者）

spec 語意是「簽**試乘同意條款**」——同意條款的本質是「出車前確認免責 / 規則」，業界（含汽車試駕）慣例都是**出車前簽**。

| 選項 | 評估 |
|---|---|
| **出車前簽（`scheduled → in_progress` 之間）** | 對齊「同意條款」語意（沒簽不出車）。卡在「開始試駕」這個既有 transition 上，flow 自然 |
| 完成時簽（complete modal 內） | 語意錯位：車都騎完了才簽免責沒意義。且 complete mode 已塞滿 rating/里程/回饋，再加簽名太擠 |
| 兩者 | 過度設計；同意條款簽一次即可，完成時不需再簽 |

**推薦：出車前簽（綁在「開始試駕」transition）。** 點「開始試駕」→ 先彈簽名同意 modal → 客戶簽完確認 → 才把 status 切 `in_progress` 並把簽名寫進 metadata。沒簽 / 取消 → 不切狀態、不出車。

### 決策 4 — UI 整合點（塞哪個 flow，對齊既有結構不重起爐灶）

「開始試駕」在 **board 列尾** 和 **detail view CRUD pill** 兩處都有。提案：**新增一個共用「試乘同意簽名 modal」元件**，兩處的「開始試駕」按鈕都改成先開此 modal、簽完 modal 內部呼叫 action 切狀態。

- 新元件：`src/app/(workspace)/sales/reception/test-rides/_components/test-ride-consent-modal.tsx`（client）
  - 內容：同意條款條文（純文字 / 可折疊）+ `<SignatureCanvas onSigned={...}>` + pending 鎖 UI。
  - props：`{ testRideId, signerName, open, onClose, onSigned }`，`onSigned` 拿到 dataURL 後呼叫 `startTestDriveWithSignatureAction`。
  - 樣式照 design pattern modal token（`fixed inset-0 z-50 bg-black/40` + `bg-white rounded-lg shadow-xl`）。
- **board**（`test-rides-board.tsx`）：列尾「開始試駕」改成 `setConsentTarget(r)` 開 modal（取代直接 `changeStatus(r,"in_progress")`）。
- **detail view**（`test-ride-detail-view.tsx`）：view mode 的「開始試駕」pill 改成開同一個 modal。
- 既有 complete flow（rating/里程/回饋）**完全不動**。
- detail view 的 view mode 在 `in_progress`/`completed` 時，「▼ 基本資料」區或新增一個「▼ 試乘同意簽名」section 顯示已簽的簽名圖（`<img src={metadata.signature.data_url}>`）+ 簽署時間。

> 為什麼不重做整個流程：既有 transition「開始試駕」就是天然 hook 點，包一層 modal 即可，不碰狀態機、不碰 complete flow。符合「對齊既有 detail-view 結構，不要重起爐灶」。

### 決策 5 — action / helper 型別怎麼擴（收 signature 參數）

**不擴 `completeTestDrive`**（決策 3 簽名在出車前、不在完成時）。改在 helper / action 加一支「帶簽名的開始試駕」：

- `src/domain/sales-test-drives.ts` 新增：
  ```ts
  export async function startTestDriveWithSignature(
    id: string,
    sig: { dataUrl: string; signerName?: string; consentVersion?: string },
  ): Promise<Result<{ id: string }>>
  ```
  內部：讀現有 metadata → merge `signature = { data_url, signed_at: now, consent_version, signer_name }` → update `status='in_progress'` + `metadata`（沿用 `completeTestDrive` 的 read-merge-write 寫法）。
- `src/domain/sales-test-drives.constants.ts` 新增型別：
  ```ts
  export type TestDriveSignature = {
    data_url: string; signed_at: string;
    consent_version?: string; signer_name?: string;
  };
  export type StartWithSignatureInput = {
    dataUrl: string; signerName?: string; consentVersion?: string;
  };
  ```
  （並在 `TestDriveRow.metadata` 的使用端把 `signature` 視為可選子鍵；metadata 已是 `Record<string, unknown>`，型別上不必硬改，detail view 讀時 cast。）
- `src/lib/sales/test-drives-actions.ts` 新增：
  ```ts
  export async function startTestDriveWithSignatureAction(
    id: string, input: StartWithSignatureInput,
  ): Promise<Result<{ id: string }>>   // gate() → startTestDriveWithSignature → revalidatePath
  ```
  沿用既有 `gate()`（`PERMISSIONS.CUSTOMER_EDIT`）。
- 保留既有 `setTestDriveStatusAction(id, "in_progress")` 不刪（其他無簽名場景 / 既有測試仍可能用）；UI 的「開始試駕」改走新 action。

### 決策 6 — 是否需要 migration

**決策 1 選 A + 決策 2 選 inline → 不需要 migration、不需要新 bucket、不需要 RLS 改動。** `metadata jsonb` 已存在，直接寫子鍵即可。（若 Ming 改選決策 1=B/C 或決策 2=storage，才需要 migration / bucket / storage policy；屆時依架構天條補 RLS 4 policy。）

---

## 三、落地清單（要改 / 新增哪些檔、是否 migration、估工）

| # | 檔案 | 動作 | 估工 |
|---|---|---|---|
| 1 | `src/domain/sales-test-drives.constants.ts` | 加 `TestDriveSignature` / `StartWithSignatureInput` 型別 | 5 min |
| 2 | `src/domain/sales-test-drives.ts` | 加 `startTestDriveWithSignature()`（read-merge-write metadata + 切 in_progress） | 20 min |
| 3 | `src/lib/sales/test-drives-actions.ts` | 加 `startTestDriveWithSignatureAction()`（gate + revalidate） | 10 min |
| 4 | `.../test-rides/_components/test-ride-consent-modal.tsx` | **新增** 同意條款 + SignatureCanvas modal（含 pending 鎖 UI） | 40 min |
| 5 | `.../test-rides/_components/test-rides-board.tsx` | 列尾「開始試駕」改成開 consent modal | 15 min |
| 6 | `.../test-rides/_components/test-ride-detail-view.tsx` | view mode「開始試駕」pill 改開 modal；新增「▼ 試乘同意簽名」section 顯示已簽圖 + 時間 | 25 min |
| 7 | `tests/e2e/rs.spec.ts`（RS-08 describe） | 補簽名 flow 斷言（見第五節） | 20 min |
| — | migration | **不需要**（決策 1=A + 決策 2=inline） | 0 |

**總估工 ~2.5 hr**（不含等 Ming 拍板）。全程不碰狀態機定義、不碰 complete flow、不碰 list query schema。

**架構天條複查**：新元件 #4/#5/#6 是 UI，**禁止 import `@/lib/supabase`**，一律走 `startTestDriveWithSignatureAction`（action）→ helper（#2/#3）。落地後跑：
```bash
grep -rn "@/lib/supabase" "src/app/(workspace)/sales/reception/test-rides" 2>/dev/null  # 預期 0 hit
```

---

## 四、待 Ming 拍板項（checklist）

> 預設推薦已標 ✅；Ming 只要對「同意推薦」打勾、或指定替代選項即可。

- [ ] **決策 1 — 簽名存哪**：✅ A `metadata.signature`（推薦）／ B typed column ／ C 新表
- [ ] **決策 2 — 存法**：✅ inline base64 in jsonb（推薦）／ storage bucket 存 URL
- [ ] **決策 3 — 簽名時機**：✅ 出車前簽（綁「開始試駕」，推薦）／ 完成時簽 ／ 兩者
- [ ] **決策 4 — UI 整合點**：✅ 共用 consent modal，board + detail 兩處「開始試駕」都先開它（推薦）／ 其他
- [ ] **決策 5 — action 擴法**：✅ 新增 `startTestDriveWithSignature(Action)`、不污染 `completeTestDrive`（推薦）
- [ ] **決策 6 — migration**：✅ 不需要（隨決策 1=A + 2=inline）
- [ ] **補充待確認**：
  - [ ] 同意條款條文內容 — 用占位文字先上、之後 Ming 提供正式條文？（建議：先放占位 + `consent_version: "test-drive-v1"`，正式條文到位再改版）
  - [ ] demo 資料 brand — 落地手測用 **Indian** brand 試乘 row（依專案規範）
  - [ ] 沒簽名能不能出車 — 推薦「同意條款＝強制」（沒簽不切 in_progress）；若 Ming 要「可跳過」再加 skip 路徑

---

## 五、驗收方式（落地後怎麼測 + RS-08 補哪些斷言）

### 手測（Indian brand）
1. board 列尾 `scheduled` 列點「開始試駕」→ 彈 consent modal、顯示同意條款 + 空白簽名板。
2. 不簽直接關 / 取消 → status 仍 `scheduled`（沒出車）。
3. 簽名 → modal 內按鈕 pending 鎖（`disabled` + spinner + `pointer-events-none opacity-60`）→ 成功 toast「✓ 已簽署並開始試駕」→ status 變 `in_progress`。
4. 進 detail view → 「▼ 試乘同意簽名」section 顯示簽名圖（`<img>` 不是豆腐）+ 簽署時間（Asia/Taipei）。
5. supabase 查 `metadata->'signature'->>'data_url'` 有值、`signed_at` 是 UTC。
6. detail view 的「開始試駕」pill 走同一個 modal（行為一致）。

### RS-08 describe 補的斷言（`tests/e2e/rs.spec.ts`，把 L434 的 `⏳ G3` 註解改成已落地）
新增一個 test（或擴現有）：
- 建一筆 `scheduled` 試乘（沿用既有冪等 marker 模式）→ 列尾「開始試駕」→ `expect(consent modal heading).toBeVisible()`。
- 在 `<canvas>` 上模擬畫線（`page.mouse.move/down/up` 數點製造筆畫）→ canvas `hasStrokes` 為 true → 「確認簽名」可點。
- 點確認 → `expect(page.getByText("✓ 已簽署並開始試駕")).toBeVisible()` → 列 status chip 變「進行中」。
- 進該列 detail → `expect(page.getByText("試乘同意簽名")).toBeVisible()` + `expect(page.locator('img[src^="data:image/png"]')).toBeVisible()`。
- 冪等清理：刪除該 row（沿用既有 dialog accept + 列尾刪除）。
- 斷言點摘要：✓ consent modal 出現 ✓ 簽名後切 in_progress ✓ 簽名圖落 DB metadata ✓ detail 顯示簽名。

> ⚠️ Playwright 在 `<canvas>` 上「畫線」要用 `page.mouse`（move→down→move 數點→up）觸發 `onMouseDown/Move/Up`；單純 click 不會產生筆畫、`hasStrokes` 不會 true、「確認簽名」按鈕仍 disabled。落地測試時注意。
