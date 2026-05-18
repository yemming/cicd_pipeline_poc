"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createEmployeeAction,
  deleteEmployeeAction,
  updateEmployeeAction,
  type EmployeeInput,
} from "@/lib/master-data/employee-actions";
import type { EmployeeFieldKey } from "@/lib/master-data/employee-form-types";
import type { Department, Employee } from "@/lib/parts/types";
import { EntityImageUploader } from "@/components/image-upload/entity-image-uploader";

export type DepartmentRef = { id: string; code: string; name: string };

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "employment" | "audit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "employment", label: "聘僱資訊" },
  { key: "audit", label: "稽核資訊" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "在職" },
  { value: "on_leave", label: "留職停薪" },
  { value: "terminated", label: "離職" },
  { value: "retired", label: "退休" },
] as const;

const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]));

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  } catch {
    return "—";
  }
}

const blankInput = (): EmployeeInput => ({
  emp_code: "",
  name: "",
  email: null,
  phone: null,
  dept_id: null,
  position: null,
  hire_date: null,
  leave_date: null,
  pay_rate: null,
  employment_status: "active",
  notes: null,
  is_active: true,
});

const fromRow = (r: Employee): EmployeeInput => ({
  emp_code: r.emp_code,
  name: r.name,
  email: r.email,
  phone: r.phone,
  dept_id: r.dept_id,
  position: r.position,
  hire_date: r.hire_date,
  leave_date: r.leave_date,
  pay_rate: r.pay_rate,
  employment_status: r.employment_status as EmployeeInput["employment_status"],
  notes: r.notes,
  is_active: r.is_active,
});

