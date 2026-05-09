"use client";

import { useEffect } from "react";

export type PrintLabelData = {
  code: string;
  name: string;
  spec_description: string | null;
  category: string | null;
  control_type: string | null;
  base_uom: string | null;
  suggested_price: number | null;
  supplier_name: string | null;
};

export function PrintLabelModal({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: PrintLabelData;
}) {
  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 print:bg-white print:relative print:inset-auto print:p-0"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto print:shadow-none print:rounded-none print:max-w-none print:max-h-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — hidden when printing */}
        <div className="px-5 py-3 border-b border-[#EEECE6] flex items-center print:hidden">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">列印標籤預覽</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded hover:bg-[#F8F7F4] text-[#9A9890] text-[18px] leading-none"
          >
            ×
          </button>
        </div>

        {/* Label body — visible in both modes */}
        <div id="label-print-area" className="p-6 print:p-0">
          <div className="border-2 border-black rounded p-5 print:rounded-none">
            <div className="text-center border-b-2 border-black pb-2 mb-3">
              <div className="text-[10px] uppercase tracking-widest text-gray-600">DealerOS · Parts Label</div>
              <div className="text-[24px] font-bold font-mono mt-1">{data.code}</div>
            </div>
            <div className="text-[16px] font-semibold mb-1">{data.name}</div>
            {data.spec_description ? (
              <div className="text-[12px] text-gray-700 mb-3">{data.spec_description}</div>
            ) : <div className="mb-3" />}

            <div className="grid grid-cols-2 gap-2 text-[12px] border-t border-gray-300 pt-3">
              {data.category ? (<><div className="text-gray-500">品類</div><div className="font-medium">{data.category}</div></>) : null}
              {data.control_type ? (<><div className="text-gray-500">管控</div><div className="font-medium">{data.control_type} 類</div></>) : null}
              {data.base_uom ? (<><div className="text-gray-500">單位</div><div className="font-medium">{data.base_uom}</div></>) : null}
              {data.suggested_price ? (<><div className="text-gray-500">建議售價</div><div className="font-mono font-medium">NT$ {Number(data.suggested_price).toLocaleString("en-US")}</div></>) : null}
              {data.supplier_name ? (<><div className="text-gray-500">供應商</div><div className="font-medium">{data.supplier_name}</div></>) : null}
            </div>

            {/* Stripe-style barcode placeholder */}
            <div className="mt-4 border-t border-gray-300 pt-3">
              <div className="flex items-end justify-center gap-[1px] h-[44px]">
                {data.code.split("").map((ch, i) => {
                  const w = (ch.charCodeAt(0) % 4) + 1;
                  return <div key={i} style={{ width: `${w}px` }} className="bg-black h-full" />;
                })}
              </div>
              <div className="text-center font-mono text-[11px] mt-1">{data.code}</div>
            </div>
          </div>
        </div>

        {/* Footer — hidden when printing */}
        <div className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="h-[30px] px-3.5 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955]"
          >
            關閉
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="h-[30px] px-3.5 rounded-full text-[12px] bg-[#1A3A5C] text-white"
          >
            列印
          </button>
        </div>
      </div>

      {/* Print-only CSS: hide everything except the label area */}
      <style>{`
        @media print {
          @page { size: 100mm 70mm; margin: 4mm; }
          body * { visibility: hidden !important; }
          #label-print-area, #label-print-area * { visibility: visible !important; }
          #label-print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; }
        }
      `}</style>
    </div>
  );
}
