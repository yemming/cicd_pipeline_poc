/**
 * 列印文件 letterhead 共用 context — brand 顯示名 + buyer 法人抬頭。
 * 給 vehicle-import 三張列印（import-po / landed-cost-statement / vehicle-cost-card）共用，
 * 避免每張各自重撈 subsidiaries。
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PrintBrandInfo = { key: string; displayName: string };
export type PrintBuyerInfo = {
  legalName: string;
  taxId?: string | null;
  address?: string | null;
  phone?: string | null;
};

// brand registry 是 client-side 靜態資料、不能 server import；兩個品牌直接對映
const BRAND_DISPLAY_NAME: Record<string, string> = {
  ducati: "Ducati Taiwan",
  indian: "Indian Motorcycle Taiwan",
};

export function brandDisplayName(brandId: string): string {
  return BRAND_DISPLAY_NAME[brandId] ?? brandId;
}

/** 撈買方法人抬頭（subsidiaries），給 PrintShell 的 letterhead 用 */
export async function getPrintBrandBuyer(
  brandId: string,
  subsidiaryId: string | null,
): Promise<{ brand: PrintBrandInfo; buyer: PrintBuyerInfo }> {
  const supabase = await createClient();
  let buyer: PrintBuyerInfo = { legalName: brandDisplayName(brandId) };
  if (subsidiaryId) {
    const { data } = await supabase
      .from("subsidiaries")
      .select("legal_name, tax_id, address, phone")
      .eq("id", subsidiaryId)
      .maybeSingle();
    if (data) {
      buyer = {
        legalName: data.legal_name ?? brandDisplayName(brandId),
        taxId: data.tax_id ?? null,
        address: data.address ?? null,
        phone: data.phone ?? null,
      };
    }
  }
  return {
    brand: { key: brandId, displayName: brandDisplayName(brandId) },
    buyer,
  };
}
