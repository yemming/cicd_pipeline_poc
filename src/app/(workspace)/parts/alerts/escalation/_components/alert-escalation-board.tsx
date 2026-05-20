"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { FlowDiagram, type FlowNode, type FlowEdge } from "@/components/visualization/FlowDiagram";
import { KpiCard } from "@/components/visualization/KpiCard";
import { Timeline, type TimelineEvent } from "@/components/visualization/Timeline";
import {
  type AlertEscalationRow,
  type AlertTypeMeta,
  type SimulationStep,
  ALERT_PRIORITY_TONE,
  TIER_TONE,
  formatMinutes,
} from "@/domain/parts-alerts-escalation.constants";
import {
  createEscalationTierAction,
  updateEscalationTierAction,
  deleteEscalationTierAction,
  setEscalationActiveAction,
  reorderEscalationTiersAction,
} from "@/lib/parts-alerts/escalation-actions";

// ---- Styling tokens ------------------------------------------------------

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

// ---- Types ---------------------------------------------------------------

type EditDraft = {
  id: string | null; // null = create
  alert_type: string;
  alert_label: string;
  alert_priority: "low" | "mid" | "high";
  alert_icon: string;
  trigger_desc: string;
  tier: number;
  tier_label: string;
  delay_minutes: number;
  recipient_label: string;
  channel_push: boolean;
  channel_sms: boolean;
  channel_email: boolean;
  is_active: boolean;
};

function fromRow(r: AlertEscalationRow): EditDraft {
  return {
    id: r.id,
    alert_type: r.alert_type,
    alert_label: r.alert_label,
    alert_priority: r.alert_priority,
    alert_icon: r.alert_icon ?? "",
    trigger_desc: r.trigger_desc ?? "",
    tier: r.tier,
    tier_label: r.tier_label,
    delay_minutes: r.delay_minutes,
    recipient_label: r.recipient_label ?? "",
    channel_push: r.channel_push,
    channel_sms: r.channel_sms,
    channel_email: r.channel_email,
    is_active: r.is_active,
  };
}

function emptyDraft(meta: AlertTypeMeta | undefined, nextTier: number): EditDraft {
  return {
    id: null,
    alert_type: meta?.alert_type ?? "",
    alert_label: meta?.alert_label ?? "",
    alert_priority: meta?.alert_priority ?? "mid",
    alert_icon: meta?.alert_icon ?? "",
    trigger_desc: meta?.trigger_desc ?? "",
    tier: nextTier,
    tier_label: `第 ${nextTier} 級`,
    delay_minutes: 60,
    recipient_label: "",
    channel_push: true,
    channel_sms: false,
    channel_email: false,
    is_active: true,
  };
}

// ---- Component -----------------------------------------------------------