export function EmployeeDetailView({
  employee,
  departments,
  canEdit,
  initialMode = "view",
}: {
  employee: Employee | null;
  departments: DepartmentRef[] | Department[];
  canEdit: boolean;
  initialMode?: "view" | "create";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(initialMode === "create");
  const [activeTab, setActiveTab] = useState<TabKey>("employment");
  const [draft, setDraft] = useState<EmployeeInput>(
    employee ? fromRow(employee) : blankInput(),
  );
  const [createDraft, setCreateDraft] = useState<EmployeeInput>(blankInput());
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<EmployeeFieldKey, string>>>({});

  const showInputs = editing || creating;
  const formDraft: EmployeeInput = creating ? createDraft : draft;
  const setFormDraft = (next: EmployeeInput) => {
    if (creating) setCreateDraft(next);
    else setDraft(next);
  };

  const deptMap = useMemo(
    () => new Map((departments as DepartmentRef[]).map((d) => [d.id, d])),
    [departments],
  );
  const dept = employee?.dept_id ? deptMap.get(employee.dept_id) ?? null : null;

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const save = () => {
    if (!employee) return;
    startTransition(async () => {
      setFieldErrors({});
      const res = await updateEmployeeAction(employee.id, draft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存變更" });
        setEditing(false);
        router.refresh();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const cancelEdit = () => {
    if (employee) setDraft(fromRow(employee));
    setFieldErrors({});
    setEditing(false);
  };

  const toggleActive = () => {
    if (!employee) return;
    startTransition(async () => {
      const res = await updateEmployeeAction(employee.id, {
        ...fromRow(employee),
        is_active: !employee.is_active,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: employee.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const openCreate = () => {
    setEditing(false);
    setCreateDraft(blankInput());
    setFieldErrors({});
    setCreating(true);
  };

  const cancelCreate = () => {
    setFieldErrors({});
    if (initialMode === "create") router.push("/admin/master-data/employees");
    else setCreating(false);
  };

  const submitCreate = () => {
    startTransition(async () => {
      setFieldErrors({});
      const res = await createEmployeeAction(createDraft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已建立員工，跳轉中…" });
        setCreating(false);
        router.push(`/admin/master-data/employees/${res.data.id}`);
        router.refresh();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const remove = () => {
    if (!employee) return;
    if (
      !confirm(
        `確定刪除員工「${employee.name}」？\n建議改用「離職」狀態保留歷史，僅在誤建時才硬刪。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteEmployeeAction(employee.id);
      if (res.ok) {
        router.push("/admin/master-data/employees");
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const sectionCard = (title: string, body: React.ReactNode) => (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
      </header>
      <div className="px-4 py-3">{body}</div>
    </section>
  );

  const inputClass =
    "h-[28px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const headlineLabel = creating
    ? "（未命名員工）"
    : employee
      ? employee.name
      : "（資料缺失）";
  const headlineCode = creating ? "—" : employee?.emp_code ?? "—";

  return (
    <main className="px-6 py-5 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/master-data/employees" className="hover:text-[#185FA5]">
            員工主檔
          </Link>
          <span>›</span>
          <span className={`text-[#5A5955] ${creating ? "" : "font-mono"}`}>
            {creating ? "新增員工" : headlineCode}
          </span>
          {editing ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              編輯模式
            </span>
          ) : creating ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              建立模式
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {editing ? (
            <>
              <button
                type="button"
                onClick={save}
                disabled={isPending || !canEdit}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "儲存中…" : "儲存變更"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890]"
              >
                取消
              </button>
            </>
          ) : creating ? (
            <>
              <button
                type="button"
                onClick={cancelCreate}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890] disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={isPending || !canEdit}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "建立中…" : "建立並開啟"}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/admin/master-data/employees"
                className="h-[30px] inline-flex items-center justify-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <button
                type="button"
                disabled={!canEdit}
                onClick={openCreate}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                新增
              </button>
              <button
                type="button"
                disabled={!canEdit || !employee}
                onClick={() => setEditing(true)}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                disabled={!canEdit || !employee}
                onClick={remove}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
              <button
                type="button"
                disabled={!canEdit || !employee}
                onClick={toggleActive}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                {employee?.is_active ? "停用" : "啟用"}
              </button>
            </>
          )}
        </div>
      </div>

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

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">員工主檔</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {headlineLabel}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {creating ? (
                  <>
                    <span className="text-[#9A9890]">—</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">
                      尚未建立
                    </span>
                  </>
                ) : employee ? (
                  <>
                    <span className="font-mono text-[#5A5955]">{employee.emp_code}</span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                        employee.is_active
                          ? "bg-[#EAF3DE] text-[#3B6D11]"
                          : "bg-[#F2F2F2] text-[#6B6A68]"
                      }`}
                    >
                      {employee.is_active ? "啟用" : "停用"}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                      {STATUS_LABEL[employee.employment_status] ?? employee.employment_status}
                    </span>
                    {dept ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                        {dept.name}
                      </span>
                    ) : null}
                    {employee.position ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#5A5955]">
                        {employee.position}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="shrink-0 flex items-start gap-3">
            {creating ? (
              <div className="w-[120px] h-[120px] rounded-full border-2 border-dashed border-[#D5D3CB] bg-[#F8F7F4] flex items-center justify-center text-[11px] text-[#9A9890] text-center px-2">
                建立後可上傳大頭照
              </div>
            ) : employee ? (
              <EntityImageUploader
                entity="employee"
                entityId={employee.id}
                imageUrl={(employee as unknown as { avatar_url: string | null }).avatar_url ?? null}
                alt={`${employee.name} 大頭照`}
                canEdit={canEdit}
                width={120}
                height={120}
                cropRatio={1}
                cropTitle="調整員工大頭照"
                promptText="點擊上傳大頭照"
                rounded="full"
              />
            ) : null}
            {!creating && employee ? (
              <div className="h-[120px] w-[130px] rounded-lg border border-[#EEECE6] bg-[#F8F7F4] flex flex-col items-center justify-center text-[12px]">
                <div className="text-[11px] text-[#9A9890]">到職日</div>
                <div className="text-[16px] font-semibold text-[#2C2C2A] font-mono">
                  {employee.hire_date ?? "—"}
                </div>
                {employee.leave_date ? (
                  <div className="text-[11px] text-[#9A9890] mt-1">
                    離職日 {employee.leave_date}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* 基本資料 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          showInputs ? lockedClass : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="員工代碼*"
            value={
              showInputs ? (
                <input
                  value={formDraft.emp_code}
                  onChange={(e) => setFormDraft({ ...formDraft, emp_code: e.target.value })}
                  placeholder="例如：E001"
                  className={inputClass}
                />
              ) : employee ? (
                <span className="font-mono">{employee.emp_code}</span>
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="姓名*"
            value={
              showInputs ? (
                <input
                  value={formDraft.name}
                  onChange={(e) => setFormDraft({ ...formDraft, name: e.target.value })}
                  placeholder="員工姓名"
                  className={inputClass}
                />
              ) : employee?.name ?? "—"
            }
          />
          <Kv
            label="部門"
            value={
              showInputs ? (
                <select
                  value={formDraft.dept_id ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, dept_id: e.target.value || null })
                  }
                  className={inputClass}
                >
                  <option value="">— 未指定 —</option>
                  {(departments as DepartmentRef[]).map((d) => (
                    <option key={d.id} value={d.id}>{`${d.code} ${d.name}`}</option>
                  ))}
                </select>
              ) : dept ? (
                <div>
                  <div>{dept.name}</div>
                  <div className="font-mono text-[11px] text-[#9A9890]">{dept.code}</div>
                </div>
              ) : (
                <span className="text-[#9A9890]">未指定</span>
              )
            }
          />
          <Kv
            label="職位"
            value={
              showInputs ? (
                <input
                  value={formDraft.position ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, position: e.target.value || null })
                  }
                  placeholder="例：服務顧問"
                  className={inputClass}
                />
              ) : (
                employee?.position ?? "—"
              )
            }
          />
          <Kv
            label="Email"
            value={
              showInputs ? (
                <input
                  type="email"
                  value={formDraft.email ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, email: e.target.value || null })
                  }
                  className={inputClass}
                />
              ) : (
                employee?.email ?? "—"
              )
            }
          />
          <Kv
            label="電話"
            value={
              showInputs ? (
                <input
                  value={formDraft.phone ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, phone: e.target.value || null })
                  }
                  className={inputClass}
                />
              ) : (
                employee?.phone ?? "—"
              )
            }
          />
        </div>
        {Object.values(fieldErrors).some(Boolean) ? (
          <div className="px-4 pb-3 text-[11.5px] text-[#CC0000]">
            {Object.entries(fieldErrors)
              .filter(([, v]) => v)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </div>
        ) : null}
      </section>

      {/* 聘僱資訊 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          showInputs ? lockedClass : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 聘僱資訊</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="到職日"
            value={
              showInputs ? (
                <input
                  type="date"
                  value={formDraft.hire_date ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, hire_date: e.target.value || null })
                  }
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{employee?.hire_date ?? "—"}</span>
              )
            }
          />
          <Kv
            label="離職日"
            value={
              showInputs ? (
                <input
                  type="date"
                  value={formDraft.leave_date ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, leave_date: e.target.value || null })
                  }
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{employee?.leave_date ?? "—"}</span>
              )
            }
          />
          <Kv
            label="聘僱狀態"
            value={
              showInputs ? (
                <select
                  value={formDraft.employment_status ?? "active"}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      employment_status: e.target.value as EmployeeInput["employment_status"],
                    })
                  }
                  className={inputClass}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : employee ? (
                STATUS_LABEL[employee.employment_status] ?? employee.employment_status
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="薪資（pay_rate）"
            value={
              showInputs ? (
                <input
                  type="number"
                  step="0.01"
                  value={formDraft.pay_rate ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      pay_rate: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className={inputClass}
                />
              ) : employee?.pay_rate != null ? (
                <span className="font-mono">
                  {Number(employee.pay_rate).toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })}
                </span>
              ) : (
                "—"
              )
            }
          />
        </div>
      </section>

      {/* 備註 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          showInputs ? lockedClass : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 備註</span>
        </header>
        <div className="px-4 py-4">
          {showInputs ? (
            <textarea
              rows={3}
              value={formDraft.notes ?? ""}
              onChange={(e) => setFormDraft({ ...formDraft, notes: e.target.value || null })}
              placeholder="補充說明…"
              className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] bg-white outline-none focus:border-[#185FA5]"
            />
          ) : (
            <div className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap min-h-[2.5em]">
              {employee?.notes || <span className="text-[#9A9890]">—</span>}
            </div>
          )}
        </div>
      </section>

      {creating ? (
        <p className="text-[12px] text-[#9A9890] leading-relaxed">
          建立後將跳轉到該員工的詳情頁，可進一步維護聘僱資訊。
        </p>
      ) : null}

      {/* Tabs */}
      {!creating && employee ? (
        <>
          <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto" id="tab-content">
            <div className="flex border-b border-[#EEECE6]">
              {TABS.map((t) => {
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
                      active
                        ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                        : "text-[#5A5955] hover:bg-[#F8F7F4]"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
            {activeTab === "employment" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sectionCard(
                  "聘僱狀態",
                  <>
                    <Kv label="目前狀態" value={STATUS_LABEL[employee.employment_status] ?? employee.employment_status} small />
                    <Kv label="到職日" value={employee.hire_date ?? "—"} mono small />
                    <Kv label="離職日" value={employee.leave_date ?? "—"} mono small />
                  </>,
                )}
                {sectionCard(
                  "歸屬",
                  <>
                    <Kv
                      label="部門"
                      value={
                        dept ? (
                          <Link
                            href={`/admin/master-data/departments/${dept.id}`}
                            className="text-[#185FA5] hover:underline"
                          >
                            {dept.name} ({dept.code})
                          </Link>
                        ) : (
                          "—"
                        )
                      }
                      small
                    />
                    <Kv label="職位" value={employee.position ?? "—"} small />
                  </>,
                )}
              </div>
            ) : null}

            {activeTab === "audit" ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {sectionCard(
                  "識別碼",
                  <>
                    <Kv label="系統識別碼" value={<span className="font-mono">{employee.id}</span>} small />
                    <Kv label="品牌" value={employee.brand_id} mono small />
                  </>,
                )}
                {sectionCard("建立", <Kv label="建立時間" value={fmtDateTime(employee.created_at)} mono small />)}
                {sectionCard("更新", <Kv label="最後更新" value={fmtDateTime(employee.updated_at)} mono small />)}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </main>
  );
}

function Kv({
  label,
  value,
  bold,
  mono,
  small,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`text-[12.5px] ${bold ? "font-semibold" : ""} ${mono ? "font-mono" : ""} ${
          small ? "text-[11.5px] text-[#5A5955]" : "text-[#2C2C2A]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
