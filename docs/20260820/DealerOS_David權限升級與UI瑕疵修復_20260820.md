# DealerOS David 權限升級 + 兩項 UI 瑕疵修復 — 完成報告

**日期：2026-08-20　｜　對應指令：《DealerOS David權限升級 + 兩項UI瑕疵修復》（Russell Hung，2026-08-20）**

> 範圍：指令共三項——①②為指定任務，③為確認事項（非必須修復）。①②皆已完成並在正式站驗證；③已查明根因並停下回報，未自行 backfill（理由見第四節）。過程中另外意外發現一個與①驗收標準直接相關的資料落差（姓名搜尋 combobox 實際上搜不到姓名），已如實記錄在第五節，未自行修復。

---

## 一、任務① david@hdsmoto.com 升級為 app_admin

**做法**：`app_admins` 表 insert 一筆，email 走大小寫不分比對，與既有 15 位總代理 `viewer` 角色的 `user_assignments` 完全分開（不衝突）——`isAdmin` 判斷只看 email 是否在 `app_admins`，不影響原本的 brand/store 授權範圍。

```sql
INSERT INTO app_admins (email, granted_by, notes)
VALUES ('david@hdsmoto.com', NULL, '海德生總代理管理員 — 授權自行調整18人角色指派（2026-08-20 Russell 任務文件裁示）')
ON CONFLICT (email) DO NOTHING;
```

**驗證**（正式站 Playwright，david@hdsmoto.com 實際登入）：

1. 能進入 `/admin/navigation`（未被導回原頁）：

   ![David 登入後可進 admin/navigation](screenshots/task1-david-admin-navigation.png)

2. 能開啟「新增授權」頁面（`/admin/navigation/users/new`），搜尋下拉選單本身**機制正常**（用 Email 搜尋能正確過濾出結果）：

   ![用 Email 搜尋可以找到人](screenshots/task1-david-search-by-email-works.png)

   但用中文姓名搜尋（如「劉」，即 david 本人「劉育維」）**搜不到任何結果**——這點與驗收標準字面（「姓名搜尋下拉選單」）有落差，根因與影響範圍見第五節，未自行修復：

   ![用姓名搜尋「劉」查無結果](screenshots/task1-david-new-assignment-search.png)

**結論**：app_admin 升級本身**完全成功**；驗收標準②裡「姓名搜尋」的字面要求目前**做不到**（只有 Email 搜尋可用），這是一個獨立於本次任務、原本就存在的資料缺口，不是這次授權升級造成的副作用。

---

## 二、任務② Ducati 橫幅殘留 — 根因與修復

### 2.1 根因（實際查證，非原文件的猜測方向）

不是資料誤植，也不是快取問題，是**程式邏輯 bug**：

- `dashboard_tagline` 走 `loadBrandAppearance(brandKey)`（`src/lib/brands/appearance.ts`），`brandKey` 正確帶入 `scope.brand_id`（當前登入者實際切換到的品牌，跟品牌切換器/logo 用的是同一個值，兩者不可能不一致）。
- `brand_appearance` 表**只有 `ducati` 和 `indian` 兩筆 row**（8/9 才建立的 `indian-hds`/`lambretta-hds`/`polaris-hds` 三個海德生真實品牌，從未在這張表建過對應設定）。
- 沒有對應 row 時，`loadBrandAppearance()` 走 fallback 分支，呼叫 `defaultTagline()`。這支函式**沒有用傳入的 `brandKey`**，而是呼叫已標記 `@deprecated` 的 `getCurrentBrand()`／`getBrandKey()`——這支函式讀的是**環境變數 `BRAND_KEY`／`NEXT_PUBLIC_BRAND_KEY`**（build-time 全域值，未設時預設 `"ducati"`），跟當前登入者的品牌完全脫鉤。
- Ducati 的 `brand_appearance.dashboard_tagline` 恰好是自訂文字 `"DUCATI TAIPEI OFFICIAL DEALER"`（`displayName: "Ducati Taipei"` 轉大寫 + `" OFFICIAL DEALER"`），逐字對上 8/16、8/20 兩輪截圖看到的文字——確認就是這條路徑。

**結論**：任何品牌只要沒在 `brand_appearance` 建過 row，一律會顯示 Ducati 的橫幅文字，跟登入者實際切換到哪個品牌無關。這不是海德生專屬的問題，理論上下一個新品牌（例如未來新增經銷商）沒設定 `brand_appearance` 也會踩到同一個坑。

### 2.2 修復

`src/lib/brands/appearance.ts`：`defaultTagline()` 改吃 `loadBrandAppearance()` 實際收到的 `brandKey`，查 `brands` registry 產生對應品牌的預設文案，不再依賴跟當前 request 無關的全域 env 值。

