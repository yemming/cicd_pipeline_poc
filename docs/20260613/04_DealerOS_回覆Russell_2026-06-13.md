# DealerOS — 回覆 Russell 6/11 五題

**日期：2026-06-13　｜　Partner & AI Agent → Russell Hung**
**對應：`01_DealerOS_回覆Partner_2026-06-11.md`**
**修補 commit：`8758bde` + `8d236a3`（已部署至正式站 https://dealeros.zeabur.app/）**
**所有截圖均對部署後的正式站、以 Indian / DUCATI 帳號實拍，並以 DOM 可見性程式複驗殘留歸零**

---

## 先講一句重話：我們承認 6/07 報告有「未附證據 + 部分聲明不實」

複查後確認：**問題三的庫存品項根本沒清乾淨**（殘留 5 筆 Ducati 品項 + 6 筆 Ducati 車款假交車單），6/07「✅已清資料」是錯誤聲明。這次全部據實附證據、不再有無佐證的勾稱。以下逐題回覆，每題給**截圖 + commit + 程式碼行號**。

---

## 問題一：B-13 保固頁中性化 — 截圖 + commit + 行號

**結論：code 早在 `c1a740b`（6/7）已中性化；本次再補兩刀並附正式站截圖。**

保固頁 `warranty-sign-view.tsx` 整頁由 `brand_config` 驅動（`page.tsx:25-33` 取 `getBrandConfig` → `resolveWarrantyContent`），標題 / 條款 / 不適用情況全部依品牌動態取，對 Indian 走中性 fallback（`brand-config.ts:95-124`），**不再對所有品牌寫死 DUCATI**。

本次（`8758bde`）額外修正兩點：

1. **提醒文案品牌正名**（`warranty-sign-view.tsx:199`）：
   - 原本印 `完成{warrantySystem}保固登記` → 對 Indian 會印「完成 **Polaris** 保固登記」（Polaris 是母廠系統碼，海德生員工不認得）
   - 改為讀 `brandName`（`warrantyRegBrand`）→ 現在印「**完成 Indian Motorcycle 保固登記**」，正中你的規格要求
2. **清除假資料**：Indian 有一筆交車單 `王大明 / Monster SP`（保固頁就是讀這筆才露出你截到的假資料）→ 已中性化為 `陳其邁 / Indian Scout Bobber`
3. **殼層補刀**（`8d236a3`）：第一輪截圖後我們用 DOM 可見性程式複驗，又揪出兩處非品牌驅動的硬編碼殘留 → 已清：
   - 交車流程步驟標題 `delivery-frame.tsx:60`：「DUCATI Warranty Terms — 交車登記表」→「保固條款 — 交車登記表」
   - 確認事項清單 `delivery-constants.ts`：「已說明 www.ducati.com…」→「已說明原廠官方網站…」

**截圖（Indian 帳號 · 正式站）**：`russell-evidence/P1_保固簽署頁_indian.png`
- ✅ 標題顯示「**Indian Motorcycle 保固條款**」，不含「DUCATI」
- ✅ 內文不含「Desmo 服務」「非 DUCATI 官方授權」
- ✅ 顯示「請於交車後 10 天內完成 **Indian Motorcycle** 保固登記」提醒（`warranty_reg_days=10`）
- ✅ 無「王大明 / Monster SP」假資料
- **DOM 可見性程式複驗：DUCATI/Desmo/王大明/Monster 可見文字節點 = 0**

**改動行**：`warranty-sign-view.tsx:29,35,199`、`warranty-sign/page.tsx:31`、`delivery-frame.tsx:58-60`、`delivery-constants.ts:199`

> 誠實補充：交車流程更深層的 PDI / 36 項點交 checklist（DQS、MyDucati、Ducati Connect 等 DUCATI 工程專屬系統）仍含 DUCATI demo 內容；這些不在保固頁（RS05）上、屬另一輪 brand-aware 重構範圍，已列入後續。本題要求的保固簽署頁已徹底中性化。

---

## 問題二：org_mode 全域 → per-brand（架構修正）

**你指出的設計缺陷成立，已修正。**

### 修改方案說明

