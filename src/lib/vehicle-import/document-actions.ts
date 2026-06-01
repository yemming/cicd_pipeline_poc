"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { DOC_TYPE_STAGE } from "@/domain/import-documents.constants";

export type DocumentActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type DocumentInput = {
  doc_type?: string;
  shipment_id?: string | null;
  purchase_order_id?: string | null;
  vehicle_id?: string | null;
  doc_no?: string | null;
  issued_by?: string | null;
  issued_date?: string | null;
  stage?: string | null;
  file_url?: string | null;
};

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) return { error: "請先登入" };
  if (!isAdmin) return { error: "需要 admin 權限" };
  return { userId };
}

const FIELDS = [
  "shipment_id",
  "purchase_order_id",
  "vehicle_id",
  "doc_no",
  "issued_by",
  "issued_date",
  "stage",
  "file_url",
] as const;

function buildPatch(input: DocumentInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const k of FIELDS) {
    if (typeof input[k] !== "undefined") {
      const v = input[k];
      patch[k] = v === "" ? null : v;
    }
  }
  return patch;
}

export async function createDocumentAction(
  input: DocumentInput,
): Promise<DocumentActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  const docType = input.doc_type?.trim();
  if (!docType) return { ok: false, error: "請選擇文件類型" };

  const brandId = (await getActiveScope()).brand_id;
  const sb = createServiceClient();
  const patch = buildPatch(input);
  // stage 沒給就依 doc_type 推斷
  if (patch.stage == null && DOC_TYPE_STAGE[docType]) patch.stage = DOC_TYPE_STAGE[docType];

  const { data, error } = await sb
    .from("import_documents")
    .insert({ ...patch, doc_type: docType, brand_id: brandId, created_by: gate.userId })
    .select("id")
    .single();
  if (error) return { ok: false, error: `建立失敗：${error.message}` };
  revalidatePath("/vehicle-import/documents", "page");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updateDocumentAction(
  id: string,
  input: DocumentInput,
): Promise<DocumentActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const sb = createServiceClient();
  const patch = buildPatch(input);
  if (typeof input.doc_type !== "undefined" && input.doc_type) patch.doc_type = input.doc_type;
  const { error } = await sb.from("import_documents").update(patch).eq("id", id);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };
  revalidatePath("/vehicle-import/documents", "page");
  return { ok: true, data: { id } };
}

export async function deleteDocumentAction(
  id: string,
): Promise<DocumentActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const sb = createServiceClient();
  const { error } = await sb.from("import_documents").delete().eq("id", id);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath("/vehicle-import/documents", "page");
  return { ok: true, data: { id } };
}
