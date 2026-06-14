/**
 * Domain Helper — RO 法律憑證 PDF 持久化（RP4 Layer3）
 *
 * 在工單關單（completeAction）時呼叫，把結帳憑證 PDF
 * 生成並存到 Supabase Storage `ro-documents` bucket（私有）。
 * 取用時走 createSignedUrl（有效 60 分鐘）。
 *
 * 設計決策：
 * - render.ts 在本機 dev 可能因 @sparticuz/chromium 無法啟動而失敗，
 *   走 try/catch 吞錯，不讓 PDF 持久化失敗阻斷關單主流程。
 * - Storage 用 service client（繞 RLS），因為這是系統內部寫入。
 * - 路徑：{brand}/repair-orders/{roId}/closeout-{timestamp}.pdf
 * - URL 存進 ro_checkouts.metadata.closeout_pdf_url（jsonb，升降級規則達標再 promote）
 * - 同一 RO 若重複呼叫（冪等保護）：先查 metadata，有 URL 就直接回傳，不重複生成。
 */

import "server-only";

import { headers } from "next/headers";

import { createServiceClient } from "@/lib/supabase/service";
import { renderPdf } from "@/lib/pdf/render";

export const RO_DOCUMENTS_BUCKET = "ro-documents";

/** 取結帳憑證 PDF 的暫時存取 URL（signed URL，60 分鐘有效） */
export async function getCloseoutPdfSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  try {
    const sb = createServiceClient();
    const { data, error } = await sb.storage
      .from(RO_DOCUMENTS_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch (e) {
    console.error("[ro-documents] createSignedUrl 失敗", e);
    return null;
  }
}

/**
 * 主函式：生成 RO 結帳憑證 PDF 並持久化到 Storage。
 *
 * @param roId         - repair_orders.id
 * @param checkoutId   - ro_checkouts.id
 * @param brand        - brand_id（用於 Storage 路徑隔離）
 * @param appOrigin    - App 的外部 origin（給 puppeteer goto /print/repair-order/{roId}）
 * @returns            - storagePath（Storage 內的相對路徑）或 null（失敗時）
 *
 * 呼叫方（ro-checkout-actions.ts completeAction）應在 after() 非阻塞呼叫，
 * 並把回傳的 storagePath 寫進 ro_checkouts.metadata.closeout_pdf_url。
 */
export async function persistRepairOrderPdf(params: {
  roId: string;
  checkoutId: string;
  brand: string;
  appOrigin: string;
  /** 把 user auth cookie 帶給 puppeteer（print route 需要登入）。
   *  不傳時自動從 next/headers 讀當前 request 的 cookie header。 */
  cookieHeader?: string;
}): Promise<{ storagePath: string; signedUrl: string } | null> {
  const { roId, checkoutId, brand, appOrigin } = params;

  // 自動讀取 request cookie（after() 在 request lifecycle 結束後執行，next/headers 仍可讀）
  let cookieHeader = params.cookieHeader ?? "";
  if (!cookieHeader) {
    try {
      const hdrs = await headers();
      cookieHeader = hdrs.get("cookie") ?? "";
    } catch {
      // 不在 request context（unit test / 手動呼叫）→ 留空
    }
  }

  try {
    // 1) 冪等：先查 metadata，有 storagePath 就直接生 signed URL 回傳
    const sb = createServiceClient();
    const { data: existing } = await sb
      .from("ro_checkouts")
      .select("metadata")
      .eq("id", checkoutId)
      .maybeSingle();

    const prevMeta = (existing?.metadata ?? {}) as Record<string, unknown>;
    if (typeof prevMeta.closeout_pdf_storage_path === "string") {
      // 已有 PDF，重新簽 URL 回傳
      const signedUrl = await getCloseoutPdfSignedUrl(prevMeta.closeout_pdf_storage_path);
      if (signedUrl) {
        return { storagePath: prevMeta.closeout_pdf_storage_path, signedUrl };
      }
      // signed URL 生成失敗 → 繼續重新生成 PDF
    }

    // 2) 呼叫 puppeteer 對 /print/repair-order/{roId} 截圖產 PDF buffer
    const printUrl = `${appOrigin}/print/repair-order/${roId}`;
    const pdfBuffer = await renderPdf({ url: printUrl, cookieHeader });

    // 3) 上傳到 Storage（私有 bucket）
    const timestamp = Date.now();
    const storagePath = `${brand}/repair-orders/${roId}/closeout-${timestamp}.pdf`;

    const { error: uploadErr } = await sb.storage
      .from(RO_DOCUMENTS_BUCKET)
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false, // 不覆蓋；若 timestamp 相同（極罕見），讓它報錯
      });

    if (uploadErr) {
      console.error("[ro-documents] PDF 上傳失敗", uploadErr.message);
      return null;
    }

    // 4) 生成 signed URL（60 分鐘）
    const signedUrl = await getCloseoutPdfSignedUrl(storagePath);

    // 5) 把 storagePath（非 signed URL，URL 會過期）存回 metadata
    //    下次需要時重新 sign，storagePath 是持久的。
    await sb
      .from("ro_checkouts")
      .update({
        metadata: {
          ...prevMeta,
          closeout_pdf_storage_path: storagePath,
          // 同時存最新 signed URL（快取用，60 分鐘過期，服務側刷新）
          closeout_pdf_url: signedUrl ?? null,
          closeout_pdf_generated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", checkoutId);

    console.log(`[ro-documents] RO ${roId} 結帳憑證 PDF 已持久化：${storagePath}`);
    return signedUrl ? { storagePath, signedUrl } : null;
  } catch (e) {
    console.error("[ro-documents] persistRepairOrderPdf 失敗（不阻斷關單）", e);
    return null;
  }
}
