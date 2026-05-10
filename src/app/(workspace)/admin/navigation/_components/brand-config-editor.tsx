"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";

import { updateBrandAppearance, uploadBrandBadge, removeBrandBadge } from "@/lib/appearance-actions";
import { setBrandModuleEnabledAction } from "@/lib/rbac/admin-actions";

type BrandRow = { id: string; name: string };
type ModuleEntry = { key: string; name: string };
type BrandModuleRow = { brand_id: string; module_key: string; enabled: boolean };

export function BrandConfigEditor({
  brandName,
  initial,
  brands,
  allModules,
  brandModules,
}: {
  brandKey: string;
  brandName: string;
  initial: {
    dashboard_tagline: string;
    footer_badge_url: string | null;
  };
  brands: BrandRow[];
  allModules: ModuleEntry[];
  brandModules: BrandModuleRow[];
}) {
  const [tagline, setTagline] = useState(initial.dashboard_tagline ?? "");
  const [badge, setBadge] = useState(initial.footer_badge_url);
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // brand_modules in-memory（optimistic）
  const [matrix, setMatrix] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const r of brandModules) out[`${r.brand_id}::${r.module_key}`] = r.enabled;
    return out;
  });

  const flash = (ok: boolean, msg: string) => {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  };

  const isEnabled = (b: string, m: string) => matrix[`${b}::${m}`] ?? true;

  const saveTagline = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("dashboard_tagline", tagline);
      try {
        await updateBrandAppearance(fd);
        flash(true, "✓ Tagline 已儲存");
      } catch (e) {
        flash(false, `儲存失敗：${(e as Error).message}`);
      }
    });
  };

  const onUpload = (file: File) => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", file);
      try {
        const res = await uploadBrandBadge(fd);
        setBadge(res.url);
        flash(true, "✓ Logo 已上傳");
      } catch (e) {
        flash(false, `上傳失敗：${(e as Error).message}`);
      }
    });
  };

  const onRemove = () => {
    if (!confirm("確定移除目前 Logo？")) return;
    startTransition(async () => {
      try {
        await removeBrandBadge();
        setBadge(null);
        flash(true, "✓ Logo 已移除");
      } catch (e) {
        flash(false, `移除失敗：${(e as Error).message}`);
      }
    });
  };

  const toggleModule = (b: string, m: string) => {
    const next = !isEnabled(b, m);
    setMatrix((prev) => ({ ...prev, [`${b}::${m}`]: next }));
    startTransition(async () => {
      const res = await setBrandModuleEnabledAction(b, m, next);
      if (!res.ok) {
        setMatrix((prev) => ({ ...prev, [`${b}::${m}`]: !next }));
        flash(false, `儲存失敗：${res.error}`);
      } else {
        flash(true, `✓ ${b} / ${m} → ${next ? "開啟" : "關閉"}`);
      }
    });
  };

  return (
    <div className="space-y-3">
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

      {/* ── 1. 當前品牌的 Logo & Tagline ── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 品牌識別</span>
          <span className="px-1.5 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5] text-[11px] font-medium">
            {brandName}
          </span>
          <span className="text-[11.5px] text-[#9A9890]">
            （切換至其他品牌請用右上角 brand 切換器）
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
          {/* Logo upload */}
          <div className="space-y-2">
            <label className="text-[11px] text-[#9A9890] font-medium">品牌 Logo（topbar / footer）</label>
            <div className="bg-[#1A3A5C] rounded-lg p-3 flex items-center justify-center h-[120px]">
              {badge ? (
                <Image
                  src={badge}
                  alt={brandName}
                  width={240}
                  height={56}
                  unoptimized
                  className="max-h-full w-auto max-w-full object-contain brightness-0 invert"
                />
              ) : (
                <span className="text-white/50 text-[12px] italic">尚未上傳</span>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
              }}
            />
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={pending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                {pending ? "處理中⋯" : badge ? "更換 Logo" : "上傳 Logo"}
              </button>
              {badge && (
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={pending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                >
                  移除
                </button>
              )}
            </div>
            <p className="text-[10.5px] text-[#9A9890]">PNG/JPG/WebP/SVG ≤ 5MB</p>
          </div>

          {/* Tagline */}
          <div className="space-y-2">
            <label className="text-[11px] text-[#9A9890] font-medium">
              Dashboard Tagline（首頁副標 / sidebar 底部 EDITION 字樣）
            </label>
            <input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="例：DUCATI TAIPEI OFFICIAL DEALER"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-full"
            />
            <button
              type="button"
              onClick={saveTagline}
              disabled={pending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              {pending ? "儲存中⋯" : "儲存 Tagline"}
            </button>
            <p className="text-[10.5px] text-[#9A9890]">
              留空 = fallback 到「{brandName.toUpperCase()} OFFICIAL DEALER」
            </p>
            <div className="mt-3 pt-3 border-t border-[#F8F7F4] text-[10.5px] text-[#9A9890]">
              ℹ️ 「佈景主題」與「配色」已下放給每位使用者個人化（個人設定頁），這裡不再控制。
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. 訂閱式模組矩陣 ── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 品牌可用模組（訂閱式）</span>
          <span className="text-[11.5px] text-[#9A9890]">
            勾選 = 該品牌使用者進站可看到該模組；未來大模組訂閱制由此控管
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[11px] text-[#9A9890] bg-[#FBFAF7]">
              <tr>
                <th className="text-left font-medium py-2 px-3 sticky left-0 bg-[#FBFAF7] z-10">
                  模組 \ 品牌
                </th>
                {brands.map((b) => (
                  <th key={b.id} className="text-center font-medium py-2 px-3 whitespace-nowrap">
                    {b.name}
                    <div className="text-[10px] text-[#9A9890] font-normal font-mono">{b.id}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allModules.length === 0 ? (
                <tr>
                  <td colSpan={brands.length + 1} className="py-4 text-center text-[#9A9890] italic">
                    尚未在 nav_nodes 找到 module_key — 先到「導覽選單」建立 level=1 模組
                  </td>
                </tr>
              ) : (
                allModules.map((m) => (
                  <tr key={m.key} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                    <td className="py-2 px-3 font-medium sticky left-0 bg-white z-10">
                      <div>{m.name}</div>
                      <div className="text-[10px] text-[#9A9890] font-mono">{m.key}</div>
                    </td>
                    {brands.map((b) => {
                      const on = isEnabled(b.id, m.key);
                      return (
                        <td key={b.id} className="text-center py-2 px-3">
                          <button
                            type="button"
                            onClick={() => toggleModule(b.id, m.key)}
                            disabled={pending}
                            className={`w-9 h-5 rounded-full transition-colors relative ${
                              on ? "bg-[#0F6E56]" : "bg-[#D5D3CB]"
                            } disabled:opacity-60`}
                            title={on ? "已開啟" : "已關閉"}
                          >
                            <span
                              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                                on ? "left-[18px]" : "left-0.5"
                              }`}
                            />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
