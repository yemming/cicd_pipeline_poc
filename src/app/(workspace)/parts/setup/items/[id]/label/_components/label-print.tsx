"use client";

import { useEffect } from "react";

export function LabelPrint({
  item,
}: {
  item: {
    code: string;
    name: string;
    spec_description: string | null;
    category: string | null;
    control_type: string | null;
    base_uom: string | null;
    suggested_price: number | null;
    suppliers: { name: string } | null;
  };
}) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-[#F2F2F2] p-6 print:bg-white print:p-0">
      <div className="max-w-md mx-auto bg-white border-2 border-black rounded p-6 print:border-black print:rounded-none">
        <div className="text-center border-b-2 border-black pb-2 mb-3">
          <div className="text-[10px] uppercase tracking-widest text-gray-600">DealerOS · Parts Label</div>
          <div className="text-[24px] font-bold font-mono mt-1">{item.code}</div>
        </div>
        <div className="text-[16px] font-semibold mb-1">{item.name}</div>
        {item.spec_description ? (
          <div className="text-[12px] text-gray-700 mb-3">{item.spec_description}</div>
        ) : <div className="mb-3" />}

        <div className="grid grid-cols-2 gap-2 text-[12px] border-t border-gray-300 pt-3">
          {item.category ? (<><div className="text-gray-500">品類</div><div className="font-medium">{item.category}</div></>) : null}
          {item.control_type ? (<><div className="text-gray-500">管控</div><div className="font-medium">{item.control_type} 類</div></>) : null}
          {item.base_uom ? (<><div className="text-gray-500">單位</div><div className="font-medium">{item.base_uom}</div></>) : null}
          {item.suggested_price ? (<><div className="text-gray-500">建議售價</div><div className="font-mono font-medium">NT$ {Number(item.suggested_price).toLocaleString("en-US")}</div></>) : null}
          {item.suppliers ? (<><div className="text-gray-500">供應商</div><div className="font-medium">{item.suppliers.name}</div></>) : null}
        </div>

        {/* Stripe-style barcode placeholder */}
        <div className="mt-4 border-t border-gray-300 pt-3">
          <div className="flex items-end justify-center gap-[1px] h-[44px]">
            {item.code.split("").map((ch, i) => {
              const w = (ch.charCodeAt(0) % 4) + 1;
              return <div key={i} style={{ width: `${w}px` }} className="bg-black h-full" />;
            })}
          </div>
          <div className="text-center font-mono text-[11px] mt-1">{item.code}</div>
        </div>

        <div className="mt-4 text-[10px] text-gray-400 text-center">
          列印時間：{new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
        </div>
      </div>

      <div className="mt-4 text-center print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="h-[32px] px-4 rounded text-[12.5px] bg-[#1A3A5C] text-white"
        >
          列印
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="ml-2 h-[32px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB]"
        >
          關閉
        </button>
      </div>

      <style>{`
        @media print {
          @page { size: 100mm 70mm; margin: 4mm; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}
