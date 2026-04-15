"use client";

import { useMemo, useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { RadialGauge } from "@/components/charts/radial-gauge";

/**
 * T1 領牌風水運算器
 *
 * 評分維度：
 *   - 數字加總（1-81 姓名學吉凶）
 *   - 尾數幸運度（9/8/6 加分；4 扣分）
 *   - 重複連號（888/666/168 加成；44/74 扣分）
 *   - 易經卦象（加總 ÷ 8 取餘）
 */

// 81 靈動數吉凶（簡易版，實際姓名學分吉/吉凶參半/凶）
const AUSPICIOUS: Record<number, { grade: "大吉" | "中吉" | "吉" | "凶" | "大凶"; phrase: string }> = {
  1: { grade: "大吉", phrase: "萬事起頭，富貴名譽" },
  3: { grade: "大吉", phrase: "進取如意，名利雙收" },
  5: { grade: "大吉", phrase: "陰陽和合，福祿長壽" },
  6: { grade: "大吉", phrase: "安穩餘慶，天賦福氣" },
  7: { grade: "吉",   phrase: "精力充沛，剛毅果斷" },
  8: { grade: "大吉", phrase: "堅實耐勞，勤勉發展" },
  9: { grade: "凶",   phrase: "窮迫不遇，獨斷獨行" },
  11: { grade: "大吉", phrase: "穩健著實，勤業發展" },
  13: { grade: "大吉", phrase: "智能超群，享盡榮華" },
  15: { grade: "大吉", phrase: "福壽雙全，立身興家" },
  16: { grade: "大吉", phrase: "貴人得助，天乙貴人" },
  17: { grade: "吉",   phrase: "突破萬難，富貴逼人" },
  18: { grade: "大吉", phrase: "有志竟成，內外有運" },
  21: { grade: "大吉", phrase: "光風霽月，萬物成形" },
  23: { grade: "大吉", phrase: "旭日升天，壯麗果敢" },
  24: { grade: "大吉", phrase: "錦綉前程，多才多藝" },
  25: { grade: "吉",   phrase: "資性英邁，希臻榮達" },
  29: { grade: "中吉", phrase: "智謀兼備，克服困難" },
  31: { grade: "大吉", phrase: "智勇得志，能成大業" },
  32: { grade: "大吉", phrase: "僥倖多望，貴人相扶" },
  33: { grade: "大吉", phrase: "家門隆昌，才德開展" },
  35: { grade: "吉",   phrase: "溫和平安，智達成功" },
  37: { grade: "大吉", phrase: "逢凶化吉，吉人天相" },
  39: { grade: "大吉", phrase: "富貴榮華，變化無窮" },
  41: { grade: "大吉", phrase: "純陽獨秀，德高望重" },
  45: { grade: "大吉", phrase: "順風揚帆，能享盛名" },
  47: { grade: "大吉", phrase: "貴人得助，可享餘慶" },
  48: { grade: "大吉", phrase: "德智兼備，堪為師表" },
  52: { grade: "大吉", phrase: "先見之明，理想實現" },
  57: { grade: "吉",   phrase: "寒雪青松，春來開花" },
  61: { grade: "大吉", phrase: "名利雙收，繁榮至上" },
  63: { grade: "大吉", phrase: "萬物化育，繁榮之象" },
  65: { grade: "大吉", phrase: "富貴長壽，家運隆昌" },
  67: { grade: "大吉", phrase: "事事如意，功成名就" },
  68: { grade: "大吉", phrase: "思慮周密，發明之才" },
  81: { grade: "大吉", phrase: "萬物回春，還本歸元" },
  // 凶數
  4: { grade: "凶", phrase: "萬事休止，不祥之兆" },
  10: { grade: "大凶", phrase: "萬事空虛，徒勞無功" },
  14: { grade: "凶", phrase: "家屬緣薄，破祖離家" },
  19: { grade: "大凶", phrase: "風雲蔽日，辛苦重來" },
  20: { grade: "大凶", phrase: "智高志大，歷盡艱辛" },
  22: { grade: "凶", phrase: "秋草逢霜，困苦無助" },
  26: { grade: "凶", phrase: "變怪奇異，波瀾重疊" },
  27: { grade: "凶", phrase: "一成一敗，坎坷奔波" },
  28: { grade: "大凶", phrase: "自豪失敗，家運沉滯" },
  34: { grade: "大凶", phrase: "破家亡身，禍患百出" },
  36: { grade: "凶", phrase: "波瀾重疊，常陷窮困" },
  40: { grade: "凶", phrase: "一盛一衰，浮沉不定" },
  42: { grade: "凶", phrase: "事業不專，十九不成" },
  43: { grade: "凶", phrase: "雨夜之花，外祥內苦" },
  44: { grade: "大凶", phrase: "須防車禍，最忌騎士" },
  46: { grade: "凶", phrase: "羅網繫身，一盛一衰" },
  50: { grade: "凶", phrase: "吉凶互見，一成一敗" },
  54: { grade: "大凶", phrase: "雖傾全力，難望成功" },
  56: { grade: "凶", phrase: "有始無終，先得後失" },
  60: { grade: "大凶", phrase: "黑暗無光，心迷意亂" },
  64: { grade: "大凶", phrase: "見異思遷，十九不成" },
  69: { grade: "大凶", phrase: "動搖不安，常陷逆境" },
  70: { grade: "大凶", phrase: "慘淡經營，難免貧困" },
  74: { grade: "大凶", phrase: "秋葉逢霜，徒勞無功" },
  80: { grade: "大凶", phrase: "遁世離俗，萬事休止" },
};

const GRADE_SCORE: Record<string, number> = {
  大吉: 95, 中吉: 80, 吉: 70, 凶: 35, 大凶: 15,
};

const BAGUA = ["乾 ☰", "兌 ☱", "離 ☲", "震 ☳", "巽 ☴", "坎 ☵", "艮 ☶", "坤 ☷"];
const BAGUA_LUCK = [
  "創始之卦，剛健進取",
  "悅澤潤物，口才得利",
  "光明麗天，文明禮樂",
  "動而有為，雷厲風行",
  "謙遜入微，隨風順勢",
  "險阻坎陷，宜戒慎",
  "止而不動，守成為吉",
  "厚德載物，順承萬物",
];

function evaluate(plate: string) {
  const clean = plate.toUpperCase().replace(/\s|-/g, "");
  const digits = clean.match(/\d/g)?.map(Number) ?? [];
  if (digits.length === 0) {
    return { valid: false as const };
  }
  const sum = digits.reduce((a, b) => a + b, 0);
  const finalNum = sum > 81 ? sum % 81 || 81 : sum;
  const baguaIdx = sum % 8;

  const entry = AUSPICIOUS[finalNum] ?? { grade: "中吉" as const, phrase: "平順安穩" };
  const baseScore = GRADE_SCORE[entry.grade];

  // 尾數加權
  const tail = digits[digits.length - 1];
  const tailBonus = { 9: 6, 8: 8, 6: 4, 3: 3, 1: 2 }[tail] ?? 0;
  const tailPenalty = tail === 4 ? -10 : 0;

  // 重複 / 連號偵測
  const str = digits.join("");
  let patternBonus = 0;
  const patterns: string[] = [];
  if (/(.)\1\1/.test(str)) {
    patternBonus += 8;
    const rep = str.match(/(.)\1\1/)?.[1];
    if (rep && "689".includes(rep)) patternBonus += 6;
    patterns.push(`${rep}${rep}${rep} 三連號`);
  }
  if (str.includes("168")) {
    patternBonus += 10;
    patterns.push("168 一路發");
  }
  if (str.includes("888")) patterns.push("888 發發發");
  if (/44|74/.test(str)) {
    patternBonus -= 12;
    patterns.push("44/74 雙煞");
  }

  const score = Math.max(0, Math.min(100, baseScore + tailBonus + tailPenalty + patternBonus));

  return {
    valid: true as const,
    plate: clean,
    digits,
    sum,
    finalNum,
    grade: entry.grade,
    phrase: entry.phrase,
    bagua: BAGUA[baguaIdx],
    baguaMeaning: BAGUA_LUCK[baguaIdx],
    tailBonus,
    tailPenalty,
    patternBonus,
    patterns,
    score,
    verdict:
      score >= 85 ? "上上籤 · 值得入手" :
      score >= 70 ? "中上籤 · 可以下訂" :
      score >= 50 ? "中平籤 · 無妨可選" :
      score >= 30 ? "下籤 · 建議換牌" :
                    "下下籤 · 強烈建議重抽",
  };
}

export default function LicenseFengshuiPage() {
  useSetPageHeader({
    title: "領牌風水運算器",
    hideSearch: true,
    breadcrumb: [{ label: "工具" }, { label: "風水運算" }, { label: "領牌風水" }],
  });

  const [input, setInput] = useState("MCE-1688");
  const result = useMemo(() => evaluate(input), [input]);

  return (
    <div className="max-w-5xl mx-auto py-6 px-2 space-y-6">
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 mb-2">
              License Plate Oracle · 領牌風水運算
            </div>
            <h2 className="text-2xl font-extrabold font-display text-on-surface tracking-tight">
              車牌吉凶評估
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              81 數姓名學 × 八卦 × 尾數玄學 · 給你的車牌打個分
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="輸入車牌（如 MCE-1688）"
              maxLength={12}
              className="px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-lg text-lg font-bold font-mono tracking-widest focus:outline-none focus:border-[#CC0000] w-56 text-center"
            />
          </div>
        </div>
      </section>

      {!result.valid ? (
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center text-slate-400">
          請輸入含數字的車牌
        </section>
      ) : (
        <>
          <section className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
            <div className="bg-gradient-to-br from-[#CC0000]/5 to-amber-50 rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center justify-center">
              <RadialGauge
                size={260}
                value={result.score}
                label="吉度"
                sublabel={result.verdict}
                color={
                  result.score >= 85 ? "#059669"
                  : result.score >= 70 ? "#F59E0B"
                  : result.score >= 50 ? "#C9A84C"
                  : "#DC2626"
                }
              />
              <div className="mt-4 text-center">
                <div className="text-3xl font-mono font-black text-on-surface tracking-widest">
                  {result.plate}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  數字 {result.digits.join(" + ")} = {result.sum}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <InfoBlock
                title="姓名學靈動數"
                icon="auto_awesome"
                color="#CC0000"
              >
                <div className="flex items-center gap-4">
                  <div className="text-5xl font-extrabold font-display text-[#CC0000]">
                    {result.finalNum}
                  </div>
                  <div>
                    <div className="text-lg font-bold text-on-surface">
                      {result.grade}
                    </div>
                    <div className="text-sm text-slate-600 leading-snug">
                      {result.phrase}
                    </div>
                  </div>
                </div>
              </InfoBlock>

              <InfoBlock title="八卦對應" icon="hub" color="#0891B2">
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-extrabold font-display text-[#0891B2]">
                    {result.bagua}
                  </div>
                  <div className="text-sm text-slate-600">
                    {result.baguaMeaning}
                  </div>
                </div>
              </InfoBlock>

              <InfoBlock title="加減分項目" icon="tune" color="#F59E0B">
                <ul className="text-sm space-y-1.5">
                  {result.tailBonus > 0 && (
                    <li className="flex items-center justify-between">
                      <span className="text-slate-600">尾數 {result.digits[result.digits.length - 1]} 吉數</span>
                      <span className="text-emerald-600 font-bold">+{result.tailBonus}</span>
                    </li>
                  )}
                  {result.tailPenalty < 0 && (
                    <li className="flex items-center justify-between">
                      <span className="text-slate-600">尾數 4 避忌</span>
                      <span className="text-rose-600 font-bold">{result.tailPenalty}</span>
                    </li>
                  )}
                  {result.patterns.map((p) => (
                    <li key={p} className="flex items-center justify-between">
                      <span className="text-slate-600">{p}</span>
                      <span className={result.patternBonus >= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                        {result.patternBonus >= 0 ? `+${result.patternBonus}` : result.patternBonus}
                      </span>
                    </li>
                  ))}
                  {result.tailBonus === 0 && result.tailPenalty === 0 && result.patterns.length === 0 && (
                    <li className="text-slate-400 text-xs">此車牌無特殊加減分項</li>
                  )}
                </ul>
              </InfoBlock>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 text-xs text-slate-500 leading-relaxed">
            <strong className="text-slate-700">免責聲明：</strong>
            本工具採用 81 靈動數姓名學與易經八卦的民間通俗算法，僅供娛樂與參考。車牌吉凶不影響交通法規與駕駛安全，
            騎車守規矩、穿戴安全裝備才是最大的「吉」。
          </section>
        </>
      )}
    </div>
  );
}

function InfoBlock({
  title,
  icon,
  color,
  children,
}: {
  title: string;
  icon: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-base" style={{ color }}>
          {icon}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}
