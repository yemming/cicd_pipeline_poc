# DealerOS 售後修護×庫存管理 — 退料閉環與借用測試工單補充修改指令
**日期：2026-06-16　｜　Russell Hung → Partner AI Agent**
**性質：跨模組補充修改，售後修護模組與庫存管理模組必須同步執行**

---

## 給 Partner AI Agent 的前置說明（必讀）

本文件處理兩個相互關聯的問題，必須同時解決：

### 問題一：退料閉環缺失（影響售後修護模組 + 庫存管理模組）

現有退料流程在系統點擊「取消追加項目」或「取消工單」後，庫存數量**立即**回補，但完全沒有倉管確認「料件實際歸還庫房」的步驟。

**後果：** 系統顯示庫存 +2 個煞車皮，但物理上那2個煞車皮還在技師工具箱裡或車間地板上。庫存數字不可信，盤點必然出現差異。

### 問題二：借用測試工單缺失（影響售後修護模組 + 庫存管理模組）

業界存在「技師借料診斷/測試」的真實場景。目前系統沒有這個流程，技師只能用正式出庫方式借料，借出後沒有閉環歸還機制，也無法處理「借3退2轉1」的複合場景。

### 為什麼要一起解決

兩個問題共用同一個「倉管確認入口」（`/parts/receipt/return-in` 的新增 Tab）和同一張 `parts_return_requests` 表。分開做會讓倉管面對兩個不同的操作入口，增加混亂。

---

## 修改影響範圍總覽

| 模組 | 需要修改的路由 | 需要修改的 domain 檔案 | 新增 DB 結構 |
|------|------------|------------------|-----------|
| 售後修護 | `/parts/aftersales/repair-orders/**`（工單頁加 TL 類型）| `repair-orders.constants.ts` | 無需新表，用 metadata |
| 售後修護 | `/parts/aftersales/repair-orders/[id]/tl-close`（新頁面）| `repair-order-actions.ts` | 無需新表 |
| 售後修護 | `/parts/aftersales/repair-orders/[id]/addons`（追加項目）| `repair-order-addon-actions.ts` | 無需新表 |
| 庫存管理 | `/parts/receipt/return-in`（新增 Tab B）| `parts-return-in` domain | `parts_return_requests` 表（新建）|

---

## 第一部分：退料閉環

### 場景一：追加項目整筆取消

**業務過程：** 技師從庫房領出煞車皮×2，客戶反悔，SA點「取消追加項目」。

**現有問題：** `cancelAddonAction` 直接把 `stock_items.status` 從 `issued` 改回 `available`。庫存立即回補，但料件還在技師手上。

**正確流程：**
```
SA 點取消追加項目
        ↓
系統建立「退料待確認記錄」（parts_return_requests）
stock_item 標記為 return_pending（不是 available）
        ↓
倉管在 /parts/receipt/return-in 的 Tab B 看到待確認記錄
實物核對後點「確認收到」
        ↓
庫存才真正回補（stock_item 改為 available）
```

---

### 場景二：追加項目部分取消（現有系統完全沒有）

**業務過程：** 追加項目包含「煞車皮×2 + 煞車油×1 + 工時0.5LU」，客戶只想退煞車油，其餘繼續。

**現有問題：** `cancelAddonAction` 只能整筆取消，無法逐行取消。

**需要新增：** `partialCancelAddonLineAction`，允許 SA 選取特定明細行取消，其他保持 agreed 繼續施工。

---

### 場景三：整張工單取消（現有系統完全漏洞）

**業務過程：** 技師已領出機油×4L + 濾芯×1 + 火星塞×4個，客戶臨時取消工單。

**現有問題：** `cancelRepairOrderAction` 只把工單狀態改為「已取消」，完全沒有處理已出庫的零件。9樣零件永遠懸空在 `issued` 狀態，庫存永遠少9樣。

---

### 場景四：技師領料後說用不到

**業務過程：** 技師領出火星塞×4，施工後確認不需要更換，想退回庫房。