export function AlertEscalationBoard({
  canEdit,
  alertTypes,
  activeType,
  rows,
  simulation,
}: {
  canEdit: boolean;
  alertTypes: AlertTypeMeta[];
  activeType: string;
  rows: AlertEscalationRow[];
  simulation: { alert_label: string; trigger_desc: string | null; steps: SimulationStep[] };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [showSimModal, setShowSimModal] = useState(false);

  const activeMeta = useMemo(
    () => alertTypes.find((t) => t.alert_type === activeType),
    [alertTypes, activeType],
  );

  // FlowDiagram nodes/edges
  const { nodes, edges } = useMemo<{ nodes: FlowNode[]; edges: FlowEdge[] }>(() => {
    const sortedRows = [...rows].sort((a, b) => a.tier - b.tier);
    const ns: FlowNode[] = [
      { id: "trigger", label: "🚨 觸發", tone: "red" },
      ...sortedRows.map((r) => ({
        id: r.id,
        label: `L${r.tier} ${r.tier_label}`,
        tone: TIER_TONE[r.tier] ?? "gray",
      })),
    ];
    const es: FlowEdge[] = [];
    if (sortedRows.length > 0) {
      es.push({ from: "trigger", to: sortedRows[0].id, label: formatMinutes(sortedRows[0].delay_minutes) });
      for (let i = 1; i < sortedRows.length; i++) {
        es.push({
          from: sortedRows[i - 1].id,
          to: sortedRows[i].id,
          label: formatMinutes(sortedRows[i].delay_minutes),
        });
      }
    }
    return { nodes: ns, edges: es };
  }, [rows]);

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function switchType(alertType: string) {
    startTransition(() => router.push(`/parts/alerts/escalation?alert_type=${encodeURIComponent(alertType)}`));
  }

  function openEdit(r: AlertEscalationRow) {
    if (!canEdit) return;
    setEditDraft(fromRow(r));
  }

  function openCreate() {
    if (!canEdit || !activeMeta) return;
    const nextTier = (rows[rows.length - 1]?.tier ?? 0) + 1;
    setEditDraft(emptyDraft(activeMeta, nextTier));
  }

  function closeEdit() {
    if (isPending) return;
    setEditDraft(null);
  }

  function saveDraft() {
    if (!editDraft) return;
    if (!editDraft.tier_label.trim()) {
      showBanner({ ok: false, msg: "層級名稱必填" });
      return;
    }
    startTransition(async () => {
      const payload = {
        alert_type: editDraft.alert_type,
        alert_label: editDraft.alert_label,
        alert_priority: editDraft.alert_priority,
        alert_icon: editDraft.alert_icon || null,
        trigger_desc: editDraft.trigger_desc || null,
        tier: editDraft.tier,
        tier_label: editDraft.tier_label,
        delay_minutes: editDraft.delay_minutes,
        recipient_label: editDraft.recipient_label || null,
        channel_push: editDraft.channel_push,
        channel_sms: editDraft.channel_sms,
        channel_email: editDraft.channel_email,
        is_active: editDraft.is_active,
        sort_order: editDraft.tier * 10,
      };
      const res = editDraft.id
        ? await updateEscalationTierAction(editDraft.id, payload)
        : await createEscalationTierAction(payload);
      if (res.ok) {
        showBanner({ ok: true, msg: editDraft.id ? "✓ 已更新" : "✓ 已新增階層" });
        setEditDraft(null);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function toggleActive(r: AlertEscalationRow) {
    if (!canEdit) return;
    startTransition(async () => {
      const res = await setEscalationActiveAction(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function removeRow(r: AlertEscalationRow) {
    if (!canEdit) return;
    if (!confirm(`確定刪除 L${r.tier} 「${r.tier_label}」？`)) return;
    startTransition(async () => {
      const res = await deleteEscalationTierAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function moveRow(r: AlertEscalationRow, dir: -1 | 1) {
    if (!canEdit) return;
    const sorted = [...rows].sort((a, b) => a.tier - b.tier);
    const idx = sorted.findIndex((x) => x.id === r.id);
    const newIdx = idx + dir;
    if (idx < 0 || newIdx < 0 || newIdx >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    startTransition(async () => {
      const res = await reorderEscalationTiersAction(
        r.alert_type,
        reordered.map((x) => x.id),
      );
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已重排" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const totalTiers = rows.length;
  const activeTiers = rows.filter((r) => r.is_active).length;
  const maxDelay = rows.reduce((acc, r) => acc + (r.is_active ? r.delay_minutes : 0), 0);

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">告警階層設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          M04L-6
        </span>
        <span className="text-[12px] text-[#9A9890]">
          告警未處理時自動升級的階層 / 通知對象 / 通道
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowSimModal(true)}
            disabled={!activeType || rows.length === 0}
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
          >
            🎬 模擬推演
          </button>
          <button
            type="button"
            onClick={openCreate}
            disabled={!canEdit || !activeMeta}
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            title={canEdit ? "" : "沒有編輯權限"}
          >
            ＋ 新增階層
          </button>
        </div>
      </header>

      {/* KPI 列 */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="告警類型"
          value={alertTypes.length}
          tone="blue"
          layout="horizontal"
          icon={<span>📋</span>}
        />
        <KpiCard
          label="當前類型階層數"
          value={totalTiers}
          tone="amber"
          layout="horizontal"
          icon={<span>🪜</span>}
        />
        <KpiCard
          label="啟用中階層"
          value={`${activeTiers} / ${totalTiers}`}
          tone="green"
          layout="horizontal"
          icon={<span>✓</span>}
        />
        <KpiCard
          label="完整升級耗時"
          value={formatMinutes(maxDelay)}
          tone="red"
          layout="horizontal"
          icon={<span>⏱</span>}
        />
      </section>

      {/* Alert Type Tab Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="flex border-b border-[#EEECE6] overflow-x-auto">
          {alertTypes.length === 0 ? (
            <div className="px-4 py-3 text-[12.5px] text-[#9A9890]">尚無告警類型</div>
          ) : (
            alertTypes.map((t) => {
              const isActive = t.alert_type === activeType;
              const tone = ALERT_PRIORITY_TONE[t.alert_priority];
              return (
                <button
                  key={t.alert_type}
                  type="button"
                  onClick={() => switchType(t.alert_type)}
                  disabled={isPending}
                  className={`px-4 h-[44px] text-[12.5px] whitespace-nowrap border-r last:border-r-0 border-[#EEECE6] inline-flex items-center gap-2 ${
                    isActive
                      ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                      : "text-[#5A5955] hover:bg-[#F8F7F4]"
                  } disabled:opacity-60`}
                >
                  <span className="text-[14px]">{t.alert_icon ?? "•"}</span>
                  <span>{t.alert_label}</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-medium border ${tone.chip}`}>
                    {tone.label}
                  </span>
                  <span className="text-[10.5px] text-[#9A9890]">{t.tier_count} 級</span>
                </button>
              );
            })
          )}
        </div>

        {/* 觸發條件說明 */}
        {activeMeta ? (
          <div className="px-4 py-2.5 bg-[#F8F7F4] border-b border-[#EEECE6] text-[12px] text-[#5A5955]">
            <b className="text-[#2C2C2A]">觸發條件：</b>
            {activeMeta.trigger_desc ?? "（未設定）"}
          </div>
        ) : null}
      </section>

      {/* FlowDiagram 階層流程圖 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 升級階層流程</span>
          <span className="text-[11px] text-[#9A9890] ml-auto">點節點查看詳情 / 編輯</span>
        </header>
        <div className="px-4 py-4">
          {rows.length === 0 ? (
            <div className="py-12 text-center text-[12.5px] text-[#9A9890]">
              <div className="text-[24px] mb-2">📭</div>
              {!activeType ? "請先選擇告警類型" : "此告警類型尚未設定階層"}
              {canEdit && activeType ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={openCreate}
                    className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                  >
                    ＋ 建立第一級
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <FlowDiagram nodes={nodes} edges={edges} orientation="horizontal" />
          )}
        </div>
      </section>

      {/* 階層明細 — 卡片陣列（節點對應的 detail） */}
      {rows.length > 0 ? (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...rows]
            .sort((a, b) => a.tier - b.tier)
            .map((r, idx, arr) => {
              const tone = TIER_TONE[r.tier] ?? "blue";
              const channels: string[] = [];
              if (r.channel_push) channels.push("Push");
              if (r.channel_sms) channels.push("SMS");
              if (r.channel_email) channels.push("Email");
              return (
                <article
                  key={r.id}
                  className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
                    !r.is_active ? "opacity-60" : ""
                  }`}
                >
                  <header
                    className={`px-3 py-2 border-b border-[#EEECE6] flex items-center gap-2 bg-tone-${tone}-50`}
                  >
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-tone-${tone}-500 text-white`}
                    >
                      L{r.tier}
                    </span>
                    <span className="text-[12.5px] font-semibold text-[#2C2C2A] truncate">
                      {r.tier_label}
                    </span>
                    <span
                      className={`ml-auto inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                        r.is_active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F2F2F2] text-[#6B6A68]"
                      }`}
                    >
                      {r.is_active ? "啟用" : "停用"}
                    </span>
                  </header>
                  <div className="px-3 py-3 space-y-2 text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[#9A9890]">觸發延遲</span>
                      <span className="font-mono text-[#2C2C2A]">
                        {formatMinutes(r.delay_minutes)}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-[#9A9890] shrink-0">通知對象</span>
                      <span className="text-[#2C2C2A] text-[12.5px]">
                        {r.recipient_label ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[#9A9890] mr-1">通道</span>
                      {channels.length === 0 ? (
                        <span className="text-[11px] text-[#9A9890]">—</span>
                      ) : (
                        channels.map((ch) => (
                          <span
                            key={ch}
                            className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] bg-[#E8F5F0] text-[#0F6E56]"
                          >
                            {ch}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <footer className="px-3 py-2 border-t border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => moveRow(r, -1)}
                      disabled={!canEdit || isPending || idx === 0}
                      className="h-[26px] px-2 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-40"
                      title="上移（降一級）"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRow(r, 1)}
                      disabled={!canEdit || isPending || idx === arr.length - 1}
                      className="h-[26px] px-2 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-40"
                      title="下移（升一級）"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(r)}
                      disabled={!canEdit || isPending}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(r)}
                      disabled={!canEdit || isPending}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    >
                      {r.is_active ? "停用" : "啟用"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(r)}
                      disabled={!canEdit || isPending}
                      className="ml-auto h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                    >
                      刪除
                    </button>
                  </footer>
                </article>
              );
            })}
        </section>
      ) : null}

      {/* Edit Modal */}
      {editDraft ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={closeEdit}
        >
          <div
            className="bg-white rounded-lg w-[640px] max-w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center gap-2">
              <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
                {editDraft.id ? "編輯告警階層" : "新增告警階層"}
              </h2>
              <span className="text-[11px] text-[#9A9890]">{editDraft.alert_label}</span>
              <button
                type="button"
                onClick={closeEdit}
                disabled={isPending}
                className="ml-auto text-[18px] text-[#9A9890] hover:text-[#5A5955]"
              >
                ×
              </button>
            </header>
            <div className={`px-4 py-3 grid grid-cols-2 gap-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>層級 (tier) *</label>
                <input
                  type="number"
                  min={1}
                  value={editDraft.tier}
                  onChange={(e) => setEditDraft({ ...editDraft, tier: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>層級名稱 *</label>
                <input
                  type="text"
                  value={editDraft.tier_label}
                  onChange={(e) => setEditDraft({ ...editDraft, tier_label: e.target.value })}
                  className={inputClass}
                  placeholder="例：一級告警"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>觸發延遲（分鐘，0=立即）</label>
                <input
                  type="number"
                  min={0}
                  value={editDraft.delay_minutes}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, delay_minutes: Number(e.target.value) })
                  }
                  className={inputClass}
                />
                <span className="text-[10.5px] text-[#9A9890]">
                  {formatMinutes(editDraft.delay_minutes)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>優先級</label>
                <select
                  value={editDraft.alert_priority}
                  onChange={(e) =>
                    setEditDraft({
                      ...editDraft,
                      alert_priority: e.target.value as "low" | "mid" | "high",
                    })
                  }
                  className={inputClass}
                >
                  <option value="low">低</option>
                  <option value="mid">中</option>
                  <option value="high">高</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 col-span-2">
                <label className={labelClass}>接收者（自由文字 / 角色名）</label>
                <input
                  type="text"
                  value={editDraft.recipient_label}
                  onChange={(e) => setEditDraft({ ...editDraft, recipient_label: e.target.value })}
                  className={inputClass}
                  placeholder="例：蔡零件（倉管）/ 陳主管"
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <label className={labelClass}>通知通道</label>
                <div className="flex items-center gap-3 mt-1">
                  <label className="inline-flex items-center gap-1.5 text-[12px] text-[#2C2C2A]">
                    <input
                      type="checkbox"
                      checked={editDraft.channel_push}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, channel_push: e.target.checked })
                      }
                    />
                    <span>Push</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-[12px] text-[#2C2C2A]">
                    <input
                      type="checkbox"
                      checked={editDraft.channel_sms}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, channel_sms: e.target.checked })
                      }
                    />
                    <span>SMS</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-[12px] text-[#2C2C2A]">
                    <input
                      type="checkbox"
                      checked={editDraft.channel_email}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, channel_email: e.target.checked })
                      }
                    />
                    <span>Email</span>
                  </label>
                </div>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-[12px] text-[#2C2C2A]">
                  <input
                    type="checkbox"
                    checked={editDraft.is_active}
                    onChange={(e) => setEditDraft({ ...editDraft, is_active: e.target.checked })}
                  />
                  <span>啟用此階層</span>
                </label>
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex items-center gap-2">
              <button
                type="button"
                onClick={closeEdit}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveDraft}
                disabled={isPending}
                className="ml-auto h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending ? "儲存中⋯" : editDraft.id ? "儲存變更" : "建立"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {/* Simulation Modal */}
      {showSimModal ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setShowSimModal(false)}
        >
          <div
            className="bg-white rounded-lg w-[640px] max-w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center gap-2">
              <h2 className="text-[14px] font-semibold text-[#2C2C2A]">🎬 模擬推演</h2>
              <span className="text-[11px] text-[#9A9890]">{simulation.alert_label}</span>
              <button
                type="button"
                onClick={() => setShowSimModal(false)}
                className="ml-auto text-[18px] text-[#9A9890] hover:text-[#5A5955]"
              >
                ×
              </button>
            </header>
            <div className="px-4 py-3 space-y-3">
              <p className="text-[12.5px] text-[#5A5955]">
                假設 <b className="text-[#CC0000]">現在</b> 觸發 {simulation.alert_label}，依照目前的階層設定，將按以下時序通知：
              </p>
              {simulation.trigger_desc ? (
                <div className="text-[11.5px] text-[#9A9890] bg-[#F8F7F4] rounded p-2 border border-[#EEECE6]">
                  觸發條件：{simulation.trigger_desc}
                </div>
              ) : null}
              {simulation.steps.length === 0 ? (
                <div className="text-[12.5px] text-[#9A9890] py-6 text-center">
                  尚無啟用中的階層，無法推演
                </div>
              ) : (
                <Timeline
                  variant="vertical"
                  events={simulation.steps.map<TimelineEvent>((s) => ({
                    id: `step-${s.tier}`,
                    time: s.fire_at_label,
                    title: `L${s.tier} — ${s.tier_label}`,
                    tone: TIER_TONE[s.tier] ?? "blue",
                    description: (
                      <div className="space-y-1">
                        <div>
                          <span className="text-[#9A9890]">通知</span>
                          <span className="ml-1 text-[#2C2C2A]">{s.recipient_label ?? "—"}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[#9A9890]">通道</span>
                          {s.channels.length === 0 ? (
                            <span className="text-[#9A9890]">—</span>
                          ) : (
                            s.channels.map((ch) => (
                              <span
                                key={ch}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] bg-[#E8F5F0] text-[#0F6E56]"
                              >
                                {ch === "push" ? "Push" : ch === "sms" ? "SMS" : "Email"}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    ),
                  }))}
                />
              )}
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex items-center">
              <span className="text-[11px] text-[#9A9890]">
                推演結果根據目前啟用中的階層 + delay_minutes 計算（假設使用者均未確認告警）
              </span>
              <button
                type="button"
                onClick={() => setShowSimModal(false)}
                className="ml-auto h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                關閉
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {/* Banner */}
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
