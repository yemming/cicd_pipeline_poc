"use client";

import { useState, useCallback, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { CommandPalette } from "@/components/command-palette";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <Sidebar />
      <Topbar onOpenSearch={openSearch} />

      <main className="ml-64 mt-16 min-h-[calc(100dvh-4rem)] bg-[#F5F5F5] p-8">
        {children}
      </main>

      <CommandPalette open={searchOpen} onClose={closeSearch} />

      {/* FAB */}
      <button className="fixed bottom-8 right-8 w-14 h-14 bg-[#C9A84C] text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-50">
        <span
          className="material-symbols-outlined text-3xl"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          add
        </span>
      </button>
    </>
  );
}
