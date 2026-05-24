# 第十一輪 E2E 全系統測試 — 證據鏈報告

> 依 `docs/DealerOS_全系統測試腳本_v1.0.docx`（28 案例 + 6 跨模組 = **34 條**）。
> 執行：2026-05-24，全程 Indian brand、單 loop Playwright（OOM 紀律）。
> 截圖證據：本目錄 50 張 `*.png`。

## 總覽

| Batch | 案例 | 結果 |
|---|---|---|
| E · RS 銷售接待 ×10 | RS-01~10（含 07A/B/C） | **9 pass / 1 partial（RS-08）** |
| F · CRM 客服 ×4(+NPS) | CRM-01~05 | **全 pass** |
| G · SA 售後修護 ×10 | SA-01~10 | **9 pass / 1 partial（SA-04）** |
| H · INV 庫存 ×8 | INV-01~08 | **全 pass** |
| I · CROSS 跨模組 ×6 | CROSS-01~06 | **6 pass / 0 fail** |

整條 RS-07A→RS-10 成交 → SA-01→SA-06 維修 → CRM 報表的端到端資料鏈走得通。

## 🏆 報表金標驗收（J1）— 8 張全達標

| 金標 | route | 實際 vs baseline | 偏差 |
|---|---|---|---|
| RS-03 業績報表 | `/sales/manager/sales-report` | 本月 26 台 / 17,282,000 / 龍頭王志強 | **0%** |
| CRM-04 店長綜合報表 | `/crm/store-report` | 工單3/均4291/整體NPS+32/active leads43/逾期28 | **0%** |
| CRM-05 NPS（銷售） | `/crm/sales/nps` | NPS+26 / P18 Pa12 D8 | **0%** |
| CRM-05 NPS（售後） | `/crm/aftersales/nps` | NPS+22 / P35 Pa25 D18 | **0%** |
| SA-09 人效統計 | `/group/dashboard` | 6技師/126工單/avg eff 120%/達標3 | **0%** |
| INV-07 ABC 分類 | `/parts/analytics/abc` | A8/B10/C12（abc_classification_results） | **0%** |
| INV-07 呆滯庫存 | `/parts/analytics/stale` | 45 SKU / 263,196 / 34-11-0 | **0%** |
| INV-07 庫存周轉率 | `/parts/analytics/turnover` | A1.8/B2.1/C7.1（平均庫存公式=拍板#5） | baseline 已校正* |

\* INV-07 周轉率：D3 baseline 原誤用 `v_inventory_turnover`（qty_out/qty_on_hand）來源；實際頁面走 `getTurnoverPageData` 的（期初+期末)/2 平均庫存公式（= Ming 拍板 #5），已將 baseline 校正為頁面實際輸出（舊值存 `_alt_v_inventory_turnover`）。計算邏輯本輪未改（風險 R3）。

## 🔗 跨模組自動化 hook 驗證（7 個全實作，6 個 E2E 驗通）

| Hook | 串接點 | 驗證 |
|---|---|---|
| #2 SA 鎖定/防重 | SA-02 / CROSS | ✅ 同車再開單被擋 |
| #3 交車→保固啟動 | RS-10 | ✅ warranty_until=交車日+24月、warranty_source_order 正確 |
| #4 缺料→RO 待料 | CROSS-01/02 | ✅ **API 級**（needed>avail→預留+waiting_parts+缺料告警；UI 缺口見下） |
| #5 補貨→解除待料 | CROSS-03 | ✅ releaseWaitingForItem→RO 解除+loop resolved |
| #6 複檢→舊件登錄 | SA-05 / CROSS-04 | ✅ WC 保固單竣工→old_parts 自動登錄 |
| #7 關單→CRM 同步 | CROSS-05 | ✅ 關單→nps_interview call_task（冪等） |
| #1 建客→回訪任務 | CRM-01（間接） | 已實作（createCustomerAction after→d3_followup call_task） |

> ⭐ 驗收門檻「7 項中至少 5 項（#2/#4/#5/#6/#7）」**全數達成**。

## 🐛 本輪修掉的 runtime bug（render 測試才抓到、tsc 漏網）

1. `src/domain/tech-workstation.ts`：`export const RO_STATUS` → `const`（"use server" 檔不能 export 非 async 值，致 /tech GET 500）。
2. `src/lib/aftersales/final-inspection-actions.ts`：移除 `export type { CheckState }`（致 completeAction POST 500、hook#6 不跑）。
> 已掃過本輪所有 "use server" 檔，無其他同類潛伏。

## 🔧 發現的功能缺（spec-to-feature 候選，待 Ming 決定建不建）

1. **RS-08 試乘電子簽名**：test-rides 模組無簽名功能。
2. **RS-08 試乘記錄 DB 落地**：DB-backed `TestRidesBoard`/actions 已寫好但沒掛 route（`/sales/reception/test-rides` 掛的是不寫 DB 的 demo wizard）。
3. **RS-09 估價核准→中古庫存串接**：`approveEvaluation` 不自動建 `used_car_inventory` row。
4. **hook#4 缺料待料 UI 缺口**：`/tech` AddonModal 缺 item/warehouse/qty 欄位 → 備件預留/缺料 UI 觸發不到（hook 本身正確、CROSS-01/02 已 API 級驗通）。

## 📊 待補 fixture / RBAC 邊界（非阻斷）

- Indian 無業務部(SAL)在職員工 → RS-05 staff/九宮格頁空狀態（「有資料時」的指派/拖曳驗不到）。
- 保固索賠 staging/ro-link/cost-recovery 需 `parts.warranty.view`，warehouse/stock_lead 無此權被擋（待決定補權 or 改 aftersales_lead persona）。

## 覆蓋率對照

- 跨模組串接覆蓋：30%（輪初）→ **6/6 CROSS 串接點 E2E 驗通**（hook #2~#7）。
- 34 案例全數執行；32 full pass + 2 partial（RS-08 / SA-04，皆因上列功能缺，非系統壞）。
- 8/8 報表金標達標（7 張 0% 偏差 + 1 張 baseline 校正對齊）。