**現有問題：** 沒有標準流程，技師可能把料件放回，但倉管不知道，庫存不會更新。

---

### 新建 DB 表：parts_return_requests

```sql
-- 先確認不存在：SELECT to_regclass('public.parts_return_requests');
CREATE TABLE IF NOT EXISTS parts_return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source_type TEXT NOT NULL,
  -- 'addon_cancel'   追加項目整筆取消
  -- 'addon_partial'  追加項目部分取消（明細行層）
  -- 'ro_cancel'      整張工單取消
  -- 'tech_unused'    技師用不到主動退料
  -- 'tl_return'      借用測試工單歸還

  source_ro_id UUID REFERENCES repair_orders(id),
  source_addon_id UUID,
  source_line_id UUID,

  item_id UUID NOT NULL,
  part_name TEXT NOT NULL,
  part_code TEXT,
  qty_requested NUMERIC(14,3) NOT NULL,
  qty_confirmed NUMERIC(14,3),

  return_type TEXT NOT NULL DEFAULT 'full_return',
  -- 'full_return'     完整退料，庫存回補
  -- 'damage_writeoff' 損耗核銷，庫存不回補

  status TEXT NOT NULL DEFAULT 'pending',
  -- 'pending'   待倉管確認
  -- 'confirmed' 已確認收到
  -- 'overdue'   逾期未確認（系統自動標記）

  requested_by UUID REFERENCES users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  return_reason TEXT,

  confirmed_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  warehouse_note TEXT,

  due_by TIMESTAMPTZ NOT NULL,
  -- 當天下班時間（從 system_settings.closing_time 計算）

  overdue_notified_at TIMESTAMPTZ,

  brand_id TEXT NOT NULL,
  store_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE parts_return_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY prr_select ON parts_return_requests FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY prr_insert ON parts_return_requests FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY prr_update ON parts_return_requests FOR UPDATE USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY prr_delete ON parts_return_requests FOR DELETE USING (user_has_brand(brand_id));
```

---

### 修改一：cancelAddonAction（`repair-order-addon-actions.ts`）

```typescript
// full_return 分支的修改：
// 不再直接更新庫存，改為建立退料待確認記錄

if (cancelMode === 'full_return') {

  // 1. 查詢已出庫零件
  const { data: issuedItems } = await supabase
    .from('stock_items')
    .select('id, item_id, qty, unit_cost, metadata')
    .eq('brand_id', brand)
    .eq('status', 'issued')
    .filter('metadata->>source_addon_id', 'eq', id);

  for (const si of issuedItems ?? []) {

    // 2. 建立退料待確認記錄
    await supabase.from('parts_return_requests').insert({
      source_type: 'addon_cancel',
      source_ro_id: cur.ro_id,
      source_addon_id: id,
      item_id: si.item_id,
      part_name: cur.name,
      qty_requested: si.qty,
      status: 'pending',
      requested_by: currentUserId,
      return_reason: `追加項目「${cur.name}」取消退料`,
      due_by: await getTodayClosingTime(),
      brand_id: brand
    });

    // 3. stock_item 標記為 return_pending，不改回 available
    await supabase.from('stock_items').update({
      status: 'return_pending',
      updated_at: now
    }).eq('id', si.id);
  }

  // 4. 費用明細從工單移除（這個可以立即執行，費用和庫存分開處理）
  // ... 原有的 repair_order_lines 刪除邏輯保留 ...
}
```

---

### 修改二：新增 partialCancelAddonLineAction

```typescript
// 新增 action：允許逐行取消追加項目
export async function partialCancelAddonLineAction(
  addonId: string,
  lineIds: string[],           // 要取消的明細行 ID 列表
  reasons: Record<string, string>  // 各行取消原因
): Promise<ActionResult<{ created_rts_ids: string[] }>> {

  // 對每個指定的明細行：
  // 1. 更新 repair_order_lines 的狀態為 cancelled（不刪除，留稽核記錄）
  // 2. 若此行有對應的已出庫 stock_item，建立 parts_return_requests
  // 3. 其他未選取的明細行保持不變，繼續施工
}
```

