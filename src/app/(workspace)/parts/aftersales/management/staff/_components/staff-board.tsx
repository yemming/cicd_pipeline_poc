"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deleteAftersalesStaffAction,
  setAftersalesStaffActiveAction,
  toggleFinalInspectionAuthAction,
} from "@/lib/aftersales/staff-actions";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type {
  AftersalesStaffRow,
  AftersalesDepartmentOption,
} from "@/domain/aftersales-staff";
import {
  AFTERSALES_GRADES,
  getGradeChipStyle,
  isFinalInspectionAuthLocked,
} from "@/domain/aftersales-staff.constants";

export type StaffFilters = {
  q: string;
  grade: string;
  dept: string;
  status: string;
  auth: string;
};

export type StaffBoardPageHeader = {
  title: string;
  caption: string;
  sprintChip: string;
};

type Banner = { ok: boolean; msg: string } | null;

export function StaffBoard({
  rows,
  totalCount,
  page,
  pageSize,
  departments,
  filters,
  canEdit,
  basePath = "/parts/aftersales/management/staff",
  pageHeader = {
    title: "員工名冊",
    caption:
      "僅限售後服務部門。職級設定影響竣工複檢授權、折扣權限與系統功能存取。",
    sprintChip: "售後管理",
  },
}: {
  rows: AftersalesStaffRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  departments: AftersalesDepartmentOption[];
  filters: StaffFilters;
  canEdit: boolean;
  basePath?: string;
  pageHeader?: StaffBoardPageHeader;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [fGrade, setFGrade] = useState(filters.grade);
  const [fDept, setFDept] = useState(filters.dept);
  const [fStatus, setFStatus] = useState(filters.status);
  const [fAuth, setFAuth] = useState(filters.auth);
  const [fQ, setFQ] = useState(filters.q);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitFilters = (overrides?: Partial<{ page: number }>) => {
    const params = new URLSearchParams();
    if (fGrade !== "all") params.set("grade", fGrade);
    if (fDept !== "all") params.set("dept", fDept);
    if (fStatus !== "all") params.set("status", fStatus);
    if (fAuth !== "all") params.set("auth", fAuth);
    if (fQ.trim()) params.set("q", fQ.trim());
    if (overrides?.page && overrides.page > 1)
      params.set("page", String(overrides.page));
    startTransition(() => {
      router.push(
        `${basePath}${params.toString() ? "?" + params : ""}`,
      );
    });
  };

  const resetFilters = () => {
    setFGrade("all");
    setFDept("all");
    setFStatus("all");
    setFAuth("all");
    setFQ("");
    startTransition(() => {
      router.push(basePath);
    });
  };

  const goToPage = (next: number) => submitFilters({ page: next });

  const toggleActive = (row: AftersalesStaffRow) => {
    if (!canEdit) return;
    startTransition(async () => {
      const res = await setAftersalesStaffActiveAction(row.id, !row.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: row.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const toggleAuth = (row: AftersalesStaffRow) => {
    if (!canEdit) return;
    if (isFinalInspectionAuthLocked(row.grade) && row.final_inspection_auth) {
      showBanner({
        ok: false,
        msg: "售後主管預設擁有竣工複檢授權，無法取消。",
      });
      return;
    }
    startTransition(async () => {
      const res = await toggleFinalInspectionAuthAction(
        row.id,
        !row.final_inspection_auth,
      );
      if (res.ok) {
        showBanner({
          ok: true,
          msg: row.final_inspection_auth ? "✓ 已收回複檢授權" : "✓ 已授權複檢",
        });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = (row: AftersalesStaffRow) => {
    if (!canEdit) return;
    if (
      !confirm(
        `確定刪除「${row.name}（${row.emp_code}）」？\n（被工單 / 派工 / 簽核紀錄引用的員工無法刪除）`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteAftersalesStaffAction(row.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const columns: DataGridColumn<AftersalesStaffRow>[] = [
    {
      id: "emp_code",
      header: "員工編號",
      width: 110,
      hideable: false,
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#5A5955]">{r.emp_code}</span>
      ),
      exportValue: (r) => r.emp_code,
      sortValue: (r) => r.emp_code,
    },
    {
      id: "name",
      header: "姓名",
      width: 100,
      cell: (r) => (
        <strong className="text-[#2C2C2A]">{r.name}</strong>
      ),
      exportValue: (r) => r.name,
      sortValue: (r) => r.name,
    },
    {
      id: "grade",
      header: "職級",
      width: 96,
      cell: (r) => {
        if (!r.grade)
          return <span className="text-[#9A9890]">—</span>;
        const s = getGradeChipStyle(r.grade);
        return (
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
            style={{ background: s.bg, color: s.fg }}
          >
            {r.grade}
          </span>
        );
      },
      exportValue: (r) => r.grade ?? "",
      sortValue: (r) => r.grade ?? "",
    },
    {
      id: "work_type",
      header: "工種",
      width: 80,
      cell: (r) =>
        r.work_type ? (
          <span className="text-[11.5px] text-[#5A5955]">{r.work_type}</span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.work_type ?? "",
      sortValue: (r) => r.work_type ?? "",
    },
    {
      id: "dept",
      header: "部門",
      width: 110,
      cell: (r) =>
        r.dept_name ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#EEF4FB] text-[#185FA5] text-[11px] whitespace-nowrap">
            {r.dept_name}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.dept_name ?? "",
      sortValue: (r) => r.dept_name ?? "",
    },
    {
      id: "auth",
      header: "竣工複檢授權",
      width: 130,
      cell: (r) =>
        r.final_inspection_auth ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11] text-[11px] whitespace-nowrap">
            ✓ 已授權
          </span>
        ) : (
          <span className="text-[#9A9890] text-[11.5px]">—</span>
        ),
      exportValue: (r) => (r.final_inspection_auth ? "已授權" : ""),
      sortValue: (r) => (r.final_inspection_auth ? 1 : 0),
    },
    {
      id: "system_account",
      header: "系統帳號",
      width: 130,
      cell: (r) =>
        r.system_account ? (
          <span className="font-mono text-[11px] text-[#5A5955]">
            {r.system_account}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.system_account ?? "",
      sortValue: (r) => r.system_account ?? "",
    },
    {
      id: "status",
      header: "在職",
      width: 70,
      cell: (r) =>
        r.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11] text-[11px] whitespace-nowrap">
            在職
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#F2F2F2] text-[#6B6A68] text-[11px] whitespace-nowrap">
            離職
          </span>
        ),
      exportValue: (r) => (r.is_active ? "在職" : "離職"),
      sortValue: (r) => (r.is_active ? 1 : 0),
    },
    {
      id: "position",
      header: "舊職稱",
      width: 100,
      defaultHidden: true,
      cell: (r) => r.position ?? "—",
      exportValue: (r) => r.position ?? "",
      sortValue: (r) => r.position ?? "",
    },
    {
      id: "email",
      header: "Email",
      width: 180,
      defaultHidden: true,
      cell: (r) => r.email ?? "—",
      exportValue: (r) => r.email ?? "",
      sortValue: (r) => r.email ?? "",
    },
    {
      id: "phone",
      header: "電話",
      width: 120,
      defaultHidden: true,
      cell: (r) => r.phone ?? "—",
      exportValue: (r) => r.phone ?? "",
      sortValue: (r) => r.phone ?? "",
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          {pageHeader.title}
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {pageHeader.sprintChip}
        </span>
        <span className="text-[12px] text-[#9A9890]">{pageHeader.caption}</span>
      </header>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">職級</label>
            <select
              value={fGrade}
              onChange={(e) => setFGrade(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none min-w-[120px]"
            >
              <option value="all">全部職級</option>
              {AFTERSALES_GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">部門</label>
            <select
              value={fDept}
              onChange={(e) => setFDept(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none min-w-[140px]"
            >
              <option value="all">全部售後部門</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
              <option value="all-depts">（含其他部門）</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">複檢授權</label>
            <select
              value={fAuth}
              onChange={(e) => setFAuth(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none min-w-[100px]"
            >
              <option value="all">全部</option>
              <option value="yes">已授權</option>
              <option value="no">未授權</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">在職</label>
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none min-w-[90px]"
            >
              <option value="all">全部</option>
              <option value="active">在職</option>
              <option value="inactive">離職</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-[11px] text-[#9A9890] font-medium">搜尋</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              placeholder="員工編號 / 姓名 / 職稱⋯"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitFilters();
              }}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => submitFilters()}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              type="button"
              onClick={() =>
                router.push("/parts/aftersales/management/staff/new")
              }
              disabled={!canEdit || isPending}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增員工
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 位員工
          {rows.length > 0 ? (
            <>
              （顯示 <b>{rows.length}</b> 筆）
            </>
          ) : null}
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/aftersales/management/staff"
        exportFileName="aftersales-staff"
        emptyMessage={
          isPending ? "載入中⋯" : "沒有符合條件的售後員工，試試「＋ 新增員工」"
        }
        disabled={isPending}
        rowActionsWidth={240}
        rowActions={(r) => (
          <>
            <button
              type="button"
              onClick={() =>
                router.push(`/parts/aftersales/management/staff/${r.id}`)
              }
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              編輯
            </button>
            <button
              type="button"
              onClick={() => toggleAuth(r)}
              disabled={!canEdit || isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {r.final_inspection_auth ? "收回授權" : "授權複檢"}
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
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
            >
              刪除
            </button>
          </>
        )}
        pagination={{ page, pageSize, totalCount, onPageChange: goToPage }}
      />

      {/* 職級權限對照表（spec §B 表，readonly reference） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 職級權限對照表
          </span>
          <span className="text-[11px] text-[#9A9890]">
            僅供參考。實際權限走 RBAC role；本表展示售後業務語意。
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-[#F8F7F4] text-[11px] text-[#9A9890]">
                <th className="px-3 py-2 text-left border-b border-[#EEECE6]">
                  功能模組
                </th>
                <th className="px-3 py-2 text-center border-b border-[#EEECE6]">
                  售後主管
                </th>
                <th className="px-3 py-2 text-center border-b border-[#EEECE6]">
                  售後接待 SA
                </th>
                <th className="px-3 py-2 text-center border-b border-[#EEECE6]">
                  車間技師
                </th>
                <th className="px-3 py-2 text-center border-b border-[#EEECE6]">
                  零件主管
                </th>
                <th className="px-3 py-2 text-center border-b border-[#EEECE6]">
                  零件專員
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ["預檢單（全部 Tab）", "✅", "✅", "Tab3 技師", "—", "—"],
                ["正式工單（RO）", "✅", "✅", "只讀", "—", "—"],
                ["竣工複檢簽核", "✅ 預設", "—", "需授權", "—", "—"],
                [
                  "增項閉環看板",
                  "整店視角",
                  "個人視角",
                  "個人視角",
                  "庫房視角",
                  "庫房視角",
                ],
                ["折扣授權上限", "主管層", "SA 層", "—", "—", "—"],
                ["管理模組（本頁）", "✅ 全部", "—", "—", "部分", "—"],
                ["即時看板", "✅", "✅", "✅", "✅", "✅"],
              ].map((row) => (
                <tr key={row[0]}>
                  <td className="px-3 py-2 border-b border-[#EEECE6]">{row[0]}</td>
                  {row.slice(1).map((cell, i) => (
                    <td
                      key={i}
                      className="px-3 py-2 text-center border-b border-[#EEECE6] text-[12.5px] text-[#5A5955]"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
