"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useActiveScope } from "@/lib/scope/scope-context";
import { setActiveScopeAction } from "@/lib/scope/active-scope-action";
import { brands as brandConfigs } from "@/lib/brands/registry";

/**
 * Topbar 右側 brand + store 切換器。
 *
 * 顯示：「{brand 中文名} / {store 名 or 全部店}」 + 下拉箭頭
 * 點開：兩段 dropdown — 上半切 brand、下半切 store（限當前 brand 下可進入的店）
 */
export function ScopeSwitcher() {
  const { brand_id, store_id, accessibleBrands, accessibleStores } = useActiveScope();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement | null>(null);

  // click outside 關掉 dropdown
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const brandLabel = brandConfigs[brand_id]?.displayName ?? brand_id;
  const storeLabel = store_id
    ? accessibleStores.find((s) => s.id === store_id)?.name ?? "(未知店)"
    : "全部店";

  const apply = (nextBrand: string, nextStore: string | null) => {
    if (nextBrand === brand_id && nextStore === store_id) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      await setActiveScopeAction(nextBrand, nextStore);
      setOpen(false);
      router.refresh();
    });
  };

  // 沒有任何可存取 brand → 不渲染
  if (accessibleBrands.length === 0) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="flex items-center gap-1 leading-tight text-[10.5px] text-white font-medium whitespace-nowrap px-2 py-1 rounded hover:bg-white/10 transition-colors disabled:opacity-60"
        title="切換品牌 / 門店"
      >
        <span>{brandLabel}</span>
        <span className="mx-1 text-white/40">/</span>
        <span>{storeLabel}</span>
        <span className="material-symbols-outlined text-[14px] text-white/70">
          {pending ? "progress_activity" : "expand_more"}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+4px)] w-[260px] bg-white border border-[#EEECE6] rounded-lg shadow-lg z-[80] overflow-hidden text-[#2C2C2A]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Brand 區 */}
          <div className="px-3 py-2 text-[10.5px] text-[#9A9890] uppercase tracking-wider bg-[#F8F7F4] border-b border-[#EEECE6]">
            品牌
          </div>
          <ul className="max-h-[180px] overflow-y-auto">
            {accessibleBrands.map((b) => {
              const cfg = brandConfigs[b];
              const active = b === brand_id;
              return (
                <li key={b}>
                  <button
                    type="button"
                    onClick={() => apply(b, null)}
                    className={`w-full text-left px-3 py-2 text-[12.5px] flex items-center gap-2 ${
                      active ? "bg-[#EAF4FB] font-medium" : "hover:bg-[#F8F7F4]"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: cfg?.primaryColor ?? "#1A3A5C" }}
                    />
                    <span className="flex-1">{cfg?.displayName ?? b}</span>
                    {active && (
                      <span className="material-symbols-outlined text-[16px] text-[#185FA5]">
                        check
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Store 區 */}
          <div className="px-3 py-2 text-[10.5px] text-[#9A9890] uppercase tracking-wider bg-[#F8F7F4] border-y border-[#EEECE6]">
            門店（限 {brandLabel}）
          </div>
          <ul className="max-h-[200px] overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => apply(brand_id, null)}
                className={`w-full text-left px-3 py-2 text-[12.5px] flex items-center gap-2 ${
                  store_id === null ? "bg-[#EAF4FB] font-medium" : "hover:bg-[#F8F7F4]"
                }`}
              >
                <span className="flex-1">全部店</span>
                {store_id === null && (
                  <span className="material-symbols-outlined text-[16px] text-[#185FA5]">
                    check
                  </span>
                )}
              </button>
            </li>
            {accessibleStores.length === 0 ? (
              <li className="px-3 py-2 text-[11.5px] text-[#9A9890] italic">
                此品牌下無可進入的門店
              </li>
            ) : (
              accessibleStores.map((s) => {
                const active = s.id === store_id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => apply(brand_id, s.id)}
                      className={`w-full text-left px-3 py-2 text-[12.5px] flex items-center gap-2 ${
                        active ? "bg-[#EAF4FB] font-medium" : "hover:bg-[#F8F7F4]"
                      }`}
                    >
                      <span className="flex-1">{s.short_name ?? s.name}</span>
                      {active && (
                        <span className="material-symbols-outlined text-[16px] text-[#185FA5]">
                          check
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
