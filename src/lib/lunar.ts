import { Solar } from "lunar-typescript";

/**
 * lunar-typescript 輸出簡中，這裡做 term-level 繁化。
 * 2020-2039 年全日期枚舉共出現 114 個宜忌詞，以下列出需要轉換的條目。
 */
const S2T: Record<string, string> = {
  "上梁": "上樑",
  "习艺": "習藝",
  "会亲友": "會親友",
  "作梁": "作樑",
  "修坟": "修墳",
  "修门": "修門",
  "修饰垣墙": "修飾垣牆",
  "入学": "入學",
  "入殓": "入殮",
  "出货财": "出貨財",
  "动土": "動土",
  "取渔": "取漁",
  "合寿木": "合壽木",
  "合帐": "合帳",
  "启钻": "啟鑽",
  "坏垣": "壞垣",
  "塑绘": "塑繪",
  "安机械": "安機械",
  "安门": "安門",
  "平治道涂": "平治道塗",
  "开仓": "開倉",
  "开光": "開光",
  "开厕": "開廁",
  "开市": "開市",
  "开柱眼": "開柱眼",
  "开池": "開池",
  "开渠": "開渠",
  "开生坟": "開生墳",
  "归宁": "歸寧",
  "归岫": "歸岫",
  "扫舍": "掃舍",
  "挂匾": "掛匾",
  "教牛马": "教牛馬",
  "斋醮": "齋醮",
  "断蚁": "斷蟻",
  "无": "無",
  "架马": "架馬",
  "栽种": "栽種",
  "求医": "求醫",
  "牧养": "牧養",
  "理发": "理髮",
  "畋猎": "畋獵",
  "盖屋": "蓋屋",
  "竖柱": "豎柱",
  "筑堤": "築堤",
  "纳婿": "納婿",
  "纳畜": "納畜",
  "纳财": "納財",
  "纳采": "納采",
  "经络": "經絡",
  "结网": "結網",
  "置产": "置產",
  "行丧": "行喪",
  "补垣": "補垣",
  "订盟": "訂盟",
  "词讼": "詞訟",
  "诸事不宜": "諸事不宜",
  "谢土": "謝土",
  "进人口": "進人口",
  "造仓": "造倉",
  "造庙": "造廟",
  "造桥": "造橋",
  "造车器": "造車器",
  "针灸": "針灸",
  "问名": "問名",
  "雇佣": "僱傭",
  "馀事勿取": "餘事勿取",
};

/** 單一宜忌詞繁化（找不到對映就原樣回傳） */
export const s2tTerm = (term: string): string => S2T[term] ?? term;

/**
 * 字級繁化對映表。
 * 來源：2026-2028 全日期枚舉 lunar-typescript 所有輸出欄位（宜忌、沖煞、彭祖、
 * 方位、吉神、節氣、生肖、月份、天神）蒐集到的 simp-only 字；加上常見節氣補漏。
 */
const CHAR_MAP: Record<string, string> = {
  // 農曆月 / 天神
  腊: "臘", 闰: "閏", 黄: "黃",
  // 生肖
  马: "馬", 龙: "龍", 鸡: "雞", 猪: "豬",
  // 節氣
  惊: "驚", 蛰: "蟄", 满: "滿", 种: "種", 处: "處",
  // 方位 / 常用
  东: "東", 长: "長", 问: "問", 头: "頭", 见: "見", 财: "財",
  // 宜忌 / 彭祖 / 沖煞 常用
  经: "經", 络: "絡", 词: "詞", 讼: "訟", 还: "還", 远: "遠",
  驿: "驛", 护: "護", 无: "無", 织: "織", 药: "藥", 续: "續",
  门: "門", 开: "開", 关: "關", 丧: "喪", 临: "臨", 乡: "鄉",
  仓: "倉", 仪: "儀", 会: "會", 匮: "匱", 医: "醫", 圣: "聖",
  宝: "寶", 对: "對", 尝: "嘗", 带: "帶", 并: "並", 张: "張",
  强: "強", 愿: "願", 敌: "敵", 时: "時", 机: "機", 气: "氣",
  灾: "災", 疮: "瘡", 盖: "蓋", 祸: "禍", 肠: "腸", 阴: "陰",
  难: "難", 颠: "顛", 动: "動", 顺: "順", 顾: "顧", 师: "師",
  营: "營", 厂: "廠", 历: "曆", 计: "計", 记: "記", 讲: "講",
  许: "許", 论: "論", 诉: "訴", 请: "請", 读: "讀", 课: "課",
  谁: "誰", 谅: "諒", 谈: "談", 谊: "誼", 谋: "謀", 谏: "諫",
  谐: "諧", 谢: "謝", 谨: "謹", 谷: "穀",
  诸: "諸", 发: "發", 货: "貨", 习: "習",
  贵: "貴", 订: "訂", 买: "買", 卖: "賣",
  严: "嚴", 乱: "亂", 书: "書", 丢: "丟",
  专: "專", 众: "眾", 团: "團", 双: "雙",
  岁: "歲", 万: "萬", 与: "與", 个: "個",
  样: "樣", 齐: "齊", 剧: "劇", 灯: "燈",
  车: "車", 斋: "齋", 针: "針", 纳: "納",
  结: "結", 阳: "陽", 产: "產", 养: "養",
  阵: "陣", 绘: "繪", 继: "繼", 绪: "緒",
  缘: "緣", 线: "線", 乐: "樂", 宁: "寧",
  审: "審", 实: "實", 进: "進", 鸣: "鳴",
  厕: "廁", 后: "後",
};

