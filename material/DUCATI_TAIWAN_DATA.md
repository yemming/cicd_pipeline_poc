# Ducati Taiwan 網站爬取資料整合文件

> 爬取來源：https://ducatitaiwan.com.tw  
> 爬取日期：2026-04-14  
> 用途：製作克隆/仿製網站的參考素材

---

## 📁 資料夾結構

| 檔案 | 說明 |
|------|------|
| `motorcycles.json` | 所有車款完整規格資料（含引擎、懸吊、電子配備等） |
| `prices.json` | 完整車款建議售價表（NTD） |
| `images.json` | 所有圖片URL清單（分類整理） |
| `site_structure.json` | 完整網站導航結構與所有頁面連結 |
| `accessories.json` | 改裝部品與服飾防護裝備分類清單 |
| `news_and_events.json` | 最新消息、品牌活動、賽事成就 |
| `dealers.json` | 台灣各地經銷商資訊 |

---

## 🏍️ 車款總覽（16款，含新車）

| 車系 | 車款 | 馬力 | 扭力 | 乾重 | 售價（NTD） |
|------|------|------|------|------|------------|
| **Panigale** | Panigale V4 S | 215.5 hp | 123.6 Nm | 174 kg | $1,828,000 |
| **Panigale** | Panigale V2 S ⭐NEW | 120 hp | 93.3 Nm | 176 kg | $1,128,000 |
| **Streetfighter** | Streetfighter V4 SP2 | 208 hp | 123 Nm | 177 kg | $1,958,000 |
| **Streetfighter** | Streetfighter V4 S | 208 hp | 123 Nm | 178 kg | $1,468,000 |
| **Streetfighter** | Streetfighter V2 | 153 hp | 101.4 Nm | 178 kg | $1,098,000 |
| **Streetfighter** | Streetfighter V2 S ⭐NEW | 120 hp | 93.3 Nm | 175 kg | $998,000 |
| **Multistrada** | Multistrada V4 Pikes Peak | 170 hp | 84 Nm | — | $2,038,000 |
| **Multistrada** | Multistrada V4 S | 170 hp | 84 Nm | 218 kg | $1,658,000 |
| **Multistrada** | Multistrada V2 S ⭐NEW | 115.6 hp | 92.1 Nm | 202 kg | $1,038,000 |
| **Hypermotard** | Hypermotard 950 SP | 114 hp | 96 Nm | 176 kg | $1,098,000 |
| **Hypermotard** | Hypermotard 950 RVE | 114 hp | 96 Nm | 178 kg | $988,000 |
| **Hypermotard** | Hypermotard 950 | 114 hp | 96 Nm | 178 kg | $888,000 |
| **Monster** | Monster SP | 111 hp | 93 Nm | 166 kg | $898,000 |
| **Monster** | Monster | 111 hp | 93 Nm | 166 kg | $748,000 |
| **SuperSport** | SuperSport 950 S | 110 hp | 93 Nm | 184 kg | $1,058,000 |
| **DesertX** | DesertX | 110 hp | 92 Nm | 202 kg | $1,078,000 |
| **Hypermotard** | Hypermotard 698 Mono RVE | 77.5 hp | 63 Nm | 151 kg | $818,000 |

> 另有 Scrambler 系列（獨立品牌）：$588,000 起

---

## 🔴 品牌識別資訊

- **品牌主色**：Ducati 紅 `#CC0000`
- **台灣總代理**：碩文
- **直營旗艦店**：台北市內湖區內湖路一段91巷19號

### 主要廣告標語（繁體中文）

```
「任由道路決定您的旅途終點」— Multistrada V2 S
「最狂野的夢想，已經實現」— DesertX
「THE ULTIMATE V2 FIGHTER FORMULA」— Streetfighter V2 S
「終極方程式，隨時準備上賽道」— Streetfighter V4 SP2
「肌肉、大膽、獨特」— Diavel V4
「為最大樂趣而製作」— Monster
「改寫旅行的規則」— Multistrada V4 S
```

---

## 📸 圖片資源說明

### 目錄結構

```
https://ducatitaiwan.com.tw/archive/images/
├── tw_bike/          ← 車款縮圖（350×190px 選單圖）與大圖
├── tw_bike_cate1Album/{model_id}/  ← 詳情相冊：設計外觀
├── tw_bike_cate2Album/{model_id}/  ← 詳情相冊：動力性能
├── tw_bike_cate3Album/{model_id}/  ← 詳情相冊：LED與細節
├── tw_bike_cate4Album/{model_id}/  ← 詳情相冊：配色展示
├── tw_bike_cate5Album/{model_id}/  ← 詳情相冊：視角與動態
├── tw_bike_cate6Album/{model_id}/  ← 詳情相冊：功能細部
├── tw_index/         ← 首頁輪播 Banner 大圖
├── tw_style/         ← 品牌生活風格圖
├── tw_shortcut/      ← 快捷小圖示
└── tw_news/          ← 新聞活動圖片
```

### 主要車款圖片 URL（選單縮圖）

