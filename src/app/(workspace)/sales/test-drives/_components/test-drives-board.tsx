"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  createTestDriveAction,
  deleteTestDriveAction,
  updateTestDriveAction,
} from "@/lib/sales/test-drive-actions";
import {
  TEST_DRIVE_STATUS_LABELS,
  TEST_DRIVE_STATUS_CHIP,
  type TestDriveRow,
  type TestDriveStatus,
  type TestDriveLookups,
} from "@/domain/sales-test-drives.constants";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Banner = { ok: boolean; msg: string } | null;
type FormMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; id: string };

export type TestDrivesBoardProps = {
  rows: TestDriveRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  filterStatus: string;
  filterQ: string;
  canEdit: boolean;
  lookups: TestDriveLookups;
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  // 顯示成 YYYY-MM-DD HH:mm（Asia/Taipei）
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const taipei = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return taipei.toISOString().slice(0, 16).replace("T", " ");
}

function toLocalInputValue(s: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  // Taipei 視角的 YYYY-MM-DDTHH:mm
  const taipei = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return taipei.toISOString().slice(0, 16);
}

function fromLocalInputToIso(v: string): string {
  // v 是 'YYYY-MM-DDTHH:mm'，當作 Asia/Taipei 時間
  if (!v) return "";
  return new Date(`${v}:00+08:00`).toISOString();
}

