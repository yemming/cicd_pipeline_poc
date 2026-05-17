# Feature: RS05 隨車文件點交清單（擴充 delivery-form.tsx）

**Source**: BDN 第三輪 #8 / `docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS05_交車管理_v1.html` §「隨車文件點交清單」
**Status**: Phase 1+ Landed（auto-approved，夜跑授權）
**Date**: 2026-05-16

---

## 1. 結構分析

既有 `delivery-form.tsx`（827 行）是 4-step wizard：

| Step | 內容 | 已有實作 |
|---|---|---|
| 1 | PDI 整備（29 項勾選） | ✅ |
| 2 | 客戶交車確認表（36 項勾選） | ✅ |
| 3 | 保固條款 + 三方簽名（tech / rs / customer） | ✅（簽名只記日期、未拿 dataURL） |
| 4 | 完成交車 + HANDOVER_DOCS 顯示 | ⚠️ 只是 6 個 chip 卡，沒勾選 / 沒簽收 |

`HANDOVER_DOCS` constant（6 項）只是裝飾性 grid，**沒有任何互動**。本任務是把這段升級成 spec 要求的 **8 項勾選 + 客戶簽收 canvas + 交付日期**。

### Spec 8 項對比現有 HANDOVER_DOCS

| Spec 8 項（任務） | 現有 HANDOVER_DOCS（6 項） | 對齊策略 |
|---|---|---|
| 1. 行照 / 牌照 | 🪪 行照 / 保險卡 | reuse、改 name |
| 2. 強制險保單 | （新增） | 加 |
| 3. 保固卡 | 📜 保固條款書（車主聯） | reuse |
| 4. 維修手冊 | 📖 車主手冊 / 隨車配件箱 | reuse、改 name |
| 5. 鑰匙 ×N（數量） | 🗝️ 車鑰匙（正副鑰匙） | reuse + 加 keys_count |
| 6. 工具包 | （新增） | 加 |
| 7. 充電器 / 隨車工具 | （新增） | 加 |
| 8. 客戶證件影本 | （新增） | 加 |

決策：**不刪掉原 6 項 HANDOVER_DOCS chip**（它的 PDI 副本 / 交車確認表副本是現場交付的副件 reference）；**獨立加一個新 `HANDOVER_DOCS_V2` 8 項勾選 list** 在它上面，互動段。

## 2. 架構提案（auto-approved）

### 2.1 資料

8 項常數 + state shape：

```ts
// delivery.constants.ts 新增
export type HandoverDocItem = {
  id: string;
  icon: string;
  label: string;
  hint?: string;
};

export const HANDOVER_DOC_ITEMS: HandoverDocItem[] = [
  { id: "license_plate",   icon: "🪪", label: "行照 / 牌照",          hint: "辦牌後交付" },
  { id: "compulsory_ins",  icon: "📋", label: "強制險保單",            hint: "保險公司核發" },
  { id: "warranty_card",   icon: "📜", label: "保固卡",                hint: "Ducati 原廠" },
  { id: "service_manual",  icon: "📖", label: "維修手冊",              hint: "車主使用手冊" },
  { id: "keys",            icon: "🗝️", label: "車鑰匙（含備用）",       hint: "依數量點交" },
  { id: "tool_kit",        icon: "🔧", label: "隨車工具包",            hint: "原廠配件" },
  { id: "charger_or_tool", icon: "⚡", label: "充電器 / 隨車工具",     hint: "電車充電器 or 油車隨車工具" },
  { id: "id_copy",         icon: "🆔", label: "客戶證件影本",          hint: "辦牌存檔" },
];
```

`delivery-form.tsx` 內 state（沿既有 React.useState 風格，不接 DB）：

```ts
const [docChecked, setDocChecked] = useState<Set<string>>(new Set());
const [keysCount, setKeysCount] = useState(2);          // 預設 2 把（正副）
const [docSignature, setDocSignature] = useState<string | null>(null); // base64 dataURL
const [docDeliveredAt, setDocDeliveredAt] = useState(""); // ISO date
```

