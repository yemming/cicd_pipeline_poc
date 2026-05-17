# 提案：BDN #20 RS05 交車管理 — 簽名必填校驗

> 來源：BDN #20（夜跑第三輪）
> 日期：2026-05-16
> 階段：短提案（純前端 UI 驗證，跳過 5 階段中的 DB / Helper / Schema）

## 1. 結構摘要

RS05 STEP 4「✅ 確認完成交車」按鈕目前無校驗 — 三方簽名（技師 / RS / 客戶）可以全部跳過就按完成。本功能在點下確認按鈕時加 client-side 校驗：缺任何一個就跳紅色 toast banner 列出缺項、不執行 confirmDelivery。

## 2. 現況實作觀察（影響規格細節）

- 規格描述「base64 長度 > 100 視為已簽」，但**實際 code 簽名儲存的是日期字串**（`signatures: Record<SignatureRole, string | null>`），來自 `doSign()` 的 `new Date().toLocaleDateString("zh-TW")`。
- 採適合實際模型的判定：`!!signatures[role]` 為 true 即視為「已簽」。語義跟「按鈕被點過 = 已簽」一致，與 SignatureCanvas 公用元件無關（SignatureCanvas 只用在 BDN #8 文件交付段）。
- 不動 SignatureCanvas、不改 `doSign` 行為、不改 `signatures` state 型別。

## 3. 修改點

| 檔案 | 改動 |
|---|---|
| `src/app/(workspace)/sales/delivery/_components/delivery-form.tsx` | 加 `validateSignatures()` + 改 toast 支援 variant + 改 `confirmDelivery` |

僅一個檔。

## 4. 實作細節

### A. 擴充 toast 為支援 variant

`toast` state 從 `string | null` 升級為 `{ msg: string; variant: 'info' | 'error' } | null`。`showToast(msg, variant?)` 預設 `info`、call site 不動可向後相容。

### B. 加 `validateSignatures()` helper

```ts
function validateSignatures(): string[] {
  const missing: string[] = [];
  if (!signatures.customer) missing.push("客戶簽名");
  if (!signatures.rs) missing.push("RS 簽名");
  if (!signatures.tech) missing.push("技師簽名");
  return missing;
}
```

順序依規格「客戶 / RS / 技師」。

### C. `confirmDelivery` 加守門

```ts
function confirmDelivery() {
  const missing = validateSignatures();
  if (missing.length > 0) {
    showToast(`⚠️ 尚有簽名未完成：${missing.join(" / ")}`, "error");
    return;
  }
  setDeliveryConfirmed(true);
  setDoneSteps(new Set([1, 2, 3, 4]));
  showToast("🎉 交車完成！D+3 回訪任務已排程 CRM03A · 2026-06-04");
}
```

### D. toast JSX 依 variant 切色

- `info`：原 `bg-[#1A3A5C] text-white`（不動）
- `error`：`bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]`（規格給的 token）

紅 banner 不自動消失？規格沒明說、依 CLAUDE.md design pattern「失敗 banner 不自動關」 → 但本實作 reuse `showToast` 的 setTimeout、為避免改太多 + 簡化 UX，**保留 2.8s 自動消失**（用戶讀完缺項列表 2.8s 足夠）。Ming 如要改成不自動消失再說。

## 5. 副作用

無。純前端、無 DB、無 Helper、無權限變動。

## 6. 不動

- BDN #8 文件交付段（docSignature / docDeliveredAt / handleDocSigned）
- SignatureCanvas 公用元件
- `doSign()` / `signatures` state 結構
- delivery-store.tsx

## 7. 驗證

- tsc / eslint 0
- helper audit `grep -rn "@/lib/supabase" ...`（本檔本來就 0 hit，但跑一次保險）
- Playwright headless：
  1. 進 /sales/delivery → 點 PDI 完成、交車確認、保固完成走到 step 4
  2. 不簽任何 → 點「✅ 確認完成交車」→ assert toast 紅底 + 列三項
  3. 簽客戶 → 點完成 → assert 列剩兩項（RS / 技師）
  4. 三張都簽 → 點完成 → assert 「🎉 交車完成」toast、`dlv-confirmed` 出現
- 截圖 `tmp/bdn20-{1,2,3,4}.png`、script `scripts/verify-signature-validate.mjs`