**售後模組 UI 規格（追加項目記錄頁）：**

目前追加項目只能整筆取消，需要在 agreed 狀態的追加項目明細行旁加入逐行勾選：

```
追加項目（agreed 已同意）：
┌─────────────────────────────────────────────┐
│ ☐ 煞車皮 × 2    NT$2,400                    │
│ ☑ 煞車油 × 1    NT$800    ← 勾選此行取消    │
│ ☐ 工時 0.5LU   NT$600                      │
└─────────────────────────────────────────────┘
[取消勾選項目] ← 只取消勾選的行，其餘不動
```

---

### 修改三：cancelRepairOrderAction（`repair-order-actions.ts`）

```typescript
export async function cancelRepairOrderAction(id: string, reason?: string) {

  // ... 原有授權驗證邏輯保留 ...

  // ── 新增：批次建立退料待確認記錄 ──
  const { data: issuedItems } = await supabase
    .from('stock_items')
    .select('id, item_id, qty, metadata')
    .eq('brand_id', brand)
    .filter('metadata->>source_ro_id', 'eq', id)
    .eq('status', 'issued');

  if (issuedItems && issuedItems.length > 0) {
    const dueBy = await getTodayClosingTime();

    // 批次建立退料待確認記錄
    await supabase.from('parts_return_requests').insert(
      issuedItems.map(si => ({
        source_type: 'ro_cancel',
        source_ro_id: id,
        item_id: si.item_id,
        part_name: si.metadata?.part_name ?? '未知零件',
        qty_requested: si.qty,
        status: 'pending',
        requested_by: currentUserId,
        return_reason: `工單取消：${reason ?? '未說明'}`,
        due_by: dueBy,
        brand_id: brand
      }))
    );

    // 批次更新 stock_items 狀態
    await supabase.from('stock_items')
      .update({ status: 'return_pending' })
      .in('id', issuedItems.map(si => si.id));
  }

  // ... 原有工單狀態更新邏輯保留 ...
}
```

---

### 修改四：庫存模組 — `/parts/receipt/return-in` 新增 Tab B

**現有 Tab A（採購退貨入庫）：保留，不動。**

**新增 Tab B（售後退料確認）：**

```
Tab A：採購退貨（現有，不改）
Tab B：售後退料確認（新增）← 本次重點
```

Tab B UI 規格：

```
售後退料待確認
──────────────────────────────────────────
篩選條件：
  來源類型：[全部][追加取消][工單取消][技師退料][TL歸還]
  狀態：[待確認][已逾期]

──────────────────────────────────────────
RO-MN-260616-001（今日 17:30 截止）

  煞車皮 × 2    申請人：張SA    14:32
  ⚠️ 剩餘 3 小時
  實際收到數量：[2___]
  零件狀態：[◉ 完整可入庫] [○ 損耗需核銷]
  備註：[________]
  [確認收到]

──────────────────────────────────────────
已逾期（紅色區塊）

RO-RP-260616-003（已逾期 2 小時）
  火星塞 × 4    申請人：李SA    09:15
  [確認收到] [損耗核銷]
```

**倉管確認後的系統動作：**

```typescript
async function confirmReturnRequestAction(
  requestId: string,
  confirmedQty: number,
  returnType: 'full_return' | 'damage_writeoff',
  note?: string
) {
  // 1. 更新 parts_return_requests
  await db.parts_return_requests.update({
    status: 'confirmed',
    qty_confirmed: confirmedQty,
    confirmed_by: currentUserId,
    confirmed_at: new Date(),
    return_type: returnType,
    warehouse_note: note
  });

  if (returnType === 'full_return') {
    // 2a. 庫存回補
    await db.stock_items.update({ status: 'available' });

  } else {
    // 2b. 損耗核銷
    await db.inventory_writeoffs.insert({
      item_id: request.item_id,
      qty: confirmedQty,
      writeoff_reason: note,
      source_ro_id: request.source_ro_id,
      brand_id: brand
    });
    // stock_item 不回補，標記 written_off
  }

  // 3. 寫入 audit_logs
  await writeAuditLog({ action: 'RETURN_REQUEST_CONFIRMED', request_id: requestId });
}
```

