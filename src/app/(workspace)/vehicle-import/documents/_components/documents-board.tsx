"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  createDocumentAction,
  updateDocumentAction,
  deleteDocumentAction,
  type DocumentInput,
} from "@/lib/vehicle-import/document-actions";
import type { ImportDocumentRow } from "@/domain/import-documents";
import type { DocumentFilters } from "@/domain/import-documents";
import {
  DOC_TYPES,
  DOC_TYPE_LABEL,
  DOC_TYPE_STAGE,
} from "@/domain/import-documents.constants";
import {
  SHIPMENT_STAGES,
  SHIPMENT_STAGE_LABEL,
} from "@/domain/import-shipments.constants";

type Banner = { ok: boolean; msg: string } | null;
type ShipmentOption = { id: string; shipment_no: string };
type VehicleOption = { id: string; vin: string | null; shipment_id: string };

type FormState = {
  id: string | null;
  doc_type: string;
  shipment_id: string;
  vehicle_id: string;
  doc_no: string;
  issued_by: string;
  issued_date: string;
  file_url: string;
};

const EMPTY_FORM: FormState = {
  id: null,
  doc_type: "pi",
  shipment_id: "",
  vehicle_id: "",
  doc_no: "",
  issued_by: "",
  issued_date: "",
  file_url: "",
};

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

