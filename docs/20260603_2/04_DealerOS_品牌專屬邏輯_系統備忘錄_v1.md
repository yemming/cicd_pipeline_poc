# DealerOS 品牌專屬邏輯 — 系統備忘錄
**版本：v1.0　｜　日期：2026-06-03　｜　給 Partner & AI Agent**

> ⚠️ **緊急提醒**：海德生（Indian Motorcycle Taiwan）真人實測前必須閱讀本文件。
> 系統目前有多處 DUCATI 專屬邏輯直接寫死在頁面中，若不處理，
> 海德生員工測試時會看到與他們業務完全無關的內容，造成嚴重誤會。

---

## 一、Desmo Service 是什麼？為什麼只有 DUCATI 需要？

### 技術背景

DUCATI 引擎使用獨特的**去彈簧氣門系統（Desmodromic Valve System）**——普通引擎靠彈簧關閉氣門，DUCATI 靠另一組機械凸輪強制關閉。這讓引擎高轉速時表現更好，但代價是需要定期拆開引擎，人工量測並調整氣門間隙。

這就是 Desmo Service：一種 DUCATI 獨有的引擎大保養，每 18,000-30,000 km 做一次（依車款而定），工時 6-12 小時，費用 NT$35,000-55,000。

### Indian Motorcycle 完全沒有這個需求

Indian 使用傳統氣門彈簧引擎，保養邏輯標準：
- Indian Scout：每 16,000 km 換機油
- Indian Chief / Chieftain / Roadmaster：每 8,000 km 換機油
- **沒有任何類似 Desmo Service 的特殊大保養項目**

---

## 二、DUCATI vs Indian 保固政策對照

### DUCATI 保固政策

| 項目 | 內容 |
|------|------|
| **標準保固期** | 購車後 **24個月**，里程無上限 |
| **保固範圍** | 材料與工藝缺陷，含零件與工時費 |
| **保固轉讓** | 可轉讓給下一位車主（不延長原始期限） |
| **延長保固** | Ever Red 方案（台灣適用）：最多延長 36 個月 |
| **保固失效條件** | 未按原廠保養週期保養、改裝、非授權經銷商施工 |
| **索賠流程** | SA 診斷確認 → 主管核准 → 填寫 YouTech 系統編號 → 舊件回廠 → 廠方核帳 |
| **特殊要求** | **電子打卡強制**：所有保固作業必須用防竄改電子系統記錄工時，缺記錄則廠方追回工時費 |
| **舊件管理** | 保固換下的舊件必須回廠給 DUCATI 稽核，需設定暫存倉到庫位層級 |

### Indian Motorcycle 保固政策

| 項目 | 內容 |
|------|------|
| **標準保固期** | 購車後 **24個月**，里程無上限 |
| **保固範圍** | 材料與工藝缺陷，含零件與工時費 |
| **保固轉讓** | 可轉讓（透過授權經銷商辦理，不延長原始期限） |
| **延長保固** | Indian Motorcycle Protection Plan（另購） |
| **保固失效條件** | 未按原廠週期保養、非授權施工 |
| **索賠流程** | SA 診斷 → 主管確認 → 向 Polaris/Indian 提交索賠 → 核帳 |
| **特殊要求** | **購車 10 天內經銷商必須向 Indian 提交保固登記表**，否則保固不生效 |
| **舊件管理** | 相對寬鬆，無 DUCATI 那種嚴格的稽核庫位要求 |

### 兩者的關鍵差異

| 差異點 | DUCATI | Indian |
|--------|--------|--------|
| 電子打卡強制 | ✅ **強制，缺記錄追回費用** | ❌ 無此要求 |
| 舊件回廠稽核 | ✅ **嚴格，需庫位管理** | ❌ 無此嚴格要求 |
| 延長保固品牌 | Ever Red（台灣適用） | Protection Plan |
| YouTech 系統編號 | ✅ **保固索賠必填** | ❌ 無此系統 |
| 保固登記時限 | 購車後（彈性） | **購車後 10 天內必須登記** |

