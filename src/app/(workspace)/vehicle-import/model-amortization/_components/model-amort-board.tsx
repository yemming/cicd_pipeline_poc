"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  saveModelAmortRuleAction,
  setModelAmortActiveAction,
  deleteModelAmortRuleAction,
} from "@/lib/vehicle-import/model-amortization-actions";
import type { ModelAmortRule } from "@/domain/model-amortization";

type Banner = { ok: boolean; msg: string } | null;
type ModelOption = { id: string; display_name: string; series: string | null };
type FormState = { id: string | null; model_id: string; amort_weight: string; note: string };

const EMPTY: FormState = { id: null, model_id: "", amort_weight: "1", note: "" };
const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

export function ModelAmortBoard({
  rules,
  modelOptions,
}: {
  rules: ModelAmortRule[];
  modelOptions: ModelOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const openCreate = () => {
    setForm(EMPTY);
    setModalOpen(true);
  };
  const openEdit = (r: ModelAmortRule) => {
    setForm({ id: r.id, model_id: r.model_id, amort_weight: String(r.amort_weight), note: r.note ?? "" });
    setModalOpen(true);
  };

  const submit = () => {
    const w = Number(form.amort_weight);
    if (!form.model_id) return showBanner({ ok: false, msg: "請選擇車型" });
    if (!Number.isFinite(w) || w < 0) return showBanner({ ok: false, msg: "權重需為 ≥ 0 的數字" });
    startTransition(async () => {
      const res = await saveModelAmortRuleAction(
        { model_id: form.model_id, amort_weight: w, note: form.note.trim() || null },
        form.id ?? undefined,
      );
      if (res.ok) {
        setModalOpen(false);
        showBanner({ ok: true, msg: form.id ? "✓ 已更新" : "✓ 已建立" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const toggleActive = (r: ModelAmortRule) => {
    startTransition(async () => {
      const res = await setModelAmortActiveAction(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const remove = (r: ModelAmortRule) => {
    if (!confirm(`刪除「${r.model_name ?? r.model_id}」的攤提規則？`)) return;
    startTransition(async () => {
      const res = await deleteModelAmortRuleAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const columns: DataGridColumn<ModelAmortRule>[] = [
    {
      id: "model",
      header: "車型",
      width: 220,
      hideable: false,
      cell: (r) => (
        <span className="text-[12.5px] text-[#2C2C2A]">
          {r.model_series ? <span className="text-[#9A9890]">{r.model_series} · </span> : null}
          {r.model_name ?? r.model_id.slice(0, 8)}
        </span>
      ),
      exportValue: (r) => `${r.model_series ?? ""} ${r.model_name ?? ""}`.trim(),
      sortValue: (r) => r.model_name ?? "",
    },
    {
      id: "amort_weight",
      header: "攤提權重",
      width: 100,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{r.amort_weight}</span>,
      exportValue: (r) => String(r.amort_weight),
      sortValue: (r) => r.amort_weight,
    },
    {
      id: "note",
      header: "備註",
      cell: (r) => <span className="text-[12px] text-[#5A5955]">{r.note ?? "—"}</span>,
      exportValue: (r) => r.note ?? "",
      sortable: false,
    },
    {
      id: "is_active",
      header: "狀態",
      width: 80,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
            r.is_active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F2F2F2] text-[#6B6A68]"
          }`}
        >
          {r.is_active ? "啟用" : "停用"}
        </span>
      ),
      exportValue: (r) => (r.is_active ? "啟用" : "停用"),
      sortValue: (r) => (r.is_active ? 1 : 0),
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">車型攤提設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">P2P</span>
        <span className="text-[12px] text-[#9A9890]">
          車型導入費 / VSCC 車型審驗費等「按車型攤提」費用的權重；未設定的車型權重 = 1（均攤）
        </span>
      </header>

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

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rules.length}</b> 條規則
        </span>
        <div className="ml-auto">
          <button
            onClick={openCreate}
            disabled={isPending}
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增攤提規則
          </button>
        </div>
      </div>

      <DataGrid
        columns={columns}
        data={rules}
        rowKey={(r) => r.id}
        persistKey="vehicle-import/model-amortization"
        exportFileName="model-amortization"
        emptyMessage="尚未設定車型攤提規則（未設定的車型一律均攤）"
        disabled={isPending}
        rowActions={(r) => (
          <>
            <button
              onClick={() => openEdit(r)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              onClick={() => toggleActive(r)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {r.is_active ? "停用" : "啟用"}
            </button>
            <button
              onClick={() => remove(r)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-40"
            >
              刪除
            </button>
          </>
        )}
      />

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-[460px] bg-white rounded-lg shadow-xl border border-[#EEECE6] overflow-hidden">
            <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
                {form.id ? "編輯攤提規則" : "新增車型攤提規則"}
              </h2>
              <button onClick={() => setModalOpen(false)} className="ml-auto text-[#9A9890] hover:text-[#5A5955] text-[18px] leading-none">
                ×
              </button>
            </header>
            <div className={`px-4 py-4 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>車型 *</label>
                <select
                  className={inputClass}
                  value={form.model_id}
                  onChange={(e) => setForm((f) => ({ ...f, model_id: e.target.value }))}
                  disabled={!!form.id}
                >
                  <option value="">請選擇⋯</option>
                  {modelOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.series ? `${m.series} · ` : ""}
                      {m.display_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>攤提權重（每台相對權重，1 = 均攤）</label>
                <input
                  className={inputClass}
                  value={form.amort_weight}
                  onChange={(e) => setForm((f) => ({ ...f, amort_weight: e.target.value }))}
                  placeholder="例：1.5（此車型每台多吃 1.5 倍攤提）"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>備註</label>
                <input
                  className={inputClass}
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                onClick={submit}
                disabled={isPending}
                className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isPending ? (form.id ? "儲存中⋯" : "建立中⋯") : form.id ? "儲存變更" : "建立"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}
