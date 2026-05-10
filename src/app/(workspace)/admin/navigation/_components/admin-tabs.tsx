"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export type AdminTabKey = "nav" | "brand" | "roles" | "permissions" | "users";

const TABS: Array<{ key: AdminTabKey; label: string; hint: string }> = [
  { key: "nav",         label: "導覽選單",   hint: "nav_nodes 三層樹 CRUD" },
  { key: "brand",       label: "品牌與模組", hint: "Logo / Tagline / 訂閱式模組" },
  { key: "roles",       label: "角色",       hint: "管理可指派的角色（List + Detail）" },
  { key: "permissions", label: "權限",       hint: "選角色 → 編輯該角色的 permission" },
  { key: "users",       label: "使用者授權", hint: "user_assignments 管理" },
];

export function AdminTabs({ active }: { active: AdminTabKey }) {
  const sp = useSearchParams();

  return (
    <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
      <div className="flex border-b border-[#EEECE6]">
        {TABS.map((t) => {
          const isActive = t.key === active;
          const params = new URLSearchParams(sp.toString());
          params.set("tab", t.key);
          return (
            <Link
              key={t.key}
              href={`?${params.toString()}`}
              scroll={false}
              className={`px-4 h-[40px] text-[12.5px] flex items-center gap-2 whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
                isActive
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
