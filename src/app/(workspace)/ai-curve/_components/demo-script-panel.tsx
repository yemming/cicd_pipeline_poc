"use client";

/**
 * Demo Script 面板 — 錄音中顯示在計時器下方、業務照唸
 * 兩個劇本切 tabs：A 換車老客戶 / B 純探詢
 */

import { useState } from "react";

type ScriptLine = { role: "RS" | "客戶"; text: string };

type Script = {
  key: string;
  title: string;
  duration: string;
  lines: ScriptLine[];
};

const SCRIPTS: Script[] = [
  {
    key: "A",
    title: "換車老客戶",
    duration: "約 30 秒",
    lines: [
      { role: "RS", text: "先生你好，第一次來嗎？" },
      { role: "客戶", text: "對啊，是朋友介紹的、他上次看過 Diavel V4。" },
      { role: "客戶", text: "我現在騎 ER-6n、騎五年想換大一點的。" },
      { role: "RS", text: "您喜歡街車還是 cruiser？" },
      { role: "客戶", text: "我比較想看 Diavel V4、外型蠻喜歡的。" },
      { role: "客戶", text: "朋友最近也在比 Honda CB1000R、叫我順便看看。" },
      { role: "RS", text: "預算大概抓多少？" },
      { role: "客戶", text: "100 萬上下、半年內買、不用急。" },
      { role: "RS", text: "下週五展廳有試駕活動、要約一下嗎？" },
      { role: "客戶", text: "好啊、5 月 30 號早上 10 點。" },
    ],
  },
  {
    key: "B",
    title: "純探詢客戶",
    duration: "約 25 秒",
    lines: [
      { role: "RS", text: "歡迎光臨、今天看什麼車？" },
      { role: "客戶", text: "嗨、網路上看到 Scrambler 1100、想說來看實車。" },
      { role: "RS", text: "您是想入手嗎？" },
      { role: "客戶", text: "嗯⋯ 還在想、可能明年吧。" },
      { role: "客戶", text: "現在主要比較幾個品牌、也看 KTM Duke 系列。" },
      { role: "RS", text: "那我留個聯絡方式、新車到再通知您？" },
      { role: "客戶", text: "好啊、謝謝。" },
    ],
  },
];

export function DemoScriptPanel() {
  const [active, setActive] = useState(0);
  const script = SCRIPTS[active];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-[#EEECE6] overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center border-b border-[#EEECE6] bg-[#F8F7F4]">
        <div className="px-3 py-2 text-[11px] text-[#9A9890] font-medium uppercase tracking-wider">
          📋 範例腳本
        </div>
        <div className="flex-1" />
        <div className="flex">
          {SCRIPTS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setActive(i)}
              className={`px-3 py-2 text-[12px] font-medium border-l border-[#EEECE6] ${
                active === i
                  ? "bg-white text-[#7C3AED]"
                  : "text-[#5A5955] hover:bg-white/50"
              }`}
            >
              劇本 {s.key}
            </button>
          ))}
        </div>
      </div>

      {/* Script body */}
      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between mb-2.5">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            {script.title}
          </span>
          <span className="text-[11px] text-[#9A9890]">{script.duration}</span>
        </div>
        <div className="space-y-1.5">
          {script.lines.map((line, i) => (
            <div key={i} className="flex gap-2 text-[13px] leading-relaxed">
              <span
                className={`shrink-0 w-9 text-[11px] font-semibold pt-0.5 ${
                  line.role === "RS" ? "text-[#7C3AED]" : "text-[#185FA5]"
                }`}
              >
                {line.role}：
              </span>
              <span className="text-[#2C2C2A]">{line.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
