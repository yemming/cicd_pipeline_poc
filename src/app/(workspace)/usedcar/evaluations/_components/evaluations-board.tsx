"use client";

import Link from "next/link";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type {
  EvaluationStatus,
  UsedCarEvaluationWithCustomer,
} from "@/domain/used-car-evaluations";

type Props = {
  rows: UsedCarEvaluationWithCustomer[];
  statusLabels: Record<EvaluationStatus, string>;
};

/** 判斷 approved 的評估單是否已超過 30 天有效期。 */
function isExpiredRow(r: UsedCarEvaluationWithCustomer): boolean {
  if (r.status !== "approved") return false;
  if (!r.expires_at) return false;
  return new Date(r.expires_at) < new Date();
}

const STATUS_BADGE: Record<EvaluationStatus, string> = {
  draft: "bg-[#F2F2F2] text-[#6B6A68]",
  submitted: "bg-[#FDF3E3] text-[#854F0B]",
  approved: "bg-[#EAF3DE] text-[#3B6D11]",
  rejected: "bg-[#FDECEA] text-[#CC0000]",
};

const GRADE_BADGE: Record<string, string> = {
  S: "bg-[#1A3A5C] text-white",
  A: "bg-[#EAF3DE] text-[#3B6D11]",
  B: "bg-[#EAF4FB] text-[#185FA5]",
  C: "bg-[#FDF3E3] text-[#854F0B]",
  D: "bg-[#FDECEA] text-[#CC0000]",
};

function fmtNT(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `NT$ ${v.toLocaleString()}`;
}

export function EvaluationsBoard({ rows, statusLabels }: Props) {
  const columns: DataGridColumn<UsedCarEvaluationWithCustomer>[] = [
    {
      id: "eval_no",
      header: "評估單號",
      width: 130,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/usedcar/evaluations/${r.id}`}
          className="font-mono font-semibold text-[#1A3A5C] hover:underline"
        >
          {r.eval_no ?? r.id.slice(0, 8)}
        </Link>
      ),
      exportValue: (r) => r.eval_no ?? r.id,
    },
    {
      id: "vehicle",
      header: "車輛",
      width: 200,
      cell: (r) => (
        <div className="min-w-0">
          <div className="text-[12.5px] text-[#2C2C2A] truncate">
            {r.brand_name ?? "—"} {r.model ?? ""}
          </div>
          <div className="text-[11px] text-[#9A9890]">
            {r.license_plate ?? "—"} ・ {r.year ?? "—"}年
          </div>
        </div>
      ),
      exportValue: (r) => `${r.brand_name ?? ""} ${r.model ?? ""} ${r.license_plate ?? ""}`,
    },
    {
      id: "customer",
      header: "車主",
      width: 130,
      cell: (r) => r.customer?.name ?? "—",
      exportValue: (r) => r.customer?.name ?? "",
    },
    {
      id: "grade",
      header: "車況",
      width: 80,
      cell: (r) =>
        r.condition_grade ? (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${GRADE_BADGE[r.condition_grade] ?? ""}`}
          >
            {r.condition_grade}
          </span>
        ) : (
          "—"
        ),
      exportValue: (r) => r.condition_grade ?? "",
    },
    {
      id: "mileage",
      header: "里程",
      width: 100,
      align: "right",
      cell: (r) => (r.mileage ? `${r.mileage.toLocaleString()} km` : "—"),
      exportValue: (r) => r.mileage?.toString() ?? "",
      sortValue: (r) => r.mileage ?? 0,
    },
    {
      id: "estimated_value",
      header: "估價",
      width: 110,
      align: "right",
      cell: (r) => fmtNT(r.estimated_value),
      exportValue: (r) => r.estimated_value?.toString() ?? "",
      sortValue: (r) => r.estimated_value ?? 0,
    },
    {
      id: "status",
      header: "狀態",
      width: 120,
      cell: (r) => {
        const expired = isExpiredRow(r);
        return (
          <div className="flex items-center gap-1 flex-wrap">
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${STATUS_BADGE[r.status]}`}
            >
              {statusLabels[r.status]}
            </span>
            {expired && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#FDECEA] text-[#CC0000]">
                已逾期
              </span>
            )}
          </div>
        );
      },
      exportValue: (r) => `${statusLabels[r.status]}${isExpiredRow(r) ? " (已逾期)" : ""}`,
    },
    {
      id: "expires_at",
      header: "有效期限",
      width: 110,
      defaultHidden: false,
      cell: (r) => {
        if (r.status !== "approved" || !r.expires_at) return "—";
        const expired = isExpiredRow(r);
        return (
          <span className={expired ? "text-[#CC0000] font-semibold" : "text-[#5A5955]"}>
            {r.expires_at.slice(0, 10)}
          </span>
        );
      },
      exportValue: (r) => r.expires_at?.slice(0, 10) ?? "",
    },
    {
      id: "created_at",
      header: "建立日期",
      width: 110,
      cell: (r) => r.created_at?.slice(0, 10) ?? "—",
      exportValue: (r) => r.created_at?.slice(0, 10) ?? "",
    },
  ];

  return (
    <DataGrid
      columns={columns}
      data={rows}
      rowKey={(r) => r.id}
      persistKey="usedcar/evaluations"
      exportFileName="used-car-evaluations"
      emptyMessage="尚無評估紀錄。點上方「＋ 新增評估」開始評估。"
    />
  );
}
