# DealerOS — 回覆Partner驗收報告
**日期：2026-06-08　｜　Russell Hung → Partner & AI Agent**

---

## 首先：感謝這份扎實的報告

Partner的兩份文件（7項紅旗補完報告 + v2已驗證回填版）品質非常高——有截圖、有SQL、有commit號，每個結論都有具體依據。這是我們希望看到的閉環驗收方式，請繼續保持這個標準。

7項紅旗全部處理完畢，B類/C類大多數項目也已就位。系統骨架已經穩固。

---

## 一、隨信附上：《系統設計原則備忘錄 v1.0》

**請Partner AI Agent在閱讀以下指令前，先完整讀一遍《DealerOS_系統設計原則備忘錄_v1.docx》。**

這份文件說明了：
- PDI的正確業界定義（新車PDI vs 中古車整備，兩種完全不同的業務）
- Config參數的正確使用方式（宣告≠完成，必須有消費端）
- 在客戶資料未到前的設計策略（預設值策略，不寫死）
- 給Partner AI Agent的溝通原則

過去我們給指令時習慣只說「做什麼」，沒有充分說明「為什麼」。這份備忘錄是對過去這個問題的修正，往後所有指令都會遵循這個原則。

---

## 二、需要你處理的事項（依優先序）

### 🔴 P0-1：B-13保固頁中性化 + Indian 10天提醒（測試前必須完成）

**問題確認：**
V-A-10截圖已清楚證明：warranty-sign-view.tsx仍寫死「DUCATI Warranty Terms / 整車保固台灣碩文版 / Desmo服務」，Indian客戶（海德生）在交車時會看到這些DUCATI專屬內容。這是真人測試前最後一個真正的阻礙。

**為什麼這麼重要：**
海德生員工在真人測試時，第一次走完交車流程時就會看到這個頁面。如果看到DUCATI的品牌字樣，第一印象就壞掉了。無論其他功能多完整，這個問題不解決，就不應該邀請客戶進行真人測試。

**具體修改要求：**

① **保固條款動態化（依brand_config讀取）**
```
// 修改前（錯誤）：
const WARRANTY_TITLE = "DUCATI Warranty Terms"
const WARRANTY_EXCLUSIONS = ["非DUCATI官方授權", "Desmo服務"]

// 修改後（正確）：
const WARRANTY_TITLE = brand_config.warranty_title
const WARRANTY_EXCLUSIONS = brand_config.warranty_exclusions
// Indian brand_config: warranty_title = "原廠保固條款", warranty_exclusions = [中性化內容]
// DUCATI brand_config: 維持現有DUCATI內容不變
```

② **Indian保固登記天數提醒消費端**
```
// brand_config.warranty_reg_days = 10 已宣告，但全src無消費端
// 需要在以下地方加入消費端：
// a. 交車完成後（completeDeliveryAction的after()）：
//    建立一筆 D+{warranty_reg_days} 的提醒任務
//    內容：「請提醒客戶在交車後{days}天內完成Indian保固登記」
// b. RS05交車頁面：顯示保固登記截止日期計算
//    截止日 = 交車日 + brand_config.warranty_reg_days
```

⚠️ **重要說明：** 10天是目前的預設值，尚未得到海德生提供的Indian台灣地區官方規定確認。程式碼中請加上註解：
```
/* 預設值10天，待海德生確認Indian台灣保固登記規定後可修改brand_config */
```
這樣未來收到海德生的確認後，只需修改brand_config，不需要改程式碼。

**驗收指令：**
```javascript
// 1. Indian帳號登入，走完交車流程到RS05保固簽署頁
await expect(page.locator('.warranty-title')).not.toContainText('DUCATI');
await expect(page.locator('.warranty-title')).not.toContainText('Desmo');
// 2. 確認交車後有D+10提醒任務建立
await page.click('#complete-delivery-btn');
const tasks = await supabase.from('call_tasks')
  .select('*').eq('source', 'warranty_reg_reminder');
expect(tasks.data.length).toBeGreaterThan(0);
```

---

### 🔴 P0-2：A-08 PDI工單執行對Indian開放（測試前必須完成）

**問題確認：**
Partner回報：indian brand scope下查無「02_PDI工單執行」node。

**業界背景（請先理解再實作）：**
詳見《系統設計原則備忘錄 v1.0》第三章。

