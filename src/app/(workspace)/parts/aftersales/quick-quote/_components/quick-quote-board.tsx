"use client";

import { Fragment, useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import type { ServicePackage, LaborRate } from "@/domain/service-packages";
import type { BalanceRow } from "@/domain/parts-balance";
import type { VehiclePendingItem } from "@/domain/service-quotes";
import {
  saveQuoteAction,
  applyQuoteToInspectionAction,
  rejectQuoteAction,
  type QuoteLineInput,
} from "@/lib/aftersales/service-quote-actions";

/* ── 型別 ── */

type VehicleInfo = {
  plate: string | null;
  model: string | null;
  year: string | null;
  mileage: number | null;
  customer: string | null;
  warranty: string | null;
  vehicleId: string | null;
  preInspectionId: string | null;
};

type CartLine = {
  uid: string;
  kind: "labor" | "part";
  sku?: string | null;
  name: string;
  qty: number;
  lu?: number | null;
  unitPrice: number;
  subtotal: number;
};

type Banner = { ok: boolean; msg: string } | null;

/* ── 工具 ── */

const fmtNT = (n: number) => `NT$${Math.round(n).toLocaleString("en-US")}`;

let uidSeq = 0;
const nextUid = () => `cl-${++uidSeq}-${Date.now()}`;

/** 零件庫存三色：依本店該料號加總 vs safety_stock */
type StockState = "ok" | "low" | "out";
function stockStateOf(qtyAvailable: number, safety: number | null): StockState {
  if (qtyAvailable <= 0) return "out";
  if (safety != null && qtyAvailable <= safety) return "low";
  return "ok";
}

const stockTextClass: Record<StockState, string> = {
  ok: "text-[#0F6E56] font-semibold",
  low: "text-[#854F0B] font-semibold",
  out: "text-[#CC0000] font-semibold",
};
const stockIcon: Record<StockState, string> = { ok: "✅", low: "⚠️", out: "❌" };
const stockLabel: Record<StockState, string> = { ok: "充足", low: "低量", out: "缺料" };

/* ── 套餐三色 ── */
const pkgTypeStyle: Record<ServicePackage["pkgType"], { chip: string; label: string }> = {
  standard: { chip: "bg-[#EAF4FB] text-[#1A3A5C] border border-[#85B7EB]", label: "原廠標準" },
  store_custom: { chip: "bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5]", label: "門店自訂" },
  promo: { chip: "bg-[#FDF3E3] text-[#854F0B] border border-[#F0C97E]", label: "限時促銷" },
};

export function QuickQuoteBoard({
  vehicle,
  packages,
  laborRates,
  balanceRows,
  pendingItems,
  canEdit,
}: {
  vehicle: VehicleInfo;
  packages: ServicePackage[];
  laborRates: LaborRate[];
  balanceRows: BalanceRow[];
  pendingItems: VehiclePendingItem[];
  canEdit: boolean;
}) {
  useSetPageHeader({
    title: "快速報價查詢",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales/pre-inspections" },
      { label: "快速報價" },
    ],
    hideSearch: true,
  });

  const [tab, setTab] = useState<0 | 1 | 2>(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [banner, setBanner] = useState<Banner>(null);
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);

  /* ── 本店庫存：group by item_code（取同料號跨倉合計 + 各倉拆解）── */
  const stockByCode = useMemo(() => {
    const m = new Map<
      string,
      {
        item_code: string;
        item_name: string;
        item_category: string | null;
        // 本店（這裡視全部 balanceRows 為「同 brand 所有倉」，合計做本店 view，逐倉 = 跨店清單）
        totalAvailable: number;
        safety: number | null;
        avgCost: number;
        warehouses: Array<{ name: string; qty: number; safety: number | null }>;
      }
    >();
    for (const r of balanceRows) {
      if (!r.item_code) continue;
      const cur = m.get(r.item_code);
      if (cur) {
        cur.totalAvailable += r.qty_available;
        if (r.safety_stock != null) cur.safety = (cur.safety ?? 0) + r.safety_stock;
        if (r.avg_unit_cost > 0 && cur.avgCost === 0) cur.avgCost = r.avg_unit_cost;
        cur.warehouses.push({
          name: r.warehouse_name ?? r.warehouse_code ?? "未命名倉",
          qty: r.qty_available,
          safety: r.safety_stock,
        });
      } else {
        m.set(r.item_code, {
          item_code: r.item_code,
          item_name: r.item_name,
          item_category: r.item_category,
          totalAvailable: r.qty_available,
          safety: r.safety_stock,
          avgCost: r.avg_unit_cost,
          warehouses: [
            { name: r.warehouse_name ?? r.warehouse_code ?? "未命名倉", qty: r.qty_available, safety: r.safety_stock },
          ],
        });
      }
    }
    return m;
  }, [balanceRows]);

  /** 取某料號的本店主倉（qty 最高者）vs 其他倉（跨店） */
  function crossStoreOf(code: string) {
    const e = stockByCode.get(code);
    if (!e) return null;
    const sorted = [...e.warehouses].sort((a, b) => b.qty - a.qty);
    return { primary: sorted[0] ?? null, others: sorted.slice(1) };
  }

  /* ── 費率 map ── */
  const rateMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of laborRates) m.set(r.bizType.toUpperCase(), r.ratePerLu);
    return m;
  }, [laborRates]);

  /* ── 建議套餐：里程最接近（<=mileage 且 interval 最大）── */
  const suggestedPkgId = useMemo(() => {
    if (vehicle.mileage == null) return null;
    const cands = packages
      .filter((p) => p.mileageInterval != null && p.mileageInterval <= vehicle.mileage!)
      .sort((a, b) => (b.mileageInterval ?? 0) - (a.mileageInterval ?? 0));
    return cands[0]?.id ?? null;
  }, [packages, vehicle.mileage]);

  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(suggestedPkgId);
  const selectedPkg = packages.find((p) => p.id === selectedPkgId) ?? null;

  /* ── cart 計算 ── */
  const laborTotal = cart.filter((l) => l.kind === "labor").reduce((s, l) => s + l.subtotal, 0);
  const partTotal = cart.filter((l) => l.kind === "part").reduce((s, l) => s + l.subtotal, 0);
  const grandTotal = laborTotal + partTotal;

  function addToCart(line: Omit<CartLine, "uid">) {
    setCart((c) => [...c, { ...line, uid: nextUid() }]);
  }
  function removeFromCart(uid: string) {
    setCart((c) => c.filter((l) => l.uid !== uid));
  }
  function clearCart() {
    setCart([]);
  }

  /** 把選定套餐的明細灌進 cart */
  function addPackageToCart(pkg: ServicePackage) {
    const lines: CartLine[] = pkg.items.map((it) => {
      if (it.kind === "labor") {
        const lu = it.lu ?? 0;
        // 套餐工項沒指定 bizType → 用 MN 費率，找不到 fallback 用 price
        const rate = rateMap.get("MN") ?? rateMap.values().next().value ?? 0;
        const sub = it.price != null ? it.price : lu * rate;
        return {
          uid: nextUid(),
          kind: "labor",
          name: it.name,
          qty: it.qty ?? 1,
          lu,
          unitPrice: lu > 0 ? sub / lu : sub,
          subtotal: sub,
        };
      }
      const qty = it.qty ?? 1;
      const unit = it.price ?? (it.sku ? stockByCode.get(it.sku)?.avgCost ?? 0 : 0);
      return {
        uid: nextUid(),
        kind: "part",
        sku: it.sku ?? null,
        name: it.name,
        qty,
        unitPrice: unit,
        subtotal: unit * qty,
      };
    });
    setCart((c) => [...c, ...lines]);
    setBanner({ ok: true, msg: `✓ 已加入套餐：${pkg.name}（${lines.length} 項）` });
    autoClear();
  }

  function autoClear() {
    setTimeout(() => setBanner(null), 2200);
  }

  function toLineInputs(): QuoteLineInput[] {
    return cart.map((l) => ({
      kind: l.kind,
      sku: l.sku ?? null,
      name: l.name,
      qty: l.qty,
      lu: l.lu ?? null,
      unitPrice: l.unitPrice,
      subtotal: l.subtotal,
    }));
  }

  /* ── 三結果閉環 ── */
  function doAgree() {
    if (!cart.length || !canEdit) return;
    startTransition(async () => {
      const res = await saveQuoteAction({
        status: "agreed",
        lines: toLineInputs(),
        total: grandTotal,
        vehicleId: vehicle.vehicleId,
        preInspectionId: vehicle.preInspectionId,
      });
      if (!res.ok) {
        setBanner({ ok: false, msg: `儲存失敗：${res.error}` });
        return;
      }
      const apply = await applyQuoteToInspectionAction(res.data.id);
      if (!apply.ok) {
        setBanner({ ok: false, msg: `帶回預檢單失敗：${apply.error}` });
        return;
      }
      setBanner({ ok: true, msg: "✓ 已帶回預檢單" });
      clearCart();
      autoClear();
    });
  }

  function doPending() {
    if (!cart.length || !canEdit) return;
    startTransition(async () => {
      const res = await saveQuoteAction({
        status: "pending",
        lines: toLineInputs(),
        total: grandTotal,
        vehicleId: vehicle.vehicleId,
        preInspectionId: vehicle.preInspectionId,
      });
      if (!res.ok) {
        setBanner({ ok: false, msg: `暫存失敗：${res.error}` });
        return;
      }
      setBanner({ ok: true, msg: "✓ 已暫存" });
      clearCart();
      autoClear();
    });
  }

  function doReject(reason: string) {
    if (!cart.length || !canEdit) return;
    startTransition(async () => {
      const res = await saveQuoteAction({
        status: "pending",
        lines: toLineInputs(),
        total: grandTotal,
        vehicleId: vehicle.vehicleId,
        preInspectionId: vehicle.preInspectionId,
      });
      if (!res.ok) {
        setBanner({ ok: false, msg: `記錄失敗：${res.error}` });
        return;
      }
      const rej = await rejectQuoteAction(res.data.id, reason);
      if (!rej.ok) {
        setBanner({ ok: false, msg: `拒絕記錄失敗：${rej.error}` });
        return;
      }
      setBanner({ ok: true, msg: `已記錄 ${rej.data.pendingCount} 筆待處理項` });
      setRejectOpen(false);
      clearCart();
      autoClear();
    });
  }

  const lockCls = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* ── 車輛資訊帶 ── */}
      <header className="bg-[#1A3A5C] text-white rounded-lg px-4 py-3 flex items-center gap-x-5 gap-y-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[16px] font-semibold">快速報價查詢</h1>
          <span className="px-2 py-0.5 text-[11px] rounded-full bg-white/15 border border-white/25 font-mono">
            Quick Quote
          </span>
          {vehicle.preInspectionId && (
            <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#E1F5EE] text-[#0F6E56] font-medium">
              來自預檢單
            </span>
          )}
        </div>
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap ml-auto text-[12.5px]">
          <VbItem label="車牌" value={vehicle.plate} />
          <VbItem label="車款" value={vehicle.model} />
          <VbItem label="年式" value={vehicle.year} />
          <VbItem
            label="目前里程"
            value={vehicle.mileage != null ? `${vehicle.mileage.toLocaleString("en-US")} km` : null}
          />
          <VbItem label="車主" value={vehicle.customer} />
          <VbItem label="保固至" value={vehicle.warranty} valueClass="text-[#5DCAA5]" />
        </div>
      </header>

      {/* 待處理項提醒 */}
      {pendingItems.length > 0 && (
        <div className="bg-[#EAF4FB] border border-[#85B7EB] rounded-lg px-4 py-2.5 text-[12px] text-[#1A3A5C]">
          ⏸ 此車有 <b>{pendingItems.length}</b> 筆上次未處理項目：
          {pendingItems.map((p) => p.itemDesc).join("、")}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 items-start">
        {/* ── 左：tabs ── */}
        <div className="space-y-3 min-w-0">
          {/* tab bar */}
          <div className="bg-white border border-[#EEECE6] rounded-lg overflow-x-auto">
            <div className="flex">
              {(["🔧 保養套餐查詢", "🔩 零件快查", "⏱ 工時費率"] as const).map((label, i) => (
                <button
                  key={label}
                  onClick={() => setTab(i as 0 | 1 | 2)}
                  className={`px-4 h-[42px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 transition-colors ${
                    tab === i
                      ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#CC0000] -mb-px"
                      : "text-[#5A5955] hover:bg-[#F8F7F4]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {tab === 0 && (
            <TabPackages
              packages={packages}
              suggestedPkgId={suggestedPkgId}
              selectedPkgId={selectedPkgId}
              onSelect={setSelectedPkgId}
              selectedPkg={selectedPkg}
              vehicleMileage={vehicle.mileage}
              rateMap={rateMap}
              stockByCode={stockByCode}
              crossStoreOf={crossStoreOf}
              onAddPackage={addPackageToCart}
              canEdit={canEdit}
            />
          )}
          {tab === 1 && (
            <TabParts
              stockByCode={stockByCode}
              crossStoreOf={crossStoreOf}
              onAdd={(line) => {
                addToCart(line);
                setBanner({ ok: true, msg: `✓ 已加入報價：${line.name}` });
                autoClear();
              }}
              canEdit={canEdit}
            />
          )}
          {tab === 2 && (
            <TabRates
              laborRates={laborRates}
              onAdd={(line) => {
                addToCart(line);
                setBanner({ ok: true, msg: `✓ 已加入報價：${line.name}` });
                autoClear();
              }}
              canEdit={canEdit}
            />
          )}
        </div>

        {/* ── 右：報價清單 cart ── */}
        <aside className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden lg:sticky lg:top-3 self-start">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 報價清單</span>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                disabled={isPending}
                className="text-[11px] text-[#9A9890] hover:text-[#CC0000] disabled:opacity-50"
              >
                清空
              </button>
            )}
          </header>
          <div className={`px-3 py-3 space-y-1.5 max-h-[40vh] overflow-y-auto ${lockCls}`}>
            {cart.length === 0 ? (
              <p className="text-[12px] text-[#9A9890] py-4 text-center">尚未加入任何工項 / 零件</p>
            ) : (
              cart.map((l) => (
                <div
                  key={l.uid}
                  className="flex items-start justify-between gap-2 px-2 py-1.5 rounded bg-[#F8F7F4]"
                >
                  <div className="min-w-0">
                    <div className="text-[12px] text-[#2C2C2A] truncate">
                      <span
                        className={`mr-1 text-[10px] px-1 py-0.5 rounded ${
                          l.kind === "labor"
                            ? "bg-[#FDF3E3] text-[#854F0B]"
                            : "bg-[#EEF4FB] text-[#185FA5]"
                        }`}
                      >
                        {l.kind === "labor" ? "工" : "件"}
                      </span>
                      {l.name}
                    </div>
                    <div className="text-[10.5px] text-[#9A9890] font-mono">
                      {l.sku ? `${l.sku} · ` : ""}
                      {l.kind === "labor" && l.lu ? `${l.lu} LU · ` : `${l.qty} × `}
                      {fmtNT(l.unitPrice)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[12px] font-mono font-semibold text-[#2C2C2A]">
                      {fmtNT(l.subtotal)}
                    </span>
                    <button
                      onClick={() => removeFromCart(l.uid)}
                      disabled={isPending}
                      className="text-[#9A9890] hover:text-[#CC0000] text-[12px] disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 小計 */}
          <div className="px-4 py-3 border-t border-[#EEECE6] space-y-1 text-[12px]">
            <Row label="工資小計" value={fmtNT(laborTotal)} />
            <Row label="零件小計" value={fmtNT(partTotal)} />
            <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-[#EEECE6]">
              <span className="text-[12px] text-[#5A5955]">報價總計</span>
              <span className="text-[18px] font-mono font-bold text-[#1A3A5C]">{fmtNT(grandTotal)}</span>
            </div>
          </div>

          {/* 三結果 */}
          <div className="px-3 py-3 border-t border-[#EEECE6] space-y-1.5">
            <div className="text-[11px] text-[#9A9890] mb-1">車主決定</div>
            {!canEdit && (
              <p className="text-[11px] text-[#CC0000] mb-1">無編輯權限，無法寫入報價</p>
            )}
            <button
              onClick={doAgree}
              disabled={!cart.length || !canEdit || isPending}
              className="w-full h-[34px] rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              {isPending ? "處理中⋯" : "✅ 車主同意 → 帶回預檢單"}
            </button>
            <button
              onClick={doPending}
              disabled={!cart.length || !canEdit || isPending}
              className="w-full h-[34px] rounded text-[12.5px] font-medium bg-white border border-[#85B7EB] text-[#1A3A5C] hover:bg-[#EAF4FB] disabled:opacity-50"
            >
              {isPending ? "處理中⋯" : "⏸ 暫存，稍後確認"}
            </button>
            <button
              onClick={() => setRejectOpen(true)}
              disabled={!cart.length || !canEdit || isPending}
              className="w-full h-[34px] rounded text-[12.5px] font-medium bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
            >
              ❌ 車主拒絕 / 暫不處理
            </button>
          </div>
        </aside>
      </div>

      {/* 拒絕原因 modal */}
      {rejectOpen && (
        <RejectModal
          isPending={isPending}
          onCancel={() => setRejectOpen(false)}
          onConfirm={doReject}
        />
      )}

      {/* banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}
    </main>
  );
}

/* ───────────────────────── Tab A：保養套餐查詢 ───────────────────────── */

function TabPackages({
  packages,
  suggestedPkgId,
  selectedPkgId,
  onSelect,
  selectedPkg,
  rateMap,
  stockByCode,
  crossStoreOf,
  onAddPackage,
  canEdit,
}: {
  packages: ServicePackage[];
  suggestedPkgId: string | null;
  selectedPkgId: string | null;
  onSelect: (id: string) => void;
  selectedPkg: ServicePackage | null;
  vehicleMileage: number | null;
  rateMap: Map<string, number>;
  stockByCode: Map<string, { totalAvailable: number; safety: number | null; avgCost: number }>;
  crossStoreOf: (code: string) => { primary: { name: string; qty: number } | null; others: Array<{ name: string; qty: number }> } | null;
  onAddPackage: (pkg: ServicePackage) => void;
  canEdit: boolean;
}) {
  if (packages.length === 0) {
    return (
      <SectionCard title="選擇服務套餐">
        <p className="text-[12px] text-[#9A9890] py-4 text-center">此里程下沒有可用套餐</p>
      </SectionCard>
    );
  }
  return (
    <>
      <SectionCard
        title="選擇服務套餐"
        sub="依車型與里程推薦 · 可切換查看其他套餐"
        right={
          <div className="flex gap-1.5">
            <span className={`px-1.5 py-0.5 rounded-md text-[10.5px] ${pkgTypeStyle.standard.chip}`}>原廠標準</span>
            <span className={`px-1.5 py-0.5 rounded-md text-[10.5px] ${pkgTypeStyle.store_custom.chip}`}>門店自訂</span>
            <span className={`px-1.5 py-0.5 rounded-md text-[10.5px] ${pkgTypeStyle.promo.chip}`}>限時促銷</span>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {packages.map((p) => {
            const sel = p.id === selectedPkgId;
            const suggested = p.id === suggestedPkgId;
            const ts = pkgTypeStyle[p.pkgType];
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={`text-left border-2 rounded-lg p-3 transition-colors ${
                  sel ? "border-[#1A3A5C] bg-[#EAF4FB]" : "border-[#EEECE6] bg-[#F8F7F4] hover:border-[#85B7EB]"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="text-[13px] font-bold text-[#2C2C2A]">{p.name}</div>
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] shrink-0 ${ts.chip}`}>{ts.label}</span>
                </div>
                <div className="text-[11px] text-[#9A9890] mb-2 line-clamp-2">
                  {p.items.map((it) => it.name).join("・") || "—"}
                </div>
                <div className="text-[18px] font-mono font-bold text-[#1A3A5C]">
                  {p.listPrice != null ? fmtNT(p.listPrice) : "—"}
                </div>
                <div className="flex gap-1 flex-wrap mt-1.5">
                  {suggested && (
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5]">
                      🎯 系統建議
                    </span>
                  )}
                  {p.pricingPolicyId && (
                    <span
                      className="px-1.5 py-0.5 rounded-md text-[10px] bg-[#EAF4FB] text-[#185FA5]"
                      title="此套餐售價由集團定價政策管控"
                    >
                      🔗 集團定價
                    </span>
                  )}
                  {p.mileageInterval != null && (
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-[#F2F2F2] text-[#6B6A68]">
                      {p.mileageInterval.toLocaleString("en-US")} km
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </SectionCard>

      {selectedPkg && (
        <SectionCard title={`套餐明細：${selectedPkg.name}`} sub="工項清單 · 零件清單 · 庫存狀態">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left">
                {["項目", "料號", "數量", "庫存", "單價", "小計"].map((h, i) => (
                  <th
                    key={h}
                    className={`text-[11px] text-[#9A9890] font-medium px-2.5 py-2 border-b border-[#EEECE6] ${
                      i >= 4 ? "text-right" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <PkgSection label="工項" />
              {selectedPkg.items
                .filter((it) => it.kind === "labor")
                .map((it, i) => {
                  const lu = it.lu ?? 0;
                  const rate = rateMap.get("MN") ?? rateMap.values().next().value ?? 0;
                  const sub = it.price != null ? it.price : lu * rate;
                  return (
                    <tr key={`l-${i}`} className="border-b border-[#F4F3F0]">
                      <td className="px-2.5 py-2 text-[12.5px]">
                        <div className="font-medium text-[#2C2C2A]">{it.name}</div>
                        {lu > 0 && <div className="text-[11px] text-[#9A9890] font-mono">{lu} LU</div>}
                      </td>
                      <td className="px-2.5 py-2 text-[11px] font-mono text-[#9A9890]">—</td>
                      <td className="px-2.5 py-2 text-[12.5px]">{it.qty ?? 1}</td>
                      <td className="px-2.5 py-2 text-[12px] text-[#9A9890]">—</td>
                      <td className="px-2.5 py-2 text-[12.5px] font-mono text-right">
                        {fmtNT(lu > 0 ? sub / lu : sub)}
                      </td>
                      <td className="px-2.5 py-2 text-[12.5px] font-mono font-semibold text-right">{fmtNT(sub)}</td>
                    </tr>
                  );
                })}
              <PkgSection label="零件" />
              {selectedPkg.items
                .filter((it) => it.kind === "part")
                .map((it, i) => {
                  const code = it.sku ?? "";
                  const entry = code ? stockByCode.get(code) : undefined;
                  const avail = entry?.totalAvailable ?? 0;
                  const safety = entry?.safety ?? null;
                  const ss = code ? stockStateOf(avail, safety) : "out";
                  const qty = it.qty ?? 1;
                  const unit = it.price ?? entry?.avgCost ?? 0;
                  const cross = code ? crossStoreOf(code) : null;
                  return (
                    <tr key={`p-${i}`} className="border-b border-[#F4F3F0]">
                      <td className="px-2.5 py-2 text-[12.5px]">
                        <div className="font-medium text-[#2C2C2A]">{it.name}</div>
                      </td>
                      <td className="px-2.5 py-2 text-[11px] font-mono text-[#9A9890]">{code || "—"}</td>
                      <td className="px-2.5 py-2 text-[12.5px]">{qty}</td>
                      <td className="px-2.5 py-2 text-[12px]">
                        {code ? (
                          <span className={stockTextClass[ss]}>
                            {stockIcon[ss]} {avail} {stockLabel[ss]}
                          </span>
                        ) : (
                          <span className="text-[#9A9890]">—</span>
                        )}
                        {ss === "out" && cross && cross.others.some((o) => o.qty > 0) && (
                          <div className="text-[10.5px] text-[#854F0B] mt-0.5">
                            跨店：{cross.others.filter((o) => o.qty > 0).map((o) => `${o.name} ${o.qty}`).join("、")}
                          </div>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-[12.5px] font-mono text-right">{fmtNT(unit)}</td>
                      <td className="px-2.5 py-2 text-[12.5px] font-mono font-semibold text-right">{fmtNT(unit * qty)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>

          <div className="flex justify-end mt-3">
            <button
              onClick={() => onAddPackage(selectedPkg)}
              disabled={!canEdit}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 加入報價
            </button>
          </div>
        </SectionCard>
      )}
    </>
  );
}

function PkgSection({ label }: { label: string }) {
  return (
    <tr>
      <td
        colSpan={6}
        className="bg-[#F8F7F4] text-[10.5px] font-bold text-[#9A9890] tracking-wide px-2.5 py-1.5"
      >
        {label}
      </td>
    </tr>
  );
}

/* ───────────────────────── Tab B：零件快查 ───────────────────────── */

function TabParts({
  stockByCode,
  crossStoreOf,
  onAdd,
  canEdit,
}: {
  stockByCode: Map<
    string,
    { item_code: string; item_name: string; item_category: string | null; totalAvailable: number; safety: number | null; avgCost: number }
  >;
  crossStoreOf: (code: string) => { primary: { name: string; qty: number } | null; others: Array<{ name: string; qty: number }> } | null;
  onAdd: (line: Omit<CartLine, "uid">) => void;
  canEdit: boolean;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const allEntries = useMemo(() => Array.from(stockByCode.values()), [stockByCode]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const e of allEntries) if (e.item_category) s.add(e.item_category);
    return Array.from(s).sort();
  }, [allEntries]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return allEntries
      .filter((e) => (cat === "all" ? true : e.item_category === cat))
      .filter(
        (e) =>
          !ql ||
          e.item_code.toLowerCase().includes(ql) ||
          e.item_name.toLowerCase().includes(ql),
      )
      .slice(0, 200);
  }, [allEntries, q, cat]);

  return (
    <SectionCard title="零件快查" sub="搜尋料號 / 名稱 · 即時庫存三色 · 一鍵加入報價">
      <div className="flex gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="輸入零件名稱、料號或關鍵字…"
          className="flex-1 h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
        />
      </div>
      <div className="flex gap-1.5 flex-wrap mb-3">
        <Ftag active={cat === "all"} onClick={() => setCat("all")}>全部</Ftag>
        {categories.map((c) => (
          <Ftag key={c} active={cat === c} onClick={() => setCat(c)}>
            {c}
          </Ftag>
        ))}
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left">
            {["料號", "名稱", "類別", "庫存", "本店", "售價", "操作"].map((h, i) => (
              <th
                key={h}
                className={`text-[11px] text-[#9A9890] font-medium px-2.5 py-2 border-b border-[#EEECE6] ${
                  i === 5 ? "text-right" : ""
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-[12px] text-[#9A9890] py-6 text-center">
                沒有符合條件的零件
              </td>
            </tr>
          ) : (
            filtered.map((e) => {
              const ss = stockStateOf(e.totalAvailable, e.safety);
              const cross = crossStoreOf(e.item_code);
              const isExpanded = expanded === e.item_code;
              const hasCross = cross && cross.others.some((o) => o.qty > 0);
              return (
                <Fragment key={e.item_code}>
                  <tr className="border-b border-[#F4F3F0] hover:bg-[#F8F7F4]">
                    <td className="px-2.5 py-2 text-[11px] font-mono font-semibold text-[#1A3A5C]">{e.item_code}</td>
                    <td className="px-2.5 py-2 text-[12.5px] text-[#2C2C2A]">{e.item_name}</td>
                    <td className="px-2.5 py-2 text-[11px]">
                      {e.item_category ? (
                        <span className="px-1.5 py-0.5 rounded-md bg-[#EEF4FB] text-[#185FA5]">{e.item_category}</span>
                      ) : (
                        <span className="text-[#9A9890]">—</span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 text-[12px]">
                      <span className={stockTextClass[ss]}>
                        {stockIcon[ss]} {e.totalAvailable} {stockLabel[ss]}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-[12px] text-[#5A5955]">{cross?.primary?.qty ?? 0}</td>
                    <td className="px-2.5 py-2 text-[12.5px] font-mono text-right">{fmtNT(e.avgCost)}</td>
                    <td className="px-2.5 py-2">
                      {ss === "out" ? (
                        hasCross ? (
                          <button
                            onClick={() => setExpanded(isExpanded ? null : e.item_code)}
                            className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B] hover:bg-[#fbeccb]"
                          >
                            {isExpanded ? "收合" : "查跨店"}
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#CC0000]">無跨店庫存</span>
                        )
                      ) : (
                        <button
                          onClick={() =>
                            onAdd({
                              kind: "part",
                              sku: e.item_code,
                              name: e.item_name,
                              qty: 1,
                              unitPrice: e.avgCost,
                              subtotal: e.avgCost,
                            })
                          }
                          disabled={!canEdit}
                          className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                        >
                          ＋ 加入報價
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && hasCross && (
                    <tr className="bg-[#FDF3E3]/40">
                      <td colSpan={7} className="px-2.5 py-2">
                        <div className="text-[11px] text-[#854F0B] mb-1 font-medium">跨店庫存（同料號其他倉）</div>
                        <div className="flex flex-wrap gap-2">
                          {cross!.others
                            .filter((o) => o.qty > 0)
                            .map((o, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md text-[11px] bg-white border border-[#F0C97E] text-[#854F0B]"
                              >
                                {o.name}：{o.qty} 件
                              </span>
                            ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </SectionCard>
  );
}

/* ───────────────────────── Tab C：工時費率 ───────────────────────── */

function TabRates({
  laborRates,
  onAdd,
  canEdit,
}: {
  laborRates: LaborRate[];
  onAdd: (line: Omit<CartLine, "uid">) => void;
  canEdit: boolean;
}) {
  const [lu, setLu] = useState("");
  const [bizType, setBizType] = useState(laborRates[0]?.bizType ?? "MN");

  const rateMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of laborRates) m.set(r.bizType, r.ratePerLu);
    return m;
  }, [laborRates]);

  const luNum = Number(lu) || 0;
  const rate = rateMap.get(bizType) ?? 0;
  const calc = luNum * rate;

  return (
    <SectionCard title="工時費率表" sub="各業務別費率 + 快速計算器">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mb-4">
        {laborRates.length === 0 ? (
          <p className="text-[12px] text-[#9A9890] col-span-3 py-3 text-center">尚未設定工時費率</p>
        ) : (
          laborRates.map((r) => (
            <div key={r.id} className="border border-[#EEECE6] rounded-lg p-3 bg-white">
              <div className="text-[11px] font-bold tracking-wide text-[#9A9890] mb-1">{r.bizType}</div>
              <div className="text-[20px] font-mono font-bold text-[#1A3A5C]">
                {r.ratePerLu.toLocaleString("en-US")}
                <span className="text-[11px] text-[#9A9890] font-sans"> NT$/LU</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 計算器 */}
      <div className="border border-[#85B7EB] rounded-lg p-3 bg-[#EAF4FB]">
        <div className="text-[11px] font-bold tracking-wide text-[#1A3A5C] mb-2">快速計算器</div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="number"
            value={lu}
            onChange={(e) => setLu(e.target.value)}
            placeholder="工時 (LU)"
            className="w-[100px] h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] text-right focus:border-[#185FA5] outline-none"
          />
          <span className="text-[13px] text-[#1A3A5C]">×</span>
          <select
            value={bizType}
            onChange={(e) => setBizType(e.target.value)}
            className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
          >
            {laborRates.map((r) => (
              <option key={r.id} value={r.bizType}>
                {r.bizType}（{r.ratePerLu.toLocaleString("en-US")}/LU）
              </option>
            ))}
          </select>
          <span className="text-[13px] text-[#1A3A5C]">=</span>
          <span className="text-[18px] font-mono font-bold text-[#1A3A5C]">{calc > 0 ? fmtNT(calc) : "NT$—"}</span>
          <button
            onClick={() =>
              onAdd({
                kind: "labor",
                name: `${bizType} 工時 ${luNum} LU`,
                qty: 1,
                lu: luNum,
                unitPrice: rate,
                subtotal: calc,
              })
            }
            disabled={!canEdit || calc <= 0}
            className="ml-auto h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 加入報價
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

/* ───────────────────────── 小元件 ───────────────────────── */

function SectionCard({
  title,
  sub,
  right,
  children,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between gap-2">
        <div>
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ {title}</span>
          {sub && <span className="ml-2 text-[11px] text-[#9A9890]">{sub}</span>}
        </div>
        {right}
      </header>
      <div className="px-4 py-3 overflow-x-auto">{children}</div>
    </section>
  );
}

function VbItem({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string | null;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10.5px] text-white/65">{label}</span>
      <span className={`text-[12.5px] font-semibold text-white ${valueClass ?? ""}`}>{value ?? "—"}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-[#9A9890]">{label}</span>
      <span className="text-[12px] font-mono text-[#2C2C2A]">{value}</span>
    </div>
  );
}

function Ftag({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11.5px] border transition-colors ${
        active
          ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
          : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
      }`}
    >
      {children}
    </button>
  );
}

function RejectModal({
  isPending,
  onCancel,
  onConfirm,
}: {
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("費用考量，下次回廠再處理");
  const lockCls = isPending ? "pointer-events-none opacity-60" : "";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className={`bg-white rounded-lg shadow-xl w-full max-w-md ${lockCls}`}>
        <header className="px-4 py-3 border-b border-[#EEECE6]">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">車主拒絕 / 暫不處理</h2>
          <p className="text-[11px] text-[#9A9890] mt-0.5">原因將記錄至人車檔案，下次回廠自動提醒 SA</p>
        </header>
        <div className="px-4 py-4">
          <label className="text-[11px] text-[#9A9890] font-medium block mb-1">拒絕原因</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none resize-none"
          />
        </div>
        <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={isPending || !reason.trim()}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#a30000] disabled:opacity-50"
          >
            {isPending ? "記錄中⋯" : "確認拒絕"}
          </button>
        </footer>
      </div>
    </div>
  );
}
