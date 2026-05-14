# 提案：銷售模組 — 展廳接待 — 試乘試駕（RS02）

> 來源：nav_node `2e0ec5a3-705c-43c6-8b93-d1059c8abbff`（indian brand）
> HTML：`nav-html/indian/2e0ec5a3-705c-43c6-8b93-d1059c8abbff.body.html`
> 日期：2026-05-14
> 階段：架構提案（自決完成、直接落地）

## 1. 結構摘要

試乘試駕 4 步驟 wizard：(1) 試駕基本登記（客戶、駕照、車款、路線、意向）(2) 試駕前安全確認 14 項 checklist（分客戶 / 車輛 / 說明三類）(3) 試駕計時（含里程與陪同方式）(4) 試駕結果評估＋黃金時刻 CTA（推報價）。流程上承 RS01 電子手卡、下接 RS04 報價單。

## 2. Schema 草案

**Day 1 不建表**。本頁定位為 pure client wizard（同 `/sales/reception/handcard`），所有狀態僅存於 React state，儲存按鈕只顯示 toast。

未來接資料時建議的表（**僅備忘、不落地**）：
- `test_rides` — 主表（客戶、車款、日期、結果評分、意向變化）
- `test_ride_safety_checks` — checklist 14 項紀錄
- 跟 `customers` / `vehicles_inventory` FK

## 3. Domain Helper 規劃

**Day 1 不建 helper**。沒有 DB 互動就沒有 helper（手卡頁就是純 client 範本，沒踩 helper 規範）。

只新增 `*.constants.ts` 放 wizard 用的靜態選項清單（車款、路線、客戶意向、安全項目等）— 不放 `src/domain/`，放在 component 同層 `_components/test-rides.constants.ts`，因為 sales 模組目前 constants 都在 _components 旁邊。

## 4. 副作用清單

無。Day 1 全部 toast、無寫入、無通知、無推 LINE。

## 5. 會計事件分析

**無** — 試乘試駕是售前接待流程、不產生資金 / 庫存 / 收入 / 費用 / AR / AP 變動。

未來若試駕產生「車輛里程累積」造成庫存車殘值調整（攤折），那是別張卡的事，不在本頁範圍。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 試乘試駕 | `/sales/reception/test-rides` | Wizard Form（4 step） | `src/app/(workspace)/sales/reception/handcard/_components/handcard-form.tsx` |

## 7. nav_nodes 變更

```sql
UPDATE nav_nodes
   SET page_kind = 'react_route',
       href      = '/sales/reception/test-rides'
 WHERE id = '2e0ec5a3-705c-43c6-8b93-d1059c8abbff';
-- 只 indian brand（parent 743bdde8 只在 indian 存在）
```

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/app/(workspace)/sales/reception/test-rides/page.tsx` |
| 新增 | `src/app/(workspace)/sales/reception/test-rides/_components/test-rides-form.tsx` |
| 新增 | `src/app/(workspace)/sales/reception/test-rides/_components/test-rides.constants.ts` |
| 更新 | `nav_nodes` UPDATE 一筆（indian）|

## 9. Verification

1. `tsc --noEmit` 0 errors
2. `eslint <touched>` 0 errors
3. `grep -rn "@/lib/supabase" src/app/\(workspace\)/sales/reception/test-rides` = 0 hit
4. Playwright CLI：login → goto `/sales/reception/test-rides` → 截圖確認 4 step bar + STEP 1 表單可見 → 點 STEP 2 切換 → 點全部 OK 進度跑到 100% → 截圖

## 10. 自決決策

- **不接 DB**：跟兄弟頁 handcard 一致；DealerOS POC 階段這類售前流程先 UI-only、未來真要存資料另起一張卡
- **不建 domain helper**：沒 DB 互動就沒 helper（天條不適用）
- **constants 放 _components 旁**：跟 handcard 同位置（雖然 handcard 把 constants 內聯在 form.tsx，這次拆出來方便讀）
- **單 brand**：parent 只在 indian 存在，不雙 brand
- **Wizard step 切換用 client state**：不走 URL `?step=N`（同 handcard 不走 URL）
