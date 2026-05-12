# Refactor B1 — Client-side `createClient` 清光

**日期**：2026-05-12
**範圍**：3 個 client component 直接 `@/lib/supabase/client` 走 anon key 的違規
**Batch**：B1（5-batch Helper 債清理計畫的第一批）

---

## 1. Audit 結果

| 檔案 | 行 | 操作 | 表 | 歸屬 helper |
|---|---|---|---|---|
| `src/app/(workspace)/sales/card/counter/page.tsx` | 94-99 | `auth.getSession()` + `profiles.select(name).eq(id).single()` | `profiles` | **新建** `src/domain/users.ts` — `getCurrentUserProfile()` |
| `src/components/feedback/canvas-editor-impl.tsx` | 72-75 | `feedback_canvas_snapshots.upsert({ ticket_id, snapshot })` | `feedback_canvas_snapshots` | **新建** `src/domain/feedback-canvas.ts` — `saveFeedbackCanvasSnapshot()` |
| `src/components/feedback/canvas-panel-impl.tsx` | 72-75 | 同上（邏輯一模一樣） | 同上 | 同上 |

合計違規行：3 處（兩 canvas 共用同一邏輯、合併成一個 helper function）

## 2. 改寫計畫

### A. 新建 `src/domain/feedback-canvas.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";

export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * 儲存 feedback ticket 的 Excalidraw canvas snapshot
 * upsert by ticket_id（每張 ticket 只保留一份最新 snapshot）
 */
export async function saveFeedbackCanvasSnapshot(
  ticketId: string,
  snapshot: Json,
): Promise<Result<null>> {
  if (!ticketId) return { ok: false, error: "缺 ticketId" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback_canvas_snapshots")
    .upsert({ ticket_id: ticketId, snapshot });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/feedback/tickets/${ticketId}`);
  return { ok: true, data: null };
}
```

### B. 新建 `src/domain/users.ts`

```ts
"use server";

import { createClient } from "@/lib/supabase/server";

export type CurrentUserProfile = {
  id: string;
  email: string | null;
  name: string | null;
};

/**
 * 取得當前登入 user 的 profile（含 id / email / profiles.name）
 * client component 透過 server action 呼叫
 */
export async function getCurrentUserProfile(): Promise<CurrentUserProfile | null> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    name: profile?.name ?? null,
  };
}
```

### C. UI 改 import

**`canvas-editor-impl.tsx` (L13 + L72-82)**:

```diff
- import { createClient } from "@/lib/supabase/client";
+ import { saveFeedbackCanvasSnapshot } from "@/domain/feedback-canvas";

  const save = useCallback(async () => {
    ...
    const snapshot = { elements, appState: cleanAppState, files };
-   const supabase = createClient();
-   const { error } = await supabase
-     .from("feedback_canvas_snapshots")
-     .upsert({ ticket_id: ticketId, snapshot });
-   if (error) {
+   const res = await saveFeedbackCanvasSnapshot(ticketId, snapshot as unknown as Json);
+   if (!res.ok) {
      console.error("[feedback] save failed", res.error);
      setStatus("error");
    } else {
      setStatus("saved");
    }
  }, [ticketId]);
```

**`canvas-panel-impl.tsx` (L13 + L72-77)**：同樣模式（更短、沒 console.error）：

```diff
- const supabase = createClient();
- const { error } = await supabase
-   .from("feedback_canvas_snapshots")
-   .upsert({ ticket_id: ticketId, snapshot });
- setStatus(error ? "error" : "saved");
+ const res = await saveFeedbackCanvasSnapshot(ticketId, snapshot as unknown as Json);
+ setStatus(res.ok ? "saved" : "error");
```

**`sales/card/counter/page.tsx` (L7 + L94-103)**：

```diff
- import { createClient } from "@/lib/supabase/client";
+ import { getCurrentUserProfile } from "@/domain/users";

  useEffect(() => {
    ...
-   const supabase = createClient();
-   supabase.auth.getSession().then(async ({ data: { session } }) => {
-     const user = session?.user;
-     if (!user) { setCurrentUserName("—"); return; }
-     const { data: profile } = await supabase
-       .from("profiles").select("name").eq("id", user.id).single();
-     const name = profile?.name ?? user.email ?? "—";
+   getCurrentUserProfile().then((profile) => {
+     if (!profile) { setCurrentUserName("—"); return; }
+     const name = profile.name ?? profile.email ?? "—";
      setCurrentUserName(name);
      setReceptionStaff(STAFF_LIST.find(s => s === name) ?? "");
    });
  }, []);
```

## 3. 風險

- **行為一致性**：3 個檔的功能性結果一致（同樣 query、同樣 mutation）— 改 server action 後等於用 user RLS scope（server 拿到的也是同一 cookie 的 session），不會繞權限
- **效能**：server action 多一輪 round-trip（client → server → DB），原本是 client → DB 一輪。canvas save 用戶感知差 ~50-150ms，可接受；counter useEffect 在 mount 時跑一次、不影響後續互動
- **不動 server actions**：既有 `src/lib/feedback-actions.ts` 等不動（裡面沒這兩個操作）
- **不改 DB / RLS**：純 layer 替換、行為不變

## 4. 不動

- 不刪既有 server actions
- 不改 DB schema / RLS / nav_nodes
- 不改視覺 / 業務邏輯（純 layer 替換）

## 5. 驗證

1. `npx tsc --noEmit` 0 errors
2. `npx eslint src/domain/feedback-canvas.ts src/domain/users.ts src/components/feedback src/app/\(workspace\)/sales/card/counter` 0 errors
3. `grep -rn "@/lib/supabase" src/app/\(workspace\)/sales/card/counter src/components/feedback`  **必須 0 hit**
4. Chrome MCP smoke：
   - `/feedback/tickets/{id}` 開 canvas → 畫一筆 → Cmd+S → 確認 saved
   - `/sales/card/counter` → 確認 useEffect 顯示當前 user name
