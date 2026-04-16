import type { Customer } from "@/lib/pos/pos-types";
import { vipTierMeta, maskPhone, formatVatId } from "@/lib/pos/format";

export function CustomerAvatar({
  customer,
  size = "md",
}: {
  customer: Customer;
  size?: "sm" | "md" | "lg";
}) {
  const cls =
    size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-14 h-14 text-lg" : "w-10 h-10 text-sm";
  const hue = customer.avatarHue ?? 220;
  const initial = customer.name.trim().slice(-2);
  return (
    <div
      className={`${cls} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue}, 65%, 55%) 0%, hsl(${(hue + 30) % 360}, 65%, 40%) 100%)`,
      }}
    >
      {initial}
    </div>
  );
}

export function VipBadge({ tier }: { tier: string }) {
  const meta = vipTierMeta(tier);
  if (tier === "None") return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      <span className="material-symbols-outlined text-[10px]">workspace_premium</span>
      {meta.label}
    </span>
  );
}

export function CustomerChip({
  customer,
  detailed,
  onRemove,
}: {
  customer: Customer;
  detailed?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200">
      <CustomerAvatar customer={customer} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-slate-900 truncate">{customer.name}</span>
          {customer.type === "B2B" && (
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">
              B2B
            </span>
          )}
          <VipBadge tier={customer.tier} />
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
          <span className="tabular-nums">{maskPhone(customer.phone)}</span>
          {customer.vatId && <span className="tabular-nums">統編 {formatVatId(customer.vatId)}</span>}
          {detailed && customer.totalSpent > 0 && (
            <span>累消 NT${(customer.totalSpent / 10000).toFixed(0)}萬</span>
          )}
        </div>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-slate-400 hover:text-rose-500 p-1"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      )}
    </div>
  );
}
