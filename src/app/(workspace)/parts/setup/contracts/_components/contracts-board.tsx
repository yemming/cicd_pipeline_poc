"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createContractAction,
  deleteContractAction,
  updateContractAction,
  type ContractInput,
} from "@/lib/parts-setup/contract-actions";

export type ContractRow = {
  id: string;
  supplier_id: string;
  contract_no: string;
  effective_from: string | null;
  effective_to: string | null;
  payment_terms: string | null;
  min_order_amount: number | null;
  notes: string | null;
  status: string | null;
  document_url: string | null;
};

export type SupplierOption = { id: string; code: string; name: string };

type Banner = { ok: boolean; msg: string } | null;

const STATUS_BADGE: Record<string, string> = {
  active: "bg-[#EAF3DE] text-[#3B6D11]",
  expired: "bg-[#F0F0F0] text-[#444]",
  terminated: "bg-[#FDECEA] text-[#CC0000]",
};

export function ContractsBoard({
  rows,
  suppliers,
  canEdit,
}: {
  rows: ContractRow[];
  suppliers: SupplierOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<ContractInput>({
    supplier_id: "",
    contract_no: "",
    status: "active",
  });

  const supplierMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  );

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const create = () => {
    startTransition(async () => {
      const res = await createContractAction(draft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已建立合約" });
        setDraft({ supplier_id: "", contract_no: "", status: "active" });
        setShowCreate(false);
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const updateField = (id: string, patch: Partial<ContractInput>) => {
    startTransition(async () => {
      const res = await updateContractAction(id, patch);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const remove = (id: string, no: string) => {
    if (!window.confirm(`刪除合約「${no}」？`)) return;
    startTransition(async () => {
      const res = await deleteContractAction(id);
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
        <h1 className="text-[20px] font-semibold">採購合約</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          02.2
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">{`共 ${rows.length} 份合約`}</span>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setShowCreate(!showCreate)}
          className="ml-auto px-3 py-1.5 text-[12.5px] rounded bg-[#0F6E56] text-white disabled:opacity-50"
        >
          ＋ 新增合約
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
          <h2 className="font-semibold text-[13px] mb-3">新增採購合約</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            <select
              value={draft.supplier_id}
              onChange={(e) => setDraft({ ...draft, supplier_id: e.target.value })}
              className={inputClass}
            >
              <option value="">選擇供應商*</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {`${s.code} ${s.name}`}
                </option>
              ))}
            </select>
            <input
              placeholder="合約號*"
              value={draft.contract_no}
              onChange={(e) => setDraft({ ...draft, contract_no: e.target.value })}
              className={inputClass}
            />
            <input
              type="date"
              value={draft.effective_from ?? ""}
              onChange={(e) => setDraft({ ...draft, effective_from: e.target.value })}
              className={inputClass}
            />
            <input
              type="date"
              value={draft.effective_to ?? ""}
              onChange={(e) => setDraft({ ...draft, effective_to: e.target.value })}
              className={inputClass}
            />
            <input
              placeholder="付款條件"
              value={draft.payment_terms ?? ""}
              onChange={(e) => setDraft({ ...draft, payment_terms: e.target.value })}
              className={inputClass}
            />
            <input
              type="number"
              placeholder="最低訂購金額"
              value={draft.min_order_amount ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  min_order_amount: e.target.value ? Number(e.target.value) : null,
                })
              }
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
                <th className="px-3 py-2 text-left">合約號</th>
                <th className="px-3 py-2 text-left">供應商</th>
                <th className="px-3 py-2 text-left">生效自</th>
                <th className="px-3 py-2 text-left">到期日</th>
                <th className="px-3 py-2 text-left">付款條件</th>
                <th className="px-3 py-2 text-right">最低訂購</th>
                <th className="px-3 py-2 text-left">狀態</th>
                <th className="px-3 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono">{r.contract_no}</td>
                  <td className="px-3 py-2">
                    {supplierMap.get(r.supplier_id)?.name ?? r.supplier_id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2">{r.effective_from ?? "—"}</td>
                  <td className="px-3 py-2">{r.effective_to ?? "—"}</td>
                  <td className="px-3 py-2">{r.payment_terms ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.min_order_amount
                      ? Number(r.min_order_amount).toLocaleString("en-US")
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <select
                        value={r.status ?? "active"}
                        onChange={(e) =>
                          updateField(r.id, { status: e.target.value })
                        }
                        className="h-7 border border-[#DADADA] rounded px-2 text-[12px]"
                      >
                        <option value="active">啟用</option>
                        <option value="expired">已到期</option>
                        <option value="terminated">已終止</option>
                      </select>
                    ) : (
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] ${
                          STATUS_BADGE[r.status ?? "active"] ?? STATUS_BADGE.active
                        }`}
                      >
                        {r.status ?? "active"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => remove(r.id, r.contract_no)}
                      className="px-2 py-1 rounded border border-[#CC0000] text-[#CC0000] text-[11.5px] disabled:opacity-50"
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-[#888]">
                    尚無合約 — 點右上「新增合約」開始
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