### 2.2 「DB shape」設計（未來 hookup 時的 jsonb 路徑）

當 deliveries table 落地時，本段資料一律塞 `deliveries.metadata.document_handover`：

```json
{
  "document_handover": {
    "checked": ["license_plate", "warranty_card", "..."],
    "keys_count": 2,
    "signature_base64": "data:image/png;base64,...",
    "delivered_at": "2026-06-01"
  }
}
```

理由：8 項 + 簽名是「單頁專用、純顯示、形狀可能再變」→ 走 jsonb（CLAUDE.md §資料存取架構升降級規則）。本輪不開新表、不寫 helper。

### 2.3 UI

新增 section「📋 隨車文件點交清單（8 項）」插在 Step 4 既有 `🎉 恭喜！交車完成` 卡 與 `📦 隨車文件點交清單` chip grid **之間**。

5 個 block：
1. Panel header（icon `📋`、iconBg `bg-[#EAF4FB]`、title「隨車文件點交清單（8 項）」、sub「逐項勾選 + 客戶簽收」、badge `{N}/8`）
2. 8 項 checkbox grid（reuse `<CheckItem>`）
3. 鑰匙數量 input（min=1 max=10 number input）
4. 交付日期 input（type date）
5. 簽名 canvas（reuse `@/components/signature-canvas` `<SignatureCanvas>`）+ 簽名後顯示 `<img>` preview + 「清除」button

### 2.4 校驗

- 8 項至少 6 項勾才能 submit（spec 寬鬆預設）
- 簽名 + 交付日期都填才算「文件交付完成」
- 完成後 banner toast「✅ 隨車文件點交完成」

第一版**不阻擋 `confirmDelivery()`**——即使這 section 沒做完也能按「✅ 確認完成交車」（避免 demo 流程卡住）。未來接 DB 時再加 hard validation。

### 2.5 簽名 pad

**不 inline 自刻**——既有 `@/components/signature-canvas` 元件已存在、API 簡單（`onSigned={(dataUrl) => ...}`），直接 reuse。

- 任務文字寫「reuse #6 proposal 的 canvas pad 寫法 ~50 行 inline」——但既然共用元件已落地、reuse 比 inline 還少 code、零過度工程
- RS04 proposal 也提及共用 `<ContractSignaturePad>`，本任務 reuse 同一個元件 = 統一往「~/components/signature-canvas」單一來源走（後續可改 prop / 視覺）

## 3. 落地細節

### 改的檔案

1. `src/app/(workspace)/sales/delivery/_components/delivery.constants.ts`
   - 加 export `HandoverDocItem` type + `HANDOVER_DOC_ITEMS` (8 項)

2. `src/app/(workspace)/sales/delivery/_components/delivery-form.tsx`
   - import `SignatureCanvas` from `@/components/signature-canvas`
   - import `HANDOVER_DOC_ITEMS`
   - 加 state: docChecked / keysCount / docSignature / docDeliveredAt
   - 加 toggleDoc / clearDocSig
   - Step 4 內加新 Panel「📋 隨車文件點交清單（8 項）」

### 測試

`scripts/verify-delivery-documents.mjs`：
- Playwright headless
- 登入 → /sales/delivery
- 走完 step 1/2/3（用 `dlv-pdi-all` / `dlv-del-all` / 3 個 sign button 快速完成）
- Step 4 進入後 → 截圖 `tmp/bdn8-step4-initial.png`
- 點 8 個 checkbox → 截圖 `tmp/bdn8-step4-checked.png`
- 改鑰匙數量、填日期、畫簽名（canvas mouse events）→ 截圖 `tmp/bdn8-step4-signed.png`

## 4. 不在範圍

- ❌ 不新增 deliveries 表 / migration
- ❌ 不寫 server action / domain helper（保持 client-only wizard demo）
- ❌ 不做 signed PDF 輸出
- ❌ 不抽簽名 pad 公用元件（已存在 `@/components/signature-canvas`、用就好）
- ❌ 不動 nav_nodes / 不 commit
