"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/org/groups", label: "集團", hint: "group — 最頂層代理商" },
  { href: "/admin/org/brands", label: "品牌", hint: "brand — 全域字典" },
  { href: "/admin/org/stores", label: "門店", hint: "store — organizations 表" },
];

export function OrgTabs() {
  const pathname = usePathname();
  return (
    <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
      <div className="flex border-b border-[#EEECE6]">
        {TABS.map((t) => {
          const active = pathname?.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-4 h-[40px] text-[12.5px] flex items-center whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
                active
                  ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                  : "text-[#5A5955] hover:bg-[#F8F7F4]"
              }`}
              title={t.hint}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