---

## 三、系統現況：已植入的 DUCATI 專屬內容（核查確認）

以下是從原始 HTML 直接掃描出的結果，不是推測：

### 問題一：保養類型選單（高風險）

**出現位置：**
- `04_預檢單_SA環檢_v3.html`
- `04_預檢單_RO串接_v3.html`

**問題內容：**
```javascript
// 目前的保養類型選單：
{ l:'定期保養', w:false },
{ l:'里程保養', w:false },
{ l:'Desmo 保養', w:false },   ← DUCATI 專屬，Indian 沒有
{ l:'故障維修', w:false },
{ l:'改裝安裝', w:false },
{ l:'⚠️ 疑似保固問題', w:true },
{ l:'📢 公報召回通知', w:true }
```

**海德生測試時的問題：**
SA 接待 Indian 車主，打開預檢單，看到「Desmo 保養」選項，
客戶和 SA 都會問：「這是什麼？我們的車有這個嗎？」

### 問題二：服務套餐主檔（高風險）

**出現位置：** `07B_服務套餐與費率設定_v1.html`

**問題內容：**
```
含Desmo預檢 的套餐
含Desmo Service 的套餐
完整保養+Desmo氣門間隙調整+冷卻液+傳動鏈條+皮帶（Multistrada）
```

**海德生測試時的問題：**
主管打開服務套餐管理，看到 Desmo 套餐，以為這是系統的標準配置，
會認為「這個系統是給 DUCATI 設計的，不適合我們 Indian」。

### 問題三：人車檔案維修履歷（中等風險）

**出現位置：** `09_人車檔案.html`

**問題內容：**
```javascript
// 維修履歷假資料：
{ ro:'MN-CP-260508-003', items:'Desmo 定保 / 煞車皮 / 鏈條', ... }
{ ro:'WC-WR-250508-003', items:'離合器系統保固維修', ... }
```
車輛假資料顯示的是 DUCATI Panigale V2，維修記錄也是 Desmo 保養。

### 問題四：車牌查詢帶出的車主資料（中等風險）

**出現位置：** `04_預檢單_SA環檢_v3.html`（修改版）

**問題內容：**
```javascript
showToast('已帶出人車資料：鄭宗勳 / Panigale V2 / 保固至2027-11-18...')
```
查詢後帶出的是 DUCATI 車主和 Panigale V2，海德生測試時應帶出 Indian 車型。

### 問題五：保固驗證邏輯的 YouTech 系統編號（低風險）

**出現位置：** `04_預檢單_RO串接_v3.html`

**問題內容：**
```html
<input placeholder="若為保固索賠請填入 YouTech 編號"/>
```
YouTech 是 DUCATI 全球保固申報系統，Indian 沒有這個系統。

---

## 四、技術解決方案

### 核心原則：brand_config 開關控制

```
不是「刪除 DUCATI 功能」，而是「依品牌設定顯示對應內容」
```

**資料庫設計：**

```sql
-- brand_config 表
CREATE TABLE brand_config (
  brand_id      TEXT PRIMARY KEY,  -- 'DUCATI' | 'INDIAN' | 'KAWASAKI'
  brand_name    TEXT,
  has_desmo     BOOLEAN DEFAULT false,  -- 是否有 Desmo Service
  warranty_system TEXT,   -- 'YouTech' | 'Polaris' | null
  oil_interval_km INT,    -- 換機油里程（依品牌不同）
  warranty_reg_days INT,  -- 保固登記期限天數
  service_template TEXT   -- 'desmo' | 'standard'
);

-- 初始資料
INSERT INTO brand_config VALUES
  ('DUCATI', 'DUCATI', true, 'YouTech', 12000, 30, 'desmo'),
  ('INDIAN', 'Indian Motorcycle', false, 'Polaris', 16000, 10, 'standard');
```