function StatusChip({ status }: { status: string }) {
  const chip =
    TEST_DRIVE_STATUS_CHIP[status as TestDriveStatus] ?? {
      bg: "bg-[#F2F2F2]",
      text: "text-[#6B6A68]",
    };
  const label =
    TEST_DRIVE_STATUS_LABELS[status as TestDriveStatus] ?? status;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${chip.bg} ${chip.text}`}
    >
      {label}
    </span>
  );
}

const inputCls =
  "h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none bg-white";

// ─────────────────────────────────────────────────────────────
// Board
// ─────────────────────────────────────────────────────────────

export default function TestDrivesBoard({
  rows,
  totalCount,
  page,
  pageSize,
  filterStatus,
  filterQ,
  canEdit,
  lookups,
}: TestDrivesBoardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [formMode, setFormMode] = useState<FormMode>({ kind: "closed" });

  const [localStatus, setLocalStatus] = useState(filterStatus);
  const [localQ, setLocalQ] = useState(filterQ);

  // Form state
  const [formCustomerId, setFormCustomerId] = useState<string>("");
  const [formModelId, setFormModelId] = useState<string>("");
  const [formConsultantId, setFormConsultantId] = useState<string>("");
  const [formLeadId, setFormLeadId] = useState<string>("");
  const [formScheduledAt, setFormScheduledAt] = useState<string>("");
  const [formStatus, setFormStatus] =
    useState<TestDriveStatus>("scheduled");
  const [formNotes, setFormNotes] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  function buildUrl(
    overrides: Partial<{ status: string; q: string; page: number }>,
  ) {
    const params = new URLSearchParams();
    const s = overrides.status ?? localStatus;
    const q = overrides.q ?? localQ;
    const p = overrides.page ?? 1;
    if (s) params.set("status", s);
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    return `/sales/test-drives?${params.toString()}`;
  }

  function handleQuery() {
    router.push(buildUrl({ page: 1 }));
  }

  function handleReset() {
    setLocalStatus("");
    setLocalQ("");
    router.push("/sales/test-drives");
  }

  function goToPage(p: number) {
    router.push(buildUrl({ page: p }));
  }

  function resetForm() {
    setFormCustomerId("");
    setFormModelId("");
    setFormConsultantId("");
    setFormLeadId("");
    setFormScheduledAt("");
    setFormStatus("scheduled");
    setFormNotes("");
    setFormError(null);
  }

  function openCreate() {
    resetForm();
    // 預設預約時間 = 現在 + 1 小時（Taipei）
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    setFormScheduledAt(toLocalInputValue(now.toISOString()));
    setFormMode({ kind: "create" });
  }

  function openEdit(row: TestDriveRow) {
    resetForm();
    setFormCustomerId(row.customer_id ?? "");
    setFormModelId(row.vehicle_model_id ?? "");
    setFormConsultantId(row.sales_consultant_id ?? "");
    setFormLeadId(row.lead_id ?? "");
    setFormScheduledAt(toLocalInputValue(row.scheduled_at));
    setFormStatus(row.status);
    setFormNotes(row.notes ?? "");
    setFormMode({ kind: "edit", id: row.id });
  }

  function closeForm() {
    setFormMode({ kind: "closed" });
    resetForm();
  }

  function handleSubmit() {
    if (!formScheduledAt) {
      setFormError("預約時間必填");
      return;
    }
    setFormError(null);

    const payload = {
      customer_id: formCustomerId || null,
      vehicle_model_id: formModelId || null,
      sales_consultant_id: formConsultantId || null,
      lead_id: formLeadId || null,
      scheduled_at: fromLocalInputToIso(formScheduledAt),
      status: formStatus,
      notes: formNotes.trim() || null,
    };

    startTransition(async () => {
      if (formMode.kind === "create") {
        const res = await createTestDriveAction(payload);
        if (res.ok) {
          showBanner(true, "✓ 已建立試駕記錄");
          closeForm();
          router.refresh();
        } else {
          setFormError(res.error);
        }
      } else if (formMode.kind === "edit") {
        const res = await updateTestDriveAction(formMode.id, payload);
        if (res.ok) {
          showBanner(true, "✓ 已更新試駕記錄");
          closeForm();
          router.refresh();
        } else {
          setFormError(res.error);
        }
      }
    });
  }

  function handleDelete(row: TestDriveRow) {
    if (!confirm(`確定要刪除這筆試駕記錄？`)) return;
    startTransition(async () => {
      const res = await deleteTestDriveAction(row.id);
      if (res.ok) {
        showBanner(true, "✓ 已刪除");
        router.refresh();
      } else {
        showBanner(false, `✗ 刪除失敗：${res.error}`);
      }
    });
  }

  function handleSetStatus(row: TestDriveRow, status: TestDriveStatus) {
    startTransition(async () => {
      const patch: { status: TestDriveStatus; completed_at?: string | null } = {
        status,
      };
      if (status === "completed") patch.completed_at = new Date().toISOString();
      else if (
        status === "cancelled" ||
        status === "no_show" ||
        status === "scheduled"
      )
        patch.completed_at = null;
      const res = await updateTestDriveAction(row.id, patch);
      if (res.ok) {
        showBanner(true, "✓ 已更新狀態");
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  // ── Columns ──────────────────────────────────────────────────

  const columns: DataGridColumn<TestDriveRow>[] = [
    {
      id: "scheduled_at",
      header: "預約日期",
      width: 150,
      hideable: false,
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#2C2C2A]">
          {fmtDateTime(r.scheduled_at)}
        </span>
      ),
      exportValue: (r) => fmtDateTime(r.scheduled_at),
      sortValue: (r) => r.scheduled_at,
    },
    {
      id: "customer_name",
      header: "客戶",
      width: 140,
      cell: (r) => (
        <span className="text-[12px] text-[#2C2C2A]">
          {r.customer_name ?? "—"}
        </span>
      ),
      exportValue: (r) => r.customer_name ?? "",
      sortValue: (r) => r.customer_name ?? "",
    },
    {
      id: "vehicle_model_name",
      header: "車型",
      width: 160,
      cell: (r) => (
        <span className="text-[12px] text-[#2C2C2A]">
          {r.vehicle_model_name ?? "—"}
        </span>
      ),
      exportValue: (r) => r.vehicle_model_name ?? "",
      sortValue: (r) => r.vehicle_model_name ?? "",
    },
    {
      id: "consultant_name",
      header: "業代",
      width: 120,
      cell: (r) => (
        <span className="text-[12px] text-[#5A5955]">
          {r.consultant_name ?? "—"}
        </span>
      ),
      exportValue: (r) => r.consultant_name ?? "",
      sortValue: (r) => r.consultant_name ?? "",
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (r) => <StatusChip status={r.status} />,
      exportValue: (r) =>
        TEST_DRIVE_STATUS_LABELS[r.status as TestDriveStatus] ?? r.status,
      sortValue: (r) => r.status,
    },
    {
      id: "completed_at",
      header: "完成時間",
      width: 150,
      defaultHidden: true,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">
          {fmtDateTime(r.completed_at)}
        </span>
      ),
      exportValue: (r) => fmtDateTime(r.completed_at),
      sortValue: (r) => r.completed_at ?? "",
    },
    {
      id: "notes",
      header: "備註",
      width: 240,
      sortable: false,
      cell: (r) => (
        <span className="text-[12px] text-[#5A5955] line-clamp-1">
          {r.notes ?? "—"}
        </span>
      ),
      exportValue: (r) => r.notes ?? "",
    },
    {
      id: "created_at",
      header: "建立日期",
      width: 100,
      defaultHidden: true,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#9A9890]">
          {(r.created_at ?? "").slice(0, 10)}
        </span>
      ),
      exportValue: (r) => (r.created_at ?? "").slice(0, 10),
      sortValue: (r) => r.created_at,
    },
  ];

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">試駕記錄</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          銷售 · GAP-03
        </span>
        <span className="text-[12px] text-[#9A9890]">
          試駕排程查詢與管理（wizard 在 /sales/testdrive）
        </span>
      </header>

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

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              狀態
            </label>
            <select
              className={inputCls}
              value={localStatus}
              onChange={(e) => setLocalStatus(e.target.value)}
            >
              <option value="">全部</option>
              <option value="scheduled">已排程</option>
              <option value="in_progress">進行中</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
              <option value="no_show">未到</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              搜尋備註
            </label>
            <input
              type="text"
              className={`${inputCls} w-[200px]`}
              placeholder="關鍵字"
              value={localQ}
              onChange={(e) => setLocalQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleQuery()}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleQuery}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              onClick={handleReset}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
            {canEdit && (
              <button
                onClick={openCreate}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                ＋ 新增試駕
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆試駕記錄
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="sales/test-drives"
        exportFileName="sales-test-drives"
        emptyMessage="沒有符合條件的試駕記錄"
        disabled={isPending}
        rowActionsWidth={canEdit ? 260 : 80}
        pagination={{
          page,
          pageSize,
          totalCount,
          onPageChange: goToPage,
        }}
        rowActions={(r) => (
          <>
            {canEdit && (
              <button
                onClick={() => openEdit(r)}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                編輯
              </button>
            )}
            {canEdit &&
              (r.status === "scheduled" || r.status === "in_progress") && (
                <button
                  onClick={() => handleSetStatus(r, "completed")}
                  disabled={isPending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#EAF3DE] border border-[#C5DC9F] text-[#3B6D11] hover:bg-[#d9f0c8] disabled:opacity-50"
                >
                  完成
                </button>
              )}
            {canEdit && r.status === "scheduled" && (
              <button
                onClick={() => handleSetStatus(r, "cancelled")}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => handleDelete(r)}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
              >
                刪除
              </button>
            )}
          </>
        )}
      />

      {/* Form Modal */}
      {formMode.kind !== "closed" && (
        <div
          className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-[520px] max-h-[90vh] overflow-y-auto">
            <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center">
              <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
                {formMode.kind === "create" ? "新增試駕記錄" : "編輯試駕記錄"}
              </h2>
              <button
                onClick={closeForm}
                className="ml-auto text-[#9A9890] hover:text-[#2C2C2A]"
                aria-label="close"
              >
                ✕
              </button>
            </header>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">
                    預約時間 *
                  </label>
                  <input
                    type="datetime-local"
                    className={inputCls}
                    value={formScheduledAt}
                    onChange={(e) => setFormScheduledAt(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">
                    狀態
                  </label>
                  <select
                    className={inputCls}
                    value={formStatus}
                    onChange={(e) =>
                      setFormStatus(e.target.value as TestDriveStatus)
                    }
                  >
                    <option value="scheduled">已排程</option>
                    <option value="in_progress">進行中</option>
                    <option value="completed">已完成</option>
                    <option value="cancelled">已取消</option>
                    <option value="no_show">未到</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">
                    客戶
                  </label>
                  <select
                    className={inputCls}
                    value={formCustomerId}
                    onChange={(e) => setFormCustomerId(e.target.value)}
                  >
                    <option value="">（未指定）</option>
                    {lookups.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">
                    車型
                  </label>
                  <select
                    className={inputCls}
                    value={formModelId}
                    onChange={(e) => setFormModelId(e.target.value)}
                  >
                    <option value="">（未指定）</option>
                    {lookups.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">
                    業代
                  </label>
                  <select
                    className={inputCls}
                    value={formConsultantId}
                    onChange={(e) => setFormConsultantId(e.target.value)}
                  >
                    <option value="">（未指定）</option>
                    {lookups.consultants.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">
                    相關線索 ID
                  </label>
                  <select
                    className={inputCls}
                    value={formLeadId}
                    onChange={(e) => setFormLeadId(e.target.value)}
                  >
                    <option value="">（未指定）</option>
                    {lookups.leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.id.slice(0, 8)}…
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">
                  備註
                </label>
                <textarea
                  className="px-2 py-1 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none bg-white min-h-[60px]"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="路線 / 駕照 / 安全清單摘要 / 滿意度等"
                />
              </div>
              {formError && (
                <div className="text-[12px] text-[#CC0000] bg-[#FDECEA] border border-[#F5AEAD] rounded px-2 py-1">
                  {formError}
                </div>
              )}
            </div>
            <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                onClick={closeForm}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending
                  ? formMode.kind === "create"
                    ? "建立中⋯"
                    : "儲存中⋯"
                  : formMode.kind === "create"
                    ? "建立"
                    : "儲存變更"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