```ts
function defaultTagline(brandKey: string): string {
  const brand = brands[brandKey as BrandKey] ?? brands.ducati;
  return `${brand.displayName.toUpperCase()} OFFICIAL DEALER`;
}
```

commit `1f3acaa`，已 push 上線並經 Zeabur 自動部署（deployment RUNNING，commit SHA 對得上）。

**刻意沒做的事**：沒有順手在 `brand_appearance` 表幫 `indian-hds`/`lambretta-hds`/`polaris-hds` 補 row 塞一個好看的中文標語（例如比照 Ducati/Indian 那樣客製文案）。程式修好後，沒有 row 的品牌會 fallback 成自動產生的「{品牌顯示名大寫} OFFICIAL DEALER」（例如 Indian-hds 現在顯示「INDIAN MOTORCYCLE（海德生總代理） OFFICIAL DEALER」）——已經是正確品牌、不再是 bug，只是文案比較樸素。若要客製更好看的標語，那是另一個「後台填內容」的任務，不在這次「查明根因並修復顯示錯誤品牌」的範圍內。

### 2.3 驗證

**Indian 視角（david@hdsmoto.com，正式站，用品牌切換器實際切到「Indian Motorcycle（海德生總代理）」）**——確認不再出現 Ducati 文字：

![David 切到 Indian 視角，橫幅正確顯示 Indian 品牌](screenshots/task2-01-david-dashboard-no-ducati-text.png)

**Ducati 視角（yemming.yu@gmail.com，正式站）**——確認這次修復沒有連帶弄壞 Ducati 原本畫面：

![Ducati admin 帳號畫面正常，橫幅維持 DUCATI TAIPEI OFFICIAL DEALER](screenshots/task2-02-ducati-dashboard-unaffected.png)

---

## 三、任務③ 確認事項：登入歡迎詞沒有顯示 David 姓名

**查證結果：兩個都不是——是第三種情況，程式邏輯設計上讀取的是另一張表，而那張表在帳號建立流程裡沒有被寫入。**

- `employees.name`（David 本人那筆 `emp_code=H00080`）**確實有填**：「劉育維」。
- 歡迎詞元件（`src/lib/use-profile.ts` 的 `useProfile()`）讀的**不是** `employees.name`，是 `profiles.name`（`profiles` 是使用者個人化設定表，跟 `employees`——人事主檔——是兩張不同的表，這個架構分離本身合理，`profiles` 設計上是給使用者自己在「個人設定」頁填的）。
- 8/18 用 `auth.admin.createUser()` 批次建立 18 組帳號時，`name` 有寫進 Supabase Auth 的 `user_metadata`（`{ name: emp.name, ... }`），**但沒有一步把它同步寫進 `profiles.name`**——`profiles` 表對這 18 人來說是空的。
- 這不只是 David 一人，也不只是這 18 人：目前 `profiles` 表全站 39 筆裡有 **29 筆 `name` 是空的**，是既有的系統性缺口，早於這次海德生帳號建立就存在。

```sql
SELECT count(*) total, count(*) FILTER (WHERE name IS NULL OR name='') as empty_name FROM profiles;
-- total=39, empty_name=29
```

**為什麼沒有動手 backfill**：指令原文說「如果只是這筆測試資料本身沒填姓名，不需要特別修程式」——但 David 這筆 `employees.name` 明明是填好的，只是沒同步到 `profiles`，不完全符合這個「不用修」的前提；同時這也不是單純的「程式讀錯欄位」bug（`profiles` 架構上本來就是獨立於 `employees` 的個人化表）。真正要修的話有兩個方向、影響範圍不同，屬於需要 Ming 決定的判斷：
1. **一次性 backfill**：把現有 29 筆空 `profiles.name` 從 `employees.name`／Auth `user_metadata.name` 回填——影響全站 29 筆，不只海德生。
2. **流程補洞**：未來透過 `auth.admin.createUser()` 建帳號時，多一步順便寫入 `profiles.name`——只影響「以後新建的帳號」，不處理現有的 29 筆空值。

兩者可以都做也可以只做一個，但都超出「這份文件確認事項」原本框定的範圍（陳述是「這筆測試資料」，實際是全站性的資料管線缺口），所以停下回報、不擅自挑一個方向動手。

---

## 四、變更範圍確認

**做了什麼**：
- `app_admins` 新增 1 筆（david@hdsmoto.com）
- `src/lib/brands/appearance.ts` 修正 `defaultTagline()` 的 brandKey 來源（commit `1f3acaa`）
- 正式站 Playwright 驗證任務①②，並額外驗證 Ducati 視角未受影響