**前端條件渲染：**

```javascript
// 預檢單保養類型選單
const serviceTypes = [
  { l:'定期保養', w:false },
  { l:'里程保養', w:false },
  // 只有 DUCATI 才顯示
  ...(brand_config.has_desmo ? [{ l:'Desmo 保養', w:false }] : []),
  { l:'故障維修', w:false },
  { l:'改裝安裝', w:false },
  { l:'⚠️ 疑似保固問題', w:true },
  { l:'📢 公報召回通知', w:true }
];

// 服務套餐：只顯示當前品牌的套餐
const packages = await fetch(`/api/service-packages?brand=${current_brand}`);

// YouTech 欄位：只有 DUCATI 才顯示
if (brand_config.warranty_system === 'YouTech') {
  showYouTechField();
}
```

### 各問題的解決方式

| 問題 | 解決方式 | 工作量 |
|------|---------|--------|
| 問題一：Desmo 保養選項 | brand_config.has_desmo=false 時從選單移除 | 小 |
| 問題二：Desmo 服務套餐 | 服務套餐加 brand_id 欄位，查詢時依品牌篩選 | 小 |
| 問題三：假資料品牌 | 種入 Indian 示範資料（Scout/Chief），替換 DUCATI 假資料 | 小（資料問題）|
| 問題四：車牌查詢帶出品牌 | 種入 Indian 車輛到 vehicles 表 | 小（資料問題）|
| 問題五：YouTech 欄位 | brand_config.warranty_system 控制欄位顯示 | 小 |

**整體工作量：小。** 大部分是加欄位 + 條件渲染，不需要改頁面架構。

---

## 五、海德生測試前的必要行動

### 🔴 測試前必須完成

| 行動 | 負責方 | 說明 |
|------|--------|------|
| 種入 Indian Motorcycle 品牌設定 | Partner | brand_config 插入 Indian 的設定值 |
| 種入 Indian 示範車輛 | Partner | vehicles 表加入 Scout/Chief/FTR，保固到期日為真實 Indian 日期 |
| 種入 Indian 服務套餐 | Partner | 07B 服務套餐加入 Indian 標準保養套餐，Desmo 套餐對 Indian 帳號隱藏 |
| 確認保養類型選單 | Partner | Indian 帳號登入時，「Desmo 保養」選項不出現 |
| 確認 YouTech 欄位 | Partner | Indian 帳號登入時，YouTech 編號欄位不出現 |

### 🟡 測試時可口頭說明（不影響測試結果）

- 保固舊件暫存倉的嚴格庫位管理是 DUCATI 稽核要求，Indian 可依需求簡化設定
- 電子打卡強制紀錄是 DUCATI 廠方政策，Indian 可依自身需求決定是否啟用

---

## 六、給兩個客戶的說明

### 給海德生（Indian Motorcycle Taiwan）

> 系統的保固管理和工單流程完全支援 Indian Motorcycle 的保固政策（24個月無限里程），
> 包含保固登記追蹤（購車後10天內）、索賠工單建立、以及向 Polaris 提交索賠的流程記錄。
> 您在系統中不會看到任何 DUCATI 專屬的功能（Desmo Service / YouTech 系統編號等），
> 因為系統依您的品牌設定顯示對應的功能選項。

### 給碩文 DUCATI Taiwan

> 系統完整支援 DUCATI 保固政策：YouTech 系統編號記錄、電子打卡工時稽核、
> Ever Red 延長保固到期追蹤、保固舊件暫存倉管理到庫位層級。
> Desmo Service 保養套餐和保養週期提醒也已整合在服務套餐和預檢單流程中。

---

*文件版本：v1.0　｜　建立日期：2026-06-03*
*Indian Motorcycle Taiwan × DUCATI Taiwan × DealerOS　｜　機密文件，請勿外傳*
