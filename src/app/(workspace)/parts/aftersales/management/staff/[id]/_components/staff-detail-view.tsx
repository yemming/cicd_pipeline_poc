"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import {
  createAftersalesStaffAction,
  deleteAftersalesStaffAction,
  setAftersalesStaffActiveAction,
  updateAftersalesStaffAction,
  type AftersalesStaffInput,
} from "@/lib/aftersales/staff-actions";
import type {
  AftersalesStaffRow,
  AftersalesStaffKpi,
  AftersalesDepartmentOption,
} from "@/domain/aftersales-staff";
import { KpiCard } from "@/components/visualization";
import {
  AFTERSALES_GRADES,
  AFTERSALES_WORK_TYPES,
  getGradeChipStyle,
  isFinalInspectionAuthLocked,
  defaultFinalInspectionAuth,
} from "@/domain/aftersales-staff.constants";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";

export function StaffDetailView({
  staff,
  departments,
  initialMode = "view",
  canEdit,
  kpi = null,
}: {
  staff: AftersalesStaffRow | null;
  departments: AftersalesDepartmentOption[];
  initialMode?: Mode;
  canEdit: boolean;
  kpi?: AftersalesStaffKpi | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const blankDraft = (): AftersalesStaffInput => ({
    emp_code: "",
    name: "",
    dept_id: departments[0]?.id ?? null,
    position: null,
    grade: AFTERSALES_GRADES[0],
    work_type: null,
    final_inspection_auth: defaultFinalInspectionAuth(AFTERSALES_GRADES[0]),
    system_account: null,
    email: null,
    phone: null,
    notes: null,
    is_active: true,
  });

  const fromRow = (r: AftersalesStaffRow): AftersalesStaffInput => ({
    emp_code: r.emp_code,
    name: r.name,
    dept_id: r.dept_id,
    position: r.position,
    grade: r.grade,
    work_type: r.work_type,
    final_inspection_auth: r.final_inspection_auth,
    system_account: r.system_account,
    email: r.email,
    phone: r.phone,
    notes: r.notes,
    is_active: r.is_active,
  });

  const [mode, setMode] = useState<Mode>(initialMode);
  const [draft, setDraft] = useState<AftersalesStaffInput>(
    staff ? fromRow(staff) : blankDraft(),
  );
  const [createDraft, setCreateDraft] = useState<AftersalesStaffInput>(
    blankDraft(),
  );

  const creating = mode === "create";
  const editing = mode === "edit";
  const showInputs = creating || editing;
  const formDraft = creating ? createDraft : draft;
  const setFormDraft = (next: AftersalesStaffInput) => {
    if (creating) setCreateDraft(next);
    else setDraft(next);
  };

  // 職級切換時自動套用「售後主管 → 鎖定複檢授權 ON」
  const onGradeChange = (next: string) => {
    const isLocked = isFinalInspectionAuthLocked(next);
    setFormDraft({
      ...formDraft,
      grade: next,
      final_inspection_auth: isLocked
        ? true
        : formDraft.final_inspection_auth,
    });
  };

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const enterEdit = () => {
    if (!staff) return;
    setDraft(fromRow(staff));
    setMode("edit");
  };
  const enterCreate = () => {
    setCreateDraft(blankDraft());
    setMode("create");
  };
  const cancelForm = () => {
    if (staff) {
      setDraft(fromRow(staff));
      setMode("view");
    } else {
      router.push("/parts/aftersales/management/staff");
    }
  };

  const saveEdit = () => {
    if (!staff) return;
    startTransition(async () => {
      const res = await updateAftersalesStaffAction(staff.id, draft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存變更" });
        setMode("view");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const submitCreate = () => {
    startTransition(async () => {
      const res = await createAftersalesStaffAction(createDraft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已建立員工" });
        router.push(`/parts/aftersales/management/staff/${res.data.id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const handleDelete = () => {
    if (!staff) return;
    if (!confirm(`確定刪除「${staff.name}（${staff.emp_code}）」？`)) return;
    startTransition(async () => {
      const res = await deleteAftersalesStaffAction(staff.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.push("/parts/aftersales/management/staff");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const handleToggleActive = () => {
    if (!staff) return;
    startTransition(async () => {
      const res = await setAftersalesStaffActiveAction(staff.id, !staff.is_active);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: staff.is_active ? "✓ 已停用" : "✓ 已啟用",
        });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputCls =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none disabled:opacity-60 w-full";

  const lockedAuth = isFinalInspectionAuthLocked(formDraft.grade);

  const titleName = creating
    ? createDraft.name || "（未命名員工）"
    : staff?.name ?? "—";
  const titleCode = creating
    ? createDraft.emp_code || "（待填編號）"
    : staff?.emp_code ?? "";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1. Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href="/parts/aftersales/management/staff"
            className="hover:text-[#185FA5]"
          >
            員工名冊
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">
            {creating ? "新增員工" : staff?.emp_code ?? "—"}
          </span>
          {editing ? (
            <span className="ml-2 px-2 py-0.5 text-[11px] rounded-full bg-[#FDF3E3] text-[#854F0B] font-medium">
              編輯模式
            </span>
          ) : null}
          {creating ? (
            <span className="ml-2 px-2 py-0.5 text-[11px] rounded-full bg-[#FDF3E3] text-[#854F0B] font-medium">
              建立模式
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" && staff ? (
            <>
              <Link
                href="/parts/aftersales/management/staff"
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm flex items-center"
              >
                返回列表
              </Link>
              <button
                type="button"
                onClick={enterCreate}
                disabled={!canEdit}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                新增
              </button>
              <button
                type="button"
                onClick={enterEdit}
                disabled={!canEdit}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canEdit || isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
              <button
                type="button"
                onClick={handleToggleActive}
                disabled={!canEdit || isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                {staff.is_active ? "停用" : "啟用"}
              </button>
            </>
          ) : editing ? (
            <>
              <button
                type="button"
                onClick={saveEdit}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {isPending ? "儲存中⋯" : "儲存變更"}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={cancelForm}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
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
          )}
        </div>
      </div>

      {/* 2. Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-start gap-4">
          {/* 頭像 */}
          {!creating ? (
            staff?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={staff.avatar_url}
                alt={staff.name}
                className="w-16 h-16 rounded-full object-cover shrink-0"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-[18px] font-bold shrink-0"
                style={{
                  background: staff?.grade
                    ? getGradeChipStyle(staff.grade).fg
                    : "#5A5955",
                }}
              >
                {staff?.name
                  ? staff.name.length <= 2
                    ? staff.name
                    : staff.name.slice(-2)
                  : "—"}
              </div>
            )
          ) : (
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-[#D5D3CB] flex items-center justify-center text-[10px] text-[#9A9890] shrink-0">
              建立後
              <br />可設定
            </div>
          )}

          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className="text-[11px] tracking-wider text-[#9A9890]">
              售後服務部門 · employees
            </div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
              {titleName}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              <span className="font-mono text-[#5A5955]">{titleCode}</span>
              {!creating && staff ? (
                <>
                  {staff.grade ? (
                    <span
                      className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold"
                      style={(() => {
                        const s = getGradeChipStyle(staff.grade);
                        return { background: s.bg, color: s.fg };
                      })()}
                    >
                      {staff.grade}
                    </span>
                  ) : null}
                  {staff.work_type ? (
                    <span className="px-1.5 py-0.5 rounded-md bg-[#EEF4FB] text-[#185FA5] text-[11px]">
                      {staff.work_type}
                    </span>
                  ) : null}
                  {staff.final_inspection_auth ? (
                    <span className="px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11] text-[11px]">
                      ✓ 複檢授權
                    </span>
                  ) : null}
                  {staff.is_active ? (
                    <span className="px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11] text-[11px]">
                      在職
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-md bg-[#F2F2F2] text-[#6B6A68] text-[11px]">
                      離職
                    </span>
                  )}
                </>
              ) : (
                <span className="px-1.5 py-0.5 rounded-md bg-[#FDF3E3] text-[#854F0B] text-[11px]">
                  尚未建立
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* KPI 段（僅 view mode 顯示） */}
      {!creating && staff && kpi ? (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <KpiCard
            tone="blue"
            label="累計 RO 筆數"
            value={kpi.ro_count_total}
          />
          <KpiCard
            tone="teal"
            label="本月 RO"
            value={kpi.ro_count_month}
          />
          <KpiCard
            tone="green"
            label="本月業績"
            value={
              kpi.monthly_revenue >= 10000
                ? `$${(kpi.monthly_revenue / 10000).toFixed(1)}萬`
                : `$${Math.round(kpi.monthly_revenue).toLocaleString()}`
            }
          />
          <KpiCard
            tone={
              kpi.nps_avg === null
                ? "gray"
                : kpi.nps_avg >= 8.5
                  ? "green"
                  : kpi.nps_avg >= 7
                    ? "blue"
                    : "amber"
            }
            label={`NPS（${kpi.nps_count} 樣本）`}
            value={kpi.nps_avg === null ? "—" : `${kpi.nps_avg.toFixed(1)} / 10`}
          />
        </section>
      ) : null}

      {/* 3. 區段卡片 1：基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 基本資料
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="員工編號 *"
            value={
              showInputs ? (
                <input
                  type="text"
                  value={formDraft.emp_code}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, emp_code: e.target.value })
                  }
                  className={inputCls + " font-mono"}
                  placeholder="例：SA001"
                />
              ) : (
                <span className="font-mono">{staff?.emp_code ?? "—"}</span>
              )
            }
          />
          <Kv
            label="姓名 *"
            value={
              showInputs ? (
                <input
                  type="text"
                  value={formDraft.name}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, name: e.target.value })
                  }
                  className={inputCls}
                  placeholder="例：技師姓名"
                />
              ) : (
                <strong>{staff?.name ?? "—"}</strong>
              )
            }
          />
          <Kv
            label="部門"
            value={
              showInputs ? (
                <select
                  value={formDraft.dept_id ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      dept_id: e.target.value || null,
                    })
                  }
                  className={inputCls}
                >
                  <option value="">—</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span>{staff?.dept_name ?? "—"}</span>
              )
            }
          />
        </div>
      </section>

      {/* 4. 區段卡片 2：售後配置 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 售後配置
          </span>
          <span className="ml-2 text-[11px] text-[#9A9890]">
            職級影響竣工複檢、折扣權限與系統功能存取
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="職級"
            value={
              showInputs ? (
                <select
                  value={formDraft.grade ?? ""}
                  onChange={(e) => onGradeChange(e.target.value)}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {AFTERSALES_GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              ) : staff?.grade ? (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold"
                  style={(() => {
                    const s = getGradeChipStyle(staff.grade);
                    return { background: s.bg, color: s.fg };
                  })()}
                >
                  {staff.grade}
                </span>
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="工種"
            value={
              showInputs ? (
                <>
                  <input
                    type="text"
                    list="work-type-options"
                    value={formDraft.work_type ?? ""}
                    onChange={(e) =>
                      setFormDraft({
                        ...formDraft,
                        work_type: e.target.value || null,
                      })
                    }
                    className={inputCls}
                    placeholder="例：機電 / 電裝 / 鈑噴 / 備料 / 接待"
                  />
                  <datalist id="work-type-options">
                    {AFTERSALES_WORK_TYPES.map((w) => (
                      <option key={w} value={w} />
                    ))}
                  </datalist>
                </>
              ) : (
                staff?.work_type ?? "—"
              )
            }
          />
          <Kv
            label="系統帳號"
            value={
              showInputs ? (
                <input
                  type="text"
                  value={formDraft.system_account ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      system_account: e.target.value || null,
                    })
                  }
                  className={inputCls + " font-mono"}
                  placeholder="例：chen.tech"
                />
              ) : staff?.system_account ? (
                <span className="font-mono text-[11.5px]">
                  {staff.system_account}
                </span>
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="竣工複檢授權"
            value={
              showInputs ? (
                <label className="flex items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={Boolean(formDraft.final_inspection_auth)}
                    disabled={lockedAuth}
                    onChange={(e) =>
                      setFormDraft({
                        ...formDraft,
                        final_inspection_auth: e.target.checked,
                      })
                    }
                    className="w-4 h-4"
                  />
                  <span>
                    {formDraft.final_inspection_auth
                      ? "✓ 已授權"
                      : "未授權"}
                  </span>
                  {lockedAuth ? (
                    <span className="text-[11px] text-[#854F0B]">
                      （售後主管預設且鎖定）
                    </span>
                  ) : null}
                </label>
              ) : staff?.final_inspection_auth ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11] text-[11px]">
                  ✓ 已授權
                </span>
              ) : (
                <span className="text-[#9A9890]">未授權</span>
              )
            }
          />
          <Kv
            label="在職狀態"
            value={
              showInputs ? (
                <label className="flex items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={Boolean(formDraft.is_active)}
                    onChange={(e) =>
                      setFormDraft({
                        ...formDraft,
                        is_active: e.target.checked,
                      })
                    }
                    className="w-4 h-4"
                  />
                  <span>
                    {formDraft.is_active ? "在職" : "離職"}
                  </span>
                </label>
              ) : staff?.is_active ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11] text-[11px]">
                  在職
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#F2F2F2] text-[#6B6A68] text-[11px]">
                  離職
                </span>
              )
            }
          />
          <Kv
            label="舊職稱（HR 用）"
            value={
              showInputs ? (
                <input
                  type="text"
                  value={formDraft.position ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      position: e.target.value || null,
                    })
                  }
                  className={inputCls}
                  placeholder="可空"
                />
              ) : (
                staff?.position ?? "—"
              )
            }
          />
        </div>
      </section>

      {/* 5. 區段卡片 3：聯絡資訊 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 聯絡資訊
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="Email"
            value={
              showInputs ? (
                <input
                  type="email"
                  value={formDraft.email ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      email: e.target.value || null,
                    })
                  }
                  className={inputCls}
                  placeholder="example@brand.tw"
                />
              ) : (
                staff?.email ?? "—"
              )
            }
          />
          <Kv
            label="電話"
            value={
              showInputs ? (
                <input
                  type="tel"
                  value={formDraft.phone ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      phone: e.target.value || null,
                    })
                  }
                  className={inputCls}
                  placeholder="0912-345-678"
                />
              ) : (
                staff?.phone ?? "—"
              )
            }
          />
          <Kv
            label="備註"
            value={
              showInputs ? (
                <input
                  type="text"
                  value={formDraft.notes ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      notes: e.target.value || null,
                    })
                  }
                  className={inputCls}
                />
              ) : (
                staff?.notes ?? "—"
              )
            }
          />
        </div>
      </section>

      {creating ? (
        <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded-lg px-4 py-3 text-[12px] text-[#5A5955]">
          建立後將跳轉到該員工的詳情頁，可進一步維護⋯
        </div>
      ) : null}

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

function Kv({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <div className="text-[12.5px] text-[#2C2C2A]">{value}</div>
    </div>
  );
}
