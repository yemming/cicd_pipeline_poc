"use client";

import { useState } from "react";
import Image from "next/image";
import { MockShell, MockCard } from "../_mock/mock-shell";
import { ducatiModels, DUCATI_FAMILIES, formatNTD, type DucatiFamily } from "@/lib/ducati-models";

export default function Page() {
  const [family, setFamily] = useState<DucatiFamily | "全部">("全部");
  const list =
    family === "全部" ? ducatiModels : ducatiModels.filter((m) => m.family === family);

  return (
    <MockShell
      title="車型管理"
      breadcrumb={[{ label: "系統設定", href: "/settings/org" }, { label: "車型管理" }]}
      tabs={[
        { label: "車型清單", active: true },
        { label: "配色與車色" },
        { label: "標配/選配" },
      ]}
    >
      <MockCard
        title="Ducati 車型"
        action={
          <button className="h-9 px-4 rounded-lg bg-[#CC0000] text-white text-sm font-medium hover:bg-[#a80000] flex items-center gap-1">
            <span className="material-symbols-outlined text-base">add</span>
            新增車型
          </button>
        }
      >
        <div className="flex flex-wrap gap-2 mb-5">
          {(["全部", ...DUCATI_FAMILIES] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFamily(f)}
              className={
                family === f
                  ? "px-3 py-1.5 rounded-full bg-[#CC0000] text-white text-xs font-medium"
                  : "px-3 py-1.5 rounded-full bg-surface-container-low text-on-surface-variant text-xs font-medium hover:bg-surface-container-high"
              }
            >
              {f}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-outline-variant/20 bg-white overflow-hidden hover:border-[#CC0000]/40 hover:shadow-md transition-all"
            >
              <div className="h-36 bg-gradient-to-br from-[#1A1A2E] to-[#0F0F1F] relative flex items-center justify-center">
                <Image
                  src={m.thumb}
                  alt={m.name}
                  width={320}
                  height={170}
                  className="max-w-[90%] max-h-[90%] object-contain"
                  unoptimized
                />
                {m.isNew && (
                  <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded bg-[#CC0000] text-white">
                    NEW
                  </span>
                )}
                <span className="absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded bg-white/90 text-on-surface">
                  {m.family}
                </span>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <div className="font-bold text-on-surface font-display">{m.name}</div>
                </div>
                <div className="text-[11px] text-on-surface-variant mb-3 truncate">
                  {m.tagline}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <Stat value={`${m.hp}`} unit="hp" />
                  <Stat value={`${m.torqueNm}`} unit="Nm" />
                  <Stat value={m.dryWeightKg ? `${m.dryWeightKg}` : "—"} unit="kg 乾重" />
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-outline-variant/15">
                  <span className="text-xs text-on-surface-variant">建議售價</span>
                  <span className="text-sm font-bold text-[#CC0000]">{formatNTD(m.priceNTD)}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {m.colors.map((c) => (
                    <span
                      key={c}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </MockCard>
    </MockShell>
  );
}

function Stat({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="rounded-lg bg-surface-container-low py-2">
      <div className="text-sm font-bold text-on-surface leading-tight">{value}</div>
      <div className="text-[10px] text-on-surface-variant">{unit}</div>
    </div>
  );
}
