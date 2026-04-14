"use client";

import { useSetPageHeader } from "@/components/page-header-context";

const MODELS = [
  {
    id: "diavel",
    name: "Diavel V4",
    category: "CRUISER",
    price: "NT$1,480,000+",
    img: "/bikes/hero/hero-monster.jpg",
    accent: "#CC0000",
  },
  {
    id: "multistrada",
    name: "Multistrada V4 PP",
    category: "ADVENTURE",
    price: "NT$1,680,000+",
    img: "/bikes/hero/hero-4.jpg",
    accent: "#4A90E2",
  },
  {
    id: "panigale",
    name: "Panigale V4 S",
    category: "SUPERBIKE",
    price: "NT$1,720,000+",
    img: "/bikes/thumbs/desertx.png",
    accent: "#CC0000",
  },
  {
    id: "scrambler",
    name: "Scrambler FT",
    category: "SCRAMBLER",
    price: "NT$628,000+",
    img: "/bikes/hero/lifestyle-3.jpg",
    accent: "#C9A84C",
  },
];

const SPECS = [
  { label: "引擎", value: "Testastretta V4 1158cc" },
  { label: "最大馬力", value: "168 hp @ 10,750 rpm" },
  { label: "最大扭力", value: "12.74 kgf·m @ 7,500 rpm" },
  { label: "乾重", value: "210 kg" },
  { label: "油箱容量", value: "17 L" },
  { label: "座高", value: "780 mm" },
  { label: "前懸吊", value: "Öhlins 倒叉 43mm" },
  { label: "後懸吊", value: "Öhlins TTX36 中置" },
];

const FEATURES = [
  "Ducati Traction Control",
  "Cornering ABS",
  "Ducati Wheelie Control",
  "4 騎乘模式",
  "Öhlins 懸吊",
  "快排系統",
];

const SWATCHES = [
  { color: "#CC0000", name: "Ducati 紅" },
  { color: "#1A1A2E", name: "暗夜黑" },
  { color: "#B8B8B8", name: "珠光銀" },
  { color: "#2D4A3E", name: "叢林綠" },
];

export default function ModelsPage() {
  useSetPageHeader({
    title: "車型資訊",
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "車型資訊" },
    ],
  });

  return (
    <div className="-m-4 md:-m-8 bg-[#FCF8FF] min-h-[calc(100dvh-4rem)] pt-8 px-8 pb-12 flex gap-8">
      {/* Left: Model Grid */}
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6 content-start">
        {MODELS.map((m) => (
          <div
            key={m.id}
            className={`bg-white rounded-2xl overflow-hidden shadow-sm border cursor-pointer group transition-all hover:shadow-md ${
              m.id === "diavel"
                ? "border-[#CC0000]/50 ring-1 ring-[#CC0000]/20"
                : "border-[#1A1A2E]/8 hover:border-[#CC0000]/30"
            }`}
          >
            <div className="h-44 bg-gradient-to-br from-[#1A1A2E] to-[#0F0F1F] flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.img}
                alt={m.name}
                className="max-w-[85%] max-h-[85%] object-contain group-hover:scale-105 transition-transform duration-500"
              />
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p
                    className="text-[10px] font-bold tracking-widest"
                    style={{ color: m.accent }}
                  >
                    {m.category}
                  </p>
                  <h3 className="font-bold text-[#1A1A2E] text-lg mt-0.5">{m.name}</h3>
                </div>
                <p className="font-bold text-[#CC0000] text-base shrink-0">{m.price}</p>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <button className="flex-1 bg-[#1A1A2E] hover:bg-[#2D2D50] text-white text-xs font-bold py-2 rounded-xl transition-colors">
                  查看規格
                </button>
                <button className="flex-1 bg-[#CC0000] hover:bg-[#AA0000] text-white text-xs font-bold py-2 rounded-xl transition-colors">
                  建立報價
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Right: Specs Aside */}
      <aside className="w-96 flex flex-col gap-4">
        {/* Current Selection — dark navy */}
        <div className="bg-[#1A1A2E] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-white/50 text-xs font-bold tracking-widest uppercase">
              Current Selection
            </span>
            <span className="text-[10px] font-bold text-[#CC0000] bg-[#CC0000]/20 px-2 py-0.5 rounded">
              CRUISER
            </span>
          </div>
          <h3 className="text-white font-bold text-2xl mb-4">Diavel V4</h3>

          <div className="space-y-2">
            {SPECS.map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-white/50 text-xs">{s.label}</span>
                <span className="text-white text-xs font-bold">{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 配備亮點 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#1A1A2E]/8">
          <h4 className="font-bold text-[#1A1A2E] text-sm mb-3">配備亮點</h4>
          <div className="flex flex-wrap gap-2">
            {FEATURES.map((f) => (
              <span
                key={f}
                className="text-[11px] font-bold bg-[#FCF8FF] text-[#1A1A2E] border border-[#1A1A2E]/10 px-2.5 py-1 rounded-full"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* 在庫現車狀態 / 顏色 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#1A1A2E]/8">
          <h4 className="font-bold text-[#1A1A2E] text-sm mb-3">在庫現車狀態</h4>
          <div className="flex flex-wrap gap-3">
            {SWATCHES.map((sw) => (
              <div key={sw.name} className="flex flex-col items-center gap-1">
                <div
                  className="w-8 h-8 rounded-full ring-2 ring-offset-2 ring-[#1A1A2E]/10"
                  style={{ backgroundColor: sw.color }}
                />
                <span className="text-[10px] text-[#1A1A2E]/60">{sw.name}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="text-[#1A1A2E]/50">現車庫存</span>
            <span className="font-bold text-[#1A1A2E]">2 輛可用</span>
          </div>
        </div>

        {/* CTA */}
        <button className="w-full bg-[#CC0000] hover:bg-[#AA0000] text-white font-bold py-4 rounded-2xl transition-colors text-base flex items-center justify-center gap-2">
          <span className="material-symbols-outlined">request_quote</span>
          建立購車報價
        </button>
      </aside>
    </div>
  );
}