| 車款 | URL |
|------|-----|
| Panigale V2 S | https://ducatitaiwan.com.tw/archive/images/tw_bike/1768457178.png |
| Panigale V4 S | https://ducatitaiwan.com.tw/archive/images/tw_bike/1768457189.png |
| Monster | https://ducatitaiwan.com.tw/archive/images/tw_bike/350x190_monster.png |
| Monster（大圖） | https://ducatitaiwan.com.tw/archive/images/tw_bike/Monster-04-hero-1600x1000-v02.jpg |
| Streetfighter V2 S | https://ducatitaiwan.com.tw/archive/images/tw_bike/1768456046.png |
| Streetfighter V4 S | https://ducatitaiwan.com.tw/archive/images/tw_bike/1768456137.png |
| Streetfighter V4 SP2 | https://ducatitaiwan.com.tw/archive/images/tw_bike/Model-Menu-MY23-Streetfighter-V4S-SP2.png |
| Multistrada V2 S | https://ducatitaiwan.com.tw/archive/images/tw_bike/1768456672.png |
| Multistrada V4 S | https://ducatitaiwan.com.tw/archive/images/tw_bike/Model-Menu-MY22-Multistrada-V4-S-Gr-v05.png |
| DesertX | https://ducatitaiwan.com.tw/archive/images/tw_bike/1768455322.png |
| Hypermotard 698 | https://ducatitaiwan.com.tw/archive/images/tw_bike/1768456517.png |
| Hypermotard 950 | https://ducatitaiwan.com.tw/archive/images/tw_bike/1768455813.png |
| Hypermotard 950 SP | https://ducatitaiwan.com.tw/archive/images/tw_bike/1768455505.png |
| SuperSport 950 S | https://ducatitaiwan.com.tw/archive/images/tw_bike/Thumb-menu-SS-950-S-R-MY21-v02.png |

---

## ⚙️ 技術規格重點摘要

### 引擎家族

| 引擎名稱 | 排氣量 | 搭載車款 |
|---------|-------|---------|
| Desmosedici Stradale V4 | 1,103 cc | Panigale V4 S、Streetfighter V4 S/SP2 |
| V4 Granturismo | 1,158 cc | Multistrada V4 S |
| Testastretta 11° L-twin（937cc） | 937 cc | Monster、DesertX、Hypermotard 950、SuperSport 950 S、Multistrada V2 S |
| V2 液冷（890cc） | 890 cc | Panigale V2 S、Streetfighter V2 S |
| 單缸（698cc） | 698 cc | Hypermotard 698 Mono |

### 電子系統縮寫對照表

| 縮寫 | 全名 | 功能 |
|------|------|------|
| DTC | Ducati Traction Control | 循跡控制系統 |
| DWC | Ducati Wheelie Control | 防前輪浮舉 |
| DSC | Ducati Slide Control | 後輪側滑控制 |
| EBC | Engine Braking Control | 引擎煞車控制 |
| DQS | Ducati Quick Shift | 快速升降檔 |
| DPL | Ducati Power Launch | 彈射起步 |
| DES | Ducati Electronic Suspension | 電子避震 |
| DSS | Ducati Skyhook Suspension | 天鉤電子避震 |
| DRL | Daytime Running Light | 晝行燈 |
| DCL | Ducati Cornering Light | 彎道輔助頭燈 |
| ABS EVO | Anti-lock Braking System EVO | 防鎖死煞車（含彎道版） |
| RbW | Ride by Wire | 電子油門 |

---

## 🏆 賽事成就

- **2025 MotoGP 世界冠軍**：Marc Márquez + Ducati
- **2025 WorldSBK 製造商冠軍（第21座）**：Panigale V4 R
- **2026 賽季**：以特別紀念塗裝出發，致敬賽車歷史

---

## 🔗 重要連結總覽

```
首頁：        https://ducatitaiwan.com.tw/
車款列表：    https://ducatitaiwan.com.tw/bikes/{model_id}
價目表：      https://ducatitaiwan.com.tw/price-list/
經銷商：      https://ducatitaiwan.com.tw/dealers/
聯絡我們：    https://ducatitaiwan.com.tw/contact/
改裝部品：    https://ducatitaiwan.com.tw/accessories/{category}
服飾防護：    https://ducatitaiwan.com.tw/apparel/{category}
最新消息：    https://ducatitaiwan.com.tw/news/
MotoGP：      https://ducatitaiwan.com.tw/racing-news/motogp
WorldSBK：    https://ducatitaiwan.com.tw/racing-news/wsbk
Facebook：    https://www.facebook.com/DUCATI.TAIWAN
Instagram：   https://www.instagram.com/ducati.taiwan/
YouTube：     http://www.youtube.com/c/DucatiTaiwanofficial
LINE：        https://lin.ee/iyW5eXT
MyDucati：    https://my.ducati.com/ww/en/access/ducati
```

---

*本資料僅供製作克隆網站之學習參考用途，所有車款規格、圖片、品牌標誌等智慧財產權均屬 Ducati Motor Holding S.p.A. 及台灣總代理碩文所有。*
