"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createVehiclePOAction,
  type VehiclePOInput,
  type VehiclePOItemInput,
} from "@/lib/vehicle-inventory/vehicle-po-actions";
import type {
  VehicleModelOption,
  WarehouseOption,
} from "@/domain/vehicle-purchase-orders";
import { brands as brandConfigs } from "@/lib/brands/registry";
import { useActiveBrand } from "@/lib/scope/scope-context";

type DraftItem = {
  key: string;
  vehicle_model_id: string;
  color: string;
  qty: number;
  unit_price_twd: number | "";
};

let _seq = 0;
const newKey = () => `row-${Date.now()}-${_seq++}`;

const blankItem = (): DraftItem => ({
  key: newKey(),
  vehicle_model_id: "",
  color: "",
  qty: 1,
  unit_price_twd: "",
});

type Banner = { ok: boolean; msg: string } | null;

function fmtNT(n: number): string {
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

export default function VehiclePOWizard({
  vehicleModels,
  warehouses,
  previewPoNo,
  basePath = "/sales/inventory/purchase-orders",
}: {
  vehicleModels: VehicleModelOption[];
  warehouses: WarehouseOption[];
  previewPoNo: string;
  basePath?: string;
}) {
  const BASE = basePath;
  const router = useRouter();
  const brandName = brandConfigs[useActiveBrand()].displayName;
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  // 單頭
  const [supplierName, setSupplierName] = useState(brandName);
  // 採購日期預設今天（Asia/Taipei）；用 lazy initializer 一次算好，避免在 render 期間呼叫 Date.now
  const [orderDate, setOrderDate] = useState(() =>
    new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const [expectedArrival, setExpectedArrival] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [currency, setCurrency] = useState("TWD");
  const [exchangeRate, setExchangeRate] = useState<number | "">(1);
  const [freight, setFreight] = useState<number | "">(0);
  const [insurance, setInsurance] = useState<number | "">(0);
  const [customsRate, setCustomsRate] = useState<number | "">(0);
  const [notes, setNotes] = useState("");

  // 明細
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);

  const modelMap = useMemo(
    () => new Map(vehicleModels.map((m) => [m.id, m])),
    [vehicleModels],
  );

  const totals = useMemo(() => {
    let qty = 0;
    let amount = 0;
    for (const it of items) {
      const q = Number(it.qty) || 0;
      const p = Number(it.unit_price_twd) || 0;
      qty += q;
      amount += q * p;
    }
    return { models: items.length, qty, amount };
  }, [items]);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, blankItem()]);
  const removeItem = (key: string) =>
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((it) => it.key !== key)));

  const buildInput = (): VehiclePOInput => ({
    supplier_name: supplierName,
    order_date: orderDate || null,
    expected_arrival: expectedArrival || null,
    warehouse_id: warehouseId || null,
    currency,
    exchange_rate: exchangeRate === "" ? 1 : Number(exchangeRate),
    freight_estimate: freight === "" ? 0 : Number(freight),
    insurance_estimate: insurance === "" ? 0 : Number(insurance),
    customs_rate: customsRate === "" ? 0 : Number(customsRate),
    notes,
    items: items.map(
      (it): VehiclePOItemInput => ({
        vehicle_model_id: it.vehicle_model_id,
        color: it.color,
        qty: Number(it.qty) || 0,
        unit_price_twd: it.unit_price_twd === "" ? 0 : Number(it.unit_price_twd),
      }),
    ),
  });

  const submit = (asDraft: boolean) => {
    // client 端先驗
    if (!asDraft && !expectedArrival) {
      showBanner({ ok: false, msg: "請填寫預計到港日" });
      return;
    }
    for (const [i, it] of items.entries()) {
      if (!it.vehicle_model_id) {
        showBanner({ ok: false, msg: `第 ${i + 1} 列：請選擇車型` });
        return;
      }
      if (!it.qty || Number(it.qty) < 1) {
        showBanner({ ok: false, msg: `第 ${i + 1} 列：數量需 ≥ 1` });
        return;
      }
      if (it.unit_price_twd === "" || Number(it.unit_price_twd) < 0) {
        showBanner({ ok: false, msg: `第 ${i + 1} 列：請填寫單價` });
        return;
      }
    }

    startTransition(async () => {
      const res = await createVehiclePOAction(buildInput(), !asDraft);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: asDraft
            ? `✓ 草稿已儲存（${res.data.po_no}）`
            : `✓ 採購訂單 ${res.data.po_no} 已送出，建立 ${res.data.inventory_rows} 台在途車輛`,
        });
        // 跳轉到詳情頁
        setTimeout(() => router.push(`${BASE}/${res.data.id}`), 350);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";
  const inputClass =
    "h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + 模式 badge */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href={BASE} className="hover:text-[#185FA5]">
            整車採購訂單
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">新增採購單</span>
          <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
            建立模式
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href={BASE}
            className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="text-[11px] tracking-wider text-[#9A9890]">整車採購訂單 / RS_INV01</div>
        <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
          新增整車採購訂單
        </h1>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
          <span className="font-mono text-[#5A5955]">{previewPoNo}</span>
          <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
            尚未建立
          </span>
          <span className="text-[#9A9890]">送出後車輛進入在途（IN_TRANSIT），等待到港確認</span>
        </div>
      </header>

      {/* 採購資訊 section */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 採購資訊</span>
        </header>
        <div className={`px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 ${lockedClass}`}>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>採購單號</label>
            <input value={previewPoNo} readOnly className={`${inputClass} font-mono bg-[#F4F3F0]`} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>採購日期 *</label>
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>預計到港日 *</label>
            <input
              type="date"
              value={expectedArrival}
              onChange={(e) => setExpectedArrival(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>供應商 *</label>
            <input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              className={inputClass}
              placeholder="例：Indian Motorcycle Taiwan"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>入庫倉</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={inputClass}
            >
              <option value="">—</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code ? `${w.code} ${w.name}` : w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>幣別</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
              <option value="TWD">TWD 新台幣</option>
              <option value="USD">USD 美元</option>
              <option value="EUR">EUR 歐元</option>
              <option value="JPY">JPY 日圓</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>匯率</label>
            <input
              type="number"
              step="0.0001"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value === "" ? "" : Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>運費估計 (NT$)</label>
            <input
              type="number"
              value={freight}
              onChange={(e) => setFreight(e.target.value === "" ? "" : Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>保險估計 (NT$)</label>
            <input
              type="number"
              value={insurance}
              onChange={(e) => setInsurance(e.target.value === "" ? "" : Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關稅率 (%)</label>
            <input
              type="number"
              step="0.01"
              value={customsRate}
              onChange={(e) => setCustomsRate(e.target.value === "" ? "" : Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* 採購車款明細 section */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 採購車款明細</span>
          <button
            type="button"
            onClick={addItem}
            disabled={isPending}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
          >
            ＋ 新增車款
          </button>
        </header>
        <div className={`px-4 py-3 space-y-2 ${lockedClass}`}>
          {/* 表頭 */}
          <div className="grid grid-cols-[1fr_120px_80px_130px_130px_40px] gap-2 px-1 text-[11px] text-[#9A9890] font-medium">
            <div>車系 / 車型</div>
            <div>顏色</div>
            <div className="text-right">數量</div>
            <div className="text-right">單價（未稅）</div>
            <div className="text-right">小計</div>
            <div></div>
          </div>
          {items.map((it) => {
            const q = Number(it.qty) || 0;
            const p = Number(it.unit_price_twd) || 0;
            const model = modelMap.get(it.vehicle_model_id);
            return (
              <div
                key={it.key}
                className="grid grid-cols-[1fr_120px_80px_130px_130px_40px] gap-2 items-center"
              >
                <select
                  value={it.vehicle_model_id}
                  onChange={(e) => {
                    const m = modelMap.get(e.target.value);
                    updateItem(it.key, {
                      vehicle_model_id: e.target.value,
                      // 沒填單價時帶 standard_cost 當建議
                      unit_price_twd:
                        it.unit_price_twd === "" && m?.standard_cost != null
                          ? Number(m.standard_cost)
                          : it.unit_price_twd,
                    });
                  }}
                  className={inputClass}
                >
                  <option value="">— 選擇車型 —</option>
                  {vehicleModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.series ? `${m.series} · ${m.display_name}` : m.display_name}
                    </option>
                  ))}
                </select>
                <input
                  value={it.color}
                  onChange={(e) => updateItem(it.key, { color: e.target.value })}
                  placeholder="顏色"
                  className={inputClass}
                />
                <input
                  type="number"
                  min={1}
                  value={it.qty}
                  onChange={(e) => updateItem(it.key, { qty: Number(e.target.value) })}
                  className={`${inputClass} text-right`}
                />
                <input
                  type="number"
                  min={0}
                  value={it.unit_price_twd}
                  onChange={(e) =>
                    updateItem(it.key, {
                      unit_price_twd: e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                  placeholder={model?.standard_cost != null ? String(model.standard_cost) : "0"}
                  className={`${inputClass} text-right font-mono`}
                />
                <div className="text-right font-mono text-[12px] font-semibold text-[#2C2C2A] pr-1">
                  {fmtNT(q * p)}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(it.key)}
                  disabled={items.length <= 1 || isPending}
                  title={items.length <= 1 ? "至少保留一列" : "刪除此列"}
                  className="h-[30px] rounded text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            );
          })}

          {/* Total bar */}
          <div className="mt-3 bg-[#1A3A5C] rounded-lg px-5 py-3 flex items-center justify-between flex-wrap gap-3">
            <div className="text-center">
              <div className="text-[10px] text-white/65">採購車款</div>
              <div className="text-[14px] font-bold font-mono text-white">{totals.models} 款</div>
            </div>
            <div className="w-px h-9 bg-white/20" />
            <div className="text-center">
              <div className="text-[10px] text-white/65">採購台數</div>
              <div className="text-[14px] font-bold font-mono text-white">{totals.qty} 台</div>
            </div>
            <div className="w-px h-9 bg-white/20" />
            <div className="text-center">
              <div className="text-[10px] text-white/65">採購金額（未稅）</div>
              <div className="text-[18px] font-bold font-mono text-[#5DCAA5]">
                {fmtNT(totals.amount)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 備註 section */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 備註</span>
        </header>
        <div className={`px-4 py-3 ${lockedClass}`}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="特殊要求、指定顏色說明、急件標記等..."
            className="w-full border border-[#D5D3CB] rounded p-2 text-[12.5px] outline-none focus:border-[#185FA5] resize-none"
          />
        </div>
      </section>

      {/* 動作列 */}
      <div className="flex justify-end gap-2">
        <Link
          href={BASE}
          className="h-[30px] px-4 inline-flex items-center rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
        >
          取消
        </Link>
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={isPending}
          className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
        >
          {isPending ? "儲存中…" : "儲存草稿"}
        </button>
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={isPending}
          className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
        >
          {isPending ? "送出中…" : "送出採購訂單"}
        </button>
      </div>

      {/* Banner toast */}
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