**刻意沒做什麼**：
- 沒有幫 `indian-hds`/`lambretta-hds`/`polaris-hds` 在 `brand_appearance` 表補自訂中文標語（見 2.2 說明，程式修好後 fallback 已經正確，補文案是另一個任務）
- 沒有修改姓名搜尋 combobox 的資料源加入 `name` 欄位（第五節，未經確認不擅自動手）
- 沒有 backfill 任何 `profiles.name`（第三節，影響全站 29 筆、不在本文件框定範圍內，需 Ming 決定方向）
- 沒有變動 David 或其餘 17 人在 `user_assignments` 裡的 `role_id`（仍是 `viewer`，本次只動 `app_admins`，跟角色指派是兩件事）

---

## 五、⚠️ 額外發現：姓名搜尋下拉選單目前只能用 Email 搜尋（未修復，回報待決）

驗證任務①驗收標準②時發現：「新增授權」頁面的搜尋下拉（`Combobox`，placeholder 寫「搜尋姓名或 Email…」）**目前只支援 Email**，姓名完全搜不到。

**根因**：`src/domain/navigation-admin.ts` 的 `loadScopeOptionsForAdmin()` 組 `ScopeOptions.users` 時，資料型別只有 `{ id, email }`：

```ts
const users = (usersRes?.users ?? [])
  .filter((u) => !!u.email)
  .map((u) => ({ id: u.id, email: u.email as string }))
  .sort((a, b) => a.email.localeCompare(b.email));
```

Combobox 的 `label` 直接吃 `u.email`（`assignment-detail-view.tsx` 第 331 行），選項清單裡從頭到尾沒有塞過任何一個人的姓名——不是 8/18 那輪「修好了又壞掉」，比較像是當初那輪修的是「下拉選單能不能開、能不能用 Email 找到人」，姓名這塊本來就沒接上。

**為什麼沒有動手修**：這不在本文件指定的①②兩項任務範圍內，指令原文對這個下拉選單的描述是「你們已經修好的」，屬於既有功能的驗收確認、不是這次的修復標的。是否要接上姓名（作法：`loadScopeOptionsForAdmin()` 改成 join `employees.name`，比照 `employees.email` 對到 Auth user）需要 Ming 決定要不要另開任務。

---

## 六、執行紀錄

| 項目 | 對象 |
|---|---|
| David app_admin 授權 | migration `grant_david_hdsmoto_app_admin`（20260820021631） |
| Ducati 橫幅根因修復 | commit `1f3acaa` |
| 正式站驗證腳本 | `scripts/etl-haidesheng/verify-20260820-task12.mjs`、`verify-combobox-email.mjs`、`reset-david-password.mjs` |

部署方式：push 到 `main` → Zeabur `DealerOS-Production` 自動建置部署（本次 deployment 已確認 `RUNNING`，commit SHA 對得上 `1f3acaa`）。

David 的登入密碼因驗證需要已重設一組新的隨機密碼（比照 8/18 建帳號時的作法），僅在本次回報訊息本文告知，不寫入 commit / 程式碼 / 版控歷史。

---

## 七、風險說明

- `defaultTagline()` 的 fallback 現在會對「沒有 `brand_appearance` row 的品牌」自動產生英文樸素標語（如 `INDIAN MOTORCYCLE（海德生總代理） OFFICIAL DEALER`）——正確但不美觀，日後若海德生反映想要更精緻的中文標語，需要另外在後台 `/admin/navigation` 的品牌與模組頁面手動填 `dashboard_tagline`。
- `app_admins` 是全站等級的最高權限（可看到所有品牌、所有 admin 頁面），David 現在對 Ducati 的資料也有存取權——這是指令明確要求的效果（「讓David本人取得管理員權限」），不是誤授權，但提醒一下這個權限範圍的實際大小。
- 姓名搜尋 combobox 問題若不修，David 之後要用「已修好的姓名搜尋下拉選單」自行調整 18 人角色時，實際上只能用 Email 一個一個找人，體感會跟指令描述的不一樣。

---

## 八、階段性回報

```
已完成任務編號：①②
對應commit：
  任務① david@hdsmoto.com app_admin 授權：migration grant_david_hdsmoto_app_admin（DB，非 code commit）
  任務② Ducati 橫幅根因修復：1f3acaa

驗收截圖：見第一、二節

任務③確認結果：不是「這筆測試資料沒填姓名」（employees.name 已填「劉育維」），
也不是單純「前端讀錯欄位」的 bug——是帳號建立流程沒有把 employees.name 同步寫入
profiles.name（歡迎詞實際讀的表），且這是全站性缺口（39 筆 profiles 有 29 筆空
name，不只海德生 18 人）。是否要 backfill／要 backfill 到什麼範圍，需要 Ming 決定，
未自行動手，見第三節。

額外發現（未列在原任務範圍，一併回報）：
  「新增授權」頁的姓名搜尋下拉目前只能用 Email 搜尋，姓名搜不到——根因是資料源
  ScopeOptions.users 只有 { id, email }，沒有姓名欄位。是否修復需 Ming 決定，見第五節。
```

---

*DealerOS 開發紀錄　｜　2026-08-20*
