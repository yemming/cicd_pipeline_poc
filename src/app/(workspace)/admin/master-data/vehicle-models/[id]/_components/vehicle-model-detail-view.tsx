"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import {
  CoaInlineSelect,
  type CoaOption,
} from "@/app/(workspace)/parts/setup/items/[id]/_components/coa-inline-select";
import {
  createVehicleModelAction,
  deleteVehicleModelAction,
  setVehicleModelActiveAction,
  updateVehicleModelAction,
  updateVehicleModelGlAccountAction,
  updateVehicleModelTaxCodeAction,
  type VehicleModelInput,
  type GlField,
} from "@/lib/master-data/vehicle-model-actions";
import type {
  VehicleModelRow,
  VehicleModelTaxCode,
  VehicleModelGlAccount,
} from "@/domain/vehicle-models";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";

export function VehicleModelDetailView({
  model,
  glAccounts: glAccountsProp,
  taxCode: taxCodeProp,
  accountOptions,
  taxCodeOptions,
  seriesOptions = [],
  initialMode = "view",
  canEdit,
}: {
  model: VehicleModelRow | null;
  glAccounts: {
    inventory: VehicleModelGlAccount | null;
    cogs: VehicleModelGlAccount | null;
    revenue: VehicleModelGlAccount | null;
  };
  taxCode: VehicleModelTaxCode | null;
  accountOptions: CoaOption[];
  taxCodeOptions: VehicleModelTaxCode[];
  seriesOptions?: string[];
  initialMode?: Mode;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const blankDraft = (): VehicleModelInput => ({
    series: "",
    model_name: "",
    display_name: "",
    vehicle_type: "motorcycle",
    year_start: null,
    year_end: null,
    engine_cc: null,
    engine_kw: null,
    standard_cost: null,
    msrp: null,
    is_active: true,
  });

  const fromModel = (m: VehicleModelRow): VehicleModelInput => ({
    series: m.series,
    model_name: m.model_name,
    display_name: m.display_name,
    vehicle_type: "motorcycle",
    year_start: m.year_start,
    year_end: m.year_end,
    engine_cc: m.engine_cc,
    engine_kw: m.engine_kw,
    standard_cost: m.standard_cost,
    msrp: m.msrp,
    is_active: m.is_active,
  });

  const [mode, setMode] = useState<Mode>(initialMode);
  const [draft, setDraft] = useState<VehicleModelInput>(
    model ? fromModel(model) : blankDraft(),
  );
  const [createDraft, setCreateDraft] = useState<VehicleModelInput>(blankDraft());

  const creating = mode === "create";
  const editing = mode === "edit";
  const showInputs = creating || editing;
  const formDraft = creating ? createDraft : draft;
  const setFormDraft = (next: VehicleModelInput) => {
    if (creating) setCreateDraft(next);
    else setDraft(next);
  };

  // GL accounts state（樂觀更新）
  const [glAccounts, setGlAccounts] = useState(glAccountsProp);
  const [glPending, setGlPending] = useState<GlField | null>(null);
  const [taxCode, setTaxCode] = useState<VehicleModelTaxCode | null>(taxCodeProp);
  const [taxCodePending, setTaxCodePending] = useState(false);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const enterEdit = () => {
    if (!model) return;
    setDraft(fromModel(model));
    setMode("edit");
  };

  const enterCreate = () => {
    setCreateDraft(blankDraft());
    setMode("create");
  };

  const cancelForm = () => {
    if (model) {
      setDraft(fromModel(model));
      setMode("view");
    } else {
      router.push("/admin/master-data/vehicle-models");
    }
  };

  const saveEdit = () => {
    if (!model) return;
    startTransition(async () => {
      const res = await updateVehicleModelAction(model.id, draft);
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
      const res = await createVehicleModelAction(createDraft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已建立車型" });
        router.push(`/admin/master-data/vehicle-models/${res.data.id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const handleDelete = () => {
    if (!model) return;
    if (!confirm(`確定刪除「${model.display_name}」？`)) return;
    startTransition(async () => {
      const res = await deleteVehicleModelAction(model.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.push("/admin/master-data/vehicle-models");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const handleToggleActive = () => {
    if (!model) return;
    startTransition(async () => {
      const res = await setVehicleModelActiveAction(model.id, !model.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: model.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const handleGlChange = async (field: GlField, coaId: string | null) => {
    if (!model) return;
    const prev = glAccounts[field];
    const next = coaId
      ? accountOptions.find((o) => o.id === coaId) ?? null
      : null;
    setGlAccounts((s) => ({ ...s, [field]: next }));
    setGlPending(field);
    try {
      const res = await updateVehicleModelGlAccountAction(model.id, field, coaId);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已更新會計科目" });
        router.refresh();
      } else {
        setGlAccounts((s) => ({ ...s, [field]: prev }));
        showBanner({ ok: false, msg: res.error });
      }
    } catch (err) {
      setGlAccounts((s) => ({ ...s, [field]: prev }));
      showBanner({
        ok: false,
        msg: `更新失敗：${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setGlPending(null);
    }
  };

  const handleTaxCodeChange = async (taxCodeId: string | null) => {
    if (!model) return;
    const prev = taxCode;
    const next = taxCodeId ? taxCodeOptions.find((t) => t.id === taxCodeId) ?? null : null;
    setTaxCode(next);
    setTaxCodePending(true);
    try {
      const res = await updateVehicleModelTaxCodeAction(model.id, taxCodeId);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已更新預設稅碼" });
        router.refresh();
      } else {
        setTaxCode(prev);
        showBanner({ ok: false, msg: res.error });
      }
    } catch (err) {
      setTaxCode(prev);
      showBanner({
        ok: false,
        msg: `更新失敗：${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setTaxCodePending(false);
    }
  };

  const inputCls =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none disabled:opacity-60";

  // Title block
  const titleSeries = creating ? createDraft.series || "（待填）" : model?.series ?? "";
  const titleDisplay = creating
    ? createDraft.display_name || "（未命名車型）"
    : model?.display_name ?? "";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1. Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/master-data/vehicle-models" className="hover:text-[#185FA5]">
            車型主檔
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">
            {creating ? "新增車型" : model?.display_name ?? "—"}
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
          {mode === "view" && model ? (
            <>
              <Link
                href="/admin/master-data/vehicle-models"
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
                {model.is_active ? "停用" : "啟用"}
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
        <div className="flex flex-col gap-2">
          <div className="text-[11px] tracking-wider text-[#9A9890]">
            重機車型 · vehicle_models
          </div>
          <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
            {titleDisplay}
          </h1>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
            <span className="font-mono text-[#5A5955]">{titleSeries}</span>
            {!creating && model ? (
              <>
                <span className="px-1.5 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5] text-[11px]">
                  {model.brand_id}
                </span>
                {model.is_active ? (
                  <span className="px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11] text-[11px]">
                    啟用
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-md bg-[#F2F2F2] text-[#6B6A68] text-[11px]">
                    停用
                  </span>
                )}
                {model.engine_cc ? (
                  <span className="px-1.5 py-0.5 rounded-md bg-[#EEF4FB] text-[#185FA5] text-[11px]">
                    {model.engine_cc} cc
                  </span>
                ) : null}
              </>
            ) : (
              <span className="px-1.5 py-0.5 rounded-md bg-[#FDF3E3] text-[#854F0B] text-[11px]">
                尚未建立
              </span>
            )}
          </div>
        </div>
      </header>

      {/* 3. 區段卡片 1：基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="車系（series）"
            value={
              showInputs ? (
                <input
                  type="text"
                  value={formDraft.series}
                  onChange={(e) => setFormDraft({ ...formDraft, series: e.target.value })}
                  list="series-options"
                  className={inputCls + " w-full"}
                  placeholder="例：Hypermotard"
                />
              ) : (
                <span className="font-semibold">{model?.series ?? "—"}</span>
              )
            }
          />
          <Kv
            label="型號（model_name）"
            value={
              showInputs ? (
                <input
                  type="text"
                  value={formDraft.model_name}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, model_name: e.target.value })
                  }
                  className={inputCls + " w-full"}
                  placeholder="例：950 SP"
                />
              ) : (
                model?.model_name ?? "—"
              )
            }
          />
          <Kv
            label="顯示名稱（display_name）"
            value={
              showInputs ? (
                <input
                  type="text"
                  value={formDraft.display_name}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, display_name: e.target.value })
                  }
                  className={inputCls + " w-full"}
                  placeholder="例：Hypermotard 950 SP"
                />
              ) : (
                model?.display_name ?? "—"
              )
            }
          />
          <Kv
            label="起始年份"
            value={
              showInputs ? (
                <input
                  type="number"
                  value={formDraft.year_start ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      year_start: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className={inputCls + " w-full"}
                  placeholder="例：2024"
                />
              ) : (
                model?.year_start ?? "—"
              )
            }
          />
          <Kv
            label="結束年份"
            value={
              showInputs ? (
                <input
                  type="number"
                  value={formDraft.year_end ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      year_end: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className={inputCls + " w-full"}
                  placeholder="例：2026"
                />
              ) : (
                model?.year_end ?? "—"
              )
            }
          />
          <Kv
            label="排量（cc）"
            value={
              showInputs ? (
                <input
                  type="number"
                  value={formDraft.engine_cc ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      engine_cc: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className={inputCls + " w-full"}
                />
              ) : (
                model?.engine_cc ?? "—"
              )
            }
          />
          <Kv
            label="馬力（kW）"
            value={
              showInputs ? (
                <input
                  type="number"
                  value={formDraft.engine_kw ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      engine_kw: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className={inputCls + " w-full"}
                />
              ) : (
                model?.engine_kw ?? "—"
              )
            }
          />
          <Kv
            label="車輛類型"
            value={
              <span className="text-[12.5px]">{model?.vehicle_type ?? "motorcycle"}</span>
            }
          />
        </div>
        <datalist id="series-options">
          {seriesOptions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </section>

      {/* 4. 區段卡片 2：商業參數 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 商業參數</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="標準成本（standard_cost）"
            value={
              showInputs ? (
                <input
                  type="number"
                  value={formDraft.standard_cost ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      standard_cost: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className={inputCls + " w-full font-mono"}
                  placeholder="0"
                />
              ) : model?.standard_cost != null ? (
                <span className="font-mono">
                  {Number(model.standard_cost).toLocaleString("en-US")}
                </span>
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="建議售價（MSRP）"
            value={
              showInputs ? (
                <input
                  type="number"
                  value={formDraft.msrp ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      msrp: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className={inputCls + " w-full font-mono"}
                  placeholder="0"
                />
              ) : model?.msrp != null ? (
                <span className="font-mono font-semibold text-[#1A3A5C]">
                  {Number(model.msrp).toLocaleString("en-US")}
                </span>
              ) : (
                "—"
              )
            }
          />
        </div>
      </section>

      {/* 5. 區段卡片 3：總帳會計科目（inline edit） */}
      {!creating && model ? (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              ▼ 總帳會計科目
            </span>
            <span className="ml-2 text-[11px] text-[#9A9890]">
              影響賣車 / 進車 / 內部移轉等業務事件的自動分錄
            </span>
          </header>
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            <Kv
              label="存貨科目"
              value={
                <CoaInlineSelect
                  current={glAccounts.inventory}
                  options={accountOptions}
                  editable={canEdit}
                  pending={glPending === "inventory"}
                  onChange={(coaId) => handleGlChange("inventory", coaId)}
                />
              }
            />
            <Kv
              label="銷售成本科目"
              value={
                <CoaInlineSelect
                  current={glAccounts.cogs}
                  options={accountOptions}
                  editable={canEdit}
                  pending={glPending === "cogs"}
                  onChange={(coaId) => handleGlChange("cogs", coaId)}
                />
              }
            />
            <Kv
              label="收入認列科目"
              value={
                <CoaInlineSelect
                  current={glAccounts.revenue}
                  options={accountOptions}
                  editable={canEdit}
                  pending={glPending === "revenue"}
                  onChange={(coaId) => handleGlChange("revenue", coaId)}
                />
              }
            />
            <Kv
              label="預設稅碼"
              value={
                taxCodePending ? (
                  <span className="text-[12.5px] text-[#9A9890]">儲存中⋯</span>
                ) : (
                  <select
                    value={taxCode?.id ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => handleTaxCodeChange(e.target.value || null)}
                    className="h-[28px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="">— 未設定 —</option>
                    {taxCodeOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.tax_code}（{t.name_zh_tw}）
                      </option>
                    ))}
                  </select>
                )
              }
            />
          </div>
        </section>
      ) : creating ? (
        <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded-lg px-4 py-3 text-[12px] text-[#5A5955]">
          建立後將跳轉到該車型的詳情頁，可進一步設定總帳會計科目、預設稅碼、相容零件等資訊。
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
