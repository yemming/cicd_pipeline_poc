"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { startCountSessionAction } from "@/domain/count";
import { COUNT_TYPE_OPTIONS } from "@/domain/count.constants";

type Banner = { ok: boolean; msg: string } | null;

export function NewCountSessionForm({
  warehouses,
}: {
  warehouses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [warehouseId, setWarehouseId] = useState("");
  const [countType, setCountType] = useState("manual");
  const [abcFilter, setAbcFilter] = useState<"" | "A" | "B" | "C">("");
  const [countDate, setCountDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [freezeWarehouse, setFreezeWarehouse] = useState(false);
  const [notes, setNotes] = useState("");
  const [banner, setBanner] = useState<Banner>(null);

  const flash = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const canSubmit = !!warehouseId && !isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await startCountSessionAction({
        warehouse_id: warehouseId,
        count_type: countType,
        abc_class_filter: abcFilter || undefined,
        count_date: countDate,
        freeze_warehouse: freezeWarehouse,
        notes: notes || undefined,
      });
      if (res.ok) {
        flash({
          ok: true,
          msg: `✓ ${res.data.ct_no} 已建立，共 ${res.data.total_lines} 行明細`,
        });
        setTimeout(() => {
          router.push(`/parts/operations/count-ops/${res.data.ct_id}`);
        }, 400);
      } else {
        flash({ ok: false, msg: res.error });
      }
    });
  };

  return (
    <main
      className={`px-6 py-5 space-y-3 ${
        isPending ? "pointer-events-none opacity-60" : ""
      }`}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href="/parts/operations/count-ops"
            className="hover:text-[#185FA5]"
          >
            庫存盤點作業
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">新建盤點 session</span>
          <span className="px-2 py-0.5 ml-2 text-[11px] rounded bg-[#FDF3E3] text-[#854F0B]">
            建立模式
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/operations/count-ops"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            取消
          </Link>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
          >
            {isPending ? "建立中⋯" : "建立並開啟"}
          </button>
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="text-[11px] tracking-wider text-[#9A9890]">
          盤點 SESSION
        </div>
        <h1 className="text-[18px] font-semibold text-[#2C2C2A]">
          建立新盤點任務
        </h1>
        <p className="text-[12px] text-[#5A5955] mt-1">
          選擇盤點倉與類型，系統會自動拍當下倉內可用庫存快照當作首盤底稿；建立後可逐行補首盤量。
        </p>
      </header>

      {/* Form */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 基本資料
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              盤點倉 <span className="text-[#CC0000]">*</span>
            </label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">請選擇⋯</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              盤點類型
            </label>
            <select
              value={countType}
              onChange={(e) => setCountType(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {COUNT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              ABC 篩選（可選）
            </label>
            <select
              value={abcFilter}
              onChange={(e) =>
                setAbcFilter(e.target.value as "" | "A" | "B" | "C")
              }
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部</option>
              <option value="A">A 類</option>
              <option value="B">B 類</option>
              <option value="C">C 類</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              盤點日期
            </label>
            <input
              type="date"
              value={countDate}
              onChange={(e) => setCountDate(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>

          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="inline-flex items-center gap-2 text-[12.5px] text-[#2C2C2A] cursor-pointer">
              <input
                type="checkbox"
                checked={freezeWarehouse}
                onChange={(e) => setFreezeWarehouse(e.target.checked)}
              />
              凍結倉庫（盤點期間鎖出入庫，避免快照漂移）
            </label>
          </div>

          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-[11px] text-[#9A9890] font-medium">
              備註
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="border border-[#D5D3CB] rounded px-2 py-1 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>
        </div>
      </section>

      <p className="text-[11.5px] text-[#9A9890]">
        建立後將跳轉到該盤點 session 的詳情頁，可逐行填首盤量並提交覆核。
      </p>

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
