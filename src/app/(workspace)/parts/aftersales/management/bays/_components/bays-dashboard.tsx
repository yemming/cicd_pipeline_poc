"use client";

/**
 * Dashboard — 工位看板 (Service Bays Live Board)
 * Spec：07_售後管理模組_v2.html → 即時看板 → 🔧 工位看板
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  BAY_STATUS_LABEL,
  BAY_STATUS_CHIP,
  BAY_STATUS_ACCENT,
  BAY_TYPE_OPTIONS,
  DAILY_HOURS_OPTIONS,
  URGENT_THRESHOLD_MINUTES,
  elapsedMinutes,
  formatTimer,
  type BayStatus,
} from "@/domain/service-bays.constants";
import type {
  ServiceBayRow,
  ServiceBayKpis,
  BayEfficiencyRow,
} from "@/domain/service-bays";
import {
  createBayAction,
  updateBayAction,
  assignBayAction,
  completeBayAction,
  setBayActiveAction,
  deleteBayAction,
  setShopDailyHoursAction,
} from "@/lib/aftersales/service-bay-actions";
import { KpiCard } from "@/components/visualization";
import { BarChart, GaugeChart } from "@/components/charts";

type Props = {
  bays: ServiceBayRow[];
  kpis: ServiceBayKpis;
  efficiency: { rows: BayEfficiencyRow[]; totals: BayEfficiencyRow };
  dailyHours: number;
  canEdit: boolean;
  /** 可選：覆蓋頁面 H1（C13a 主管視角用） */
  titleOverride?: string;
  /** 可選：覆蓋 sprint chip 字（預設「售後管理 / Live」） */
  sprintLabel?: string;
  /** 可選：覆蓋副標 caption */
  captionOverride?: string;
};

type Banner = { ok: boolean; msg: string } | null;

type ModalMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; bay: ServiceBayRow }
  | { kind: "assign"; bay: ServiceBayRow }
  | { kind: "delete"; bay: ServiceBayRow };

const inputClass =
  "h-[34px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:outline-none focus:border-[#185FA5] bg-white";
const labelClass = "text-[11px] text-[#9A9890] font-medium";
const lockedClass = "pointer-events-none opacity-60";