| 項目 | 原本（錯） | 修正後 |
|------|-----------|--------|
| 落點 | `system_settings` 單一全域 row（`org_mode=3`） | `brand_config.metadata.org_mode`，**每品牌一筆** |
| Indian | 受全域值限制 | `org_mode=3` → 系統收合「區域」層 → 集團→法人→門店（三層） |
| Ducati | 全域=3 時根本撐不起四層 | `org_mode=4` → 保留「區域」層 → 集團→法人→區域→門店（四層） |
| 切換 | 全域一個值 | 組織架構設定頁依**當前品牌**讀寫；改 config 不改 code |

**關鍵：org_mode 不再只是被存起來的設定，而是真正驅動組織樹渲染。** `getOrgStructure()`（`org-structure.ts:289-298,328`）在組每個法人子樹時，依該法人品牌的 `org_mode` 決定：=3 收合區域、門店上提直掛法人；=4 保留區域節點。

> 為什麼放 `brand_config.metadata.org_mode` 而非新開 typed column：本專案架構約定「形狀變動中 / 單頁專用的設定先進 metadata jsonb，被多處引用後再一條 ALTER 升級成 typed column」。org_mode 目前單點使用，先進 metadata；隨時可無痛 promote。落點與你要求的「brand_config per-brand」完全一致。

### 驗證（同一棵組織樹，兩品牌並存）

```
【集團】DealerOS Demo Group
  └─【法人】彥明國際貿易（ducati，org_mode=4）→ 四層
        └─【區域】Ducati Taiwan
              └─【門店】Ducati Kaohsiung / Taipei(信義) / Taipei(內湖)
  └─【法人】DealerOS Indian Motorcycle Taiwan（indian，org_mode=3）→ 三層
        └─【門店】台北/台中/高雄/台南/嘉義直營店  ← 區域已收合
```

→ **系統同時支援三層的海德生與四層的碩文，只靠 config 切換、零程式碼改動。**

**截圖**：`russell-evidence/P2a_組織架構_indian三層.png`（Indian 帳號，組織模式顯示「三層」）、`P2b_組織架構_ducati四層.png`（Ducati 帳號，顯示「四層」、區域層存在）

**改動檔**：`brand-config.ts`、`org-settings.ts`、`org-structure.ts:160-163,289-298,328`、`org-settings-actions.ts`、`org-structure/page.tsx`、`org-structure-board.tsx`

---

## 問題三：B-05 三處殘留 — 三張截圖

**①試駕車款、③Desmo 費率本就乾淨；②庫存品項是真破口，已清。**

### ① 試駕車款下拉（截圖 `P3a_試駕車款下拉_indian.png`）

試乘表單（`test-rides-form.tsx:29,422-440`）已改吃 `vehicle_models`（依 active brand 過濾）。Indian 的 `vehicle_models` 只有 Chief / FTR / Scout，**DB 層就不存在 Ducati 車款**。
- 程式抓取下拉實際選項 = **`Chief Vintage` / `FTR Sport` / `Scout Bobber`**（全 Indian，無 Panigale/Monster）

### ② 庫存品項清單（截圖 `P3b_庫存品項_indian.png`）

**這是 6/07 報告漏掉的真破口。** 複查發現 Indian brand 底下仍有 5 筆寫死 Ducati 的品項，本次全部中性化：

| 代碼 | 原品名（污染） | 改後 |
|------|--------------|------|
| ACC-HLM-001 | Ducati 復刻款安全帽 M | Indian 復刻款安全帽 M |
| OEM-BDY-001 | Panigale V4 整流罩 紅 | FTR 整流罩 紅 |
| OEM-BDY-002 | Monster 油箱蓋 | Scout 油箱蓋 |
| E2E-SVC-021 | Desmo 汽門間隙校正 | 氣門間隙校正 |
| OEM-ENG-003 | Desmodromic 進氣搖臂 | 進氣搖臂 |

> 第一輪只清了 `name` 欄，DOM 複驗又抓到 `name_en` / `spec_description` 仍殘（Ducati Helmet Replica / Ducati 紅塗裝 / Monster 系列通用 / desmo 系統 / Panigale 適用），`8d236a3` 已連同清除。
- **DOM 可見性程式複驗：Indian 品項清單 Ducati/Panigale/Monster/Desmo 可見文字 = 0**

### ③ 07B 工時費率表 Tab B（截圖 `P3c_工時費率表_indian.png`）

