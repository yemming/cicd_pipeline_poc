"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  setAlertEscalationActiveAction,
  deleteAlertEscalationAction,
  updateAlertEscalationAction,
  type BusinessRuleRow,
  type AlertEscalationConfig,
} from "@/domain/rules";
import {
  ALERT_ESCALATION_CHANNEL_OPTIONS,
  ALERT_ESCALATION_LEVEL_CHIP,
  ALERT_ESCALATION_RECIPIENT_LABEL,
} from "@/domain/rules.constants";

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

type Row = BusinessRuleRow & { _cfg: Partial<AlertEscalationConfig> };

function attach(r: BusinessRuleRow): Row {
  return { ...r, _cfg: (r.config ?? {}) as Partial<AlertEscalationConfig> };
}

function fmtTimeout(min: number | undefined): string {
  if (min === undefined || min === null) return "—";
  if (min === 0) return "立即";
  if (min % 1440 === 0) return `${min / 1440} 天後`;
  if (min % 60 === 0) return `${min / 60} 小時後`;
  return `${min} 分鐘後`;
}

const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(
  ALERT_ESCALATION_CHANNEL_OPTIONS.map((o) => [o.value, o.label]),
);

export function EscalationBoard({
  rules,
  canEdit,
  initialQ,
  initialLevel,
  initialIsActive,
}: {
  rules: BusinessRuleRow[];
  canEdit: boolean;
  initialQ: string;
  initialLevel: string;
  initialIsActive: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [q, setQ] = useState(initialQ);
  const [level, setLevel] = useState(initialLevel);
  const [isActive, setIsActive] = useState(initialIsActive);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  const rows = useMemo(() => rules.map(attach), [rules]);

  function buildHref(extra: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      q: q || undefined,
      level: level || undefined,
      is_active: isActive || undefined,
      ...extra,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === null) continue;
      params.set(k, v);
    }
    const qs = params.toString();
    return `/parts/alerts/escalation${qs ? "?" + qs : ""}`;
  }

  function applyFilter() {
    startTransition(() => router.push(buildHref({})));
  }

  function resetFilter() {
    setQ("");
    setLevel("");
    setIsActive("");
    startTransition(() => router.push("/parts/alerts/escalation"));
  }

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function toggleActive(r: Row) {
    startTransition(async () => {
      const res = await setAlertEscalationActiveAction(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function removeRow(r: Row) {
    if (!confirm(`確定刪除告警階層「${r._cfg.label ?? `L${r._cfg.level ?? "?"}`}」？此動作無法復原。`)) {
      return;
    }
    startTransition(async () => {
      const res = await deleteAlertEscalationAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const columns = useMemo<DataGridColumn<Row>[]>(() => {
    const labelEdit = canEdit
      ? {
          type: "text" as const,
          getValue: (r: Row) => r._cfg.label ?? "",
          onSave: async (r: Row, value: string) => {
            const v = value.trim();
            if (!v) return { ok: false as const, error: "名稱不可為空" };
            const res = await updateAlertEscalationAction(r.id, { label: v });
            if (res.ok) {
              showBanner({ ok: true, msg: "✓ 已更新" });
              router.refresh();
              return { ok: true as const };
            }
            return { ok: false as const, error: res.error };
          },
        }
      : undefined;

    return [
      {
        id: "level",
        header: "層級",
        width: 80,
        hideable: false,
        cell: (r) => {
          const lvl = r._cfg.level ?? 0;
          const def =
            ALERT_ESCALATION_LEVEL_CHIP[lvl] ?? {
              chip: "bg-[#F2F2F2] text-[#6B6A68]",
              label: `L${lvl}`,
            };
          return (
            <Link
              href={`/parts/alerts/escalation/${r.id}`}
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] font-semibold hover:underline ${def.chip}`}
            >
              {def.label}
            </Link>
          );
        },
        exportValue: (r) => `L${r._cfg.level ?? ""}`,
        sortValue: (r) => r._cfg.level ?? 0,
      },
      {
        id: "label",
        header: "階層名稱",
        width: 220,
        cell: (r) => (
          <Link
            href={`/parts/alerts/escalation/${r.id}`}
            className="text-[#1A3A5C] hover:text-[#185FA5] hover:underline"
          >
            {r._cfg.label ?? "—"}
          </Link>
        ),
        exportValue: (r) => r._cfg.label ?? "",
        sortValue: (r) => r._cfg.label ?? "",
        editable: labelEdit,
      },
      {
        id: "timeout",
        header: "升級延遲",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[12px]">{fmtTimeout(r._cfg.timeout_min)}</span>
        ),
        exportValue: (r) => fmtTimeout(r._cfg.timeout_min),
        sortValue: (r) => r._cfg.timeout_min ?? 0,
      },
      {
        id: "recipients",
        header: "通知對象",
        width: 260,
        sortable: false,
        cell: (r) => (
          <div className="flex items-center gap-1 flex-wrap">
            {(r._cfg.recipients ?? []).length === 0 ? (
              <span className="text-[11px] text-[#9A9890]">—</span>
            ) : (
              (r._cfg.recipients ?? []).map((rcp) => (
                <span
                  key={rcp}
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] bg-[#EAF4FB] text-[#185FA5]"
                >
                  {ALERT_ESCALATION_RECIPIENT_LABEL[rcp] ?? rcp}
                </span>
              ))
            )}
          </div>
        ),
        exportValue: (r) => (r._cfg.recipients ?? []).join(","),
      },
      {
        id: "channels",
        header: "通知通道",
        width: 200,
        sortable: false,
        cell: (r) => (
          <div className="flex items-center gap-1 flex-wrap">
            {(r._cfg.channels ?? []).length === 0 ? (
              <span className="text-[11px] text-[#9A9890]">—</span>
            ) : (
              (r._cfg.channels ?? []).map((ch) => (
                <span
                  key={ch}
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] bg-[#E8F5F0] text-[#0F6E56]"
                >
                  {CHANNEL_LABEL[ch] ?? ch}
                </span>
              ))
            )}
          </div>
        ),
        exportValue: (r) => (r._cfg.channels ?? []).join(","),
      },
      {
        id: "sort_order",
        header: "排序",
        width: 60,
        align: "right",
        cell: (r) => <span className="font-mono text-[12px]">{r.sort_order ?? "—"}</span>,
        exportValue: (r) => String(r.sort_order ?? ""),
        sortValue: (r) => r.sort_order ?? 0,
      },
      {
        id: "is_active",
        header: "啟用",
        width: 70,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
              r.is_active
                ? "bg-[#EAF3DE] text-[#3B6D11]"
                : "bg-[#F2F2F2] text-[#6B6A68]"
            }`}
          >
            {r.is_active ? "啟用" : "停用"}
          </span>
        ),
        exportValue: (r) => (r.is_active ? "啟用" : "停用"),
        sortValue: (r) => (r.is_active ? 1 : 0),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">告警階層設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          10.5
        </span>
        <span className="text-[12px] text-[#9A9890]">告警未處理時自動升級的階層 / 通知對象</span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>名稱搜尋</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="階層名稱..."
              className={`${inputClass} w-[200px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>層級</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className={`${inputClass} w-[100px]`}
            >
              <option value="">全部</option>
              <option value="1">L1</option>
              <option value="2">L2</option>
              <option value="3">L3</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>啟用狀態</label>
            <select
              value={isActive}
              onChange={(e) => setIsActive(e.target.value)}
              className={`${inputClass} w-[100px]`}
            >
              <option value="">全部</option>
              <option value="true">啟用</option>
              <option value="false">停用</option>
            </select>
          </div>

          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={applyFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
            <Link
              href="/parts/alerts/escalation/new"
              aria-disabled={!canEdit}
              tabIndex={!canEdit ? -1 : 0}
              title={canEdit ? "" : "沒有編輯權限"}
              className={`h-[30px] px-3 rounded text-[12.5px] font-medium inline-flex items-center bg-[#0F6E56] text-white hover:bg-[#0a5742] ${
                !canEdit ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              ＋ 新增階層
            </Link>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆告警階層
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/alerts/escalation"
        exportFileName="alert-escalation"
        emptyMessage="沒有符合條件的告警階層"
        disabled={isPending}
        rowActionsWidth={220}
        rowActions={(r) => (
          <div className="flex gap-1.5">
            <Link
              href={`/parts/alerts/escalation/${r.id}`}
              className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              編輯
            </Link>
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
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
            >
              刪除
            </button>
          </div>
        )}
      />

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