export function BaysDashboard({
  bays,
  kpis,
  efficiency,
  dailyHours,
  canEdit,
  titleOverride,
  sprintLabel,
  captionOverride,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [modal, setModal] = useState<ModalMode>({ kind: "closed" });
  const [, setNowTick] = useState(0);

  // 每秒重新算 timer 的「現在」基準（HTML 規格寫每 30 秒，但 in-cell 顯示更平滑）
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // banner 自動消失（成功）
  useEffect(() => {
    if (!banner?.ok) return;
    const id = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(id);
  }, [banner]);

  const handleResult = (
    res: { ok: boolean; error?: string },
    successMsg: string,
  ) => {
    if (res.ok) {
      setBanner({ ok: true, msg: `✓ ${successMsg}` });
      setModal({ kind: "closed" });
      router.refresh();
    } else {
      setBanner({ ok: false, msg: res.error ?? "操作失敗" });
    }
  };

  // 視覺概覽 — 派生指標
  const totalBays = bays.length;
  const overallUsagePct = efficiency.totals.usage_pct;
  const overallDone = efficiency.totals.done_today;
  const overallTurnover = efficiency.totals.turnover;
  const occupancyRatio =
    kpis.total > 0
      ? Math.round(((kpis.busy + kpis.urgent) / Math.max(1, kpis.total - kpis.offline)) * 100)
      : 0;
  const turnoverBarData = efficiency.rows.map((r) => ({
    name: r.name,
    turnover: r.turnover,
    usage: r.usage_pct,
  }));

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "opacity-95" : ""}`}>
      {/* ── Page Header ────────────────────────── */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          {titleOverride ?? "工位看板"}
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {sprintLabel ?? "售後管理 / Live"}
        </span>
        <span className="text-[12px] text-[#9A9890]">
          {captionOverride ?? "車間工位即時狀態、計時、使用率"}
        </span>
      </header>

      {/* ── 視覺概覽（A 級華麗版）────────────────── */}
      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="工位總數"
          value={totalBays}
          tone="blue"
          layout="vertical"
        />
        <KpiCard
          label="使用中（含逾時）"
          value={`${kpis.busy + kpis.urgent} / ${Math.max(1, kpis.total - kpis.offline)}`}
          tone={kpis.urgent > 0 ? "red" : kpis.busy > 0 ? "amber" : "teal"}
          layout="vertical"
          delta={{
            value: occupancyRatio,
            tone: occupancyRatio >= 80 ? "positive" : occupancyRatio >= 50 ? "neutral" : "negative",
          }}
        />
        <KpiCard
          label="今日完成工單"
          value={overallDone}
          tone="green"
          layout="vertical"
        />
        <KpiCard
          label="平均使用率"
          value={`${overallUsagePct}%`}
          tone={overallUsagePct >= 80 ? "teal" : overallUsagePct >= 50 ? "amber" : "red"}
          layout="vertical"
        />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 全場平均使用率</span>
          </header>
          <div className="p-3">
            {totalBays === 0 ? (
              <p className="text-[12px] text-[#9A9890] text-center py-10">尚無工位資料</p>
            ) : (
              <GaugeChart
                value={overallUsagePct}
                tone={overallUsagePct >= 80 ? "teal" : overallUsagePct >= 50 ? "amber" : "red"}
                size="md"
                label={`${overallUsagePct}%`}
                caption={`目標 ≥ 80%　周轉 ${overallTurnover} 張/位`}
              />
            )}
          </div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden md:col-span-2">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 各工位今日完成數 vs 使用率</span>
          </header>
          <div className="p-3">
            {turnoverBarData.length === 0 ? (
              <p className="text-[12px] text-[#9A9890] text-center py-10">尚無工位資料</p>
            ) : (
              <BarChart
                data={turnoverBarData}
                categoryKey="name"
                valueKey={[
                  { key: "turnover", label: "完成工單" },
                  { key: "usage", label: "使用率 %" },
                ]}
                tone="blue"
                size="md"
                showLegend
              />
            )}
          </div>
        </div>
      </section>

      {/* ── KPI Bar ────────────────────────────── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3 flex flex-wrap items-center gap-2">
        <KpiChip
          color="#0F6E56"
          bg="#E1F5EE"
          border="#1D9E75"
          label="空閒"
          value={kpis.free}
        />
        <KpiChip
          color="#854F0B"
          bg="#FAEEDA"
          border="#BA7517"
          label="使用中"
          value={kpis.busy}
        />
        <KpiChip
          color="#CC0000"
          bg="#FCEBEB"
          border="#F09595"
          label="逾時警示"
          value={kpis.urgent}
        />
        <KpiChip
          color="#6B6A68"
          bg="#E8E7E4"
          border="#D1D0CE"
          label="停用"
          value={kpis.offline}
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-[#9A9890]">每日可用工時</span>
          <select
            className={inputClass}
            value={dailyHours}
            disabled={!canEdit || isPending}
            onChange={(e) => {
              const h = Number(e.target.value);
              startTransition(async () => {
                const res = await setShopDailyHoursAction(h);
                handleResult(res, `已切換為每日 ${h} 小時`);
              });
            }}
          >
            {DAILY_HOURS_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h} 小時
              </option>
            ))}
          </select>
          <button
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            disabled={!canEdit || isPending}
            onClick={() => setModal({ kind: "create" })}
          >
            ＋ 新增工位
          </button>
        </div>
      </section>

      {/* ── Bay Grid ───────────────────────────── */}
      <section
        className={`grid gap-3 ${isPending ? lockedClass : ""}`}
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
      >
        {bays.length === 0 ? (
          <div className="col-span-full bg-white border border-[#EEECE6] rounded-lg p-10 text-center text-[12px] text-[#9A9890]">
            還沒有工位，點右上「＋ 新增工位」開始建立
          </div>
        ) : (
          bays.map((b) => (
            <BayCard
              key={b.id}
              bay={b}
              canEdit={canEdit}
              onEdit={() => setModal({ kind: "edit", bay: b })}
              onAssign={() => setModal({ kind: "assign", bay: b })}
              onComplete={() => {
                startTransition(async () => {
                  const res = await completeBayAction(b.id);
                  handleResult(res, `${b.name} 已完工`);
                });
              }}
              onToggleActive={() => {
                startTransition(async () => {
                  const res = await setBayActiveAction(b.id, !b.is_active);
                  handleResult(res, b.is_active ? "已停用" : "已啟用");
                });
              }}
              onDelete={() => setModal({ kind: "delete", bay: b })}
            />
          ))
        )}
      </section>

      {/* ── 工位效率統計 ───────────────────────── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#1A3A5C] text-white">
          <span className="text-[13px] font-semibold">📊 工位效率統計　今日</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[#1A1A1A] text-white">
              <tr>
                <Th>工位</Th>
                <Th>性質/用途</Th>
                <Th align="right">完成工單</Th>
                <Th align="right">已用工時</Th>
                <Th align="right">可用工時</Th>
                <Th align="right">使用率</Th>
                <Th align="right">周轉率(張/日)</Th>
                <Th>狀態</Th>
              </tr>
            </thead>
            <tbody>
              {efficiency.rows.map((r) => (
                <tr
                  key={r.bay_id}
                  className="border-b border-[#EEECE6] hover:bg-[#F8F7F4]"
                >
                  <Td>
                    <div className="font-semibold text-[#2C2C2A]">{r.name}</div>
                    <div className="text-[10px] text-[#9A9890] font-mono">{r.code}</div>
                  </Td>
                  <Td>
                    <div>{r.bay_type ?? "—"}</div>
                    <div className="text-[10px] text-[#9A9890]">
                      {r.purpose ?? ""}
                    </div>
                  </Td>
                  <Td align="right">{r.done_today}</Td>
                  <Td align="right">{(r.used_minutes / 60).toFixed(1)} h</Td>
                  <Td align="right">
                    {r.available_minutes > 0
                      ? `${(r.available_minutes / 60).toFixed(1)} h`
                      : "—"}
                  </Td>
                  <Td align="right">
                    <UsageBar pct={r.usage_pct} />
                  </Td>
                  <Td align="right">{r.turnover}</Td>
                  <Td>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${BAY_STATUS_CHIP[r.status]}`}
                    >
                      {BAY_STATUS_LABEL[r.status]}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[#F8F7F4]">
              <tr>
                <Td>
                  <strong className="text-[#1A3A5C]">{efficiency.totals.name}</strong>
                </Td>
                <Td>—</Td>
                <Td align="right">
                  <strong>{efficiency.totals.done_today}</strong>
                </Td>
                <Td align="right">
                  <strong>{(efficiency.totals.used_minutes / 60).toFixed(1)} h</strong>
                </Td>
                <Td align="right">
                  <strong>
                    {(efficiency.totals.available_minutes / 60).toFixed(1)} h
                  </strong>
                </Td>
                <Td align="right">
                  <strong>{efficiency.totals.usage_pct}%</strong>
                </Td>
                <Td align="right">
                  <strong>{efficiency.totals.turnover}</strong>
                </Td>
                <Td>—</Td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <p className="text-[11px] text-[#9A9890]">
        <strong>工位使用率</strong> = 已用工時 ÷ 每日可用工時 × 100% ｜
        <strong> 工位周轉率</strong> = 今日完成工單數 ÷ 工位數量　業界目標：使用率 ≥ 80%　{`(`}逾時警示閾值 {URGENT_THRESHOLD_MINUTES} 分鐘{`)`}
      </p>

      {/* ── Modals ─────────────────────────────── */}
      {modal.kind === "create" || modal.kind === "edit" ? (
        <BayFormModal
          mode={modal.kind}
          bay={modal.kind === "edit" ? modal.bay : null}
          isPending={isPending}
          onCancel={() => setModal({ kind: "closed" })}
          onSubmit={(input) => {
            startTransition(async () => {
              if (modal.kind === "create") {
                const res = await createBayAction(input);
                handleResult(res, "工位已建立");
              } else if (modal.kind === "edit") {
                const res = await updateBayAction(modal.bay.id, {
                  name: input.name,
                  bay_type: input.bay_type,
                  purpose: input.purpose,
                  sort_order: input.sort_order,
                });
                handleResult(res, "工位已更新");
              }
            });
          }}
        />
      ) : null}

      {modal.kind === "assign" ? (
        <AssignModal
          bay={modal.bay}
          isPending={isPending}
          onCancel={() => setModal({ kind: "closed" })}
          onSubmit={(input) => {
            startTransition(async () => {
              const res = await assignBayAction(modal.bay.id, input);
              handleResult(res, `已派工到 ${modal.bay.name}`);
            });
          }}
        />
      ) : null}

      {modal.kind === "delete" ? (
        <ConfirmModal
          title="刪除工位"
          message={`確定要刪除「${modal.bay.name}」嗎？此操作不可復原。`}
          confirmText="確認刪除"
          danger
          isPending={isPending}
          onCancel={() => setModal({ kind: "closed" })}
          onConfirm={() => {
            startTransition(async () => {
              const res = await deleteBayAction(modal.bay.id);
              handleResult(res, "工位已刪除");
            });
          }}
        />
      ) : null}

      {/* ── Banner ─────────────────────────────── */}
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
    </main>
  );
}

