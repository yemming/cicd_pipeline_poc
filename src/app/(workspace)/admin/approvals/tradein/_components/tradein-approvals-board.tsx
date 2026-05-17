"use client";

/**
 * /admin/approvals/tradein — 收車（中古車評估鑑價）簽核中心 List View
 *
 * Design Pattern：List View 規格（CLAUDE.md §Design Pattern）
 * 操作：[查看] → /usedcar/evaluation?id=<id>  / [核准] / [駁回]
 * 樂觀更新 + pending 鎖（CLAUDE.md §UX 互動規範）
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  approveEvaluationAction,
  rejectEvaluationAction,
} from "@/lib/used-car/evaluation-actions";
import type {
  ConditionGrade,
  UsedCarEvaluationWithCustomer,
} from "@/domain/used-car-evaluations";
import { useSetPageHeader } from "@/components/page-header-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Banner = { ok: boolean; msg: string } | null;

function fmtNT(n: number | null): string {
  if (n == null) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function gradeChipClass(g: ConditionGrade | null): string {
  switch (g) {
    case "S":
      return "bg-[#E8F5F0] text-[#0F6E56]";
    case "A":
      return "bg-[#EAF4FB] text-[#185FA5]";
    case "B":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "C":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "D":
      return "bg-[#FDECEA] text-[#CC0000]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

export function TradeinApprovalsBoard({
  rows,
  canApprove,
}: {
  rows: UsedCarEvaluationWithCustomer[];
  canApprove: boolean;
}) {
  useSetPageHeader({
    title: "收車簽核",
    breadcrumb: [{ label: "簽核管理", href: "/admin/approvals" }, { label: "收車簽核" }],
    hideSearch: true,
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; evalNo: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approveModal, setApproveModal] = useState<UsedCarEvaluationWithCustomer | null>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const handleApprove = (row: UsedCarEvaluationWithCustomer) => {
    if (!canApprove) {
      showBanner({ ok: false, msg: "只有管理員可以簽核" });
      return;
    }
    setApproveModal(row);
  };
  const doApprove = () => {
    if (!approveModal) return;
    const row = approveModal;
    setApproveModal(null);
    setPendingId(row.id);
    startTransition(async () => {
      const res = await approveEvaluationAction(row.id);
      setPendingId(null);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已核准 ${row.eval_no ?? ""}` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const handleRejectSubmit = () => {
    if (!rejectModal) return;
    if (!canApprove) {
      showBanner({ ok: false, msg: "只有管理員可以簽核" });
      return;
    }
    const reason = rejectReason.trim();
    if (!reason) {
      showBanner({ ok: false, msg: "請填寫駁回原因" });
      return;
    }
    const id = rejectModal.id;
    const evalNo = rejectModal.evalNo;
    setPendingId(id);
    startTransition(async () => {
      const res = await rejectEvaluationAction(id, reason);
      setPendingId(null);
      if (res.ok) {
        setRejectModal(null);
        setRejectReason("");
        showBanner({ ok: true, msg: `✓ 已駁回 ${evalNo}` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const columns = useMemo<DataGridColumn<UsedCarEvaluationWithCustomer>[]>(
    () => [
      {
        id: "eval_no",
        header: "評估單號",
        width: 150,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/usedcar/evaluation?id=${r.id}`}
            className="font-mono font-semibold text-[#1A3A5C] hover:underline"
          >
            {r.eval_no ?? r.id.slice(0, 8)}
          </Link>
        ),
        exportValue: (r) => r.eval_no ?? "",
        sortValue: (r) => r.eval_no ?? "",
      },
      {
        id: "vehicle",
        header: "車輛",
        width: 220,
        cell: (r) => (
          <div className="flex flex-col">
            <span className="text-[12.5px] text-[#2C2C2A]">
              {[r.brand_name, r.model].filter(Boolean).join(" ") || "—"}
              {r.year ? `（${r.year}）` : ""}
            </span>
            <span className="text-[11px] text-[#9A9890]">
              {[r.license_plate, r.vin].filter(Boolean).join(" / ") || "—"}
            </span>
          </div>
        ),
        exportValue: (r) =>
          [r.brand_name, r.model, r.year, r.license_plate, r.vin]
            .filter(Boolean)
            .join(" / "),
        sortValue: (r) => `${r.brand_name ?? ""} ${r.model ?? ""}`,
      },
      {
        id: "customer",
        header: "車主",
        width: 140,
        cell: (r) => (
          <div className="flex flex-col">
            <span className="text-[12.5px] text-[#2C2C2A]">
              {r.customer?.name ?? "—"}
            </span>
            {r.customer?.phone && (
              <span className="text-[11px] text-[#9A9890]">{r.customer.phone}</span>
            )}
          </div>
        ),
        exportValue: (r) =>
          [r.customer?.name, r.customer?.phone].filter(Boolean).join(" / "),
        sortValue: (r) => r.customer?.name ?? "",
      },
      {
        id: "condition_grade",
        header: "車況",
        width: 70,
        align: "right",
        cell: (r) =>
          r.condition_grade ? (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${gradeChipClass(r.condition_grade)}`}
            >
              {r.condition_grade}
            </span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        exportValue: (r) => r.condition_grade ?? "",
        sortValue: (r) => r.condition_grade ?? "",
      },
      {
        id: "mileage",
        header: "里程",
        width: 100,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12.5px]">
            {r.mileage != null ? `${Number(r.mileage).toLocaleString("en-US")} km` : "—"}
          </span>
        ),
        exportValue: (r) => (r.mileage != null ? String(r.mileage) : ""),
        sortValue: (r) => r.mileage ?? 0,
      },
      {
        id: "estimated_value",
        header: "估價",
        width: 120,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12.5px] text-[#2C2C2A]">
            {fmtNT(r.estimated_value)}
          </span>
        ),
        exportValue: (r) => String(r.estimated_value ?? ""),
        sortValue: (r) => r.estimated_value ?? 0,
      },
      {
        id: "appraiser",
        header: "鑑價人",
        width: 100,
        cell: (r) => r.appraiser ?? "—",
        exportValue: (r) => r.appraiser ?? "",
        sortValue: (r) => r.appraiser ?? "",
      },
      {
        id: "submitted_at",
        header: "送簽時間",
        width: 140,
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955]">{fmtDateTime(r.submitted_at)}</span>
        ),
        exportValue: (r) => fmtDateTime(r.submitted_at),
        sortValue: (r) => r.submitted_at ?? "",
      },
    ],
    [],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">收車簽核</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          S1-8
        </span>
        <span className="text-[12px] text-[#9A9890]">
          待簽核中古車評估鑑價單 —— 核准後可進入收車合約 / 入庫
        </span>
      </header>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆待簽核評估單
        </span>
        {!canApprove && (
          <span className="ml-3 px-2 py-0.5 rounded-md bg-[#FDF3E3] text-[#854F0B] text-[11px]">
            僅檢視模式（無管理員權限）
          </span>
        )}
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="admin/approvals/tradein"
        exportFileName="tradein-approvals"
        emptyMessage="目前沒有待簽核的中古車評估單"
        disabled={isPending}
        rowActionsWidth={240}
        rowActions={(r) => {
          const isRowPending = pendingId === r.id;
          return (
            <>
              <Link
                href={`/usedcar/evaluation?id=${r.id}`}
                className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                查看
              </Link>
              <button
                type="button"
                disabled={!canApprove || isRowPending || isPending}
                onClick={() => handleApprove(r)}
                className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isRowPending ? "簽核中⋯" : "核准"}
              </button>
              <button
                type="button"
                disabled={!canApprove || isRowPending || isPending}
                onClick={() => {
                  setRejectModal({ id: r.id, evalNo: r.eval_no ?? r.id.slice(0, 8) });
                  setRejectReason("");
                }}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
              >
                駁回
              </button>
            </>
          );
        }}
      />

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md border border-[#EEECE6]">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
                駁回評估單{" "}
                <span className="font-mono text-[#185FA5]">{rejectModal.evalNo}</span>
              </h2>
            </header>
            <div className="px-4 py-4 space-y-2">
              <label className="text-[11px] text-[#9A9890] font-medium">
                駁回原因（必填）
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                placeholder="例：估價過高、車況描述不完整、缺少 VIN⋯"
                className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none resize-none"
                disabled={isPending}
              />
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason("");
                }}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isPending || !rejectReason.trim()}
                onClick={handleRejectSubmit}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#a30000] disabled:opacity-50"
              >
                {isPending ? "駁回中⋯" : "確認駁回"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Approve confirm dialog */}
      {approveModal && (
        <ConfirmDialog
          title="確認核准評估單？"
          message={`確定核准評估單「${approveModal.eval_no ?? approveModal.id}」？核准後可進入收車合約 / 入庫。`}
          confirmLabel="確認核准"
          variant="primary"
          isPending={isPending}
          onConfirm={doApprove}
          onCancel={() => setApproveModal(null)}
        />
      )}

      {/* Banner */}
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
