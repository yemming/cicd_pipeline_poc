"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deletePriceAction,
  upsertPriceAction,
} from "@/lib/parts-setup/pricing-actions";

export type PriceRow = {
  id: string;
  item_id: string;
  org_id: string | null;
  price: number;
  pricing_type: string | null;
  promo_start_date: string | null;
  promo_end_date: string | null;
  is_active: boolean | null;
  notes: string | null;
};

export type ItemOption = {
  id: string;
  code: string;
  name: string;
  suggested_price: number | null;
};

export type OrgOption = { id: string; code: string; name: string };

type Banner = { ok: boolean; msg: string } | null;

const PRICING_TYPE_LABEL: Record<string, string> = {
  list: "標準價",
  promo: "促銷價",
  vip: "VIP",
  contract: "合約價",
};

export function PricingBoard({
  rows,
  items,
  orgs,
  canEdit,
}: {
  rows: PriceRow[];
  items: ItemOption[];
  orgs: OrgOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({
    item_id: "",
    org_id: "",
    price: "",
    pricing_type: "list",
    notes: "",
  });
  const [filter, setFilter] = useState("");

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const orgMap = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);

  const filteredRows = useMemo(() => {
    if (!filter) return rows;
    const f = filter.toLowerCase();
    return rows.filter((r) => {
      const it = itemMap.get(r.item_id);
      return (
        (it?.code ?? "").toLowerCase().includes(f) ||
        (it?.name ?? "").toLowerCase().includes(f)
      );
    });
  }, [rows, filter, itemMap]);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const create = () => {
    if (!draft.price) return showBanner({ ok: false, msg: "請輸入價格" });
    startTransition(async () => {
      const res = await upsertPriceAction({
        item_id: draft.item_id,
        org_id: draft.org_id || null,
        price: Number(draft.price),
        pricing_type: draft.pricing_type,
        notes: draft.notes,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已新增價格" });
        setDraft({ item_id: "", org_id: "", price: "", pricing_type: "list", notes: "" });
        setShowCreate(false);
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const updatePrice = (id: string, item_id: string, value: string) => {
    if (!value) return;
    startTransition(async () => {
      const res = await upsertPriceAction({
        id,
        item_id,
        org_id: null,
        price: Number(value),
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const remove = (id: string) => {
    if (!window.confirm("刪除此筆定價？")) return;
    startTransition(async () => {
      const res = await deletePriceAction(id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";
  const inputClass = "h-7 border border-[#DADADA] rounded px-2 text-[12px] w-full";

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">門市定價</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          03.4
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          {`共 ${rows.length} 筆 · 顯示 ${filteredRows.length}`}
        </span>
        <input
          placeholder="搜尋料號 / 商品"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-7 border border-[#DADADA] rounded px-2 text-[12px] ml-auto w-[260px]"
        />
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 text-[12.5px] rounded bg-[#0F6E56] text-white disabled:opacity-50"
        >
          ＋ 新增定價
        </button>
      </header>

      {banner ? (
        <div
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {showCreate ? (
        <section className={`rounded-md border border-[#0F6E56] bg-[#F5FCF8] p-4 ${lockedClass}`}>
          <h2 className="font-semibold text-[13px] mb-3">新增定價</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <select
              value={draft.item_id}
              onChange={(e) => setDraft({ ...draft, item_id: e.target.value })}
              className={inputClass}
            >
              <option value="">選擇料號*</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {`${i.code} ${i.name}`}
                </option>
              ))}
            </select>
            <select
              value={draft.org_id}
              onChange={(e) => setDraft({ ...draft, org_id: e.target.value })}
              className={inputClass}
            >
              <option value="">所有門市（預設）</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {`${o.code} ${o.name}`}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="價格*"
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              className={inputClass}
            />
            <select
              value={draft.pricing_type}
              onChange={(e) => setDraft({ ...draft, pricing_type: e.target.value })}
              className={inputClass}
            >
              <option value="list">標準價</option>
              <option value="promo">促銷價</option>
              <option value="vip">VIP</option>
              <option value="contract">合約價</option>
            </select>
            <input
              placeholder="備註"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={create}
              className="px-3 py-1.5 rounded bg-[#0F6E56] text-white text-[12.5px]"
            >
              建立
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 rounded border border-[#DADADA] text-[12.5px]"
            >
              取消
            </button>
          </div>
        </section>
      ) : null}

      <section className={`rounded-md border border-[#E1E1E1] bg-white ${lockedClass}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">料號</th>
                <th className="px-3 py-2 text-left">商品</th>
                <th className="px-3 py-2 text-right">建議售價</th>
                <th className="px-3 py-2 text-right">實際售價</th>
                <th className="px-3 py-2 text-left">類型</th>
                <th className="px-3 py-2 text-left">門市</th>
                <th className="px-3 py-2 text-left">啟用</th>
                <th className="px-3 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, 200).map((r) => {
                const it = itemMap.get(r.item_id);
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-mono">{it?.code ?? "—"}</td>
                    <td className="px-3 py-2">{it?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-[#888]">
                      {it?.suggested_price
                        ? Number(it.suggested_price).toLocaleString("en-US")
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {canEdit ? (
                        <input
                          type="number"
                          defaultValue={r.price}
                          onBlur={(e) =>
                            updatePrice(r.id, r.item_id, e.currentTarget.value)
                          }
                          className="h-7 border border-[#DADADA] rounded px-2 text-right w-[100px]"
                        />
                      ) : (
                        Number(r.price).toLocaleString("en-US")
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded bg-[#EBF3FF] text-[#1A3A5C] text-[11px]">
                        {PRICING_TYPE_LABEL[r.pricing_type ?? "list"] ?? r.pricing_type}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {r.org_id ? orgMap.get(r.org_id)?.name ?? "—" : "全門市"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] ${
                          r.is_active
                            ? "bg-[#EAF3DE] text-[#3B6D11]"
                            : "bg-[#F0F0F0] text-[#444]"
                        }`}
                      >
                        {r.is_active ? "啟用" : "停用"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => remove(r.id)}
                        className="px-2 py-1 rounded border border-[#CC0000] text-[#CC0000] text-[11.5px] disabled:opacity-50"
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-[#888]">
                    無定價資料
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
