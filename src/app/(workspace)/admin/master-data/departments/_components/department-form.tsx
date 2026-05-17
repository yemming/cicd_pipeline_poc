"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Combobox } from "@/components/forms/combobox";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  createDepartmentAction,
  updateDepartmentAction,
  type DepartmentInput,
} from "@/lib/master-data/department-actions";
import type { DepartmentFieldKey } from "@/lib/master-data/department-form-types";
import type { Department, Employee } from "@/lib/parts/types";

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}

export function DepartmentForm({
  mode,
  department,
  parents,
  employees,
}: {
  mode: "create" | "edit";
  department?: Department | null;
  parents: Department[];
  employees: Employee[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<DepartmentFieldKey, string>>
  >({});
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  const submitIdle = mode === "create" ? "建立部門" : "儲存變更";
  const submitPending = mode === "create" ? "建立中…" : "儲存中…";
  const fe = fieldErrors;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: DepartmentInput = {
      code: String(fd.get("code") ?? "").trim(),
      name: String(fd.get("name") ?? "").trim(),
      parent_id: strOrNull(fd.get("parent_id")),
      manager_employee_id: strOrNull(fd.get("manager_employee_id")),
      ...(mode === "edit" ? { is_active: fd.get("is_active") === "on" } : {}),
    };

    startTransition(async () => {
      setError(null);
      setFieldErrors({});
      const res =
        mode === "create"
          ? await createDepartmentAction(input)
          : await updateDepartmentAction(department!.id, input);
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        setBanner({ ok: false, msg: res.error });
        return;
      }
      setBanner({
        ok: true,
        msg: mode === "create" ? "✓ 已建立部門" : "✓ 已儲存",
      });
      if (mode === "create") {
        router.push("/admin/master-data/departments");
      } else {
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-[#FFBDAD] bg-[#FFEBE6] px-4 py-3 text-[13px] text-[#BF2600]"
        >
          <strong className="font-semibold">{error}</strong>
          {Object.keys(fe).length > 0 && (
            <span className="ml-2 text-[12px] text-[#BF2600]/80">
              請查看下方紅字欄位
            </span>
          )}
        </div>
      )}

      <fieldset
        disabled={isPending}
        className={isPending ? "pointer-events-none opacity-60" : ""}
      >
        <section className="space-y-3">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
            基本資料
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              name="code"
              label="部門代碼"
              required
              defaultValue={department?.code ?? ""}
              placeholder="例：SVC / SAL / PRT"
              hint="同 brand 內 code 唯一"
              error={fe.code}
            />
            <FormField
              name="name"
              label="部門名稱"
              required
              defaultValue={department?.name ?? ""}
              placeholder="例：維修部"
              error={fe.name}
            />
            <Combobox
              name="parent_id"
              label="上層部門"
              placeholder="搜尋部門代碼 / 名稱…"
              defaultValue={department?.parent_id ?? ""}
              options={parents
                .filter((p) => p.id !== department?.id)
                .map((p) => ({
                  value: p.id,
                  label: p.name,
                  hint: p.code,
                }))}
              hint="留空表示頂層部門"
              error={fe.parent_id}
            />
            <Combobox
              name="manager_employee_id"
              label="部門主管"
              placeholder="搜尋姓名 / 員工代碼…"
              defaultValue={department?.manager_employee_id ?? ""}
              options={employees.map((e) => ({
                value: e.id,
                label: e.name,
                hint: [e.emp_code, e.position].filter(Boolean).join(" · "),
              }))}
              hint="非必填；指定後員工列表可顯示主管"
              error={fe.manager_employee_id}
            />
          </div>
        </section>

        {mode === "edit" && (
          <label className="flex items-center gap-2 text-[13px] text-[#172B4D] mt-4">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={department?.is_active ?? true}
              className="w-4 h-4"
            />
            部門仍在營運中（停用後不會出現在新員工的 dropdown）
          </label>
        )}

        <div className="flex items-center gap-3 pt-3 mt-4 border-t border-[#DFE1E6]">
          <SubmitButton
            idleLabel={submitIdle}
            pendingLabel={submitPending}
            pending={isPending}
          />
          <Link
            href="/admin/master-data/departments"
            className="px-5 py-2 text-[14px] text-[#42526E] hover:text-[#172B4D]"
          >
            取消
          </Link>
        </div>
      </fieldset>

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
    </form>
  );
}