---

### 修改五：逾期通知 cron job

```typescript
// 每15分鐘掃描，找出逾期未確認的退料記錄
async function scanOverdueReturnRequests() {
  const { data: overdue } = await db.parts_return_requests
    .where({ status: 'pending' })
    .where('due_by', '<', new Date());

  for (const req of overdue) {
    await db.parts_return_requests.update({ status: 'overdue' });
    await sendNotification({
      target_role: 'aftersales_lead',
      type: 'return_request_overdue',
      message: `退料待確認已逾期：${req.part_name} × ${req.qty_requested}，工單 ${req.source_ro_id}`
    });
    await writeAuditLog({ action: 'RETURN_REQUEST_OVERDUE', id: req.id });
  }
}
```

---

## 第二部分：借用測試工單（TL）

### 問題說明

業界存在「技師借料診斷/測試」的場景：
- 借出3款感應器測試，確認後安裝1款，退回2款
- 借出零件給客戶試裝展示，客戶當場決定買單（1款轉正式工單）
- 借出機油試看是否合適，試完退回

目前系統：沒有這個流程，技師只能用正式出庫，無法標記「臨時性質」，也無法處理部分轉正式工單、部分退料的複合場景。

### TL 工單設計原則

1. **完全沿用現有工單框架**（`repair_orders` 表、現有路由），最小化改動
2. **SA + 技師雙簽開立**（防濫用，形成約束）
3. **不強制關聯其他工單或客戶**（因為真實場景可能是獨立的測試行為）
4. **當天下班前必須結案**（借料不能過夜）
5. **結案時逐行決定處置**（轉正式工單 / 退料 / 向車主收費 / 門店吸收）
6. **車主簽名只有在「向車主收費」時才強制要求**

---

### 修改六：`repair-orders.constants.ts` — 新增 TL 前綴碼

```typescript
// PrefixP1 型別新增 TL
export type PrefixP1 = "MN" | "RP" | "WC" | "AC" | "OT" | "PD" | "TL";

// PREFIX_P1_DEFS 新增
{ code: "TL", name: "借用測試", desc: "Test & Loan · 臨時借出診斷/測試，當天必須結案" },

// PREFIX_COMBO_RULES 新增（TL 只有一種合法組合）
{ p1: "TL", p2: "IN", verdict: "valid", accounting: "EXPENSE",
  description: "✅ TL-IN 借用測試 · 內部借出，費用依結案處置決定" },

// 一車多工單規則補充（在現有的 concurrent 檢查邏輯裡）：
// TL 工單與任何其他類型並存 → 不觸發告警（因為 TL 就是為了「測試後決定要不要正式做」）
// 只有 TL + TL 才觸發告警（同台車不應有兩張借料工單）
```

---

### 修改七：TL 工單的 metadata 結構

不需要改 schema，沿用現有 `repair_orders.metadata jsonb`：

```typescript
// TL 工單開立時寫入 metadata.tl_config
{
  tl_config: {
    loan_purpose: string,           // 借出目的（必填）
    related_ro_id: string | null,   // 關聯正式工單（選填）
    related_customer_id: string | null, // 關聯客戶（選填）

    // SA 簽名
    sa_signature_url: string,       // 存 Supabase Storage
    sa_signed_at: string,

    // 技師簽名
    tech_signature_url: string,     // 存 Supabase Storage
    tech_signed_at: string,

    // 時限
    due_by: string,                 // 當天下班時間

    // 結案摘要（結案後填入）
    closed_summary: {
      transferred_lines: string[],  // 轉入正式工單的明細行 ID
      returned_lines: string[],     // 退料的明細行 ID
      charged_lines: string[],      // 向車主收費的明細行 ID
      absorbed_lines: string[]      // 門店吸收的明細行 ID
    } | null
  }
}

// TL 工單的每個 repair_order_line.metadata 記錄處置方式
{
  tl_disposition: {
    decision: 'transfer_to_ro' | 'return_to_stock' | 'charge_customer' | 'absorb_internally' | 'pending',
    target_ro_id: string | null,        // 若轉入正式工單
    customer_signature_url: string | null, // 若向車主收費
    decided_at: string | null,
    decided_by: string | null
  }
}
```

