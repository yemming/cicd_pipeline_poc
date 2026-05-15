"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  PRE_INSPECTION_STATUS,
  STATUS_CHIP,
  STATUS_LABEL,
  type PreInspectionStatus,
} from "@/domain/pre-inspections.constants";
import type {
  PreInspectionListRow,
  AppointmentCandidate,
} from "@/domain/pre-inspections";
import {
  createBlankAction,
  createFromAppointmentAction,
} from "@/lib/aftersales/pre-inspection-actions";

type Banner = { ok: boolean; msg: string } | null;
type Filter = { status: PreInspectionStatus | "all"; q: string };

type Props = {
  rows: PreInspectionListRow[];
  candidates: AppointmentCandidate[];
  filter: Filter;
  canEdit: boolean;
};

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtMoney(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `NT$${Math.round(n).toLocaleString()}`;
}

export function PreInspectionsBoard({ rows, candidates, filter, canEdit }: Props) {
  useSetPageHeader({
    title: "接待預檢",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "接待預檢" },
    ],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"appt" | "blank">(
    candidates.length > 0 ? "appt" : "blank",
  );
  const [selectedApptId, setSelectedApptId] = useState<string>(candidates[0]?.id ?? "");
  const [blankForm, setBlankForm] = useState({
    customer_name: "",
    customer_phone: "",
    vehicle_license_plate: "",
    vehicle_model_name: "",
    mileage_in: "" as string,
    sa_name: "",
  });
  const [statusLocal, setStatusLocal] = useState<Filter["status"]>(filter.status);
  const [qLocal, setQLocal] = useState(filter.q);

  function showBanner(b: NonNullable<Banner>) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function applyFilter() {
    const params = new URLSearchParams();
    if (statusLocal !== "all") params.set("status", statusLocal);
    if (qLocal.trim()) params.set("q", qLocal.trim());
    startTransition(() => {
      router.push(`/parts/aftersales/pre-inspections?${params.toString()}`);
    });
  }
  function resetFilter() {
    setStatusLocal("all");
    setQLocal("");
    startTransition(() => {
      router.push(`/parts/aftersales/pre-inspections`);
    });
  }

  function handleCreate() {
    startTransition(async () => {
      if (createMode === "appt") {
        if (!selectedApptId) {
          showBanner({ ok: false, msg: "請選擇預約" });
          return;
        }
        const res = await createFromAppointmentAction(selectedApptId);
        if (res.ok) {
          showBanner({ ok: true, msg: "✓ 已建立預檢，跳轉中⋯" });
          setCreateOpen(false);
          router.push(`/parts/aftersales/pre-inspections/${res.data.id}`);
        } else {
          showBanner({ ok: false, msg: res.error });
        }
        return;
      }
      const res = await createBlankAction({
        customer_name: blankForm.customer_name.trim() || undefined,
        customer_phone: blankForm.customer_phone.trim() || undefined,
        vehicle_license_plate: blankForm.vehicle_license_plate.trim() || undefined,
        vehicle_model_name: blankForm.vehicle_model_name.trim() || undefined,
        mileage_in: blankForm.mileage_in ? Number(blankForm.mileage_in) : null,
        sa_name: blankForm.sa_name.trim() || undefined,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已建立預檢，跳轉中⋯" });
        setCreateOpen(false);
        router.push(`/parts/aftersales/pre-inspections/${res.data.id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const columns = useMemo<DataGridColumn<PreInspectionListRow>[]>(
    () => [
      {
        id: "pi_no",
        header: "預檢編號",
        width: 150,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/aftersales/pre-inspections/${r.id}`}
            className="font-mono font-semibold text-[#1A3A5C] hover:underline"
          >
            {r.pi_no}
          </Link>
        ),
        exportValue: (r) => r.pi_no,
        sortValue: (r) => r.pi_no,
      },
      {
        id: "status",
        header: "狀態",
        width: 110,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${STATUS_CHIP[r.status]}`}
          >
            {STATUS_LABEL[r.status]}
          </span>
        ),
        exportValue: (r) => STATUS_LABEL[r.status],
        sortValue: (r) => r.status,
      },
      {
        id: "customer",
        header: "車主",
        cell: (r) => (
          <span>
            {r.customer_name ?? "—"}
            {r.customer_phone ? (
              <span className="ml-1.5 text-[11px] text-[#9A9890]">{r.customer_phone}</span>
            ) : null}
          </span>
        ),
        exportValue: (r) => `${r.customer_name ?? ""} ${r.customer_phone ?? ""}`.trim(),
      },
      {
        id: "vehicle",
        header: "車輛",
        cell: (r) => (
          <span>
            <span className="font-mono">{r.vehicle_license_plate ?? "—"}</span>
            {r.vehicle_model_name ? (
              <span className="ml-1.5 text-[11px] text-[#5A5955]">{r.vehicle_model_name}</span>
            ) : null}
          </span>
        ),
        exportValue: (r) =>
          `${r.vehicle_license_plate ?? ""} ${r.vehicle_model_name ?? ""}`.trim(),
      },
      {
        id: "mileage_in",
        header: "進廠里程",
        width: 100,
        align: "right",
        cell: (r) => (r.mileage_in ? r.mileage_in.toLocaleString() : "—"),
        exportValue: (r) => r.mileage_in,
        sortValue: (r) => r.mileage_in ?? 0,
      },
      {
        id: "checks",
        header: "環檢進度",
        width: 110,
        cell: (r) => (
          <span className="text-[11.5px]">
            {r.done_checks}/{r.total_checks}
            {r.damage_count > 0 && (
              <span className="ml-1.5 inline-flex items-center px-1 py-0.5 rounded text-[10px] bg-[#FCEBEB] text-[#CC0000]">
                損傷{r.damage_count}
              </span>
            )}
            {r.warning_count > 0 && (
              <span className="ml-1 inline-flex items-center px-1 py-0.5 rounded text-[10px] bg-[#FAEEDA] text-[#854F0B]">
                注意{r.warning_count}
              </span>
            )}
          </span>
        ),
        exportValue: (r) => `${r.done_checks}/${r.total_checks}`,
        sortValue: (r) => (r.total_checks ? r.done_checks / r.total_checks : 0),
      },
      {
        id: "estimated_subtotal",
        header: "預估費用",
        width: 110,
        align: "right",
        cell: (r) => fmtMoney(r.estimated_subtotal),
        exportValue: (r) => r.estimated_subtotal,
        sortValue: (r) => r.estimated_subtotal ?? 0,
      },
      {
        id: "sa",
        header: "接待 SA",
        width: 100,
        cell: (r) => r.sa_name ?? "—",
        exportValue: (r) => r.sa_name,
      },
      {
        id: "updated_at",
        header: "更新時間",
        width: 140,
        cell: (r) => fmtDateTime(r.updated_at),
        exportValue: (r) => r.updated_at,
        sortValue: (r) => r.updated_at,
      },
    ],
    [],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">接待預檢</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Sprint 5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          客戶到店 → SA 環車 → 來意 → 技師 → 報價 → 簽名 → 轉正式工單
        </span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
            <select
              value={statusLocal}
              onChange={(e) => setStatusLocal(e.target.value as Filter["status"])}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white"
            >
              <option value="all">全部</option>
              {PRE_INSPECTION_STATUS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <label className="text-[11px] text-[#9A9890] font-medium">關鍵字</label>
            <input
              value={qLocal}
              onChange={(e) => setQLocal(e.target.value)}
              placeholder="預檢編號 / 車主 / 車牌"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilter();
              }}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={applyFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              onClick={resetFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
            {canEdit && (
              <button
                onClick={() => setCreateOpen(true)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                ＋ 新增預檢
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆預檢單
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="aftersales/pre-inspections"
        exportFileName="pre-inspections"
        emptyMessage="沒有符合條件的預檢單"
        disabled={isPending}
      />

      {createOpen && canEdit && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-40"
          onClick={() => !isPending && setCreateOpen(false)}
        >
          <div
            className="bg-white rounded-lg p-5 w-[520px] max-w-[92vw] shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[14px] font-semibold text-[#2C2C2A]">新增預檢單</h2>
            <div className="flex border border-[#EEECE6] rounded overflow-hidden text-[12px]">
              <button
                onClick={() => setCreateMode("appt")}
                className={`flex-1 h-[30px] ${
                  createMode === "appt"
                    ? "bg-[#1A3A5C] text-white"
                    : "bg-white text-[#5A5955] hover:bg-[#F8F7F4]"
                }`}
              >
                從預約建立（{candidates.length}）
              </button>
              <button
                onClick={() => setCreateMode("blank")}
                className={`flex-1 h-[30px] ${
                  createMode === "blank"
                    ? "bg-[#1A3A5C] text-white"
                    : "bg-white text-[#5A5955] hover:bg-[#F8F7F4]"
                }`}
              >
                空白單（無預約）
              </button>
            </div>

            {createMode === "appt" ? (
              candidates.length === 0 ? (
                <div className="text-[12.5px] text-[#9A9890] py-4 text-center">
                  目前沒有可建立預檢的預約（已 confirmed / checked_in / in_progress 且未轉預檢）
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">選擇預約</label>
                  <select
                    value={selectedApptId}
                    onChange={(e) => setSelectedApptId(e.target.value)}
                    className="h-[34px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white"
                  >
                    {candidates.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.appt_no} ｜ {a.customer_name ?? "—"} ｜ {a.vehicle_license_plate ?? "—"}{" "}
                        {a.vehicle_model_name ?? ""} ｜ {fmtDateTime(a.scheduled_at)}
                      </option>
                    ))}
                  </select>
                </div>
              )
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="車主姓名"
                  value={blankForm.customer_name}
                  onChange={(v) => setBlankForm({ ...blankForm, customer_name: v })}
                />
                <Field
                  label="聯絡電話"
                  value={blankForm.customer_phone}
                  onChange={(v) => setBlankForm({ ...blankForm, customer_phone: v })}
                />
                <Field
                  label="車牌號碼"
                  value={blankForm.vehicle_license_plate}
                  onChange={(v) => setBlankForm({ ...blankForm, vehicle_license_plate: v })}
                />
                <Field
                  label="車型"
                  value={blankForm.vehicle_model_name}
                  onChange={(v) => setBlankForm({ ...blankForm, vehicle_model_name: v })}
                />
                <Field
                  label="進廠里程 (km)"
                  value={blankForm.mileage_in}
                  onChange={(v) => setBlankForm({ ...blankForm, mileage_in: v })}
                  type="number"
                />
                <Field
                  label="接待 SA"
                  value={blankForm.sa_name}
                  onChange={(v) => setBlankForm({ ...blankForm, sa_name: v })}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setCreateOpen(false)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isPending ? "建立中⋯" : "建立並開啟"}
              </button>
            </div>
          </div>
        </div>
      )}

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

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
      />
    </div>
  );
}
