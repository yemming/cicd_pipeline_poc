"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization";
import {
  MODE_CHIP,
  MODE_DESC,
  MODE_LABEL,
  PRE_INSPECTION_MODE,
  PRE_INSPECTION_STATUS,
  STATUS_CHIP,
  STATUS_LABEL,
  type PreInspectionMode,
  type PreInspectionStatus,
} from "@/domain/pre-inspections.constants";
import type {
  PreInspectionListRow,
  AppointmentCandidate,
  PlateLookupResult,
} from "@/domain/pre-inspections";
import { lookupVehicleByPlate } from "@/domain/pre-inspections";
import {
  createBlankAction,
  createFromAppointmentAction,
} from "@/lib/aftersales/pre-inspection-actions";
import {
  addVehiclePendingItemAction,
  type AddVehiclePendingItemInput,
} from "@/lib/aftersales/vehicle-pending-actions";

type Banner = { ok: boolean; msg: string } | null;
type Filter = {
  status: PreInspectionStatus | "all";
  mode: PreInspectionMode | "all";
  q: string;
};

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
  const [createPiMode, setCreatePiMode] = useState<PreInspectionMode>("full");
  const [selectedApptId, setSelectedApptId] = useState<string>(candidates[0]?.id ?? "");
  const [blankForm, setBlankForm] = useState({
    customer_name: "",
    customer_phone: "",
    vehicle_license_plate: "",
    vehicle_model_name: "",
    mileage_in: "" as string,
    sa_name: "",
  });
  // 包D：車牌查詢結果（帶出車主/車型 + pending + 特殊標籤）
  const [plateLookup, setPlateLookup] = useState<PlateLookupResult | null>(null);
  const [plateLooking, setPlateLooking] = useState(false);
  async function doPlateLookup() {
    const plate = blankForm.vehicle_license_plate.trim();
    if (!plate) {
      showBanner({ ok: false, msg: "請先輸入車牌" });
      return;
    }
    setPlateLooking(true);
    const res = await lookupVehicleByPlate(plate);
    setPlateLookup(res);
    setPlateLooking(false);
    if (res.found) {
      // 帶出車主 / 車型 / 里程（不覆蓋使用者已手填的欄）
      setBlankForm((f) => ({
        ...f,
        customer_name: f.customer_name || res.customer?.name || "",
        customer_phone: f.customer_phone || res.customer?.phone || "",
        vehicle_model_name: f.vehicle_model_name || res.vehicle?.model_name || "",
        mileage_in:
          f.mileage_in || (res.vehicle?.current_mileage != null ? String(res.vehicle.current_mileage) : ""),
      }));
    }
  }

  // ─── RP7③ SA 手動新增待處理項 modal state ───
  const [pendingItemOpen, setPendingItemOpen] = useState(false);
  const [piVehiclePlate, setPiVehiclePlate] = useState("");
  const [piVehicleId, setPiVehicleId] = useState<string | null>(null);
  const [piVehicleLabel, setPiVehicleLabel] = useState<string | null>(null);
  const [piLooking, setPiLooking] = useState(false);
  const [piLookupMsg, setPiLookupMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [piItemDesc, setPiItemDesc] = useState("");
  const [piSafetyLevel, setPiSafetyLevel] = useState<AddVehiclePendingItemInput["safety_level"]>("建議");
  const [piReason, setPiReason] = useState("");

  async function doPiVehicleLookup() {
    const plate = piVehiclePlate.trim();
    if (!plate) {
      setPiLookupMsg({ ok: false, msg: "請輸入車牌" });
      return;
    }
    setPiLooking(true);
    setPiLookupMsg(null);
    setPiVehicleId(null);
    setPiVehicleLabel(null);
    const res = await lookupVehicleByPlate(plate);
    setPiLooking(false);
    if (res.found && res.vehicle) {
      setPiVehicleId(res.vehicle.id);
      const label = [res.customer?.name, res.vehicle.model_name, res.vehicle.license_plate]
        .filter(Boolean)
        .join(" · ");
      setPiVehicleLabel(label);
      setPiLookupMsg({ ok: true, msg: `✓ 找到車籍：${label}` });
    } else {
      setPiLookupMsg({ ok: false, msg: "查無此車牌，請確認後再試" });
    }
  }

  function handleAddPendingItem() {
    if (!piVehicleId) {
      showBanner({ ok: false, msg: "請先查詢並確認車籍" });
      return;
    }
    if (!piItemDesc.trim()) {
      showBanner({ ok: false, msg: "請填寫待處理項目說明" });
      return;
    }
    startTransition(async () => {
      const res = await addVehiclePendingItemAction({
        vehicle_id: piVehicleId!,
        item_desc: piItemDesc.trim(),
        safety_level: piSafetyLevel,
        reason: piReason.trim() || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已新增待處理項目（${piSafetyLevel}）` });
        setPendingItemOpen(false);
        // 重置表單
        setPiVehiclePlate("");
        setPiVehicleId(null);
        setPiVehicleLabel(null);
        setPiLookupMsg(null);
        setPiItemDesc("");
        setPiSafetyLevel("建議");
        setPiReason("");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const [statusLocal, setStatusLocal] = useState<Filter["status"]>(filter.status);
  const [modeLocal, setModeLocal] = useState<Filter["mode"]>(filter.mode);
  const [qLocal, setQLocal] = useState(filter.q);

  // KPI 計算（list 客戶端聚合，伺服器已過濾 brand）
  const kpis = useMemo(() => {
    const total = rows.length;
    const inProgress = rows.filter(
      (r) => r.status === "in_progress" || r.status === "quoting",
    ).length;
    const transferred = rows.filter((r) => r.status === "transferred").length;
    const simpleCount = rows.filter((r) => r.mode === "simple").length;
    const fullCount = rows.filter((r) => r.mode === "full").length;
    const damaged = rows.reduce((acc, r) => acc + r.damage_count, 0);
    const avgQuote = (() => {
      const priced = rows.filter((r) => (r.estimated_subtotal ?? 0) > 0);
      if (priced.length === 0) return 0;
      const sum = priced.reduce((acc, r) => acc + Number(r.estimated_subtotal ?? 0), 0);
      return Math.round(sum / priced.length);
    })();
    return { total, inProgress, transferred, simpleCount, fullCount, damaged, avgQuote };
  }, [rows]);

  function showBanner(b: NonNullable<Banner>) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function applyFilter() {
    const params = new URLSearchParams();
    if (statusLocal !== "all") params.set("status", statusLocal);
    if (modeLocal !== "all") params.set("mode", modeLocal);
    if (qLocal.trim()) params.set("q", qLocal.trim());
    startTransition(() => {
      router.push(`/parts/aftersales/pre-inspections?${params.toString()}`);
    });
  }
  function resetFilter() {
    setStatusLocal("all");
    setModeLocal("all");
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
        const res = await createFromAppointmentAction(selectedApptId, createPiMode);
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
        mode: createPiMode,
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
        id: "mode",
        header: "模式",
        width: 90,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${MODE_CHIP[r.mode]}`}
            title={MODE_DESC[r.mode]}
          >
            {MODE_LABEL[r.mode]}
          </span>
        ),
        exportValue: (r) => MODE_LABEL[r.mode],
        sortValue: (r) => r.mode,
      },
      {
        id: "photos",
        header: "照片",
        width: 70,
        align: "right",
        cell: (r) =>
          r.photos.length > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-[11.5px] text-[#185FA5]">
              📷 {r.photos.length}
            </span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        exportValue: (r) => r.photos.length,
        sortValue: (r) => r.photos.length,
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

      {/* KPI 列 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard
          tone="blue"
          layout="mini"
          label="今日預檢單"
          value={kpis.total}
        />
        <KpiCard
          tone="amber"
          layout="mini"
          label="進行中 / 報價中"
          value={kpis.inProgress}
        />
        <KpiCard
          tone="green"
          layout="mini"
          label="已轉工單"
          value={kpis.transferred}
        />
        <KpiCard
          tone="teal"
          layout="mini"
          label="平均預估費用"
          value={kpis.avgQuote > 0 ? `NT$${kpis.avgQuote.toLocaleString()}` : "—"}
        />
      </div>

      {/* 模式分布提示條 */}
      <div className="flex items-center gap-2 text-[11.5px] text-[#5A5955]">
        <span>分布：</span>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md ${MODE_CHIP.full}`}>
          {MODE_LABEL.full} × {kpis.fullCount}
        </span>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md ${MODE_CHIP.simple}`}>
          {MODE_LABEL.simple} × {kpis.simpleCount}
        </span>
        {kpis.damaged > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#FCEBEB] text-[#CC0000]">
            🔧 累計損傷標記 {kpis.damaged}
          </span>
        )}
      </div>

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
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">模式</label>
            <select
              value={modeLocal}
              onChange={(e) => setModeLocal(e.target.value as Filter["mode"])}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white"
            >
              <option value="all">全部</option>
              {PRE_INSPECTION_MODE.map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m]}
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
            {canEdit && (
              <button
                onClick={() => {
                  setPiVehiclePlate("");
                  setPiVehicleId(null);
                  setPiVehicleLabel(null);
                  setPiLookupMsg(null);
                  setPiItemDesc("");
                  setPiSafetyLevel("建議");
                  setPiReason("");
                  setPendingItemOpen(true);
                }}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B] hover:bg-[#fce9c5] disabled:opacity-50"
              >
                📌 新增待處理項
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

            {/* Mode 選擇器：simple / full */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-[#9A9890] font-medium">預檢模式</label>
              <div className="grid grid-cols-2 gap-2">
                {PRE_INSPECTION_MODE.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setCreatePiMode(m)}
                    className={`text-left p-2.5 rounded-lg border text-[12px] transition-colors ${
                      createPiMode === m
                        ? "border-[#1A3A5C] bg-[#EBF3FF]"
                        : "border-[#EEECE6] bg-white hover:bg-[#F8F7F4]"
                    }`}
                  >
                    <div className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${MODE_CHIP[m]} mb-1`}>
                      {MODE_LABEL[m]}
                    </div>
                    <div className="text-[11.5px] text-[#5A5955] leading-snug">{MODE_DESC[m]}</div>
                  </button>
                ))}
              </div>
            </div>

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
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890]">車牌號碼（可查詢帶入）</label>
                  <div className="flex gap-1.5">
                    <input
                      value={blankForm.vehicle_license_plate}
                      onChange={(e) => {
                        setBlankForm({ ...blankForm, vehicle_license_plate: e.target.value });
                        setPlateLookup(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") doPlateLookup();
                      }}
                      placeholder="ABC-1234"
                      className="h-[30px] flex-1 border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white"
                    />
                    <button
                      type="button"
                      onClick={doPlateLookup}
                      disabled={plateLooking}
                      className="h-[30px] px-3 rounded text-[12px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60 shrink-0"
                    >
                      {plateLooking ? "查詢中⋯" : "🔍 查詢"}
                    </button>
                  </div>
                </div>
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

            {/* 包D：車牌查詢結果 — 帶入 / 查無建檔引導 / 特殊標籤紅框 / 待處理項 */}
            {createMode === "blank" && plateLookup && (
              <div className="mt-1 space-y-2">
                {plateLookup.found ? (
                  <>
                    <div className="px-3 py-2 rounded bg-[#EAF3DE] border border-[#C5DC9F] text-[12px] text-[#3B6D11]">
                      ✓ 找到車籍：{plateLookup.customer?.name ?? "—"} ·{" "}
                      {plateLookup.vehicle?.model_name ?? "—"}
                      {plateLookup.vehicle?.warranty_until
                        ? ` · 保固至 ${plateLookup.vehicle.warranty_until}${plateLookup.vehicle.warranty_computed ? "（系統推算）" : ""}`
                        : ""}
                      ，已自動帶入車主 / 車型 / 里程。
                    </div>
                    {plateLookup.special_tags.length > 0 && (
                      <div className="px-3 py-2 rounded bg-[#FDECEA] border-[1.5px] border-[#F5AEAD] text-[12px] text-[#CC0000]">
                        <b>⚠️ 特殊標籤：</b>
                        <span className="inline-flex flex-wrap gap-1 ml-1 align-middle">
                          {plateLookup.special_tags.map((t) => (
                            <span
                              key={t}
                              className="inline-flex px-1.5 py-0.5 rounded-md bg-white border border-[#F5AEAD] text-[11px]"
                            >
                              {t}
                            </span>
                          ))}
                        </span>
                      </div>
                    )}
                    {plateLookup.pending_items.length > 0 && (
                      <div className="px-3 py-2 rounded bg-[#FDF3E3] border border-[#F0C97E] text-[12px] text-[#854F0B]">
                        <b>📌 待處理項目（{plateLookup.pending_items.length}）：</b>
                        <ul className="mt-1 space-y-0.5">
                          {plateLookup.pending_items.map((p, i) => {
                            const safetyChip =
                              p.safety_level === "緊急"
                                ? <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-[#FDECEA] text-[#CC0000]">緊急</span>
                                : p.safety_level === "警示"
                                ? <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-[#FDF3E3] text-[#854F0B]">警示</span>
                                : null;
                            return (
                              <li key={i} className="flex items-start gap-1">
                                <span>·</span>
                                <span>
                                  {p.item_desc}
                                  {safetyChip}
                                  {p.reject_count > 1 && (
                                    <span className="ml-1 text-[10px] text-[#9A9890]">（第{p.reject_count}次拒絕）</span>
                                  )}
                                  {p.reason ? <span className="text-[#9A9890]">（{p.reason}）</span> : ""}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                        <div className="text-[11px] text-[#9A9890] mt-1">
                          建議本次預檢主動向車主提醒這些項目。
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="px-3 py-2 rounded bg-[#EAF4FB] border border-[#A9CCE8] text-[12px] text-[#185FA5]">
                    查無此車牌 — 將以<b>新客 / 新車</b>建檔。請確認車主姓名 / 電話 / 車型後建立預檢，系統會一併開立車籍。
                  </div>
                )}
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

      {/* RP7③ SA 手動新增待處理項 Modal */}
      {pendingItemOpen && canEdit && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-40"
          onClick={() => !isPending && setPendingItemOpen(false)}
        >
          <div
            className="bg-white rounded-lg p-5 w-[500px] max-w-[92vw] shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
              📌 SA 手動新增待處理項目（RP7③）
            </h2>
            <p className="text-[12px] text-[#9A9890]">
              電話諮詢或未進廠時，SA 可手動為車輛登記待處理項，下次進廠預檢自動帶出提醒。
            </p>

            {/* 車牌查詢 */}
            <div className="space-y-1">
              <label className="text-[11px] text-[#9A9890] font-medium">車牌號碼（查詢車籍）</label>
              <div className="flex gap-1.5">
                <input
                  value={piVehiclePlate}
                  onChange={(e) => {
                    setPiVehiclePlate(e.target.value);
                    setPiVehicleId(null);
                    setPiVehicleLabel(null);
                    setPiLookupMsg(null);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") doPiVehicleLookup(); }}
                  placeholder="ABC-1234"
                  className="h-[30px] flex-1 border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white"
                />
                <button
                  type="button"
                  onClick={doPiVehicleLookup}
                  disabled={piLooking}
                  className="h-[30px] px-3 rounded text-[12px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60 shrink-0"
                >
                  {piLooking ? "查詢中⋯" : "🔍 查詢"}
                </button>
              </div>
              {piLookupMsg && (
                <div className={`mt-1 px-3 py-1.5 rounded text-[12px] ${
                  piLookupMsg.ok
                    ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
                    : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
                }`}>
                  {piLookupMsg.msg}
                </div>
              )}
            </div>

            {/* 項目說明 */}
            <div className="space-y-1">
              <label className="text-[11px] text-[#9A9890] font-medium">待處理項目說明 <span className="text-[#CC0000]">*</span></label>
              <input
                value={piItemDesc}
                onChange={(e) => setPiItemDesc(e.target.value)}
                placeholder="例：前煞車皮磨損需更換、輪胎氣壓異常…"
                className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
              />
            </div>

            {/* 安全等級 + 原因（同列） */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-[#9A9890] font-medium">安全等級</label>
                <select
                  value={piSafetyLevel}
                  onChange={(e) => setPiSafetyLevel(e.target.value as AddVehiclePendingItemInput["safety_level"])}
                  className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white"
                >
                  <option value="建議">建議（一般維護提醒）</option>
                  <option value="警示">警示（影響使用安全）</option>
                  <option value="緊急">緊急（立即有危險）</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-[#9A9890] font-medium">原因 / 備註（選填）</label>
                <input
                  value={piReason}
                  onChange={(e) => setPiReason(e.target.value)}
                  placeholder="例：客戶電話反映、目視發現…"
                  className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                />
              </div>
            </div>

            {/* 目前車籍確認欄 */}
            {piVehicleLabel && (
              <div className="px-3 py-2 rounded bg-[#EAF4FB] border border-[#A9CCE8] text-[12px] text-[#185FA5]">
                <span className="font-medium">對象車輛：</span>{piVehicleLabel}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setPendingItemOpen(false)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleAddPendingItem}
                disabled={isPending || !piVehicleId || !piItemDesc.trim()}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#854F0B] text-white hover:bg-[#6b3f08] disabled:opacity-50"
              >
                {isPending ? "新增中⋯" : "新增待處理項"}
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