export function DocumentsBoard({
  rows,
  filters,
  shipmentOptions,
  vehicleOptions,
}: {
  rows: ImportDocumentRow[];
  filters: DocumentFilters;
  shipmentOptions: ShipmentOption[];
  vehicleOptions: VehicleOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [fQ, setFQ] = useState(filters.q ?? "");
  const [fType, setFType] = useState(filters.doc_type ?? "all");
  const [fStage, setFStage] = useState(filters.stage ?? "all");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const buildHref = (o: Partial<DocumentFilters> = {}) => {
    const p = new URLSearchParams();
    const q = o.q ?? fQ.trim();
    const type = o.doc_type ?? fType;
    const stage = o.stage ?? fStage;
    if (q) p.set("q", q);
    if (type !== "all") p.set("doc_type", type);
    if (stage !== "all") p.set("stage", stage);
    const qs = p.toString();
    return qs ? `/vehicle-import/documents?${qs}` : "/vehicle-import/documents";
  };
  const submitFilters = () => startTransition(() => router.push(buildHref()));
  const resetFilters = () => {
    setFQ("");
    setFType("all");
    setFStage("all");
    startTransition(() => router.push("/vehicle-import/documents"));
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };
  const openEdit = (r: ImportDocumentRow) => {
    setForm({
      id: r.id,
      doc_type: r.doc_type,
      shipment_id: r.shipment_id ?? "",
      vehicle_id: r.vehicle_id ?? "",
      doc_no: r.doc_no ?? "",
      issued_by: r.issued_by ?? "",
      issued_date: r.issued_date ?? "",
      file_url: r.file_url ?? "",
    });
    setModalOpen(true);
  };

  // 批次 → 車輛相依下拉：選了批次才列該批車輛
  const vehiclesForShipment = useMemo(
    () => (form.shipment_id ? vehicleOptions.filter((v) => v.shipment_id === form.shipment_id) : []),
    [form.shipment_id, vehicleOptions],
  );

  const submitForm = () => {
    if (!form.doc_type) {
      showBanner({ ok: false, msg: "請選擇文件類型" });
      return;
    }
    const payload: DocumentInput = {
      doc_type: form.doc_type,
      shipment_id: form.shipment_id || null,
      vehicle_id: form.vehicle_id || null,
      doc_no: form.doc_no.trim() || null,
      issued_by: form.issued_by.trim() || null,
      issued_date: form.issued_date || null,
      file_url: form.file_url.trim() || null,
      stage: DOC_TYPE_STAGE[form.doc_type] ?? null,
    };
    startTransition(async () => {
      const res = form.id
        ? await updateDocumentAction(form.id, payload)
        : await createDocumentAction(payload);
      if (res.ok) {
        setModalOpen(false);
        showBanner({ ok: true, msg: form.id ? "✓ 已更新" : "✓ 已建立" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = (r: ImportDocumentRow) => {
    if (!confirm(`刪除文件「${DOC_TYPE_LABEL[r.doc_type] ?? r.doc_type}${r.doc_no ? ` ${r.doc_no}` : ""}」？`))
      return;
    startTransition(async () => {
      const res = await deleteDocumentAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const columns: DataGridColumn<ImportDocumentRow>[] = [
    {
      id: "doc_type",
      header: "文件類型",
      width: 170,
      hideable: false,
      cell: (r) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-[#EAF4FB] text-[#185FA5]">
          {DOC_TYPE_LABEL[r.doc_type] ?? r.doc_type}
        </span>
      ),
      exportValue: (r) => DOC_TYPE_LABEL[r.doc_type] ?? r.doc_type,
      sortValue: (r) => r.doc_type,
    },
    {
      id: "doc_no",
      header: "單號",
      width: 140,
      cell: (r) => <span className="font-mono text-[12px] text-[#2C2C2A]">{r.doc_no ?? "—"}</span>,
      exportValue: (r) => r.doc_no ?? "",
      sortValue: (r) => r.doc_no ?? "",
    },
    {
      id: "link",
      header: "關聯",
      width: 200,
      sortable: false,
      cell: (r) => (
        <span className="text-[12px] text-[#5A5955]">
          {r.shipment_no ? `批次 ${r.shipment_no}` : ""}
          {r.po_no ? `${r.shipment_no ? " · " : ""}PO ${r.po_no}` : ""}
          {r.vehicle_vin ? `${r.shipment_no || r.po_no ? " · " : ""}VIN ${r.vehicle_vin}` : ""}
          {!r.shipment_no && !r.po_no && !r.vehicle_vin ? "—" : ""}
        </span>
      ),
      exportValue: (r) =>
        [r.shipment_no && `批次 ${r.shipment_no}`, r.po_no && `PO ${r.po_no}`, r.vehicle_vin && `VIN ${r.vehicle_vin}`]
          .filter(Boolean)
          .join(" · "),
    },
    {
      id: "stage",
      header: "階段",
      width: 80,
      cell: (r) => (
        <span className="text-[12px] text-[#5A5955]">
          {r.stage ? (SHIPMENT_STAGE_LABEL[r.stage] ?? r.stage) : "—"}
        </span>
      ),
      exportValue: (r) => (r.stage ? SHIPMENT_STAGE_LABEL[r.stage] ?? r.stage : ""),
      sortValue: (r) => r.stage ?? "",
    },
    {
      id: "issued_by",
      header: "開立單位",
      width: 120,
      cell: (r) => <span className="text-[12px] text-[#5A5955]">{r.issued_by ?? "—"}</span>,
      exportValue: (r) => r.issued_by ?? "",
    },
    {
      id: "issued_date",
      header: "開立日期",
      width: 110,
      cell: (r) => <span className="text-[12px] text-[#5A5955]">{r.issued_date ?? "—"}</span>,
      exportValue: (r) => r.issued_date ?? "",
      sortValue: (r) => r.issued_date ?? "",
    },
    {
      id: "file_url",
      header: "連結",
      width: 80,
      sortable: false,
      cell: (r) =>
        r.file_url ? (
          <a
            href={r.file_url}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-[#185FA5] hover:underline"
          >
            開啟
          </a>
        ) : (
          <span className="text-[12px] text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.file_url ?? "",
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">進口文件</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          P2P
        </span>
        <span className="text-[12px] text-[#9A9890]">
          7-stage 進口文件登記：PI / CI / B/L / 報單 / 完稅 / VSCC…，可掛批次・採購單・車輛
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

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字</label>
            <input
              className={inputClass}
              placeholder="單號 / 開立單位"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>文件類型</label>
            <select className={inputClass} value={fType} onChange={(e) => setFType(e.target.value)}>
              <option value="all">全部</option>
              {DOC_TYPES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>階段</label>
            <select className={inputClass} value={fStage} onChange={(e) => setFStage(e.target.value)}>
              <option value="all">全部</option>
              {SHIPMENT_STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.short}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={submitFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              onClick={resetFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              onClick={openCreate}
              disabled={isPending}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增文件
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 份文件
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="vehicle-import/documents"
        exportFileName="import-documents"
        emptyMessage="沒有符合條件的文件（點右上「新增文件」登記）"
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
              onClick={() => removeRow(r)}
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
          <div className="w-full max-w-[560px] bg-white rounded-lg shadow-xl border border-[#EEECE6] overflow-hidden">
            <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
                {form.id ? "編輯文件" : "新增進口文件"}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="ml-auto text-[#9A9890] hover:text-[#5A5955] text-[18px] leading-none"
              >
                ×
              </button>
            </header>
            <div className={`px-4 py-4 grid grid-cols-2 gap-x-4 gap-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>文件類型 *</label>
                <select
                  className={inputClass}
                  value={form.doc_type}
                  onChange={(e) => setForm((f) => ({ ...f, doc_type: e.target.value }))}
                >
                  {DOC_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>單號</label>
                <input
                  className={inputClass}
                  value={form.doc_no}
                  onChange={(e) => setForm((f) => ({ ...f, doc_no: e.target.value }))}
                  placeholder="例：PI-2026-001"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>關聯批次</label>
                <select
                  className={inputClass}
                  value={form.shipment_id}
                  onChange={(e) => setForm((f) => ({ ...f, shipment_id: e.target.value, vehicle_id: "" }))}
                >
                  <option value="">（不指定）</option>
                  {shipmentOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shipment_no}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>關聯車輛（VIN）</label>
                <select
                  className={inputClass}
                  value={form.vehicle_id}
                  onChange={(e) => setForm((f) => ({ ...f, vehicle_id: e.target.value }))}
                  disabled={!form.shipment_id}
                >
                  <option value="">（整批 / 不指定）</option>
                  {vehiclesForShipment.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.vin ?? v.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>開立單位</label>
                <input
                  className={inputClass}
                  value={form.issued_by}
                  onChange={(e) => setForm((f) => ({ ...f, issued_by: e.target.value }))}
                  placeholder="例：海關 / 原廠 / VSCC"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>開立日期</label>
                <input
                  type="date"
                  className={inputClass}
                  value={form.issued_date}
                  onChange={(e) => setForm((f) => ({ ...f, issued_date: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1 col-span-2">
                <label className={labelClass}>檔案連結（URL）</label>
                <input
                  className={inputClass}
                  value={form.file_url}
                  onChange={(e) => setForm((f) => ({ ...f, file_url: e.target.value }))}
                  placeholder="貼上掃描檔 / 雲端連結"
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
                onClick={submitForm}
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
