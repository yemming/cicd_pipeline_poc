# Side Effect Checklist

階段 1-2 自動分析時，掃 HTML / 描述抓副作用線索。階段 3 用這份問用戶確認。

副作用 = 寫一張表以外的事。Domain helper 內部要不要走 RPC / server action 全看這個。

## 線索掃描關鍵字

從 UI 文案 / button alert / hint text 找這些字眼：

| 看到這些 | 推測副作用 |
|---|---|
| 「審核通過後 / 提交後 / 完成後」 | 狀態機推進 + 跨表寫入 |
| 「自動回沖 / 自動扣減 / 自動退款」 | 跨表事務（庫存 / 帳務） |
| 「LINE 通知 / Email 通知 / 推播」 | 走 notification hub `notifications.dispatch()` |
| 「審核 / 加簽 / 簽核」 | 觸發業務規則驗證 + 通知下個審核者 |
| 「物流追蹤 / 出貨單 / 運單」 | 寫物流子表 + 可能呼外部 API |
| 「對帳 / 沖銷 / 結轉」 | 寫會計分錄 |
| 「同步至 NetSuite / 推到 NetSuite」 | 走 NetSuite MCP / 中臺 |
| 「審計記錄 / 變更歷史 / 操作日誌」 | 寫 audit log 表 |
| 「水位告警 / 庫存不足通知」 | 觸發告警系統 |
| 「上傳 / 附件 / 照片」 | 寫 storage + 可能寫 attachments 表 |
| 「批次匯入 / 匯出 Excel」 | 走 import / export 流程 |

## 副作用分類

### A. 跨表事務（必須原子）

例：審核採購退貨 → `purchase_returns.status = approved` + `inventory_adjustments` 寫入庫存回沖

**處理**：domain helper 內部走 supabase RPC（DB function 內部 BEGIN/COMMIT），或升級到 server action 包事務。

提案要寫：

```markdown
## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| approvePurchaseReturn(id) | UPDATE purchase_returns + INSERT inventory_adjustments + 推 LINE 給供應商 | 確定（畫面寫「審核通過後庫存自動回沖」）+ [需確認] 通知範圍 |
```

### B. 通知（推 LINE / Email）

例：建單後通知主管、審核完成後通知申請人

**處理**：domain helper 內部走 server action（client 沒 LINE token）。Server action 用 Next 16 `after()` 非阻塞：

```ts
import { after } from "next/server";
import { notifications } from "@/lib/notifications";

export async function approvePurchaseReturnAction(id: string) {
  // 1. UPDATE 主表
  // 2. 跨表寫入
  after(async () => {
    await notifications.dispatch({
      code: "purchase_return.approved",
      payload: { id, ... },
    });
  });
  return { ok: true };
}
```

提案要寫：

- 推給誰（角色 / 個人 / 群組）
- 推什麼通路（LINE / Email / 站內）
- 是否要等推送完成才回（通常不要 — 用 `after()`）

⚠️ 通知 event code 要問用戶，例如 `purchase_return.approved` vs `purchase_return.status_changed`。

### C. 業務規則驗證

例：建採購單 → 套採購權限規則驗證金額是否超 role 上限 → 超了走加簽流程

**處理**：domain helper 內部 read `business_rules` + 驗證 + 決定要不要 reject 或進加簽：

```ts
export async function createPurchaseOrder(input: PurchaseOrderInput) {
  const rule = await getApplicableRule('purchase_authority', {
    role: currentUser.role,
    subsidiary: input.subsidiary_id,
  });
  if (rule.config.max_single_amount && input.total > rule.config.max_single_amount) {
    if (!rule.config.require_supervisor_approval) {
      return { ok: false, error: '超過你的採購上限' };
    }
    // 進加簽流程
    input.status = 'pending_supervisor_approval';
  }
  // ... 寫入
}
```

⚠️ 規則類副作用通常**還沒落地**（business_rules 表還沒建），提案時標 [Phase 2 後可實作]。

### D. Audit log

例：「所有狀態變更要記」、「改門店資料要留紀錄」

**處理**：通常走 DB trigger 自動寫 audit_log 表，不在 domain helper 處理（除非很客製）。

提案先標 [需確認] — 用戶可能說「現在不做」。

### E. 外部 API（NetSuite / 物流 / 金流）

例：「同步至 NetSuite」、「呼物流 API 取得運單號」

**處理**：domain helper 內部走 server action，server action 內部呼外部 API。提案要列 API 來源（NetSuite MCP / 自建 fetch / n8n）。

⚠️ 外部 API 副作用通常 [Phase 3 之後]，提案時標出但不在這次落地。

### F. Cache 失效

例：list 頁建單後要立刻看到、跨頁狀態同步

**處理**：domain helper 寫入後呼 `revalidatePath('/...')`（如果是 server action）；client side 走 `router.refresh()` 或 `mutate`（SWR / react-query）。

通常**不算 [需確認]**，預設處理即可。

## 提案 Template

```markdown
## 4. 副作用清單

| 動作 | 副作用類型 | 細節 | 確定性 |
|---|---|---|---|
| createPurchaseReturn | 無（Day 1 純寫單表） | - | 確定 |
| approvePurchaseReturn | A 跨表事務 | UPDATE purchase_returns + INSERT inventory_adjustments | 確定（畫面：「審核通過後庫存自動回沖」） |
| approvePurchaseReturn | B 通知 | 推 LINE 給申請人 | [需確認] 範圍 |
| approvePurchaseReturn | E 外部 | 同步至 NetSuite | [Phase 3 後再做] |
| createPurchaseReturn | D Audit | 寫 audit_log | [需確認] 用戶要不要 |
```

## 階段 3 問用戶的標準題

對每個 [需確認] 副作用，AskUserQuestion 問：

```
Q: <action> 動作要不要 <副作用>？
   - 要（會影響：<具體影響>）
   - 不要（這次先不做、未來 Phase X 再加）
```

一次最多問 4 題。如果副作用太多分批問。

## 反例 — 不要這樣做

❌ **沒問用戶就替他寫副作用**：
- 建單一定要推 LINE 嗎？可能用戶要靜默
- 「審核通過自動回沖」是不是這次就要做？可能 Phase 1 先做狀態機、Phase 2 才接庫存

❌ **副作用全寫在 client component**：
- Client 沒 LINE token、API 暴露
- 副作用必須走 server side

❌ **把副作用放錯層**：
- DB trigger 寫 audit log（OK）
- DB trigger 推 LINE（不行，DB 不該打外部 API）
- Domain helper 內部直接 fetch LINE API（不行，client 沒 token）

## Day 1 預設策略

Phase 1 落地時，**所有副作用標 [Phase 2 後再做]**，先做純資料 CRUD，跑得起來再回頭加。

例：採購退貨 Phase 1 只做：
- create 寫 `purchase_returns` + `purchase_return_items`
- update status 純改 status 欄位、不接庫存回沖

Phase 2 才升級 `approvePurchaseReturn` helper 內部，接庫存 + 推通知。

⭐ **這是 user 最在意的「快」的關鍵**：副作用後做、不要為了完整性卡住主流程。