/* ──────────────── Sub-components ──────────────── */

function KpiChip({
  color,
  bg,
  border,
  label,
  value,
}: {
  color: string;
  bg: string;
  border: string;
  label: string;
  value: number;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px]"
      style={{ background: bg, border: `0.5px solid ${border}`, color }}
    >
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: border }}
      />
      <span>
        {label} <strong>{value}</strong> 個
      </span>
    </span>
  );
}

function BayCard({
  bay,
  canEdit,
  onEdit,
  onAssign,
  onComplete,
  onToggleActive,
  onDelete,
}: {
  bay: ServiceBayRow;
  canEdit: boolean;
  onEdit: () => void;
  onAssign: () => void;
  onComplete: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const elapsed = elapsedMinutes(bay.started_at);
  // read-time 升 urgent
  const isUrgent =
    bay.status === "busy" && elapsed >= URGENT_THRESHOLD_MINUTES;
  const status: BayStatus = isUrgent ? "urgent" : bay.status;
  const accent = BAY_STATUS_ACCENT[status];

  return (
    <div
      className="rounded-lg bg-white border-[1.5px] p-3 relative overflow-hidden flex flex-col gap-2"
      style={{
        borderColor: accent,
        background:
          status === "free"
            ? "linear-gradient(135deg,#fff 0%,#F0FBF7 100%)"
            : status === "busy"
              ? "linear-gradient(135deg,#fff 0%,#FDF6E8 100%)"
              : status === "urgent"
                ? "linear-gradient(135deg,#fff 0%,#FDF0F0 100%)"
                : "#F5F5F4",
        opacity: status === "offline" ? 0.7 : 1,
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: accent }}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-[#2C2C2A] truncate">
            {bay.name}
          </div>
          {bay.bay_type ? (
            <span className="text-[10px] text-[#6B6A68] bg-[#E8E7E4] px-1.5 py-0.5 rounded">
              {bay.bay_type}
            </span>
          ) : null}
        </div>
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${BAY_STATUS_CHIP[status]}`}
        >
          {BAY_STATUS_LABEL[status]}
        </span>
      </div>

      {bay.current_ro_code ? (
        <>
          <div className="text-[11px] font-semibold text-[#2C2C2A] font-mono truncate">
            {bay.current_ro_code}
          </div>
          <div className="text-[10px] text-[#6B6A68] truncate">
            {bay.current_item}
          </div>
        </>
      ) : (
        <div className="text-[11px] text-[#9A9890]">{bay.purpose ?? "—"}</div>
      )}

      {bay.started_at ? (
        <div
          className="text-[20px] font-extrabold tabular-nums leading-none"
          style={{
            color: status === "urgent" ? "#CC0000" : "#854F0B",
          }}
        >
          {formatTimer(elapsed)}
        </div>
      ) : (
        <div className="text-[12px] text-[#9A9890]">—</div>
      )}

      {bay.current_tech_name ? (
        <div className="flex items-center gap-1.5 text-[10px] text-[#6B6A68]">
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
            style={{ background: bay.current_tech_color ?? "#185FA5" }}
          >
            {bay.current_tech_name.slice(0, 1)}
          </span>
          {bay.current_tech_name}
        </div>
      ) : null}

      {/* Action row */}
      {canEdit ? (
        <div className="flex flex-wrap gap-1 mt-1">
          {status === "free" || status === "busy" || status === "urgent" ? (
            status === "free" ? (
              <button
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                onClick={onAssign}
              >
                派工
              </button>
            ) : (
              <button
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                onClick={onComplete}
              >
                完工
              </button>
            )
          ) : null}
          <button
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            onClick={onEdit}
          >
            編輯
          </button>
          <button
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            onClick={onToggleActive}
          >
            {bay.is_active ? "停用" : "啟用"}
          </button>
          <button
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
            onClick={onDelete}
          >
            刪除
          </button>
        </div>
      ) : null}
    </div>
  );
}

function UsageBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const color =
    pct >= 80 ? "#0F6E56" : pct >= 50 ? "#854F0B" : "#CC0000";
  return (
    <div className="inline-flex items-center gap-1 min-w-[90px]">
      <div className="flex-1 h-[5px] bg-[#E8E7E4] rounded overflow-hidden">
        <div
          className="h-full rounded"
          style={{ width: `${clamped}%`, background: color }}
        />
      </div>
      <span className="text-[11px] font-semibold" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className="px-2.5 py-2 text-[11px] font-semibold whitespace-nowrap"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className="px-2.5 py-2 text-[12px] text-[#2C2C2A] align-middle"
      style={{ textAlign: align }}
    >
      {children}
    </td>
  );
}

/* ──────────────── Modals ──────────────── */

type BayFormInput = {
  code: string;
  name: string;
  bay_type: string | null;
  purpose: string | null;
  sort_order: number;
};

function BayFormModal({
  mode,
  bay,
  isPending,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  bay: ServiceBayRow | null;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (input: BayFormInput) => void;
}) {
  const [code, setCode] = useState(bay?.code ?? "");
  const [name, setName] = useState(bay?.name ?? "");
  const [bayType, setBayType] = useState<string>(bay?.bay_type ?? "機電");
  const [purpose, setPurpose] = useState(bay?.purpose ?? "");
  const [sortOrder, setSortOrder] = useState<number>(bay?.sort_order ?? 0);

  return (
    <ModalShell
      title={mode === "create" ? "新增工位" : `編輯工位 — ${bay?.name ?? ""}`}
      onCancel={onCancel}
      onConfirm={() =>
        onSubmit({
          code: code.trim(),
          name: name.trim(),
          bay_type: bayType || null,
          purpose: purpose.trim() || null,
          sort_order: sortOrder,
        })
      }
      confirmText={mode === "create" ? "建立" : "儲存變更"}
      isPending={isPending}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="工位代碼 *">
          <input
            className={inputClass}
            value={code}
            disabled={mode === "edit"}
            onChange={(e) => setCode(e.target.value)}
            placeholder="B1"
          />
        </Field>
        <Field label="顯示名稱 *">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="機電工位 1"
          />
        </Field>
        <Field label="性質">
          <select
            className={inputClass}
            value={bayType}
            onChange={(e) => setBayType(e.target.value)}
          >
            {BAY_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="排序 (數字越小越前)">
          <input
            type="number"
            className={inputClass}
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="用途說明" full>
          <input
            className={inputClass}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="一般機電維修保養"
          />
        </Field>
      </div>
    </ModalShell>
  );
}

function AssignModal({
  bay,
  isPending,
  onCancel,
  onSubmit,
}: {
  bay: ServiceBayRow;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    ro_code: string;
    item: string;
    tech_name: string;
    tech_color?: string;
  }) => void;
}) {
  const [ro, setRo] = useState("");
  const [item, setItem] = useState("");
  const [tech, setTech] = useState("");

  return (
    <ModalShell
      title={`派工到 ${bay.name}`}
      onCancel={onCancel}
      onConfirm={() =>
        onSubmit({
          ro_code: ro.trim(),
          item: item.trim(),
          tech_name: tech.trim(),
        })
      }
      confirmText="派工"
      isPending={isPending}
    >
      <div className="grid grid-cols-1 gap-3">
        <Field label="RO 編號 *">
          <input
            className={inputClass}
            value={ro}
            onChange={(e) => setRo(e.target.value)}
            placeholder="MN-CP-260429-001"
          />
        </Field>
        <Field label="施工項目 *">
          <input
            className={inputClass}
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="定期保養（機油+濾芯）"
          />
        </Field>
        <Field label="技師姓名 *">
          <input
            className={inputClass}
            value={tech}
            onChange={(e) => setTech(e.target.value)}
            placeholder="陳建明"
          />
        </Field>
      </div>
    </ModalShell>
  );
}

function ConfirmModal({
  title,
  message,
  confirmText,
  danger,
  isPending,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell
      title={title}
      onCancel={onCancel}
      onConfirm={onConfirm}
      confirmText={confirmText}
      isPending={isPending}
      danger={danger}
    >
      <p className="text-[13px] text-[#5A5955]">{message}</p>
    </ModalShell>
  );
}

function ModalShell({
  title,
  children,
  onCancel,
  onConfirm,
  confirmText,
  isPending,
  danger,
}: {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  confirmText: string;
  isPending: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-6"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-[520px] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[14px] font-semibold text-[#2C2C2A] mb-4">{title}</h2>
        <div className={isPending ? lockedClass : ""}>{children}</div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            onClick={onCancel}
            disabled={isPending}
          >
            取消
          </button>
          <button
            className={`h-[30px] px-4 rounded text-[12.5px] font-medium text-white disabled:opacity-50 ${
              danger
                ? "bg-[#CC0000] hover:bg-[#a30000]"
                : "bg-[#0F6E56] hover:bg-[#0a5742]"
            }`}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "處理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 ${full ? "col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {children}
    </div>
  );
}
