"use client";

import dynamic from "next/dynamic";
import { useSetPageHeader } from "@/components/page-header-context";

const LunarCalendar = dynamic(() => import("@/components/lunar-calendar"), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center text-sm text-slate-400">
      載入農民曆中…
    </div>
  ),
});

export default function CalendarPage() {
  useSetPageHeader({
    title: "農民曆",
    hideSearch: true,
    breadcrumb: [{ label: "工具" }, { label: "農民曆" }],
  });
  return (
    <div className="max-w-[1600px] mx-auto py-6 px-2">
      <LunarCalendar />
    </div>
  );
}
