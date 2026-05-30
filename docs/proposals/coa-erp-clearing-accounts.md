# COA 擴充提案：ERP 結帳閉環所需清算科目

> 依 CLAUDE.md「COA 規格使用規則」：本提案列出 ERP 財務脊椎（P2P/O2C 過帳）需要的新 L5 子科目。
> **等 Ming 審核同意後才執行 INSERT**。絕不自動建 L5（違反 `03_design_principles.md §11`）。
> 日期：2026-05-28 ・ 關聯計畫：`~/.claude/plans/erp-netsuite-memoized-chipmunk.md`

## 為什麼需要這些科目

報表脊椎的過帳鏈用「GR/IR 清算」把**收貨**與**收發票**解耦（NetSuite 標準作法）：

```
進貨(GRN) → Dr 存貨 / Cr GR/IR          ← 收到貨、還沒收到發票
廠商發票   → Dr GR/IR + Dr 進項稅 / Cr 應付帳款   ← 收到發票，清掉 GR/IR
（發票價 ≠ 進貨成本時）差額 → 採購價差 PPV
```

沒有 GR/IR，存貨會被重複借（GRN 借一次、發票又借一次），存貨對帳永遠對不平。
現有 COA **沒有** GR/IR、PPV、應付營業稅淨額這三類，需新增。

## 提案新增的 L5 子科目（皆為可過帳 L5_DETAIL、is_locked=false、is_active=true）

| 用途 | 建議 account_code | parent_code | name_zh_tw | l1_category | moea_code | normal_balance | dealer_category | 急迫度 |
|---|---|---|---|---|---|---|---|---|
| **GR/IR 清算** | `2170106` | `21701` 應付帳款 | 進貨未取得發票（GR/IR 暫估應付） | LIABILITY | 2170 | C | GENERAL | **P2 必須** |
| **採購價差 PPV** | `5100304` | `51003` 存貨損失 | 採購價差（PPV） | COGS | 5100 | D | GENERAL | P2 可延後（先設容差） |
| **應付營業稅淨額** | `2250102` | `22501` 銷項稅額 | 應付營業稅（申報淨額） | LIABILITY | 2250 | C | GENERAL | 後續輪（VAT_FILING 才用） |

備註：
- code 皆 7 碼、prefix 對齊 parent（符合 `03 §12` 檢查表）。
- GR/IR 若想依品類分流（車輛/零件各一），可改為 `2170106 車輛`＋`2170107 零件`，請 Ming 定奪。預設一個 GENERAL 即可。
- 三者 `required_dimensions` 建議 `["SUBSIDIARY"]`（清算/稅務科目不綁 VEHICLE/PART 細維度，避免過帳卡關）。
- `ai_tags`：GR/IR `{"kpi_role":"grir_clearing","benchmarkable":false}`；PPV `{"profit_attribution":"purchase_variance","benchmarkable":true}`；VAT `{"regulatory_flag":"vat_special"}`。

## 簽核後落地步驟（待 Ming 同意）

1. INSERT 上述 3 筆 L5（單一 migration，tenant 全帶 `e4cd1ac2-…`）。
2. 回填 `system_accounting_settings`：`grir_coa_id`／`ppv_coa_id`／`vat_payable_coa_id`（欄位已於 `erp_p0_je_subsidiary_and_settings_clearing_cols` 建好，目前為 null）。
3. 之後 P2 的 transaction_types（VENDOR_BILL 等）才用 `system_default` resolver 指到這些科目。

## 等待簽核 @Ming

- [ ] 同意 3 個科目的 code / 命名 / 分類？
- [ ] GR/IR 要單一 GENERAL 還是車輛/零件分流？
- [ ] PPV、應付營業稅淨額 是否本輪一起建，或延到實際用到時再建？