費率表元件（`service-packages-board.tsx:518`）對 `has_desmo=false`（Indian）的品牌**會濾掉 Desmo Service 列**。Indian 帳號的「工時費率表」Tab 只有 5 列：MN 定保 / RP 一般維修 / WC 保固維修 / AC 事故維修 / PD 整備，**無 Desmo 列**。
- **DOM 可見性程式複驗：工時費率表 Desmo 可見文字 = 0**

---

## 問題四：碩文（DUCATI）環境區隔 — 現況確認 + 截圖

**三點全部確認 OK：**

1. **DUCATI 帳號看到的是 DUCATI 資料**：ducati brand 有自有業務資料（30 客戶 / 15 車款 / 30 品項），RLS 按品牌隔離。截圖 `P4b_ducati業務資料_車型.png` 顯示車型主檔為 Panigale / Monster / Streetfighter 等 DUCATI 車款（程式命中 24 處，**這是正確的——DUCATI 帳號本就該看到自己的車款**），非 Indian 資料。
2. **nav_nodes 正確顯示 DUCATI 功能**：ducati 有 298 個 nav 節點 / 19 個一級模組（**非空**）。截圖 `P4a_ducati首頁目錄.png`。
3. **RLS 對 DUCATI 生效**：6/4 RLS hardening 已對全 205 張表套 `user_has_brand(brand_id)` 政策（advisor 14→0），品牌隔離對 ducati 與 indian 對稱生效。

> 補充現況：ducati 的 nav 目錄**尚未**套用 v3.0 目錄規範（仍是舊的 19 模組結構）。這正是 6/07 報告所述「待 Indian 驗收 OK 再比照套用」的狀態——功能可用、資料隔離，只差目錄重排。等海德生驗收通過即比照套到 ducati。

---

## 問題五：HTML 黃金版本回傳 — 接受，已回傳 5 支（入庫版控）

**已接受你的要求，不以截圖替代。** 5 支可在瀏覽器獨立運行的 HTML 黃金版，已隨 `8758bde` 入 git 版控，路徑：
`docs/20260613/03_DealerOS_黃金版本v3針對售後修護模組_交付包_20260612/`

| 回傳檔 | 行數 | 主要異動 |
|--------|------|---------|
| 04_預檢單_合併版_v1.html | 792 | 合併 SA環檢+RO串接、Walk-in、車牌查詢、SA/技師視角、Tab5 跳轉 |
| 02_正式工單RO_v2.html | 736 | PD補回+IN付款、資料預填、推送派工、品牌中性化 |
| 07_售後管理模組_v3.html | 939 | 派工看板通知橫幅、真實工單列表、派工 Modal |
| 10_工單查詢_v1.html | 100 | 今日快速篩選、Walk-in 標籤、title 中性化 |
| 07B_服務套餐與費率設定_v2.html | 712 | Tab B 費率可編輯+儲存+Dirty State |

品質符合你的四項要求：
- ✅ 按鈕 / Tab / 輸入欄位皆可操作（每支 7~43 個互動 handler）
- ✅ 後端串接點以 `// 後端串接點：…/api/…` 標註（每支 3~10 處）
- ✅ 假資料全 Indian（Scout / Chief / FTR / Roadmaster），**複查清除了 10 / 07 / 07B 三支殘留的 Ducati 字樣**（Panigale / Monster / Desmo / Multistrada 等），現 0 殘留
- ✅ title 標籤不含 DUCATI

> 同交付包另附 11 支相關頁面（預約看板 / 增項閉環 / 出庫領料 / 竣工複檢 / 結帳收款 / 人車檔案 / Tech 工作台 / 三本稽核日誌等），一併版控。

---

## 附：本次所有改動

- **commit**：`8758bde`（org 架構 + 首輪中性化）+ `8d236a3`（殼層補刀）；皆 tsc + eslint 全綠、已部署正式站
- **程式碼**：保固頁 ×2、org 架構 ×6（brand-config / org-settings / org-structure / action / page / board）、交車殼層 ×2（delivery-frame / delivery-constants）
- **資料庫**（已套正式站 Supabase）：brand_config.metadata.org_mode（indian=3/ducati=4）、items 全文字欄中性化（name / name_en / spec_description）、6 交車單中性化
- **HTML 黃金版**：5 支主檔 + 11 支附件入庫版控
- **截圖證據**：`docs/20260613/russell-evidence/`（P1 / P2a / P2b / P3a / P3b / P3c / P4a / P4b，皆 DOM 可見性複驗殘留歸零）

*Partner & AI Agent ｜ 2026-06-13*
