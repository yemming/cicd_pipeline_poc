/**
 * damage_disputes 的純常數 / 型別（無 server-only 相依）
 *
 * 拆出此檔的原因：client component（damage-dispute-section.tsx）需要 DISPUTE_TYPE_LABEL
 * 這個 runtime 值與型別。若直接從 domain/damage-disputes.ts 取，會把 server-only
 * （createClient / next-headers）拉進 client bundle，build 直接炸。
 * runtime 值一律放這支零相依的 constants 檔。
 */

export type DamageDisputeType =
  | "existing_damage" // 進廠前已有損傷（客戶提出存證）
  | "cause_dispute" // 損傷成因有爭議（客戶不接受 SA 描述）
  | "scope_dispute"; // 損傷範圍有爭議（客戶認為範圍誤判）

export const DISPUTE_TYPE_LABEL: Record<DamageDisputeType, string> = {
  existing_damage: "進廠前已有損傷",
  cause_dispute: "損傷成因有爭議",
  scope_dispute: "損傷範圍有爭議",
};

export type DamageDispute = {
  id: string;
  brandId: string;
  preInspectionId: string | null;
  repairOrderId: string | null;
  vehicleId: string | null;
  disputeType: DamageDisputeType;
  damageLabel: string;
  customerWords: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
};