簡要說明：PDI在業界有兩種類型：
- **新車PDI**：新車到港入庫前，依廠家標準清單執行的品質驗收（這是海德生的核心業務）
- **中古車整備**：收購中古車後的車況評估與修復

海德生是Indian Motorcycle Taiwan的代理商（distributor），進口新車後必須在交給客戶前執行PDI。因此「02_PDI工單執行」是他們的核心業務頁面，必須對Indian scope開放。

**具體修改要求：**
```sql
-- 在Indian brand的nav_nodes新增PDI工單執行入口
INSERT INTO nav_nodes (brand_id, label, href, parent_label, is_active, sort_order)
VALUES (
  'indian',
  'PDI工單執行',
  '/aftersales/pdi/workorder',
  '售後修護 > PDI整備',
  true,
  1
);
-- 同時確認「02_中古車整備工單」也在同一目錄下並排
-- 這兩個是不同業務，必須各自獨立入口
```

**驗收指令：**
```javascript
// Indian帳號登入，確認側欄有PDI工單執行入口
await page.goto('/aftersales/pdi/workorder');
await expect(page).not.toHaveURL(/404/);
await expect(page.locator('h1')).toContainText('PDI');
```

---

### 🟡 P1：B-05殘留品牌字樣清理（測試前建議完成）

根據v2回填報告，以下三處仍對Indian露出DUCATI相關字樣：

① **試乘車款下拉（test-rides）：** 寫死Panigale/Monster等車型
→ 改為依brand_id過濾，Indian只顯示Indian車款（Chief/FTR/Scout）

② **庫存品項名稱：** 含「Ducati/Monster」字樣的5筆品項
→ 已停用（Partner在補完報告中確認），請確認停用狀態正確

③ **labor_rates表Desmo費率列：** Indian系統顯示Desmo費率
→ 依brand_id過濾，Indian只顯示Indian費率（MN/RP/WC/AC/PD五種）

---

### 🟡 P2：C-24/C-25/C-28 技術方向確認

**C-24 休眠降級cron：**
你提出了pg_cron / api / edge function三個方案。

請先確認：目前Supabase方案層級是否支援pg_cron？

- 如果支援→ 用pg_cron（最簡單，不需要外部依賴）
- 如果不支援→ 用Supabase Edge Function + GitHub Actions每日觸發（最輕量的外部方案）

不需要現在實作，確認技術可行性後回覆我們方向。

**C-25 逐客戶LINE綁定：**
同意Partner的判斷，留到上線後。

理由完全正確：在沒有真實客戶加好友前，無從建立LINE帳號對應關係。這屬於上線後的客戶導入工作，不是開發工作。

**C-28 增項零件實體出庫：**
目前work_orders和repair_orders之間缺FK橋接，導致增項零件無法實體出庫扣帳。

這個問題不影響真人測試（測試時不會走到這個邊界案例），可以在B-13和A-08完成後再處理。請先描述你打算如何建立這個FK橋接關係，我們確認方向後再實作。

---

### 🟡 P3：B-10手卡→客戶基盤同步（確認範圍）

Partner回報：createHandcard路徑有findOrCreateCustomerForHandcard，但主RS01表單仍走snapshot-only舊路徑。

請確認：
- 新建手卡時（RS01表單提交），客戶資料是否自動同步到customers表？
- 如果主路徑還沒串接，這個在測試前需要修正嗎？（業務員測試場景會走這個路徑）

---

## 三、不需要現在處理的事項

以下項目Partner的判斷完全正確，同意留到上線後：

| 項目 | 理由 |
|------|------|
| C-24休眠降級排程（啟用） | 需要真實工單資料才有意義，現在做是白做 |
| C-25逐客戶LINE推播 | 需要真實客戶綁定LINE才能測試 |
| 電子發票API串接 | 第四波功能，已在測試腳本標注「展示用途」 |

---

## 四、現在的整體狀態評估

**可以進行混合測試的模組：**
- ✅ 售後工單主流程（待B-13完成後）
- ✅ 庫存管理全模組
- ✅ CRM客服管理
- ✅ 集團管理GRP系列
- ✅ 業務員銷售接待（部分）

**還不能測試的：**
- ❌ 交車→保固登記流程（B-13未完成）
- ❌ PDI整備流程（A-08未完成）

**建議：B-13和A-08完成後，即可邀請海德生進行第一輪真人測試。**

---

*Russell Hung × Claude Sonnet 4.6　｜　2026-06-08　｜　機密文件*
