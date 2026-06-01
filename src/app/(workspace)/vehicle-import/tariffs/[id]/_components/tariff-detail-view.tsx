"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createTariffAction,
  updateTariffAction,
  setTariffActiveAction,
  deleteTariffAction,
  type TariffInput,
} from "@/lib/vehicle-import/tariff-actions";
import type { HsCodeTariffRow } from "@/domain/hs-code-tariffs";
import {
  PLATE_CLASSES,
  HS_CODE_8711_DEFAULTS,
  computeImportTaxes,
} from "@/domain/import-tax.constants";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";

const PLATE_LABEL: Record<string, string> = Object.fromEntries(
  PLATE_CLASSES.map((p) => [p.value, p.label]),
);
const pct = (v: number) => `${(v * 100).toFixed(2).replace(/\.00$/, "")}%`;
const nt = (n: number) => `NT$ ${Math.round(n).toLocaleString("en-US")}`;

function thisYear(): number {
  // Asia/Taipei
  const tpe = new Date(Date.now() + 8 * 3600 * 1000);
  return tpe.getUTCFullYear();
}

export function TariffDetailView({
  tariff,
  initialMode,
}: {
  tariff: HsCodeTariffRow | null;
  initialMode: Mode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);

  // form state（edit / create 共用）
  const [hsCode, setHsCode] = useState(tariff?.hs_code ?? "");
  const [year, setYear] = useState<string>(String(tariff?.effective_year ?? thisYear()));
  const [plate, setPlate] = useState(tariff?.plate_class ?? "");
  const [dispMin, setDispMin] = useState<string>(
    tariff?.displacement_min != null ? String(tariff.displacement_min) : "",
  );
  const [dispMax, setDispMax] = useState<string>(
    tariff?.displacement_max != null ? String(tariff.displacement_max) : "",
  );
  const [customs, setCustoms] = useState<string>(String(tariff?.customs_rate ?? "0.17"));
  const [commodity, setCommodity] = useState<string>(String(tariff?.commodity_tax_rate ?? "0.17"));
  const [trade, setTrade] = useState<string>(String(tariff?.trade_promotion_rate ?? "0.0004"));
  const [vat, setVat] = useState<string>(String(tariff?.vat_rate ?? "0.05"));
  const [note, setNote] = useState(tariff?.note ?? "");

  // 試算 CIF（即時預覽稅金引擎）
  const [demoCif, setDemoCif] = useState("600000");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const enterEdit = () => {
    if (tariff) {
      setHsCode(tariff.hs_code);
      setYear(String(tariff.effective_year));
      setPlate(tariff.plate_class ?? "");
      setDispMin(tariff.displacement_min != null ? String(tariff.displacement_min) : "");
      setDispMax(tariff.displacement_max != null ? String(tariff.displacement_max) : "");
      setCustoms(String(tariff.customs_rate));
      setCommodity(String(tariff.commodity_tax_rate));
      setTrade(String(tariff.trade_promotion_rate));
      setVat(String(tariff.vat_rate));
      setNote(tariff.note ?? "");
    }
    setMode("edit");
  };

  const buildInput = (): TariffInput => ({
    hs_code: hsCode.trim(),
    effective_year: Number(year),
    displacement_min: dispMin.trim() ? Number(dispMin) : null,
    displacement_max: dispMax.trim() ? Number(dispMax) : null,
    plate_class: plate || null,
    customs_rate: Number(customs),
    commodity_tax_rate: Number(commodity),
    trade_promotion_rate: Number(trade),
    vat_rate: Number(vat),
    note: note.trim() || null,
  });

  const submitCreate = () => {
    startTransition(async () => {
      const res = await createTariffAction(buildInput());
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已新增稅則" });
        router.push(`/vehicle-import/tariffs/${res.data.id}`);
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const submitEdit = () => {
    if (!tariff) return;
    startTransition(async () => {
      const res = await updateTariffAction(tariff.id, buildInput());
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        setMode("view");
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const toggleActive = () => {
    if (!tariff) return;
    startTransition(async () => {
      const res = await setTariffActiveAction(tariff.id, !tariff.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: tariff.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const removeRow = () => {
    if (!tariff) return;
    if (!confirm(`確定刪除稅則「${tariff.hs_code} / ${tariff.effective_year}」？`)) return;
    startTransition(async () => {
      const res = await deleteTariffAction(tariff.id);
      if (res.ok) router.push("/vehicle-import/tariffs");
      else showBanner({ ok: false, msg: res.error });
    });
  };

  const creating = mode === "create";
  const editing = mode === "edit";
  const formMode = creating || editing;

  // 即時稅金預覽（用目前表單率 or 既有 row 率）
  const preview = useMemo(() => {
    const rates = formMode
      ? {
          customs_rate: Number(customs) || 0,
          commodity_tax_rate: Number(commodity) || 0,
          trade_promotion_rate: Number(trade) || 0,
          vat_rate: Number(vat) || 0,
        }
      : tariff
        ? {
            customs_rate: tariff.customs_rate,
            commodity_tax_rate: tariff.commodity_tax_rate,
            trade_promotion_rate: tariff.trade_promotion_rate,
            vat_rate: tariff.vat_rate,
          }
        : null;
    if (!rates) return null;
    return computeImportTaxes(Number(demoCif) || 0, rates);
  }, [formMode, customs, commodity, trade, vat, tariff, demoCif]);

  const inputClass =
    "h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const pill = "h-[30px] px-4 rounded-full text-[12px] inline-flex items-center shadow-sm";

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/vehicle-import/tariffs" className="hover:text-[#185FA5]">
            進口稅則
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">
            {creating ? "新增" : tariff?.hs_code}
          </span>
          {creating && (
            <span className="px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
              建立模式
            </span>
          )}
          {editing && (
            <span className="px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
              編輯模式
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" && (
            <>
              <button
                onClick={() => router.push("/vehicle-import/tariffs")}
                className={`${pill} bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]`}
              >
                返回列表
              </button>
              <button
                onClick={() => router.push("/vehicle-import/tariffs/new")}
                className={`${pill} font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50`}
                disabled={isPending}
              >
                新增
              </button>
              <button
                onClick={enterEdit}
                className={`${pill} font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50`}
                disabled={isPending}
              >
                修改
              </button>
              <button
                onClick={removeRow}
                className={`${pill} bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50`}
                disabled={isPending}
              >
                刪除
              </button>
              <button
                onClick={toggleActive}
                className={`${pill} bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50`}
                disabled={isPending}
              >
                {tariff?.is_active ? "停用" : "啟用"}
              </button>
            </>
          )}
          {editing && (
            <>
              <button
                onClick={submitEdit}
                disabled={isPending}
                className={`${pill} font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50`}
              >
                {isPending ? "儲存中⋯" : "儲存變更"}
              </button>
              <button
                onClick={() => setMode("view")}
                disabled={isPending}
                className={`${pill} bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]`}
              >
                取消
              </button>
            </>
          )}
          {creating && (
            <>
              <button
                onClick={() => router.push("/vehicle-import/tariffs")}
                disabled={isPending}
                className={`${pill} bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]`}
              >
                取消
              </button>
              <button
                onClick={submitCreate}
                disabled={isPending}
                className={`${pill} font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50`}
              >
                {isPending ? "建立中⋯" : "建立並開啟"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="text-[11px] tracking-wider text-[#9A9890]">進口稅則 · HS 8711</div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
              {creating ? "（未命名稅則）" : `${tariff?.hs_code} · ${tariff?.effective_year} 年度版本`}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              {creating ? (
                <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                  尚未建立
                </span>
              ) : (
                <>
                  {tariff?.plate_class && (
                    <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">
                      {PLATE_LABEL[tariff.plate_class] ?? tariff.plate_class}
                    </span>
                  )}
                  {tariff?.is_active ? (
                    <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                      啟用
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
                      停用
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 區段卡片：稅則設定 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 稅則設定</span>
        </header>
        {formMode ? (
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            <Field label="HS Code *">
              <select
                className={inputClass}
                value={hsCode}
                onChange={(e) => {
                  const v = e.target.value;
                  setHsCode(v);
                  const d = HS_CODE_8711_DEFAULTS.find((x) => x.hs_code === v);
                  if (d) {
                    setPlate(d.plate_class);
                    setDispMin(String(d.displacement_min));
                    setDispMax(d.displacement_max != null ? String(d.displacement_max) : "");
                  }
                }}
              >
                <option value="">— 選擇 —</option>
                {HS_CODE_8711_DEFAULTS.map((d) => (
                  <option key={d.hs_code} value={d.hs_code}>
                    {d.hs_code}
                  </option>
                ))}
                {hsCode && !HS_CODE_8711_DEFAULTS.some((d) => d.hs_code === hsCode) && (
                  <option value={hsCode}>{hsCode}</option>
                )}
              </select>
            </Field>
            <Field label="年度版本 *">
              <input
                className={inputClass}
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </Field>
            <Field label="牌照級距">
              <select className={inputClass} value={plate} onChange={(e) => setPlate(e.target.value)}>
                <option value="">— 無 —</option>
                {PLATE_CLASSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="排氣量下限 (cc)">
              <input className={inputClass} type="number" value={dispMin} onChange={(e) => setDispMin(e.target.value)} />
            </Field>
            <Field label="排氣量上限 (cc，空=無上限)">
              <input className={inputClass} type="number" value={dispMax} onChange={(e) => setDispMax(e.target.value)} />
            </Field>
            <div />
            <Field label="關稅率（小數，如 0.17）*">
              <input className={inputClass} type="number" step="0.0001" value={customs} onChange={(e) => setCustoms(e.target.value)} />
            </Field>
            <Field label="貨物稅率（>150cc 0.17）*">
              <input className={inputClass} type="number" step="0.0001" value={commodity} onChange={(e) => setCommodity(e.target.value)} />
            </Field>
            <Field label="推貿費率（0.0004）*">
              <input className={inputClass} type="number" step="0.0001" value={trade} onChange={(e) => setTrade(e.target.value)} />
            </Field>
            <Field label="進口營業稅率（0.05）*">
              <input className={inputClass} type="number" step="0.0001" value={vat} onChange={(e) => setVat(e.target.value)} />
            </Field>
            <div className="md:col-span-3">
              <label className={labelClass}>備註</label>
              <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="稅率來源 / GC411 查詢日期…" />
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            <Kv label="HS Code" value={tariff?.hs_code} mono />
            <Kv label="年度版本" value={String(tariff?.effective_year)} mono />
            <Kv label="牌照級距" value={tariff?.plate_class ? PLATE_LABEL[tariff.plate_class] : "—"} />
            <Kv
              label="排氣量級距"
              value={`${tariff?.displacement_min ?? "—"} ~ ${tariff?.displacement_max ?? "∞"} cc`}
            />
            <Kv label="關稅率" value={pct(tariff?.customs_rate ?? 0)} mono />
            <Kv label="貨物稅率" value={pct(tariff?.commodity_tax_rate ?? 0)} mono />
            <Kv label="推貿費率" value={pct(tariff?.trade_promotion_rate ?? 0)} mono />
            <Kv label="進口營業稅率" value={pct(tariff?.vat_rate ?? 0)} mono />
            <Kv label="備註" value={tariff?.note ?? "—"} small />
          </div>
        )}
      </section>

      {/* 稅金試算（即時驗證引擎） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-3">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 稅金試算（疊加計算）</span>
          <span className="text-[11px] text-[#9A9890]">輸入 CIF 完稅價，即時套用本稅則率</span>
        </header>
        <div className="px-4 py-4 space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>CIF 完稅價 (NT$)</label>
              <input
                className="h-[30px] w-[180px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none font-mono"
                type="number"
                value={demoCif}
                onChange={(e) => setDemoCif(e.target.value)}
              />
            </div>
          </div>
          {preview && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-[12.5px]">
              <Kv label="關稅" value={nt(preview.customs)} mono />
              <Kv label="貨物稅" value={nt(preview.commodityTax)} mono />
              <Kv label="推貿費" value={nt(preview.tradeFee)} mono />
              <Kv label="進口營業稅（進項，不入成本）" value={nt(preview.importVat)} mono />
              <Kv label="計入存貨成本稅費" value={nt(preview.inventoriableTotal)} mono />
              <div className="flex flex-col">
                <span className="text-[11px] text-[#9A9890]">進口時繳稅合計</span>
                <span className="text-[14px] font-bold text-[#1A3A5C] font-mono">
                  {nt(preview.totalPayable)}
                </span>
              </div>
            </div>
          )}
          <p className="text-[11px] text-[#9A9890]">
            ⚠️ 進口營業稅是<b>進項稅額</b>，後續銷售可扣抵銷項、<b>不是真正成本</b>（僅前期現金流出），故不計入整車成本。
          </p>
        </div>
      </section>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {children}
    </div>
  );
}

function Kv({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span
        className={`${small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"} ${
          mono ? "font-mono" : ""
        }`}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}
