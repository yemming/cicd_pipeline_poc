# Partner AI Agent 回覆：Indian / Polaris Dealer Portal 系統串接建議

**致 Russell Hung　｜　2026-06-16**

Russell 在指令文件問到：對 Indian Motorcycle / Polaris Dealer Portal 的系統串接有沒有了解或建議，有沒有 EDI / FTP / 第三方中介層等業界替代方案。以下是我的看法。

---

## 一、先講結論（TL;DR）

1. **Polaris 沒有公開 REST API**，這點你判斷正確——powersports OEM 幾乎都不對外開 self-serve API，要串一定得經過原廠授權。
2. **不要等「完整即時 API」**才動手。業界真正在跑的串接，八成是 **EDI + SFTP 批次檔**，不是即時 REST。
3. **務實的階梯**是：手動 Excel（現在）→ **SFTP 夜間批次 Price Book / 可用量**（下一步，最高 CP 值）→ EDI 採購/出貨/對帳（量夠大再上）。
4. **最低風險路徑通常是借道既有 powersports DMS / iPaaS 中介層**，而不是自己跟原廠對接 EDI。

---

## 二、Polaris / Indian 經銷體系的串接現實

| 管道 | 業界實況 | 對海德生的可行性 |
|---|---|---|
| **Dealer Portal（網頁）** | 原廠給經銷商查零件、價格、下單、報保固的網站。無公開 API、有 ToS 限制 | 人工查詢可，**禁止爬蟲/RPA**（違反 ToS、畫面一改就壞，不建議） |
| **EDI（X12）** | 大型經銷/代理採購補貨的標準：850 採購單、855 回覆、856 出貨通知(ASN)、810 發票、816 組織、832 價目表 | 需原廠開通 + VAN 或 AS2 連線；適合「PO→出貨→對帳」自動化，建置成本中高 |
| **SFTP / 平面檔批次** | 原廠把 Price Book、零件可用量、料號異動以 CSV/XLSX 夜間丟 SFTP | **最務實的 Phase 1.5**：拿到固定格式檔就能套用我們現成的 upsert 匯入管線，不需 API 規格 |
| **DMS / 中介層** | Lightspeed (ADP)、DX1、Dealer Spike、Talon 等 powersports DMS 早已內建 Polaris 零件目錄/定價/庫存/保固串接 | 借道既有整合層通常比自建 EDI 快且穩；或用 iPaaS（Cleo、Boomi、MuleSoft）做轉接 |
| **保固索賠** | Polaris 有經銷商保固提報系統，多走 Portal 或 EDI 結構化提報 | 我們已先把 `warranty_claim_receivables` 應收款骨架備好，未來對接原廠回覆狀態即可 |

---

## 三、建議的落地階梯（與系統已預留的接口對齊）

### Phase 1（已完成）— 手動 Excel Price Book 匯入
- `/parts/setup/items` 已加「原廠 Price Book 匯入」，倉管上傳原廠 Excel → 自動 upsert 料號/定價。
- OEM 供應商分類存 `suppliers.metadata`（`oem_type` / `oem_dealer_code` / `oem_portal_url` / `oem_api_endpoint`），接口先備好、等資料到位再填。

### Phase 1.5（建議下一步，CP 值最高）— SFTP 夜間批次
- **跟海德生 / Polaris 要一條 SFTP 帳號**，原廠每日丟 Price Book + 零件可用量平面檔。
- 系統端用排程（已有 Zeabur cron 機制）每晚拉檔，**重用現成的 `upsertPriceBookAction` 管線**，把「手動上傳」換成「自動同步」。
- 不需要任何 API 規格文件，工程量小，卻能讓料號/定價自動保鮮。

### Phase 2（量夠大再上）— EDI / 中介層
- 採購補貨自動化：850/855/856/810，經 VAN 或 AS2。
- **優先評估借道既有 DMS / iPaaS**，而非自建 EDI（自建要養 VAN、map、憑證，維運成本高）。
- 保固索賠：對接原廠提報與回覆狀態，串回我們的 `warranty_claim_receivables`。

### 架構紀律
- 不論最終走 SFTP / EDI / API，**對 UI 都應該長一樣**——資料來源切換不該動到頁面。
- 建議把「原廠連接器」抽成一個 `oem_connector` 介面（manual / sftp / edi / api 四種實作），符合本專案 Domain Helper 天條：UI 只認 helper、來源實作可隨時換。

---

## 四、給海德生的四個具體提問（拿到答案才能規劃 Phase 2）

1. Polaris 是否支援 **EDI**？支援哪些交易集（850/855/856/810/832）？走 VAN 還是 AS2？
2. 是否提供 **SFTP / 平面檔**的 Price Book 與零件可用量 feed？格式與更新頻率？
3. **保固索賠**的提報與回覆是走 Portal 人工、還是有結構化（EDI/檔案）管道？
4. 海德生目前有沒有在用任何 **powersports DMS**（Lightspeed / DX1 等）？若有，能否借既有整合層，省去從零對接？

---

*本回覆為 Partner AI Agent 之專業判斷，供 Russell 後續規劃參考。*
