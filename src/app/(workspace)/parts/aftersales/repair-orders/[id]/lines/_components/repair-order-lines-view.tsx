"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  addLaborLineAction,
  addPartLineAction,
  deleteLineAction,
  setLinePartLifecycleAction,
  updateLaborLineAction,
  updatePartLineAction,
  updateRoDiscountAction,
} from "@/lib/aftersales/repair-order-line-actions";
import type {
  RepairOrderLineWithStock,
  RepairOrderLinesPageData,
} from "@/domain/repair-order-lines";

function fmtNT(n: number | null | undefined): string {
  if (n == null) return "—";
  return `NT$${Math.round(Number(n)).toLocaleString()}`;
}

function statusBadge(status: string): string {
  switch (status) {
    case "進行中":
      return "bg-[#EAF4FB] text-[#185FA5]";
    case "維修中":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "待結帳":
      return "bg-[#EBF3FF] text-[#1A3A5C]";
    case "已關單":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    case "已取消":
      return "bg-[#F2F2F2] text-[#6B6A68]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

const inputCls =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white";
const btnSm =
  "h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center disabled:opacity-50";

// M03-3 spec：零件 lifecycle
export type PartLifecycle = "new" | "installed" | "returned" | "replaced";

function lifecycleOf(line: RepairOrderLineWithStock): PartLifecycle {
  const meta = (line.metadata ?? {}) as Record<string, unknown>;
  const v = typeof meta.part_lifecycle === "string" ? meta.part_lifecycle : "new";
  return (["new", "installed", "returned", "replaced"].includes(v)
    ? v
    : "new") as PartLifecycle;
}

function lifecycleChip(lc: PartLifecycle): { label: string; cls: string } {
  switch (lc) {
    case "installed":
      return { label: "已安裝", cls: "bg-[#EAF3DE] text-[#3B6D11]" };
    case "returned":
      return { label: "已退料", cls: "bg-[#F2F2F2] text-[#6B6A68]" };
    case "replaced":
      return { label: "已替換", cls: "bg-[#FDECEA] text-[#CC0000]" };
    default:
      return { label: "新料", cls: "bg-[#EAF4FB] text-[#185FA5]" };
  }
}

export function RepairOrderLinesView({
  data,
  canEdit,
}: {
  data: RepairOrderLinesPageData;
  canEdit: boolean;
}) {
  const { ro, laborLines, partLines, summary, itemOptions } = data;

  useSetPageHeader({
    title: `${ro.ro_code} · 維修項目零件明細`,
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "正式工單 RO", href: "/parts/aftersales/repair-orders" },
      { label: ro.ro_code, href: `/parts/aftersales/repair-orders/${ro.id}` },
      { label: "維修項目零件" },
    ],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  // labor add form
  const [newLabor, setNewLabor] = useState({
    name: "",
    lu: "",
    unit_price: "1000",
    note: "",
  });
  function submitNewLabor() {
    if (!canEdit || isPending) return;
    startTransition(async () => {
      const res = await addLaborLineAction(ro.id, {
        labor_name: newLabor.name,
        labor_units: Number(newLabor.lu),
        unit_price: Number(newLabor.unit_price),
        labor_note: newLabor.note || null,
      });
      if (res.ok) {
        setNewLabor({ name: "", lu: "", unit_price: "1000", note: "" });
        showBanner({ ok: true, msg: "✓ 已新增工項" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  // part add form
  const [newPart, setNewPart] = useState({ item_id: "", qty: "1", unit_price: "" });
  function pickItemForNewPart(item_id: string) {
    const it = itemOptions.find((i) => i.id === item_id);
    setNewPart({
      item_id,
      qty: "1",
      unit_price: it?.suggested_price ? String(it.suggested_price) : "",
    });
  }
  function submitNewPart() {
    if (!canEdit || isPending) return;
    startTransition(async () => {
      const res = await addPartLineAction(ro.id, {
        item_id: newPart.item_id,
        qty: Number(newPart.qty),
        unit_price: Number(newPart.unit_price),
      });
      if (res.ok) {
        setNewPart({ item_id: "", qty: "1", unit_price: "" });
        showBanner({ ok: true, msg: "✓ 已新增零件" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function doDelete(line: RepairOrderLineWithStock) {
    if (!canEdit || isPending) return;
    if (!confirm(`刪除「${line.kind === "labor" ? line.labor_name : line.part_name}」？`))
      return;
    startTransition(async () => {
      const res = await deleteLineAction(ro.id, line.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  // discount form
  const [discount, setDiscount] = useState({
    pct: String(summary.discount_pct ?? 0),
    reason: summary.discount_reason ?? "",
  });
  function submitDiscount() {
    if (!canEdit || isPending) return;
    startTransition(async () => {
      const res = await updateRoDiscountAction(ro.id, {
        discount_pct: Number(discount.pct),
        discount_reason: discount.reason || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 折扣已更新" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const stockHints = useMemo(
    () =>
      partLines.filter(
        (p) =>
          p.stock_on_hand != null && p.qty != null && (p.stock_on_hand as number) < Number(p.qty),
      ),
    [partLines],
  );

  const subtotalDiscounted =
    summary.subtotal * (1 - Math.max(0, Math.min(30, summary.discount_pct)) / 100);

  return (
    <main
      className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}
    >
      {/* Breadcrumb + 返回 / 查工單 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href={`/parts/aftersales/repair-orders/${ro.id}`}
            className="hover:text-[#185FA5]"
          >
            ← 返回工單
          </Link>
          <span>›</span>
          <span className="font-mono text-[#5A5955]">{ro.ro_code}</span>
          <span>›</span>
          <span className="text-[#5A5955]">維修項目／零件明細</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/aftersales/repair-orders"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                售後工單 — 維修項目／零件明細
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight font-mono">
                {ro.ro_code}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span
                  className={`inline-flex whitespace-nowrap px-1.5 py-0.5 rounded-md text-[11px] font-medium ${statusBadge(ro.status)}`}
                >
                  {ro.status}
                </span>
                {ro.customer_name && (
                  <span className="text-[#5A5955]">{ro.customer_name}</span>
                )}
                {ro.vehicle_model_name && (
                  <span className="inline-flex px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">
                    {ro.vehicle_model_name}
                  </span>
                )}
                {ro.vehicle_license_plate && (
                  <span className="font-mono text-[#5A5955]">{ro.vehicle_license_plate}</span>
                )}
                {ro.mileage_in != null && (
                  <span className="text-[#9A9890]">
                    進廠 {ro.mileage_in.toLocaleString()} km
                  </span>
                )}
                {ro.sa_name && (
                  <span className="text-[#9A9890]">SA：{ro.sa_name}</span>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0 w-[260px] h-[120px] rounded-lg bg-[#F8F7F4] border border-[#EEECE6] flex flex-col items-center justify-center text-center">
            <div className="text-[11px] text-[#9A9890]">本單總計（含 5% 稅）</div>
            <div
              className="text-[24px] font-semibold text-[#1A3A5C] font-mono"
              data-testid="ro-grand-total"
            >
              {fmtNT(summary.total)}
            </div>
            <div className="text-[11px] text-[#9A9890] mt-1">
              工時 {summary.labor_units_total.toFixed(1)} LU
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr,340px] gap-3">
        {/* 左欄：工項 + 零件 */}
        <div className="space-y-3">
          {/* 工項 */}
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">🔧 工項明細</span>
              <span className="ml-2 text-[11px] text-[#9A9890]">
                共 {laborLines.length} 條 · 工時小計 {summary.labor_units_total.toFixed(1)} LU /{" "}
                {fmtNT(summary.labor_subtotal)}
              </span>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead className="bg-[#F8F7F4]">
                  <tr className="text-[11px] text-[#9A9890]">
                    <th className="text-left px-3 py-2 w-12">#</th>
                    <th className="text-left px-3 py-2">工項名稱</th>
                    <th className="text-right px-3 py-2 w-20">工時 (LU)</th>
                    <th className="text-right px-3 py-2 w-24">單價/LU</th>
                    <th className="text-right px-3 py-2 w-28">小計</th>
                    <th className="text-left px-3 py-2">備註</th>
                    <th className="text-right px-3 py-2 w-28">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {laborLines.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center text-[12px] text-[#9A9890] py-6"
                      >
                        尚未新增工項
                      </td>
                    </tr>
                  )}
                  {laborLines.map((l) => (
                    <LaborRow
                      key={l.id}
                      line={l}
                      canEdit={canEdit}
                      isEditing={editingId === l.id}
                      onEdit={() => setEditingId(l.id)}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => {
                        setEditingId(null);
                        router.refresh();
                      }}
                      onDelete={() => doDelete(l)}
                      showBanner={showBanner}
                      roId={ro.id}
                      isPending={isPending}
                      startTransition={startTransition}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {/* add form */}
            {canEdit && (
              <div className="border-t border-dashed border-[#D5D3CB] px-3 py-3 bg-[#F8F7F4] grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4 flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890]">工項名稱 *</label>
                  <input
                    className={inputCls}
                    value={newLabor.name}
                    onChange={(e) => setNewLabor({ ...newLabor, name: e.target.value })}
                    placeholder="例：機油更換"
                  />
                </div>
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890]">LU *</label>
                  <input
                    className={inputCls + " text-right"}
                    type="number"
                    step="0.1"
                    min="0"
                    value={newLabor.lu}
                    onChange={(e) => setNewLabor({ ...newLabor, lu: e.target.value })}
                  />
                </div>
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890]">單價/LU *</label>
                  <input
                    className={inputCls + " text-right"}
                    type="number"
                    min="0"
                    value={newLabor.unit_price}
                    onChange={(e) =>
                      setNewLabor({ ...newLabor, unit_price: e.target.value })
                    }
                  />
                </div>
                <div className="col-span-3 flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890]">備註</label>
                  <input
                    className={inputCls}
                    value={newLabor.note}
                    onChange={(e) => setNewLabor({ ...newLabor, note: e.target.value })}
                  />
                </div>
                <div className="col-span-1 flex">
                  <button
                    type="button"
                    onClick={submitNewLabor}
                    disabled={isPending || !newLabor.name || !newLabor.lu}
                    className="h-[30px] w-full px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                  >
                    {isPending ? "新增中⋯" : "＋ 新增"}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 零件 */}
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">🔩 零件明細</span>
              <span className="ml-2 text-[11px] text-[#9A9890]">
                共 {partLines.length} 條 · {fmtNT(summary.parts_subtotal)}
              </span>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead className="bg-[#F8F7F4]">
                  <tr className="text-[11px] text-[#9A9890]">
                    <th className="text-left px-3 py-2 w-12">#</th>
                    <th className="text-left px-3 py-2 w-32">料號</th>
                    <th className="text-left px-3 py-2">品名</th>
                    <th className="text-right px-3 py-2 w-20">數量</th>
                    <th className="text-right px-3 py-2 w-24">單價</th>
                    <th className="text-right px-3 py-2 w-28">小計</th>
                    <th className="text-center px-3 py-2 w-24">庫存</th>
                    <th className="text-right px-3 py-2 w-28">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {partLines.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="text-center text-[12px] text-[#9A9890] py-6"
                      >
                        尚未新增零件
                      </td>
                    </tr>
                  )}
                  {partLines.map((l) => (
                    <PartRow
                      key={l.id}
                      line={l}
                      canEdit={canEdit}
                      isEditing={editingId === l.id}
                      onEdit={() => setEditingId(l.id)}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => {
                        setEditingId(null);
                        router.refresh();
                      }}
                      onDelete={() => doDelete(l)}
                      showBanner={showBanner}
                      roId={ro.id}
                      isPending={isPending}
                      startTransition={startTransition}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {canEdit && (
              <div className="border-t border-dashed border-[#D5D3CB] px-3 py-3 bg-[#F8F7F4] grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6 flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890]">選擇零件 *</label>
                  <select
                    className={inputCls}
                    value={newPart.item_id}
                    onChange={(e) => pickItemForNewPart(e.target.value)}
                  >
                    <option value="">— 請選擇 —</option>
                    {itemOptions.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.code} · {it.name}
                        {it.suggested_price != null
                          ? ` (建議 NT$${it.suggested_price})`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890]">數量 *</label>
                  <input
                    className={inputCls + " text-right"}
                    type="number"
                    min="1"
                    step="1"
                    value={newPart.qty}
                    onChange={(e) => setNewPart({ ...newPart, qty: e.target.value })}
                  />
                </div>
                <div className="col-span-3 flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890]">單價 *</label>
                  <input
                    className={inputCls + " text-right"}
                    type="number"
                    min="0"
                    value={newPart.unit_price}
                    onChange={(e) =>
                      setNewPart({ ...newPart, unit_price: e.target.value })
                    }
                  />
                </div>
                <div className="col-span-1 flex">
                  <button
                    type="button"
                    onClick={submitNewPart}
                    disabled={isPending || !newPart.item_id || !newPart.qty || !newPart.unit_price}
                    className="h-[30px] w-full px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                  >
                    {isPending ? "新增中⋯" : "＋ 新增"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* 右欄：費用彙總 + 庫存提示 */}
        <div className="space-y-3">
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">💰 費用彙總</span>
            </header>
            <div className="px-4 py-3 space-y-2 text-[12.5px]">
              <Row label="工時費" value={fmtNT(summary.labor_subtotal)} />
              <Row label="零件費" value={fmtNT(summary.parts_subtotal)} />
              <Row label="小計" value={fmtNT(summary.subtotal)} bold />
              {summary.discount_pct > 0 && (
                <Row
                  label={`折扣 (${summary.discount_pct}%)`}
                  value={`- ${fmtNT(summary.subtotal - subtotalDiscounted)}`}
                  warn
                />
              )}
              <Row label="稅金 (5%)" value={fmtNT(summary.tax)} />
              <div className="border-t-2 border-[#1A3A5C] my-2" />
              <Row
                label="總計（含稅）"
                value={fmtNT(summary.total)}
                strong
              />
              {canEdit && (
                <div className="pt-3 border-t border-[#EEECE6] mt-3 space-y-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#9A9890]">折扣（%）</label>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={discount.pct}
                      onChange={(e) => setDiscount({ ...discount, pct: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#9A9890]">折扣原因</label>
                    <select
                      value={discount.reason}
                      onChange={(e) =>
                        setDiscount({ ...discount, reason: e.target.value })
                      }
                      className={inputCls}
                    >
                      <option value="">無折扣</option>
                      <option value="VIP客戶">VIP 客戶</option>
                      <option value="促銷活動">促銷活動</option>
                      <option value="主管授權">主管授權</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={submitDiscount}
                    disabled={isPending}
                    className="h-[30px] w-full rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
                  >
                    {isPending ? "儲存中⋯" : "套用折扣"}
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">⚡ 庫存提示</span>
            </header>
            <div className="px-4 py-3 space-y-2 text-[12px]">
              {partLines.length === 0 && (
                <div className="text-[#9A9890]">無零件</div>
              )}
              {partLines.length > 0 && stockHints.length === 0 && (
                <div className="text-[#3B6D11]">✓ 全部零件庫存充足</div>
              )}
              {stockHints.map((p) => (
                <div
                  key={p.id}
                  className="text-[#854F0B] bg-[#FDF3E3] border border-[#F0C97E] rounded px-2 py-1.5"
                >
                  ⚠️ {p.part_name}：需求 {p.qty} · 庫存 {p.stock_on_hand}
                </div>
              ))}
              {partLines
                .filter(
                  (p) =>
                    p.stock_on_hand != null &&
                    p.qty != null &&
                    Number(p.stock_on_hand) >= Number(p.qty),
                )
                .slice(0, 5)
                .map((p) => (
                  <div key={p.id} className="text-[#9A9890]">
                    · {p.part_name}（庫存 {p.stock_on_hand}）
                  </div>
                ))}
            </div>
          </section>
        </div>
      </div>

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

function Row({
  label,
  value,
  bold,
  strong,
  warn,
}: {
  label: string;
  value: string;
  bold?: boolean;
  strong?: boolean;
  warn?: boolean;
}) {
  const valueCls = strong
    ? "text-[18px] font-semibold text-[#1A3A5C] font-mono"
    : warn
      ? "text-[#854F0B]"
      : bold
        ? "font-semibold text-[#2C2C2A]"
        : "text-[#2C2C2A]";
  return (
    <div className="flex items-center justify-between">
      <span className={warn ? "text-[#854F0B]" : "text-[#5A5955]"}>{label}</span>
      <span className={valueCls}>{value}</span>
    </div>
  );
}

function LaborRow({
  line,
  canEdit,
  isEditing,
  onEdit,
  onCancel,
  onSaved,
  onDelete,
  showBanner,
  roId,
  isPending,
  startTransition,
}: {
  line: RepairOrderLineWithStock;
  canEdit: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
  onDelete: () => void;
  showBanner: (b: { ok: boolean; msg: string }) => void;
  roId: string;
  isPending: boolean;
  startTransition: (cb: () => void) => void;
}) {
  const [form, setForm] = useState({
    name: line.labor_name ?? "",
    lu: String(line.labor_units ?? ""),
    unit_price: String(line.unit_price ?? ""),
    note: line.labor_note ?? "",
  });

  function save() {
    startTransition(async () => {
      const res = await updateLaborLineAction(roId, line.id, {
        labor_name: form.name,
        labor_units: Number(form.lu),
        unit_price: Number(form.unit_price),
        labor_note: form.note || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已更新" });
        onSaved();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  if (!isEditing) {
    return (
      <tr className="border-t border-[#EEECE6]">
        <td className="px-3 py-2 text-[#9A9890] font-mono">{line.line_no}</td>
        <td className="px-3 py-2 text-[#2C2C2A]">{line.labor_name}</td>
        <td className="px-3 py-2 text-right font-mono">
          {Number(line.labor_units ?? 0).toFixed(1)}
        </td>
        <td className="px-3 py-2 text-right font-mono">
          {fmtNT(line.unit_price)}
        </td>
        <td className="px-3 py-2 text-right font-mono font-semibold">
          {fmtNT(line.amount)}
        </td>
        <td className="px-3 py-2 text-[11px] text-[#9A9890]">
          {line.labor_note ?? ""}
        </td>
        <td className="px-3 py-2 text-right">
          <div className="inline-flex gap-1.5">
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={onEdit}
                  disabled={isPending}
                  className={`${btnSm} bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]`}
                >
                  編輯
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={isPending}
                  className={`${btnSm} bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]`}
                >
                  刪除
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-[#EEECE6] bg-[#FDF3E3]">
      <td className="px-3 py-2 text-[#9A9890] font-mono">{line.line_no}</td>
      <td className="px-3 py-2">
        <input
          className={inputCls + " w-full"}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className={inputCls + " w-full text-right"}
          type="number"
          step="0.1"
          value={form.lu}
          onChange={(e) => setForm({ ...form, lu: e.target.value })}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className={inputCls + " w-full text-right"}
          type="number"
          value={form.unit_price}
          onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
        />
      </td>
      <td className="px-3 py-2 text-right font-mono text-[#9A9890]">
        {fmtNT(Math.round(Number(form.lu || 0) * Number(form.unit_price || 0)))}
      </td>
      <td className="px-3 py-2">
        <input
          className={inputCls + " w-full"}
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex gap-1.5">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className={`${btnSm} bg-[#0F6E56] text-white hover:bg-[#0a5742]`}
          >
            {isPending ? "儲存中⋯" : "儲存"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className={`${btnSm} bg-white border border-[#D5D3CB] text-[#5A5955]`}
          >
            取消
          </button>
        </div>
      </td>
    </tr>
  );
}

function PartRow({
  line,
  canEdit,
  isEditing,
  onEdit,
  onCancel,
  onSaved,
  onDelete,
  showBanner,
  roId,
  isPending,
  startTransition,
}: {
  line: RepairOrderLineWithStock;
  canEdit: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
  onDelete: () => void;
  showBanner: (b: { ok: boolean; msg: string }) => void;
  roId: string;
  isPending: boolean;
  startTransition: (cb: () => void) => void;
}) {
  const [form, setForm] = useState({
    qty: String(line.qty ?? "1"),
    unit_price: String(line.unit_price ?? ""),
  });

  function save() {
    startTransition(async () => {
      const res = await updatePartLineAction(roId, line.id, {
        qty: Number(form.qty),
        unit_price: Number(form.unit_price),
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已更新" });
        onSaved();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const stockLow =
    line.stock_on_hand != null && line.qty != null && Number(line.stock_on_hand) < Number(line.qty);

  const lc = lifecycleOf(line);
  const chip = lifecycleChip(lc);

  function setLifecycle(next: PartLifecycle) {
    startTransition(async () => {
      const res = await setLinePartLifecycleAction(roId, line.id, next);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已標記「${lifecycleChip(next).label}」` });
        onSaved();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  if (!isEditing) {
    return (
      <tr className="border-t border-[#EEECE6]">
        <td className="px-3 py-2 text-[#9A9890] font-mono">{line.line_no}</td>
        <td className="px-3 py-2 font-mono text-[11px]">{line.part_code}</td>
        <td className="px-3 py-2 text-[#2C2C2A]">
          <span className={lc === "returned" || lc === "replaced" ? "text-[#9A9890]" : ""}>
            {line.part_name}
          </span>
          <span
            className={`ml-1.5 inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium ${chip.cls}`}
            title={`零件 lifecycle：${chip.label}`}
          >
            {chip.label}
          </span>
        </td>
        <td className="px-3 py-2 text-right font-mono">{Number(line.qty ?? 0)}</td>
        <td className="px-3 py-2 text-right font-mono">{fmtNT(line.unit_price)}</td>
        <td className="px-3 py-2 text-right font-mono font-semibold">
          {fmtNT(line.amount)}
        </td>
        <td className="px-3 py-2 text-center">
          <span
            className={`inline-flex px-1.5 py-0.5 rounded-md text-[11px] ${
              stockLow
                ? "bg-[#FDF3E3] text-[#854F0B]"
                : "bg-[#EAF3DE] text-[#3B6D11]"
            }`}
          >
            {stockLow ? "⚠️" : "✓"} {line.stock_on_hand ?? "—"}
          </span>
        </td>
        <td className="px-3 py-2 text-right">
          <div className="inline-flex gap-1.5 flex-wrap justify-end">
            {canEdit && (
              <>
                {lc !== "installed" && (
                  <button
                    type="button"
                    onClick={() => setLifecycle("installed")}
                    disabled={isPending}
                    className={`${btnSm} bg-[#EAF3DE] border border-[#C5DC9F] text-[#3B6D11] hover:bg-[#dceec5]`}
                    title="標記為已安裝"
                  >
                    ✓ 安裝
                  </button>
                )}
                {lc !== "returned" && lc !== "replaced" && (
                  <button
                    type="button"
                    onClick={() => setLifecycle("returned")}
                    disabled={isPending}
                    className={`${btnSm} bg-white border border-[#D5D3CB] text-[#854F0B] hover:border-[#9A9890]`}
                    title="依規則退料"
                  >
                    ↺ 退料
                  </button>
                )}
                {lc !== "replaced" && (
                  <button
                    type="button"
                    onClick={() => setLifecycle("replaced")}
                    disabled={isPending}
                    className={`${btnSm} bg-white border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]`}
                    title="依規則替換（保留原料件作為紀錄）"
                  >
                    ⇄ 替換
                  </button>
                )}
                {lc !== "new" && (
                  <button
                    type="button"
                    onClick={() => setLifecycle("new")}
                    disabled={isPending}
                    className={`${btnSm} bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]`}
                    title="清除標記，回到「新料」"
                  >
                    清除
                  </button>
                )}
                <button
                  type="button"
                  onClick={onEdit}
                  disabled={isPending}
                  className={`${btnSm} bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]`}
                >
                  編輯
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={isPending}
                  className={`${btnSm} bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]`}
                >
                  刪除
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-[#EEECE6] bg-[#FDF3E3]">
      <td className="px-3 py-2 text-[#9A9890] font-mono">{line.line_no}</td>
      <td className="px-3 py-2 font-mono text-[11px] text-[#9A9890]">{line.part_code}</td>
      <td className="px-3 py-2 text-[#9A9890]">{line.part_name}</td>
      <td className="px-3 py-2">
        <input
          className={inputCls + " w-full text-right"}
          type="number"
          min="1"
          value={form.qty}
          onChange={(e) => setForm({ ...form, qty: e.target.value })}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className={inputCls + " w-full text-right"}
          type="number"
          min="0"
          value={form.unit_price}
          onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
        />
      </td>
      <td className="px-3 py-2 text-right font-mono text-[#9A9890]">
        {fmtNT(Math.round(Number(form.qty || 0) * Number(form.unit_price || 0)))}
      </td>
      <td className="px-3 py-2 text-center text-[11px] text-[#9A9890]">
        {line.stock_on_hand ?? "—"}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex gap-1.5">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className={`${btnSm} bg-[#0F6E56] text-white hover:bg-[#0a5742]`}
          >
            {isPending ? "儲存中⋯" : "儲存"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className={`${btnSm} bg-white border border-[#D5D3CB] text-[#5A5955]`}
          >
            取消
          </button>
        </div>
      </td>
    </tr>
  );
}
