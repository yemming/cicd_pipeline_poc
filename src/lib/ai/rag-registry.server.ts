/**
 * RAG ingestion registry — server only
 *
 * 把 client-safe 的 SOURCE_META 跟 server 端的 serialize 函式配對。
 * 加新 source：
 *   1. 改 rag-registry.ts SOURCE_META push 一筆（icon/label/href）
 *   2. 改 rag-serialize.ts 寫一個 serialize 函式
 *   3. 改這個檔的 SERIALIZE_BY_TYPE 對應
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import * as S from '@/lib/ai/rag-serialize';
import type { SerializedChunk } from '@/lib/ai/rag-serialize';
import { SOURCE_META } from '@/lib/ai/rag-registry';

type SerializeFn = (sb: SupabaseClient, id: string) => Promise<SerializedChunk | null>;

/**
 * source_type → DB table name + serialize fn。
 * 沒在這裡的 source（如 manual）走自己的 ingestion pipeline，不參與 reindex。
 */
const SERIALIZE_BY_TYPE: Record<string, { table: string; serialize: SerializeFn }> = {
  repair_order: { table: 'repair_orders', serialize: S.serializeRepairOrder },
  final_inspection: { table: 'final_inspections', serialize: S.serializeFinalInspection },
  customer: { table: 'customers', serialize: S.serializeCustomer },
  handcard_voice: { table: 'handcard_voice_notes', serialize: S.serializeHandcardVoiceNote },
  business_card: { table: 'business_card_scans', serialize: S.serializeBusinessCardScan },
  einvoice: { table: 'einvoices', serialize: S.serializeEinvoice },
  sales_order: { table: 'sales_orders', serialize: S.serializeSalesOrder },
  sales_lead: { table: 'sales_leads', serialize: S.serializeSalesLead },
  sales_handcard: { table: 'sales_handcards', serialize: S.serializeSalesHandcard },
  appointment: { table: 'appointments', serialize: S.serializeAppointment },
  work_order: { table: 'work_orders', serialize: S.serializeWorkOrder },
  pre_inspection: { table: 'pre_inspections', serialize: S.serializePreInspection },
  customer_vehicle: { table: 'customer_vehicles', serialize: S.serializeCustomerVehicle },
  new_car_inventory: { table: 'new_car_inventory', serialize: S.serializeNewCarInventory },
  used_car_inventory: { table: 'used_car_inventory', serialize: S.serializeUsedCarInventory },
  sales_test_drive: { table: 'sales_test_drives', serialize: S.serializeSalesTestDrive },
  sales_quote: { table: 'sales_quotes', serialize: S.serializeSalesQuote },
  delivery: { table: 'deliveries', serialize: S.serializeDelivery },
  warranty_claim: { table: 'warranty_claims', serialize: S.serializeWarrantyClaim },
  // 2026-06-18 Russell 裁示：parts_warranty_claim 改從 warranty_claims 序列化（原 parts_warranty_claims 已退役）
  parts_warranty_claim: { table: 'warranty_claims', serialize: S.serializePartsWarrantyClaim },
  insurance_policy: { table: 'insurance_policies', serialize: S.serializeInsurancePolicy },
  item: { table: 'items', serialize: S.serializeItem },
};

export type IngestableSource = {
  type: string;
  table: string;
  serialize: SerializeFn;
};

/** 給 reindex 用：依 SOURCE_META 順序 + serialize fn pair */
export const INGESTABLE_SOURCES: IngestableSource[] = SOURCE_META.flatMap((meta) => {
  const cfg = SERIALIZE_BY_TYPE[meta.type];
  return cfg ? [{ type: meta.type, table: cfg.table, serialize: cfg.serialize }] : [];
});

export function getIngestable(type: string): IngestableSource | undefined {
  const cfg = SERIALIZE_BY_TYPE[type];
  return cfg ? { type, table: cfg.table, serialize: cfg.serialize } : undefined;
}