/** 字級繁化：整段字串逐字替換（未列於字典的字原樣保留） */
export const s2tChars = (s: string): string => {
  let out = "";
  for (const c of s) out += CHAR_MAP[c] ?? c;
  return out;
};

/** 先 term-level 後 char-level 的組合繁化，通吃詞與句子 */
const s2tAll = (s: string): string => s2tChars(s2tTerm(s));

export interface TimeInfo {
  name: string;        // 子/丑/寅…
  range: string;       // "23:00–00:59"
  ganZhi: string;      // 時柱干支（繁化）
  tianShen: string;    // 黃道 / 黑道
  isAuspicious: boolean;
  yi: string[];        // 該時辰宜
  ji: string[];        // 該時辰忌
  chong: string;       // 沖煞（繁化）
}

export interface DayInfo {
  // 公曆
  solarYear: number;
  solarMonth: number;
  solarDay: number;
  dayOfWeek: number;

  // 農曆
  lunarYear: string;
  lunarMonth: string;
  lunarDay: string;
  isLeapMonth: boolean;

  // 三柱干支
  yearGanZhi: string;   // 年柱，例「丙午馬年」
  monthGanZhi: string;  // 月柱，例「壬辰月」
  ganZhi: string;       // 日柱，例「己未日」

  // 黃曆
  yi: string[];
  ji: string[];
  jieQi: string | null;                                  // 當日節氣（若是）
  jieQiPeriod: { name: string; from: string; to: string } | null;  // 所在節氣期間
  isAuspicious: boolean;
  tianShen: string;

  // 神煞 / 方位
  jiShen: string[];
  pengZu: string[];
  chong: string;
  positionXi: string;
  positionFu: string;
  positionCai: string;

  // 12 時辰
  times: TimeInfo[];
}

const ZHI_NAMES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const ZHI_RANGES: Record<string, string> = {
  子: "23:00–00:59", 丑: "01:00–02:59", 寅: "03:00–04:59", 卯: "05:00–06:59",
  辰: "07:00–08:59", 巳: "09:00–10:59", 午: "11:00–12:59", 未: "13:00–14:59",
  申: "15:00–16:59", 酉: "17:00–18:59", 戌: "19:00–20:59", 亥: "21:00–22:59",
};

type MaybeDate = { toYmd?: () => string };
const ymdOf = (s: unknown): string => {
  const anyS = s as MaybeDate;
  return typeof anyS?.toYmd === "function" ? anyS.toYmd() : "";
};

export function getDayInfo(year: number, month: number, day: number): DayInfo {
  const solar = Solar.fromYmd(year, month, day);
  const lunar = solar.getLunar();

  const monthChinese = lunar.getMonthInChinese();
  const tianShen = s2tChars(lunar.getDayTianShenType());
  const jieQiToday = lunar.getJieQi();

  // 所在節氣期間：prev 節氣日 → next 節氣日前一天
  let jieQiPeriod: DayInfo["jieQiPeriod"] = null;
  try {
    const prev = lunar.getPrevJieQi(true);
    const next = lunar.getNextJieQi(true);
    if (prev && next) {
      jieQiPeriod = {
        name: s2tChars(prev.getName()),
        from: ymdOf(prev.getSolar()),
        to: ymdOf(next.getSolar()),
      };
    }
  } catch {
    jieQiPeriod = null;
  }

  // 12 時辰
  const times: TimeInfo[] = lunar.getTimes().map((t, idx) => {
    const zhi = ZHI_NAMES[idx] ?? "";
    const shen = s2tChars(t.getTianShenType());
    return {
      name: zhi,
      range: ZHI_RANGES[zhi] ?? `${t.getMinHm()}–${t.getMaxHm()}`,
      ganZhi: s2tChars(t.getGanZhi()),
      tianShen: shen,
      isAuspicious: shen === "黃道",
      yi: t.getYi().map(s2tAll),
      ji: t.getJi().map(s2tAll),
      chong: s2tChars(t.getChongDesc()),
    };
  });

  const shengXiao = s2tChars(lunar.getYearShengXiao());

  return {
    solarYear: year,
    solarMonth: month,
    solarDay: day,
    dayOfWeek: new Date(year, month - 1, day).getDay(),

    lunarYear: `${lunar.getYearInGanZhi()}年（${shengXiao}）`,
    lunarMonth: `${s2tChars(monthChinese)}月`,
    lunarDay: lunar.getDayInChinese(),
    isLeapMonth: monthChinese.startsWith("闰"),

    yearGanZhi: `${lunar.getYearInGanZhi()}${shengXiao}年`,
    monthGanZhi: `${lunar.getMonthInGanZhi()}月`,
    ganZhi: `${lunar.getDayInGanZhi()}日`,

    yi: lunar.getDayYi().map(s2tAll),
    ji: lunar.getDayJi().map(s2tAll),
    jieQi: jieQiToday ? s2tChars(jieQiToday) : null,
    jieQiPeriod,
    isAuspicious: tianShen === "黃道",
    tianShen,

    jiShen: lunar.getDayJiShen().map(s2tAll),
    pengZu: [lunar.getPengZuGan(), lunar.getPengZuZhi()].filter(Boolean).map(s2tChars),
    chong: s2tChars(lunar.getDayChongDesc()),
    positionXi: s2tChars(lunar.getDayPositionXiDesc()),
    positionFu: s2tChars(lunar.getDayPositionFuDesc()),
    positionCai: s2tChars(lunar.getDayPositionCaiDesc()),

    times,
  };
}

export function getMonthDays(year: number, month: number): DayInfo[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: DayInfo[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(getDayInfo(year, month, d));
  }
  return days;
}
