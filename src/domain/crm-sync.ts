"use server";

/**
 * Domain Helper — CRM 360 同步（BDN #16 / RS01 電子手卡 → CRM01A）
 *
 * 場景：handcard-form.tsx 是 client-only useState 表單（BDN #15 確認沒接 DB）。
 *      使用者按「儲存並送出」後，把 handcard 主要欄位序列化成 snapshot，
 *      試著寫進對應 customer row 的 metadata.last_handcard_snapshot。
 *
 * 三種結果：
 *   - 找到 customer 並寫入成功         → { ok: true, mode: 'db', customer_id }
 *   - 找不到 customer（demo 階段常態）  → { ok: true, mode: 'demo', reason }
 *   - DB / schema 出錯                  → { ok: false, error }
 *
 * 紀律：sync 是 onSave 的 side effect，**永遠不擋使用者流程**。
 *       即使這個 helper 整個炸了，UI 應該 catch 後當作 warn、讓使用者繼續。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

export type HandcardSnapshot = {
  at: string; // ISO timestamp
  identity?: string;
  customer_name?: string;
  customer_phone?: string;
  lead_source?: string;
  intent_model?: string;
  intent_year?: string;
  intent_color?: string;
  buy_timing?: string;
  trial_status?: string;
  habc_grade?: string;
  intent_level?: number;
  quote_status?: string;
  quote_amount?: string;
  follow_date?: string;
  follow_method?: string;
  tags?: string[];
  visit_note?: string;
  need_note?: string;
  competitor_1?: string;
  competitor_2?: string;
  visit_result?: string;
  lost_reason?: string;
};

export type CrmSyncResult =
  | { ok: true; mode: "db"; customer_id: string }
  | { ok: true; mode: "demo"; reason: string }
  | { ok: false; error: string };

function normalizePhone(phone: string | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-()]/g, "").trim();
  return cleaned || null;
}

export async function upsertCustomer360(
  snapshot: HandcardSnapshot,
): Promise<CrmSyncResult> {
  try {
    // 沒任何識別資訊 → demo
    const phone = normalizePhone(snapshot.customer_phone);
    const name = snapshot.customer_name?.trim() || null;
    if (!phone && !name) {
      return { ok: true, mode: "demo", reason: "no identifiers in snapshot" };
    }

    const supabase = await createClient();
    let scope;
    try {
      scope = await getActiveScope();
    } catch {
      // 沒 session / 沒 scope → 直接 demo
      return { ok: true, mode: "demo", reason: "no active scope" };
    }
    const brand = scope.brand_id;

    // 查 customer：phone 優先、name fallback
    let customerId: string | null = null;

    if (phone) {
      const { data, error } = await supabase
        .from("customers")
        .select("id, metadata")
        .eq("brand_id", brand)
        .eq("phone", phone)
        .limit(1)
        .maybeSingle();
      if (error) {
        // schema / 權限問題：當 demo，不擋使用者
        return { ok: true, mode: "demo", reason: `lookup by phone failed: ${error.message}` };
      }
      if (data) customerId = data.id;
    }

    if (!customerId && name) {
      const { data, error } = await supabase
        .from("customers")
        .select("id, metadata")
        .eq("brand_id", brand)
        .eq("name", name)
        .limit(1)
        .maybeSingle();
      if (error) {
        return { ok: true, mode: "demo", reason: `lookup by name failed: ${error.message}` };
      }
      if (data) customerId = data.id;
    }

    if (!customerId) {
      return { ok: true, mode: "demo", reason: "no matching customer" };
    }

    // 撈現有 metadata 再 merge（避免覆蓋其他 key）
    const { data: existing, error: fetchErr } = await supabase
      .from("customers")
      .select("metadata")
      .eq("id", customerId)
      .single();
    if (fetchErr) {
      return { ok: false, error: `fetch metadata failed: ${fetchErr.message}` };
    }

    const prevMetadata = (existing?.metadata as Record<string, unknown> | null) ?? {};
    const nextMetadata = {
      ...prevMetadata,
      last_handcard_snapshot: snapshot,
    };

    const { error: updateErr } = await supabase
      .from("customers")
      .update({ metadata: nextMetadata })
      .eq("id", customerId);

    if (updateErr) {
      return { ok: false, error: `update metadata failed: ${updateErr.message}` };
    }

    return { ok: true, mode: "db", customer_id: customerId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