---

### 修改八：售後模組 — TL 工單開立頁面

**現有路由：** `/parts/aftersales/repair-orders/new`

在「選擇業務類型」加入 TL 選項，選擇 TL 後顯示特殊表單：

```
業務類型：[MN][RP][WC][AC][OT][PD][TL ← 新增]

選擇 TL 後顯示：
┌──────────────────────────────────────────────┐
│ 📋 借用測試工單（TL）                           │
│                                              │
│ 借出目的（必填）：                              │
│ [測試煞車感應器型號是否相容___________]          │
│                                              │
│ 關聯正式工單（選填）：[搜尋工單號]               │
│ 關聯客戶（選填）：[搜尋車牌/手機]                │
│                                              │
│ ⚠️ TL 工單規則提醒：                            │
│  • 必須當天下班前完成結案                        │
│  • 所有借出料件必須有明確的處置方式               │
│  • SA 與技師須各自電子簽名確認                   │
│                                              │
│ SA 確認簽名                                   │
│ [Canvas 電子簽名區]                            │
│ 「我確認此借料測試有必要性，並負責追蹤結案」        │
│                                              │
│ 技師 確認簽名                                  │
│ [Canvas 電子簽名區]                            │
│ 「我確認借出料件由我負責保管，當天下班前歸還或處置」 │
│                                              │
│ [兩人均已簽名後，開立 TL 借用測試工單]           │
└──────────────────────────────────────────────┘

注意：雙簽完成後才能開立工單，開立後才能到
/parts/issue/repair-pick 正常領料
```

---

### 修改九：售後模組 — TL 工單結案頁面（新增頁面）

**新增路由：** `/parts/aftersales/repair-orders/[id]/tl-close`

TL 工單不走「竣工複檢→結帳」流程，有自己的結案頁：

```
TL 借用測試工單結案
工單：TL-IN-260616-001
借出目的：測試煞車感應器型號是否相容

━━━ 零件明細（每行選擇處置方式）━━━

煞車感應器 A 型 × 1（料號 IND-12345）
[◉ 轉入正式工單] [○ 退料歸還] [○ 向車主收費] [○ 門店吸收]
  目標工單：[RO-RP-260616-005___]

煞車感應器 B 型 × 1（料號 IND-12346）
[○ 轉入正式工單] [◉ 退料歸還] [○ 向車主收費] [○ 門店吸收]

煞車感應器 C 型 × 1（料號 IND-12347）
[○ 轉入正式工單] [◉ 退料歸還] [○ 向車主收費] [○ 門店吸收]

━━━ 工時明細（每行選擇處置方式）━━━

診斷工時 1.0 LU（NT$800）
[○ 轉入正式工單] [○ 向車主收費 →需補車主簽名] [◉ 門店吸收]

━━━ 結案摘要預覽 ━━━
  轉入正式工單 RO-RP-260616-005：感應器 A × 1
  退料歸還（建立退料待確認）：感應器 B × 1、感應器 C × 1
  門店吸收（不收費）：診斷工時 NT$800

[確認結案]
```

**結案 action 邏輯：**

