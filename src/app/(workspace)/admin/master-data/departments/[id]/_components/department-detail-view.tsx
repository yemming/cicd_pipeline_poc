"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createDepartmentAction,
  deleteDepartmentAction,
  updateDepartmentAction,
  type DepartmentInput,
} from "@/lib/master-data/department-actions";
import type { DepartmentFieldKey } from "@/lib/master-data/department-form-types";
import type { Department } from "@/lib/parts/types";

export type DepartmentRef = { id: string; code: string; name: string };
export type EmployeeRef = { id: string; emp_code: string; name: string; position?: string | null };

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "members" | "audit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "members", label: "成員概覽" },
  { key: "audit", label: "稽核資訊" },
];

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  } catch {
    return "—";
  }
}

const blankInput = (): DepartmentInput => ({
  code: "",
  name: "",
  parent_id: null,
  manager_employee_id: null,
  is_active: true,
});

const fromRow = (r: Department): DepartmentInput => ({
  code: r.code,
  name: r.name,
  parent_id: r.parent_id,
  manager_employee_id: r.manager_employee_id,
  is_active: r.is_active,
});

export function DepartmentDetailView({
  department,
  parents,
  employees,
  headcount,
  canEdit,
  initialMode = "view",
}: {
  department: Department | null;
  parents: DepartmentRef[];
  employees: EmployeeRef[];
  headcount: number;
  canEdit: boolean;
  initialMode?: "view" | "create";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(initialMode === "create");
  const [activeTab, setActiveTab] = useState<TabKey>("members");
  const [draft, setDraft] = useState<DepartmentInput>(
    department ? fromRow(department) : blankInput(),
  );
  const [createDraft, setCreateDraft] = useState<DepartmentInput>(blankInput());
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<DepartmentFieldKey, string>>>({});

  const showInputs = editing || creating;
  const formDraft: DepartmentInput = creating ? createDraft : draft;
  const setFormDraft = (next: DepartmentInput) => {
    if (creating) setCreateDraft(next);
    else setDraft(next);
  };

  const parentMap = useMemo(() => new Map(parents.map((p) => [p.id, p])), [parents]);
  const employeeMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const parent = department?.parent_id ? parentMap.get(department.parent_id) ?? null : null;
  const manager = department?.manager_employee_id
    ? employeeMap.get(department.manager_employee_id) ?? null
    : null;

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const save = () => {
    if (!department) return;
    startTransition(async () => {
      setFieldErrors({});
      const res = await updateDepartmentAction(department.id, draft);
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
    if (department) setDraft(fromRow(department));
    setFieldErrors({});
    setEditing(false);
  };

  const toggleActive = () => {
    if (!department) return;
    startTransition(async () => {
      const res = await updateDepartmentAction(department.id, {
        ...fromRow(department),
        is_active: !department.is_active,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: department.is_active ? "✓ 已停用" : "✓ 已啟用" });
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
    if (initialMode === "create") router.push("/admin/master-data/departments");
    else setCreating(false);
  };

  const submitCreate = () => {
    startTransition(async () => {
      setFieldErrors({});
      const res = await createDepartmentAction(createDraft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已建立部門，跳轉中…" });
        setCreating(false);
        router.push(`/admin/master-data/departments/${res.data.id}`);
        router.refresh();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const remove = () => {
    if (!department) return;
    if (
      !confirm(
        `確定刪除部門「${department.name}」？\n若有員工 / 下層部門引用會擋下；建議改用停用保留歷史。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteDepartmentAction(department.id);
      if (res.ok) {
        router.push("/admin/master-data/departments");
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
    ? "（未命名部門）"
    : department
      ? department.name
      : "（資料缺失）";
  const headlineCode = creating ? "—" : department?.code ?? "—";

  // 上層部門選項 — 排除自己（避免自指）
  const parentOptions = department
    ? parents.filter((p) => p.id !== department.id)
    : parents;

  return (
    <main className="px-6 py-5 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/master-data/departments" className="hover:text-[#185FA5]">
            部門組織
          </Link>
          <span>›</span>
          <span className={`text-[#5A5955] ${creating ? "" : "font-mono"}`}>
            {creating ? "新增部門" : headlineCode}
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
                href="/admin/master-data/departments"
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
                disabled={!canEdit || !department}
                onClick={() => setEditing(true)}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                disabled={!canEdit || !department}
                onClick={remove}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
              <button
                type="button"
                disabled={!canEdit || !department}
                onClick={toggleActive}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                {department?.is_active ? "停用" : "啟用"}
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
              <div className="text-[11px] tracking-wider text-[#9A9890]">部門組織</div>
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
                ) : department ? (
                  <>
                    <span className="font-mono text-[#5A5955]">{department.code}</span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                        department.is_active
                          ? "bg-[#EAF3DE] text-[#3B6D11]"
                          : "bg-[#F2F2F2] text-[#6B6A68]"
                      }`}
                    >
                      {department.is_active ? "啟用" : "停用"}
                    </span>
                    {parent ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                        上層 {parent.name}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <div
              className={`w-[260px] h-[120px] rounded-lg flex flex-col items-center justify-center text-[12px] ${
                creating
                  ? "border-2 border-dashed border-[#D5D3CB] bg-[#F8F7F4] text-[#9A9890]"
                  : "border border-[#EEECE6] bg-[#F8F7F4]"
              }`}
            >
              {creating ? (
                <span>建立後顯示在編人數</span>
              ) : (
                <>
                  <div className="text-[11px] text-[#9A9890]">在編員工</div>
                  <div className="text-[26px] font-semibold text-[#2C2C2A] font-mono">
                    {headcount}
                  </div>
                  <div className="text-[11px] text-[#9A9890] mt-1">位</div>
                </>
              )}
            </div>
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
            label="部門代碼*"
            value={
              showInputs ? (
                <input
                  value={formDraft.code}
                  onChange={(e) => setFormDraft({ ...formDraft, code: e.target.value })}
                  placeholder="例如：SALES、SVC"
                  className={inputClass}
                />
              ) : department ? (
                <span className="font-mono">{department.code}</span>
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="部門名稱*"
            value={
              showInputs ? (
                <input
                  value={formDraft.name}
                  onChange={(e) => setFormDraft({ ...formDraft, name: e.target.value })}
                  placeholder="例如：銷售部"
                  className={inputClass}
                />
              ) : department?.name ?? "—"
            }
          />
          <Kv
            label="上層部門"
            value={
              showInputs ? (
                <select
                  value={formDraft.parent_id ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, parent_id: e.target.value || null })
                  }
                  className={inputClass}
                >
                  <option value="">— 無 / 頂層 —</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>{`${p.code} ${p.name}`}</option>
                  ))}
                </select>
              ) : parent ? (
                <div>
                  <div>{parent.name}</div>
                  <div className="font-mono text-[11px] text-[#9A9890]">{parent.code}</div>
                </div>
              ) : (
                <span className="text-[#9A9890]">頂層部門</span>
              )
            }
          />
          <Kv
            label="主管"
            value={
              showInputs ? (
                <select
                  value={formDraft.manager_employee_id ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, manager_employee_id: e.target.value || null })
                  }
                  className={inputClass}
                >
                  <option value="">— 未指定 —</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{`${e.name} (${e.emp_code})`}</option>
                  ))}
                </select>
              ) : manager ? (
                <div>
                  <div className="font-medium">{manager.name}</div>
                  <div className="font-mono text-[11px] text-[#9A9890]">{manager.emp_code}</div>
                </div>
              ) : (
                <span className="text-[#9A9890]">未指定</span>
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

      {creating ? (
        <p className="text-[12px] text-[#9A9890] leading-relaxed">
          建立後將跳轉到該部門的詳情頁，可調整主管 / 上層 / 啟停狀態。
        </p>
      ) : null}

      {/* Tabs */}
      {!creating && department ? (
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
            {activeTab === "members" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sectionCard(
                  "成員概覽",
                  <>
                    <Kv label="在編人數" value={<span className="font-mono">{headcount}</span>} small />
                    <Kv
                      label="員工列表"
                      value={
                        <Link
                          href={`/admin/master-data/employees?dept=${department.id}`}
                          className="text-[#185FA5] hover:underline"
                        >
                          查看本部門員工 →
                        </Link>
                      }
                      small
                    />
                  </>,
                )}
                {sectionCard(
                  "停用影響",
                  <div className="text-[12px] text-[#5A5955] leading-relaxed">
                    停用後此部門不會出現在新建員工的 dropdown，但已關聯的員工仍維持引用。建議調整員工歸屬後再停用。
                  </div>,
                )}
              </div>
            ) : null}

            {activeTab === "audit" ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {sectionCard(
                  "識別碼",
                  <>
                    <Kv label="系統識別碼" value={<span className="font-mono">{department.id}</span>} small />
                    <Kv label="品牌" value={department.brand_id} mono small />
                  </>,
                )}
                {sectionCard("建立", <Kv label="建立時間" value={fmtDateTime(department.created_at)} mono small />)}
                {sectionCard("更新", <Kv label="最後更新" value={fmtDateTime(department.updated_at)} mono small />)}
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
