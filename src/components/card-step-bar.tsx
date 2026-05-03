"use client";

import Link from "next/link";

const STEPS = [
  { num: 1, symbol: "①", label: "前台登記",   href: "/sales/card/counter"    },
  { num: 2, symbol: "②", label: "需求諮詢",   href: "/sales/card/consultant" },
  { num: 3, symbol: "③", label: "試駕與成交", href: "/sales/card/closing"    },
  { num: 4, symbol: "④", label: "結案記錄",   href: "/sales/card/record"     },
] as const;

export function CardStepBar({ currentStep }: { currentStep: 1 | 2 | 3 | 4 }) {
  return (
    <div className="bg-[#F5F2FF] py-5 px-12 flex justify-between items-center relative overflow-hidden border-b border-[#1A1A2E]/10">
      <div className="absolute top-1/2 left-0 w-full h-[2px] bg-[#1A1A2E]/10 -translate-y-1/2 z-0" />
      {STEPS.map((step) => {
        const done   = step.num < currentStep;
        const active = step.num === currentStep;

        return (
          <Link
            key={step.num}
            href={step.href}
            className="relative z-10 flex flex-col items-center gap-2 group"
          >
            {done ? (
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center border-2 border-green-500 group-hover:scale-110 group-hover:shadow-md transition-all">
                <span className="material-symbols-outlined text-lg">check</span>
              </div>
            ) : active ? (
              <div className="w-12 h-12 rounded-full bg-[#C9A84C] text-white flex items-center justify-center border-4 border-white shadow-xl ring-2 ring-[#C9A84C]">
                <span className="font-bold text-lg">{step.num}</span>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#E2E0FC] text-[#47464C] flex items-center justify-center border-2 border-[#C6C4DF] group-hover:border-[#C9A84C] group-hover:text-[#C9A84C] group-hover:scale-110 transition-all">
                <span className="font-bold">{step.num}</span>
              </div>
            )}
            <span className={`transition-colors ${
              active
                ? "text-sm font-bold text-[#1A1A2E]"
                : done
                  ? "text-xs font-bold text-green-700 group-hover:text-green-800"
                  : "text-xs font-medium text-[#47464C]/60 group-hover:text-[#47464C]"
            }`}>
              {step.symbol} {step.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