```typescript
async function closeTlWorkOrderAction(
  roId: string,
  lineDispositions: Array<{
    lineId: string,
    decision: 'transfer_to_ro' | 'return_to_stock' | 'charge_customer' | 'absorb_internally',
    targetRoId?: string,
    customerSignatureUrl?: string
  }>
) {
  for (const d of lineDispositions) {
    if (d.decision === 'transfer_to_ro') {
      // 把此明細行複製到目標工單
      // 庫存的 stock_issue_line 關聯改到目標工單

    } else if (d.decision === 'return_to_stock') {
      // 建立 parts_return_requests（和修改一、三相同機制）
      await db.parts_return_requests.insert({
        source_type: 'tl_return',
        source_ro_id: roId,
        source_line_id: d.lineId,
        ...
      });
      // stock_item → return_pending

    } else if (d.decision === 'charge_customer') {
      // 必須有車主簽名才能執行
      if (!d.customerSignatureUrl) {
        return { ok: false, error: '向車主收費必須補充車主簽名' };
      }
      // 建立收費記錄

    } else if (d.decision === 'absorb_internally') {
      // 費用記錄為 FR，不向車主收費
      // 料件若已用掉→核銷；若未用→建立退料待確認
    }
  }

  // 所有明細都處置完畢，關閉 TL 工單
  await updateRepairOrderStatus(roId, '已關單');
  await writeAuditLog({ action: 'TL_RO_CLOSED', ro_id: roId });
}
```

---

### 修改十：逾期未結案的 TL 工單通知

在修改五的 cron job 裡補充：

```typescript
// 距當天下班1小時，TL 工單尚未結案
const { data: pendingTL } = await db.repair_orders
  .where({ prefix_p1: 'TL' })
  .whereIn('status', ['進行中', '維修中'])
  .where('metadata->>tl_config->>due_by', '<', addHours(closingTime, -1));

for (const ro of pendingTL) {
  await sendNotification({
    target_role: 'aftersales_lead',
    type: 'tl_ro_closing_soon',
    message: `借用測試工單 ${ro.ro_number} 距下班1小時，請督促 SA 完成結案`
  });
}
```

---

## 動手前必須確認的事項

```
□ stock_items.status 允許值是否可以擴充？
  需要新增：'return_pending'（退料待確認中）
  確認方式：查詢現有的 status check constraint 或 enum

□ system_settings 是否有 closing_time 欄位？
  getTodayClosingTime() 需要從這裡讀取
  若無，需要新增此設定欄位

□ TL 工單的一車多工單規則是否在現有 concurrent 邏輯裡正確處理？
  TL + 任何類型 = 允許（不告警）
  TL + TL = 告警（不常見但需要防範）

□ /parts/receipt/return-in 新增 Tab B 是否會影響現有 Tab（採購退貨）？
  確認只是新增 Tab，不修改現有邏輯

□ TL 工單結案頁「轉入正式工單」時，stock_issue_lines 的 ro_id 是否可以更新？
  確認此操作不違反現有的庫存稽核規則
```

---

## 回覆格式要求

**所有項目完成才能回覆 Russell，不接受分批。**

```markdown
# 退料閉環與 TL 借用測試工單修補完成報告
日期：YYYY-MM-DD

## 動手前確認清單
- [ ] stock_items.status 可以新增 return_pending：✅/❌（說明）
- [ ] system_settings.closing_time 欄位：✅已存在 / ❌需新增（說明）
- [ ] TL 一車多工單規則已確認
- [ ] return-in Tab B 不影響現有 Tab A

## 退料閉環完成確認
- [ ] parts_return_requests 表建立（截圖Schema + RLS）
- [ ] cancelAddonAction 修改（不直接更新庫存）
- [ ] partialCancelAddonLineAction 新增
- [ ] cancelRepairOrderAction 修改（批次建立 RTS）
- [ ] /parts/receipt/return-in Tab B 新增
- [ ] 倉管確認 action 實作
- [ ] 逾期通知 cron job

## TL 借用測試工單完成確認
- [ ] TL 前綴碼新增（constants + COMBO_RULES）
- [ ] TL 工單開立頁面（SA+技師雙簽）
- [ ] TL 工單結案頁面（逐行處置）
- [ ] TL 歸還自動建立 parts_return_requests
- [ ] TL 逾期未結案通知

## 截圖索引
（每個修改至少一張，對應角色帳號實拍）

## 特別說明
（任何無法實作的項目或需要進一步討論的地方）
```

---

*DealerOS 機密文件　｜　Russell Hung　｜　2026-06-16*
