"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createEmployeeRoleAction,
  updateEmployeeRoleAction,
  deactivateEmployeeRoleAction,
  listEmployeesUsingRoleAction,
} from "@/lib/master-data/employee-role-actions";
import type {
  EmployeeRoleType,
  EmployeeRoleInput,
  EmployeeUsingRole,
} from "@/domain/employee-roles.constants";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";

const COLOR_PALETTE = [
  "#0F6E56", "#185FA5", "#854F0B", "#CC0000", "#0F2A45",
  "#5A5955", "#3B6D11", "#1A3A5C", "#534AB7",
];

export type EmployeeRoleDetailViewProps = {
  role: EmployeeRoleType | null;
  canEdit: boolean;
  initialMode: Mode;
};

export function EmployeeRoleDetailView({
  role,
  canEdit,
  initialMode,
}: EmployeeRoleDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);

  // Edit form state（updateEmployeeRoleAction 接受的欄位）
  const [eNameZh, setENameZh] = useState(role?.name_zh ?? "");
  const [eNameEn, setENameEn] = useState(role?.name_en ?? "");
  const [eDesc, setEDesc] = useState(role?.description ?? "");
  const [eColor, setEColor] = useState(role?.color ?? "#185FA5");
  const [eIcon, setEIcon] = useState(role?.icon ?? "");
  const [eSortOrder, setESortOrder] = useState<number>(role?.sort_order ?? 100);
  const [eRbac, setERbac] = useState(role?.suggested_rbac_role_id ?? "");

  // Create form state
  const [cCode, setCCode] = useState("");
  const [cNameZh, setCNameZh] = useState("");
  const [cNameEn, setCNameEn] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cColor, setCColor] = useState("#185FA5");
  const [cIcon, setCIcon] = useState("");
  const [cSortOrder, setCSortOrder] = useState<number>(100);
  const [cRbac, setCRbac] = useState("");

  // 反查（掛此角色的員工）— 進 view mode 後一次性載入
  const [usingEmps, setUsingEmps] = useState<EmployeeUsingRole[]>([]);
  const [usingLoading, setUsingLoading] = useState(false);
  const usingLoadedRef = useRef(false);
  useEffect(() => {
    if (mode !== "view" || !role || usingLoadedRef.current) return;
    usingLoadedRef.current = true;
    let cancelled = false;
    void (async () => {
      setUsingLoading(true);
      const res = await listEmployeesUsingRoleAction(role.code);
      if (cancelled) return;
      setUsingLoading(false);
      if (res.ok) setUsingEmps(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, role]);

  const enterEditMode = () => {
    if (role) {
      setENameZh(role.name_zh);
      setENameEn(role.name_en ?? "");
      setEDesc(role.description ?? "");
      setEColor(role.color ?? "#185FA5");
      setEIcon(role.icon ?? "");
      setESortOrder(role.sort_order);
      setERbac(role.suggested_rbac_role_id ?? "");
    }
    setMode("edit");
  };

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitEdit = () => {
    if (!role) return;
    if (!eNameZh.trim()) {
      showBanner({ ok: false, msg: "顯示名稱必填" });
      return;
    }
    startTransition(async () => {
      const res = await updateEmployeeRoleAction(role.code, {
        name_zh: eNameZh.trim(),
        name_en: eNameEn.trim() || null,
        description: eDesc.trim() || null,
        color: eColor,
        icon: eIcon.trim() || null,
        sort_order: eSortOrder,
        suggested_rbac_role_id: eRbac.trim() || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        setMode("view");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const submitCreate = () => {
    if (!cCode.trim()) {
      showBanner({ ok: false, msg: "角色代碼必填" });
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(cCode.trim())) {
      showBanner({ ok: false, msg: "角色代碼只允許小寫英文+數字+底線、字母開頭" });
      return;
    }
    if (!cNameZh.trim()) {
      showBanner({ ok: false, msg: "顯示名稱必填" });
      return;
    }
    const input: EmployeeRoleInput = {
      code: cCode.trim(),
      name_zh: cNameZh.trim(),
      name_en: cNameEn.trim() || null,
      description: cDesc.trim() || null,
      color: cColor,
      icon: cIcon.trim() || null,
      sort_order: cSortOrder,
      suggested_rbac_role_id: cRbac.trim() || null,
    };
    startTransition(async () => {
      const res = await createEmployeeRoleAction(input);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已新增 ${input.code}` });
        router.push(`/admin/master-data/employee-roles/${res.data.code}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const toggleActive = () => {
    if (!role) return;
    if (role.is_active) {
      if (
        !confirm(
          `確定停用角色「${role.name_zh}」？\n停用後此角色不會出現在員工角色多選下拉。`,
        )
      )
        return;
    }
    startTransition(async () => {
      const res = role.is_active
        ? await deactivateEmployeeRoleAction(role.code)
        : await updateEmployeeRoleAction(role.code, { is_active: true });
      if (res.ok) {
        showBanner({ ok: true, msg: role.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const taClass =
    "border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const breadcrumbCode =
    mode === "create" ? "新增角色" : role?.code ?? "—";

  const renderPills = () => {
    if (mode === "edit" && role) {
      return (
        <>
          <button
            type="button"
            onClick={() => setMode("view")}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submitEdit}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存變更"}
          </button>
        </>
      );
    }
    if (mode === "create") {
      return (
        <>
          <button
            type="button"
            onClick={() => router.push("/admin/master-data/employee-roles")}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submitCreate}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
          >
            {isPending ? "建立中⋯" : "建立並開啟"}
          </button>
        </>
      );
    }
    return (
      <>
        <Link
          href="/admin/master-data/employee-roles"
          className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
        >
          返回列表
        </Link>
        {canEdit && (
          <>
            <Link
              href="/admin/master-data/employee-roles/new"
              className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
            >
              新增
            </Link>
            <button
              type="button"
              onClick={enterEditMode}
              disabled={isPending || !role}
              className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
            >
              修改
            </button>
            <button
              type="button"
              onClick={toggleActive}
              disabled={isPending || !role || (!!role?.is_system && !!role?.is_active)}
              title={
                role?.is_system && role?.is_active ? "系統內建角色不可停用" : ""
              }
              className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
            >
              {role?.is_active ? "停用" : "啟用"}
            </button>
          </>
        )}
      </>
    );
  };

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* 1. Breadcrumb + CRUD Pill Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href="/admin/master-data/employee-roles"
            className="hover:text-[#185FA5]"
          >
            員工角色主檔
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{breadcrumbCode}</span>
          {mode === "edit" && (
            <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">
              編輯模式
            </span>
          )}
          {mode === "create" && (
            <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">
              建立模式
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">{renderPills()}</div>
      </div>

      {/* 2. Banner */}
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

      {/* 3. Title Card */}
      {mode === "create" ? (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="text-[11px] tracking-wider text-[#9A9890]">員工角色</div>
          <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight mt-1">
            （未命名角色）
          </h1>
          <div className="mt-1 flex items-center gap-1.5 text-[12px]">
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
              尚未建立
            </span>
            <span className="text-[#9A9890]">
              角色代碼為小寫英數+底線、字母開頭（程式判斷用、建立後不可改）
            </span>
          </div>
        </header>
      ) : role ? (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="flex flex-col gap-2">
            <div className="text-[11px] tracking-wider text-[#9A9890]">員工角色</div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight inline-flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: role.color }}
              />
              {role.name_zh}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              <span className="font-mono text-[#5A5955]">{role.code}</span>
              {role.name_en && (
                <span className="text-[#9A9890]">{role.name_en}</span>
              )}
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                  role.is_active
                    ? "bg-[#EAF3DE] text-[#3B6D11]"
                    : "bg-[#F2F2F2] text-[#6B6A68]"
                }`}
              >
                {role.is_active ? "啟用" : "停用"}
              </span>
              {role.is_system ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF4FB] text-[#185FA5]">
                  系統內建
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#FDF3E3] text-[#854F0B]">
                  自訂角色
                </span>
              )}
            </div>
          </div>
        </header>
      ) : (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-6 text-center text-[13px] text-[#CC0000]">
          找不到此角色（code 不存在或已被刪除）
        </header>
      )}

      {/* 4. Sections */}
      {mode === "create" ? (
        <SectionCard title="▼ 基本資料">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>角色代碼 *</label>
              <input
                className={`${inputClass} font-mono`}
                placeholder="technician / sa / parts_manager"
                value={cCode}
                onChange={(e) => setCCode(e.target.value.toLowerCase())}
              />
              <span className="text-[10px] text-[#9A9890]">
                小寫英數+底線、字母開頭、建立後不可改
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>顯示名稱 *</label>
              <input
                className={inputClass}
                placeholder="技師 / 服務顧問"
                value={cNameZh}
                onChange={(e) => setCNameZh(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>英文名稱</label>
              <input
                className={inputClass}
                placeholder="Technician"
                value={cNameEn}
                onChange={(e) => setCNameEn(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>排序（小→前）</label>
              <input
                type="number"
                className={`${inputClass} font-mono`}
                value={cSortOrder}
                onChange={(e) =>
                  setCSortOrder(parseInt(e.target.value, 10) || 0)
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Material icon name</label>
              <input
                className={`${inputClass} font-mono`}
                placeholder="engineering / badge"
                value={cIcon}
                onChange={(e) => setCIcon(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>建議 RBAC role id</label>
              <input
                className={`${inputClass} font-mono`}
                placeholder="technician / service_advisor"
                value={cRbac}
                onChange={(e) => setCRbac(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-3">
              <label className={labelClass}>顏色（chip 顯示）</label>
              <ColorPicker
                value={cColor}
                onChange={setCColor}
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-3">
              <label className={labelClass}>說明</label>
              <textarea
                className={`${taClass} w-full`}
                rows={2}
                placeholder="用途說明（給後台維護者看）"
                value={cDesc}
                onChange={(e) => setCDesc(e.target.value)}
              />
            </div>
          </div>
          <div className="text-[12px] text-[#9A9890] px-1 py-2 mt-2">
            建立後將跳轉到該角色的詳情頁，可進一步維護⋯
          </div>
        </SectionCard>
      ) : role ? (
        <>
          <SectionCard title="▼ 基本資料">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv
                label="角色代碼"
                value={<span className="font-mono">{role.code}</span>}
              />
              <Kv
                label="顯示名稱"
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} w-full`}
                      value={eNameZh}
                      onChange={(e) => setENameZh(e.target.value)}
                    />
                  ) : (
                    role.name_zh
                  )
                }
              />
              <Kv
                label="英文名稱"
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} w-full`}
                      value={eNameEn}
                      onChange={(e) => setENameEn(e.target.value)}
                    />
                  ) : (
                    role.name_en ?? "—"
                  )
                }
              />
              <Kv
                label="排序"
                value={
                  mode === "edit" ? (
                    <input
                      type="number"
                      className={`${inputClass} font-mono w-full`}
                      value={eSortOrder}
                      onChange={(e) =>
                        setESortOrder(parseInt(e.target.value, 10) || 0)
                      }
                    />
                  ) : (
                    <span className="font-mono">{role.sort_order}</span>
                  )
                }
                small={mode !== "edit"}
              />
              <Kv
                label="Material icon"
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} font-mono w-full`}
                      placeholder="engineering / badge"
                      value={eIcon}
                      onChange={(e) => setEIcon(e.target.value)}
                    />
                  ) : (
                    <span className="font-mono">{role.icon ?? "—"}</span>
                  )
                }
              />
              <Kv
                label="顏色"
                value={
                  mode === "edit" ? (
                    <ColorPicker
                      value={eColor}
                      onChange={setEColor}
                      disabled={isPending}
                    />
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: role.color }}
                      />
                      <span className="font-mono text-[11.5px]">
                        {role.color}
                      </span>
                    </span>
                  )
                }
              />
              <Kv
                label="說明"
                full
                value={
                  mode === "edit" ? (
                    <textarea
                      className={`${taClass} w-full`}
                      rows={2}
                      value={eDesc}
                      onChange={(e) => setEDesc(e.target.value)}
                    />
                  ) : (
                    role.description ?? "—"
                  )
                }
              />
            </div>
          </SectionCard>

          <SectionCard title="▼ RBAC 對映建議">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv
                label="建議綁定的 RBAC role id"
                full
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} font-mono w-full`}
                      placeholder="technician / service_advisor / warehouse"
                      value={eRbac}
                      onChange={(e) => setERbac(e.target.value)}
                    />
                  ) : (
                    <span className="font-mono">
                      {role.suggested_rbac_role_id ?? "—"}
                    </span>
                  )
                }
              />
            </div>
            <div className="text-[11px] text-[#9A9890] px-1 pt-2">
              人事系統將來可參考此值自動配 RBAC role；POC 階段純供提示。
            </div>
          </SectionCard>

          <SectionCard title="▼ 進階（系統欄位）">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv
                label="來源"
                value={role.is_system ? "系統內建" : "自訂角色"}
                small
              />
              <Kv label="狀態" value={role.is_active ? "啟用" : "停用"} small />
              <Kv label="更新時間" value={role.updated_at} mono small />
            </div>
          </SectionCard>

          <SectionCard
            title={`▼ 掛此角色的員工（${
              usingLoading ? "查詢中⋯" : `${usingEmps.length} 人`
            }）`}
          >
            {usingLoading ? (
              <div className="text-[12px] text-[#9A9890] py-3 text-center">
                查詢中⋯
              </div>
            ) : usingEmps.length === 0 ? (
              <div className="text-[12px] text-[#9A9890] py-3 text-center">
                目前沒有任何員工把 {role.code} 列在 role_codes
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
                  <tr>
                    <th className="text-left font-medium py-2 px-3 w-[120px]">
                      員工編號
                    </th>
                    <th className="text-left font-medium py-2 px-3">姓名</th>
                    <th className="text-left font-medium py-2 px-3 w-[100px]">
                      品牌
                    </th>
                    <th className="text-left font-medium py-2 px-3 w-[80px]">
                      狀態
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usingEmps.map((emp) => (
                    <tr
                      key={emp.id}
                      className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]"
                    >
                      <td className="py-2 px-3">
                        <Link
                          href={`/admin/master-data/employees/${emp.id}`}
                          className="font-mono text-[#185FA5] hover:underline"
                        >
                          {emp.emp_code ?? "—"}
                        </Link>
                      </td>
                      <td className="py-2 px-3">{emp.name}</td>
                      <td className="py-2 px-3 text-[#5A5955]">
                        {emp.brand_id ?? "—"}
                      </td>
                      <td className="py-2 px-3 text-[#5A5955]">
                        {emp.is_active ? "啟用" : "停用"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="text-[11px] text-[#9A9890] px-1 pt-2">
              此處唯讀呈現關聯；要調整員工角色請到員工主檔該員工的詳情頁編輯
              role_codes。
            </div>
          </SectionCard>
        </>
      ) : null}
    </main>
  );
}

function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (c: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      {COLOR_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          disabled={disabled}
          className={`w-7 h-7 rounded-full border-2 ${
            value === c ? "border-[#2C2C2A]" : "border-transparent"
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="#185FA5"
        className="h-[28px] w-[100px] border border-[#D5D3CB] rounded px-2 text-[11.5px] font-mono focus:border-[#185FA5] focus:outline-none"
      />
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">{title}</span>
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function Kv({
  label,
  value,
  mono,
  small,
  full,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  small?: boolean;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${full ? "md:col-span-3" : ""}`}>
      <label className="text-[11px] text-[#9A9890]">{label}</label>
      <div
        className={`${mono ? "font-mono" : ""} ${
          small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
