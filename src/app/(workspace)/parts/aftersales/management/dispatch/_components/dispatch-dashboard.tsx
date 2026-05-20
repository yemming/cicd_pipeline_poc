"use client";

/**
 * Dashboard — 派工看板 (Dispatch Live Board)
 * Spec：07_售後管理模組_v2.html → 即時看板 → 👨‍🔧 派工看板
 *
 * 結構：
 *   1. Page Header
 *   2. NADA 公式說明 banner
 *   3. KPI Bar (施工中 / 待命 / 休息) + ＋ 新增技師
 *   4. 技師卡 grid (按 status 的 accent 上色 + NADA 三指標 + 派工 button)
 *   5. 今日人效統計表 (NADA 標準) + footer 全員平均
 *   6. Modals: 派工 / 新增 / 編輯 / 切狀態 / 刪除
 *   7. Banner toast
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  TECH_STATUS_LABEL,
  TECH_STATUS_CHIP,
  TECH_STATUS_ACCENT,
  TECH_GRADE_OPTIONS,
  AVATAR_COLOR_OPTIONS,
  NADA_EFF_TARGET,
  NADA_PROD_TARGET,
  NADA_UTIL_TARGET,
  computeEfficiency,
  computeProductivity,
  computeUtilization,
  effColor,
  prodColor,
  utilColor,
  formatElapsed,
  elapsedMinutes,
  minutesToHoursStr,
  type TechStatus,
} from "@/domain/aftersales-technicians.constants";
import type {
  AftersalesTechnicianRow,
  DispatchKpis,
  DispatchTotals,
} from "@/domain/aftersales-technicians";
import {
  createTechnicianAction,
  updateTechnicianAction,
  dispatchToTechnicianAction,
  completeTechnicianJobAction,
  setTechnicianStatusAction,
  setTechnicianActiveAction,
  deleteTechnicianAction,
} from "@/lib/aftersales/aftersales-technician-actions";
import { KpiCard } from "@/components/visualization";
import { BarChart, GaugeChart } from "@/components/charts";

type Props = {
  technicians: AftersalesTechnicianRow[];
  kpis: DispatchKpis;
  totals: DispatchTotals;
  canEdit: boolean;
};

type Banner = { ok: boolean; msg: string } | null;

type ModalMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; tech: AftersalesTechnicianRow }
  | { kind: "dispatch"; tech: AftersalesTechnicianRow }
  | { kind: "delete"; tech: AftersalesTechnicianRow };

const inputClass =
  "h-[34px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:outline-none focus:border-[#185FA5] bg-white";
const labelClass = "text-[11px] text-[#9A9890] font-medium";
const lockedClass = "pointer-events-none opacity-60";

export function DispatchDashboard({
  technicians,
  kpis,
  totals,
  canEdit,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [modal, setModal] = useState<ModalMode>({ kind: "closed" });
  const [, setNowTick] = useState(0);

  // 每秒重算 timer 基準
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

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
  const activeTechs = technicians.filter((t) => t.is_active);
  const onTargetEff = activeTechs.filter(
    (t) => computeEfficiency(t.sold_minutes, t.actual_minutes) >= NADA_EFF_TARGET,
  ).length;
  const onTargetUtil = activeTechs.filter(
    (t) => computeUtilization(t.actual_minutes, t.available_minutes) >= NADA_UTIL_TARGET,
  ).length;
  const nadaBarData = activeTechs.map((t) => ({
    name: t.name,
    eff: computeEfficiency(t.sold_minutes, t.actual_minutes),
    prod: computeProductivity(t.sold_minutes, t.available_minutes),
    util: computeUtilization(t.actual_minutes, t.available_minutes),
  }));

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "opacity-95" : ""}`}>
      {/* ── Page Header ────────────────────────── */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">派工看板</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          售後管理 / Live
        </span>
        <span className="text-[12px] text-[#9A9890]">
          技師即時狀態、NADA 三指標、手動派工
        </span>
      </header>

      {/* ── 視覺概覽（A 級華麗版）────────────────── */}
      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="在職技師"
          value={`${kpis.working + kpis.idle + kpis.break} / ${kpis.total_active}`}
          tone="blue"
          layout="vertical"
        />
        <KpiCard
          label="今日工單（完成 / 總）"
          value={`${totals.done_jobs} / ${totals.total_jobs}`}
          tone={totals.done_jobs >= totals.total_jobs * 0.8 ? "teal" : "amber"}
          layout="vertical"
        />
        <KpiCard
          label="效率達標人數"
          value={`${onTargetEff} / ${activeTechs.length}`}
          tone={onTargetEff >= activeTechs.length * 0.7 ? "teal" : onTargetEff > 0 ? "amber" : "red"}
          layout="vertical"
          delta={{
            value: NADA_EFF_TARGET,
            tone: "neutral",
          }}
        />
        <KpiCard
          label="利用率達標人數"
          value={`${onTargetUtil} / ${activeTechs.length}`}
          tone={onTargetUtil >= activeTechs.length * 0.7 ? "teal" : onTargetUtil > 0 ? "amber" : "red"}
          layout="vertical"
          delta={{
            value: NADA_UTIL_TARGET,
            tone: "neutral",
          }}
        />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 全員效率 Eff.</span>
          </header>
          <div className="p-3">
            <GaugeChart
              value={Math.min(150, totals.avg_eff)}
              max={150}
              tone={
                totals.avg_eff >= NADA_EFF_TARGET ? "teal" : totals.avg_eff >= 100 ? "amber" : "red"
              }
              size="md"
              label={`${totals.avg_eff}%`}
              caption={`目標 ≥ ${NADA_EFF_TARGET}%`}
            />
          </div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 全員生產力 Prod.</span>
          </header>
          <div className="p-3">
            <GaugeChart
              value={totals.avg_prod}
              tone={
                totals.avg_prod >= NADA_PROD_TARGET ? "teal" : totals.avg_prod >= 70 ? "amber" : "red"
              }
              size="md"
              label={`${totals.avg_prod}%`}
              caption={`目標 ${NADA_PROD_TARGET}-87.5%`}
            />
          </div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 全員利用率 Util.</span>
          </header>
          <div className="p-3">
            <GaugeChart
              value={totals.avg_util}
              tone={
                totals.avg_util >= NADA_UTIL_TARGET ? "teal" : totals.avg_util >= 65 ? "amber" : "red"
              }
              size="md"
              label={`${totals.avg_util}%`}
              caption={`目標 ≥ ${NADA_UTIL_TARGET}%`}
            />
          </div>
        </div>
      </section>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 個別技師 NADA 三指標比較</span>
        </header>
        <div className="p-3">
          {nadaBarData.length === 0 ? (
            <p className="text-[12px] text-[#9A9890] text-center py-10">尚無在職技師</p>
          ) : (
            <BarChart
              data={nadaBarData}
              categoryKey="name"
              valueKey={[
                { key: "eff", label: "效率 %" },
                { key: "prod", label: "生產力 %" },
                { key: "util", label: "利用率 %" },
              ]}
              tone="blue"
              size="md"
              showLegend
            />
          )}
        </div>
      </section>

      {/* ── NADA 公式說明 ────────────────────────── */}
      <section className="bg-[#1A1A1A] text-white rounded-lg p-3 grid gap-1.5 md:grid-cols-3 text-[11.5px] leading-relaxed">
        <div>
          <strong style={{ color: "#7FFFD4" }}>效率 Efficiency</strong> = 銷售工時 ÷ 實際施工工時 × 100%　目標 ≥ {NADA_EFF_TARGET}%
        </div>
        <div>
          <strong style={{ color: "#FFD580" }}>生產力 Productivity</strong> = 銷售工時 ÷ 可用工時 × 100%　目標 {NADA_PROD_TARGET}-87.5%
        </div>
        <div>
          <strong style={{ color: "#C9A0FF" }}>利用率 Utilization</strong> = 實際施工工時 ÷ 可用工時 × 100%　目標 ≥ {NADA_UTIL_TARGET}%
        </div>
      </section>

      {/* ── KPI Bar ────────────────────────────── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3 flex flex-wrap items-center gap-2">
        <KpiChip
          color="#185FA5"
          bg="#E6F1FB"
          border="#4A90D9"
          label="施工中"
          value={kpis.working}
          unit="人"
        />
        <KpiChip
          color="#0F6E56"
          bg="#E1F5EE"
          border="#1D9E75"
          label="待命"
          value={kpis.idle}
          unit="人"
        />
        <KpiChip
          color="#6B6A68"
          bg="#E8E7E4"
          border="#D1D0CE"
          label="休息"
          value={kpis.break}
          unit="人"
        />
        {kpis.off > 0 ? (
          <KpiChip
            color="#9A9890"
            bg="#F5F5F4"
            border="#D1D0CE"
            label="下班"
            value={kpis.off}
            unit="人"
          />
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-[#9A9890]">
            共 {kpis.total_active} 位在職技師
          </span>
          <button
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            disabled={!canEdit || isPending}
            onClick={() => setModal({ kind: "create" })}
          >
            ＋ 新增技師
          </button>
        </div>
      </section>

      {/* ── 技師卡 Grid ────────────────────────── */}
      <section
        className={`grid gap-3 ${isPending ? lockedClass : ""}`}
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
      >
        {technicians.length === 0 ? (
          <div className="col-span-full bg-white border border-[#EEECE6] rounded-lg p-10 text-center text-[12px] text-[#9A9890]">
            還沒有技師，點右上「＋ 新增技師」開始建立
          </div>
        ) : (
          technicians.map((t) => (
            <TechCard
              key={t.id}
              tech={t}
              canEdit={canEdit}
              onDispatch={() => setModal({ kind: "dispatch", tech: t })}
              onComplete={() => {
                startTransition(async () => {
                  const res = await completeTechnicianJobAction(t.id);
                  handleResult(res, `${t.name} 完工 1 件`);
                });
              }}
              onSetStatus={(s) => {
                startTransition(async () => {
                  const res = await setTechnicianStatusAction(t.id, s);
                  handleResult(
                    res,
                    `${t.name} 已切換為「${TECH_STATUS_LABEL[s]}」`,
                  );
                });
              }}
              onEdit={() => setModal({ kind: "edit", tech: t })}
              onToggleActive={() => {
                startTransition(async () => {
                  const res = await setTechnicianActiveAction(
                    t.id,
                    !t.is_active,
                  );
                  handleResult(res, t.is_active ? "已停用" : "已啟用");
                });
              }}
              onDelete={() => setModal({ kind: "delete", tech: t })}
            />
          ))
        )}
      </section>

      {/* ── 今日人效統計表（NADA） ────────────────── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#1A3A5C] text-white">
          <span className="text-[13px] font-semibold">
            📊 今日人效統計　NADA 標準
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[#1A1A1A] text-white">
              <tr>
                <Th>技師</Th>
                <Th>狀態</Th>
                <Th align="right">工單</Th>
                <Th align="right">完成</Th>
                <Th align="right">進行中</Th>
                <Th align="right">銷售</Th>
                <Th align="right">實際</Th>
                <Th align="right">可用</Th>
                <Th align="right" title="銷售÷實際×100%  目標≥125%">效率 Eff.</Th>
                <Th align="right" title="銷售÷可用×100%  目標85-87.5%">生產力 Prod.</Th>
                <Th align="right" title="實際÷可用×100%  目標≥80%">利用率 Util.</Th>
              </tr>
            </thead>
            <tbody>
              {technicians.map((t) => {
                const eff = computeEfficiency(t.sold_minutes, t.actual_minutes);
                const prod = computeProductivity(
                  t.sold_minutes,
                  t.available_minutes,
                );
                const util = computeUtilization(
                  t.actual_minutes,
                  t.available_minutes,
                );
                const inProgress = Math.max(0, t.jobs_total - t.jobs_done);
                return (
                  <tr
                    key={t.id}
                    className="border-b border-[#EEECE6] hover:bg-[#F8F7F4]"
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white"
                          style={{ background: t.avatar_color ?? "#185FA5" }}
                        >
                          {t.name.slice(0, 1)}
                        </span>
                        <div>
                          <div className="font-semibold text-[#2C2C2A]">
                            {t.name}
                          </div>
                          <div className="text-[10px] text-[#9A9890]">
                            {t.grade ?? "—"}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${TECH_STATUS_CHIP[t.status]}`}
                      >
                        {TECH_STATUS_LABEL[t.status]}
                      </span>
                    </Td>
                    <Td align="right">{t.jobs_total}</Td>
                    <Td align="right">{t.jobs_done}</Td>
                    <Td align="right">{inProgress}</Td>
                    <Td align="right">{minutesToHoursStr(t.sold_minutes)}</Td>
                    <Td align="right">{minutesToHoursStr(t.actual_minutes)}</Td>
                    <Td align="right">{minutesToHoursStr(t.available_minutes)}</Td>
                    <Td align="right">
                      <strong style={{ color: effColor(eff) }}>{eff}%</strong>
                    </Td>
                    <Td align="right">
                      <strong style={{ color: prodColor(prod) }}>{prod}%</strong>
                    </Td>
                    <Td align="right">
                      <strong style={{ color: utilColor(util) }}>{util}%</strong>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-[#F8F7F4]">
              <tr>
                <Td>
                  <strong className="text-[#1A3A5C]">
                    全員合計（{totals.technician_count} 人）
                  </strong>
                </Td>
                <Td>—</Td>
                <Td align="right">
                  <strong>{totals.total_jobs}</strong>
                </Td>
                <Td align="right">
                  <strong>{totals.done_jobs}</strong>
                </Td>
                <Td align="right">
                  <strong>{totals.in_progress_jobs}</strong>
                </Td>
                <Td align="right">
                  <strong>{minutesToHoursStr(totals.sold_minutes)}</strong>
                </Td>
                <Td align="right">
                  <strong>{minutesToHoursStr(totals.actual_minutes)}</strong>
                </Td>
                <Td align="right">
                  <strong>{minutesToHoursStr(totals.available_minutes)}</strong>
                </Td>
                <Td align="right">
                  <strong style={{ color: effColor(totals.avg_eff) }}>
                    {totals.avg_eff}%
                  </strong>
                </Td>
                <Td align="right">
                  <strong style={{ color: prodColor(totals.avg_prod) }}>
                    {totals.avg_prod}%
                  </strong>
                </Td>
                <Td align="right">
                  <strong style={{ color: utilColor(totals.avg_util) }}>
                    {totals.avg_util}%
                  </strong>
                </Td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <p className="text-[11px] text-[#9A9890]">
        <strong>NADA</strong> 為北美汽車經銷商協會（National Automobile Dealers Association）車間人效標準。
        1 LU（labor unit）= 6 分鐘 → 銷售工時 = Σ LU ÷ 10。
      </p>

      {/* ── Modals ─────────────────────────────── */}
      {modal.kind === "create" || modal.kind === "edit" ? (
        <TechFormModal
          mode={modal.kind}
          tech={modal.kind === "edit" ? modal.tech : null}
          isPending={isPending}
          onCancel={() => setModal({ kind: "closed" })}
          onSubmit={(input) => {
            startTransition(async () => {
              if (modal.kind === "create") {
                const res = await createTechnicianAction(input);
                handleResult(res, "技師已建立");
              } else if (modal.kind === "edit") {
                const res = await updateTechnicianAction(modal.tech.id, {
                  name: input.name,
                  grade: input.grade,
                  avatar_color: input.avatar_color,
                  sort_order: input.sort_order,
                });
                handleResult(res, "技師已更新");
              }
            });
          }}
        />
      ) : null}

      {modal.kind === "dispatch" ? (
        <DispatchModal
          tech={modal.tech}
          isPending={isPending}
          onCancel={() => setModal({ kind: "closed" })}
          onSubmit={(input) => {
            startTransition(async () => {
              const res = await dispatchToTechnicianAction(modal.tech.id, input);
              handleResult(res, `已派工給 ${modal.tech.name}`);
            });
          }}
        />
      ) : null}

      {modal.kind === "delete" ? (
        <ConfirmModal
          title="刪除技師"
          message={`確定要刪除「${modal.tech.name}」嗎？此操作不可復原（後續 NADA 統計會少一位）。`}
          confirmText="確認刪除"
          danger
          isPending={isPending}
          onCancel={() => setModal({ kind: "closed" })}
          onConfirm={() => {
            startTransition(async () => {
              const res = await deleteTechnicianAction(modal.tech.id);
              handleResult(res, "技師已刪除");
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
  unit = "個",
}: {
  color: string;
  bg: string;
  border: string;
  label: string;
  value: number;
  unit?: string;
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
        {label} <strong>{value}</strong> {unit}
      </span>
    </span>
  );
}

function TechCard({
  tech,
  canEdit,
  onDispatch,
  onComplete,
  onSetStatus,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  tech: AftersalesTechnicianRow;
  canEdit: boolean;
  onDispatch: () => void;
  onComplete: () => void;
  onSetStatus: (s: TechStatus) => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const accent = TECH_STATUS_ACCENT[tech.status];
  const eff = computeEfficiency(tech.sold_minutes, tech.actual_minutes);
  const prod = computeProductivity(tech.sold_minutes, tech.available_minutes);
  const util = computeUtilization(tech.actual_minutes, tech.available_minutes);
  const elapsed = elapsedMinutes(tech.started_at);

  return (
    <div
      className="rounded-lg bg-white border-[1.5px] p-3 relative overflow-hidden flex flex-col gap-2"
      style={{
        borderColor: accent,
        background:
          tech.status === "working"
            ? "linear-gradient(135deg,#fff 0%,#EEF6FF 100%)"
            : tech.status === "idle"
              ? "linear-gradient(135deg,#fff 0%,#F0FBF7 100%)"
              : tech.status === "break"
                ? "#F5F5F4"
                : "#F5F5F4",
        opacity: tech.status === "off" || !tech.is_active ? 0.65 : 1,
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: accent }}
      />

      {/* Top: avatar + name + status */}
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center w-9 h-9 rounded-full text-[14px] font-bold text-white shrink-0"
          style={{ background: tech.avatar_color ?? "#185FA5" }}
        >
          {tech.name.slice(0, 1)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-[#2C2C2A] truncate">
            {tech.name}
          </div>
          <div className="text-[10px] text-[#9A9890]">{tech.grade ?? "—"}</div>
        </div>
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TECH_STATUS_CHIP[tech.status]}`}
        >
          {TECH_STATUS_LABEL[tech.status]}
        </span>
      </div>

      {/* Current job */}
      {tech.status === "working" && tech.current_ro_code ? (
        <div className="bg-white border border-[#EEECE6] rounded p-2">
          <div className="text-[11px] font-mono font-semibold text-[#2C2C2A] truncate">
            {tech.current_ro_code}
            {tech.current_bay_code ? (
              <span className="ml-1.5 text-[10px] text-[#9A9890] font-sans">
                @ {tech.current_bay_code}
              </span>
            ) : null}
          </div>
          <div className="text-[10.5px] text-[#6B6A68] truncate">
            {tech.current_item}
          </div>
          {tech.started_at ? (
            <div className="mt-1 text-[12px] text-[#185FA5] font-semibold tabular-nums">
              ⏱ {formatElapsed(elapsed)}
            </div>
          ) : null}
        </div>
      ) : tech.status === "idle" ? (
        <div className="text-[11px] text-[#0F6E56]">✅ 可接受派工</div>
      ) : tech.status === "break" ? (
        <div className="text-[11px] text-[#9A9890]">休息中</div>
      ) : (
        <div className="text-[11px] text-[#9A9890]">已下班</div>
      )}

      {/* NADA 三指標 mini bar */}
      <div className="flex border border-[#EEECE6] rounded overflow-hidden">
        <NadaCell label="效率" pct={eff} color={effColor(eff)} />
        <NadaCell label="生產力" pct={prod} color={prodColor(prod)} />
        <NadaCell label="利用率" pct={util} color={utilColor(util)} />
      </div>

      {/* 今日工單統計 */}
      <div className="flex items-center justify-between text-[10.5px] text-[#6B6A68]">
        <span>
          工單 <b className="text-[#2C2C2A]">{tech.jobs_total}</b> 件
        </span>
        <span>
          完成 <b className="text-[#0F6E56]">{tech.jobs_done}</b>
        </span>
        <span>
          銷售 <b className="text-[#2C2C2A]">{minutesToHoursStr(tech.sold_minutes)}</b>
        </span>
      </div>

      {/* Action row */}
      {canEdit ? (
        <div className="flex flex-wrap gap-1 mt-1">
          {tech.status === "idle" ? (
            <button
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] flex-1"
              onClick={onDispatch}
            >
              指派工單 →
            </button>
          ) : null}
          {tech.status === "working" ? (
            <button
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742] flex-1"
              onClick={onComplete}
            >
              完工
            </button>
          ) : null}
          {tech.status === "break" ? (
            <button
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#1D9E75] text-[#0F6E56] hover:bg-[#E1F5EE] flex-1"
              onClick={() => onSetStatus("idle")}
            >
              收假回崗
            </button>
          ) : null}
          {tech.status === "working" || tech.status === "idle" ? (
            <button
              className="h-[26px] px-2 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              onClick={() => onSetStatus("break")}
            >
              休息
            </button>
          ) : null}
          <button
            className="h-[26px] px-2 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            onClick={onEdit}
          >
            編輯
          </button>
          <button
            className="h-[26px] px-2 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            onClick={onToggleActive}
          >
            {tech.is_active ? "停用" : "啟用"}
          </button>
          <button
            className="h-[26px] px-2 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
            onClick={onDelete}
          >
            刪除
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NadaCell({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="flex-1 text-center px-1 py-1.5 border-r border-[#EEECE6] last:border-r-0">
      <div className="text-[9px] text-[#9A9890]">{label}</div>
      <div
        className="text-[12.5px] font-bold tabular-nums"
        style={{ color }}
      >
        {pct}%
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
  title,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  title?: string;
}) {
  return (
    <th
      className="px-2.5 py-2 text-[11px] font-semibold whitespace-nowrap"
      style={{ textAlign: align }}
      title={title}
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

type TechFormInput = {
  code: string;
  name: string;
  grade: string | null;
  avatar_color: string | null;
  sort_order: number;
};

function TechFormModal({
  mode,
  tech,
  isPending,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  tech: AftersalesTechnicianRow | null;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (input: TechFormInput) => void;
}) {
  const [code, setCode] = useState(tech?.code ?? "");
  const [name, setName] = useState(tech?.name ?? "");
  const [grade, setGrade] = useState<string>(tech?.grade ?? "車間技師");
  const [color, setColor] = useState<string>(tech?.avatar_color ?? "#185FA5");
  const [sortOrder, setSortOrder] = useState<number>(tech?.sort_order ?? 0);

  return (
    <ModalShell
      title={
        mode === "create" ? "新增技師" : `編輯技師 — ${tech?.name ?? ""}`
      }
      onCancel={onCancel}
      onConfirm={() =>
        onSubmit({
          code: code.trim(),
          name: name.trim(),
          grade: grade || null,
          avatar_color: color || null,
          sort_order: sortOrder,
        })
      }
      confirmText={mode === "create" ? "建立" : "儲存變更"}
      isPending={isPending}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="技師代碼 *">
          <input
            className={inputClass}
            value={code}
            disabled={mode === "edit"}
            onChange={(e) => setCode(e.target.value)}
            placeholder="T1"
          />
        </Field>
        <Field label="姓名 *">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="陳建明"
          />
        </Field>
        <Field label="職級">
          <select
            className={inputClass}
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          >
            {TECH_GRADE_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
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
        <Field label="頭像顏色" full>
          <div className="flex flex-wrap gap-1.5">
            {AVATAR_COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                className="w-7 h-7 rounded-full border-2"
                style={{
                  background: c,
                  borderColor: color === c ? "#1A3A5C" : "transparent",
                }}
                onClick={() => setColor(c)}
                title={c}
              />
            ))}
          </div>
        </Field>
      </div>
    </ModalShell>
  );
}

function DispatchModal({
  tech,
  isPending,
  onCancel,
  onSubmit,
}: {
  tech: AftersalesTechnicianRow;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    ro_code: string;
    item: string;
    bay_code?: string | null;
  }) => void;
}) {
  const [ro, setRo] = useState("");
  const [item, setItem] = useState("");
  const [bay, setBay] = useState("");

  return (
    <ModalShell
      title={`指派工單給 ${tech.name}`}
      onCancel={onCancel}
      onConfirm={() =>
        onSubmit({
          ro_code: ro.trim(),
          item: item.trim(),
          bay_code: bay.trim() || null,
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
        <Field label="工位代碼（選填）">
          <input
            className={inputClass}
            value={bay}
            onChange={(e) => setBay(e.target.value)}
            placeholder="B2"
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
