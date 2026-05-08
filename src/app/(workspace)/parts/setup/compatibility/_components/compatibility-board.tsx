"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createCompatAction,
  deleteCompatAction,
  toggleVerifiedAction,
} from "@/lib/parts-setup/compatibility-actions";

export type CompatRow = {
  id: string;
  item_id: string;
  motorcycle_model_id: string;
  year_start: number | null;
  year_end: number | null;
  notes: string | null;
  is_verified: boolean | null;
};

export type ItemOption = { id: string; code: string; name: string };
export type ModelOption = {
  id: string;
  series: string | null;
  model_name: string;
  display_name: string | null;
  year_start: number | null;
  year_end: number | null;
};

type Banner = { ok: boolean; msg: string } | null;

export function CompatBoard({
  rows,
  items,
  models,
  canEdit,
}: {
  rows: CompatRow[];
  items: ItemOption[];
  models: ModelOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState({
    item_id: "",
    motorcycle_model_id: "",
    year_start: "",
    year_end: "",
    notes: "",
    is_verified: false,
  });

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const modelMap = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);

  const filteredRows = useMemo(() => {
    if (!filter) return rows;
    const f = filter.toLowerCase();
    return rows.filter((r) => {
      const it = itemMap.get(r.item_id);
      const mod = modelMap.get(r.motorcycle_model_id);
      return (
        (it?.code ?? "").toLowerCase().includes(f) ||
        (it?.name ?? "").toLowerCase().includes(f) ||
        (mod?.model_name ?? "").toLowerCase().includes(f)
      );
    });
  }, [rows, filter, itemMap, modelMap]);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const create = () => {
    startTransition(async () => {
      const res = await createCompatAction({
        item_id: draft.item_id,
        motorcycle_model_id: draft.motorcycle_model_id,
        year_start: draft.year_start ? Number(draft.year_start) : null,
        year_end: draft.year_end ? Number(draft.year_end) : null,
        notes: draft.notes,
        is_verified: draft.is_verified,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已新增適配規則" });
        setDraft({
          item_id: "",
          motorcycle_model_id: "",
          year_start: "",
          year_end: "",
          notes: "",
          is_verified: false,
        });
        setShowCreate(false);
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const toggleV = (id: string, next: boolean) => {
    startTransition(async () => {
      const res = await toggleVerifiedAction(id, next);
      if (res.ok) router.refresh();
      else showBanner({ ok: false, msg: res.error });
    });
  };

  const remove = (id: string) => {
    if (!window.confirm("刪除此適配規則？")) return;
    startTransition(async () => {
      const res = await deleteCompatAction(id);
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
        <h1 className="text-[20px] font-semibold">適配設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          03.3
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          {`共 ${rows.length} 筆 · 顯示 ${filteredRows.length} · 已驗證 ${rows.filter((r) => r.is_verified).length}`}
        </span>
        <input
          placeholder="搜尋料號 / 車型"
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
          ＋ 新增適配
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
          <h2 className="font-semibold text-[13px] mb-3">新增適配規則</h2>
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
              value={draft.motorcycle_model_id}
              onChange={(e) => setDraft({ ...draft, motorcycle_model_id: e.target.value })}
              className={inputClass}
            >
              <option value="">選擇車型*</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name ?? m.model_name}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="起始年份"
              value={draft.year_start}
              onChange={(e) => setDraft({ ...draft, year_start: e.target.value })}
              className={inputClass}
            />
            <input
              type="number"
              placeholder="結束年份"
              value={draft.year_end}
              onChange={(e) => setDraft({ ...draft, year_end: e.target.value })}
              className={inputClass}
            />
            <input
              placeholder="備註"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              className={inputClass}
            />
            <label className="flex items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={draft.is_verified}
                onChange={(e) => setDraft({ ...draft, is_verified: e.target.checked })}
              />
              已驗證
            </label>
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
                <th className="px-3 py-2 text-left">適配車型</th>
                <th className="px-3 py-2 text-left">年份範圍</th>
                <th className="px-3 py-2 text-left">備註</th>
                <th className="px-3 py-2 text-left">驗證</th>
                <th className="px-3 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, 200).map((r) => {
                const it = itemMap.get(r.item_id);
                const m = modelMap.get(r.motorcycle_model_id);
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-mono">{it?.code ?? "—"}</td>
                    <td className="px-3 py-2">{it?.name ?? "—"}</td>
                    <td className="px-3 py-2">
                      {m?.display_name ?? m?.model_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {r.year_start || r.year_end
                        ? `${r.year_start ?? "—"} ~ ${r.year_end ?? "—"}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-[#666]">{r.notes ?? "—"}</td>
                    <td className="px-3 py-2">
                      {canEdit ? (
                        <input
                          type="checkbox"
                          checked={Boolean(r.is_verified)}
                          onChange={(e) => toggleV(r.id, e.target.checked)}
                        />
                      ) : (
                        <span>{r.is_verified ? "✓" : "—"}</span>
                      )}
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
                  <td colSpan={7} className="px-3 py-6 text-center text-[#888]">
                    無適配資料
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
