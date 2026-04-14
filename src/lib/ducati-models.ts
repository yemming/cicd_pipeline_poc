/**
 * Ducati model catalog — Single Source of Truth for demo data.
 *
 * Source: material/prices.json + material/motorcycles.json + material/DUCATI_TAIWAN_DATA.md
 * Images: public/bikes/thumbs/{id}.{png|jpg} (downloaded via scripts/download-ducati-images.sh)
 */

export type DucatiFamily =
  | "Panigale"
  | "Streetfighter"
  | "Multistrada"
  | "Monster"
  | "Hypermotard"
  | "SuperSport"
  | "DesertX"
  | "Scrambler";

export type DucatiCategory =
  | "超級跑車"
  | "街頭格鬥"
  | "多功能冒險"
  | "街車"
  | "越野冒險"
  | "運動旅行"
  | "街頭娛樂"
  | "復古街車";

export type DucatiModel = {
  id: string;
  family: DucatiFamily;
  name: string;
  category: DucatiCategory;
  tagline: string;
  priceNTD: number;
  isNew?: boolean;
  hp: number;
  torqueNm: number;
  dryWeightKg?: number;
  displacementCc: number;
  engine: string;
  colors: string[];
  thumb: string;
};

export const ducatiModels: DucatiModel[] = [
  {
    id: "panigale-v4-s",
    family: "Panigale",
    name: "Panigale V4 S",
    category: "超級跑車",
    tagline: "終極方程式，隨時準備上賽道",
    priceNTD: 1828000,
    hp: 215.5,
    torqueNm: 123.6,
    dryWeightKg: 174,
    displacementCc: 1103,
    engine: "Desmosedici Stradale V4",
    colors: ["Ducati 紅"],
    thumb: "/bikes/thumbs/panigale-v4-s.png",
  },
  {
    id: "panigale-v2-s",
    family: "Panigale",
    name: "Panigale V2 S",
    category: "超級跑車",
    tagline: "V2 純粹賽道血統",
    priceNTD: 1128000,
    isNew: true,
    hp: 120,
    torqueNm: 93.3,
    dryWeightKg: 176,
    displacementCc: 890,
    engine: "V2 液冷 890cc",
    colors: ["Ducati 紅"],
    thumb: "/bikes/thumbs/panigale-v2-s.png",
  },
  {
    id: "streetfighter-v4-sp2",
    family: "Streetfighter",
    name: "Streetfighter V4 SP2",
    category: "街頭格鬥",
    tagline: "賽道級街頭格鬥旗艦",
    priceNTD: 1958000,
    hp: 208,
    torqueNm: 123,
    dryWeightKg: 177,
    displacementCc: 1103,
    engine: "Desmosedici Stradale V4",
    colors: ["SP2 塗裝"],
    thumb: "/bikes/thumbs/streetfighter-v4-sp2.png",
  },
  {
    id: "streetfighter-v4-s",
    family: "Streetfighter",
    name: "Streetfighter V4 S",
    category: "街頭格鬥",
    tagline: "V4 街頭怪物",
    priceNTD: 1468000,
    hp: 208,
    torqueNm: 123,
    dryWeightKg: 178,
    displacementCc: 1103,
    engine: "Desmosedici Stradale V4",
    colors: ["Ducati 紅", "闇夜灰"],
    thumb: "/bikes/thumbs/streetfighter-v4-s.png",
  },
  {
    id: "streetfighter-v2",
    family: "Streetfighter",
    name: "Streetfighter V2",
    category: "街頭格鬥",
    tagline: "輕量化街頭格鬥",
    priceNTD: 1098000,
    hp: 153,
    torqueNm: 101.4,
    dryWeightKg: 178,
    displacementCc: 955,
    engine: "Superquadro V2",
    colors: ["Ducati 紅", "風暴綠"],
    thumb: "/bikes/thumbs/streetfighter-v2.png",
  },
  {
    id: "streetfighter-v2-s",
    family: "Streetfighter",
    name: "Streetfighter V2 S",
    category: "街頭格鬥",
    tagline: "最狂野的街頭 V2 公式",
    priceNTD: 998000,
    isNew: true,
    hp: 120,
    torqueNm: 93.3,
    dryWeightKg: 175,
    displacementCc: 890,
    engine: "V2 液冷 890cc",
    colors: ["Ducati 紅"],
    thumb: "/bikes/thumbs/streetfighter-v2-s.png",
  },
  {
    id: "multistrada-v4-s",
    family: "Multistrada",
    name: "Multistrada V4 S",
    category: "多功能冒險",
    tagline: "改寫旅行的規則",
    priceNTD: 1658000,
    hp: 170,
    torqueNm: 84,
    dryWeightKg: 218,
    displacementCc: 1158,
    engine: "V4 Granturismo",
    colors: ["Ducati 紅", "飛行灰"],
    thumb: "/bikes/thumbs/multistrada-v4-s.png",
  },
  {
    id: "multistrada-v2-s",
    family: "Multistrada",
    name: "Multistrada V2 S",
    category: "多功能冒險",
    tagline: "任由道路決定您的旅途終點",
    priceNTD: 1038000,
    isNew: true,
    hp: 115.6,
    torqueNm: 92.1,
    dryWeightKg: 202,
    displacementCc: 937,
    engine: "Testastretta 11° L-twin",
    colors: ["Ducati 紅", "風暴綠"],
    thumb: "/bikes/thumbs/multistrada-v2-s.png",
  },
  {
    id: "monster",
    family: "Monster",
    name: "Monster",
    category: "街車",
    tagline: "為最大樂趣而製作",
    priceNTD: 748000,
    hp: 111,
    torqueNm: 93,
    dryWeightKg: 166,
    displacementCc: 937,
    engine: "Testastretta 11° L-twin",
    colors: ["Ducati 紅", "闇夜黑", "極光白"],
    thumb: "/bikes/thumbs/monster.png",
  },
  {
    id: "monster-sp",
    family: "Monster",
    name: "Monster SP",
    category: "街車",
    tagline: "賽道級零件武裝",
    priceNTD: 898000,
    hp: 111,
    torqueNm: 93,
    dryWeightKg: 166,
    displacementCc: 937,
    engine: "Testastretta 11° L-twin",
    colors: ["SP 塗裝"],
    thumb: "/bikes/thumbs/monster-sp.png",
  },
  {
    id: "hypermotard-950-sp",
    family: "Hypermotard",
    name: "Hypermotard 950 SP",
    category: "街頭娛樂",
    tagline: "賽道樂趣街頭化",
    priceNTD: 1098000,
    hp: 114,
    torqueNm: 96,
    dryWeightKg: 176,
    displacementCc: 937,
    engine: "Testastretta 11° L-twin",
    colors: ["SP 塗裝"],
    thumb: "/bikes/thumbs/hypermotard-950-sp.png",
  },
  {
    id: "hypermotard-950",
    family: "Hypermotard",
    name: "Hypermotard 950",
    category: "街頭娛樂",
    tagline: "街頭翹孤輪天王",
    priceNTD: 888000,
    hp: 114,
    torqueNm: 96,
    dryWeightKg: 178,
    displacementCc: 937,
    engine: "Testastretta 11° L-twin",
    colors: ["Ducati 紅"],
    thumb: "/bikes/thumbs/hypermotard-950.png",
  },
  {
    id: "hypermotard-698-mono",
    family: "Hypermotard",
    name: "Hypermotard 698 Mono RVE",
    category: "街頭娛樂",
    tagline: "單缸純粹樂趣",
    priceNTD: 818000,
    hp: 77.5,
    torqueNm: 63,
    dryWeightKg: 151,
    displacementCc: 698,
    engine: "Superquadro Mono",
    colors: ["RVE 塗裝"],
    thumb: "/bikes/thumbs/hypermotard-698-mono.png",
  },
  {
    id: "supersport-950-s",
    family: "SuperSport",
    name: "SuperSport 950 S",
    category: "運動旅行",
    tagline: "日常與賽道兼具",
    priceNTD: 1058000,
    hp: 110,
    torqueNm: 93,
    dryWeightKg: 184,
    displacementCc: 937,
    engine: "Testastretta 11° L-twin",
    colors: ["Ducati 紅", "條紋白"],
    thumb: "/bikes/thumbs/supersport-950-s.png",
  },
  {
    id: "desertx",
    family: "DesertX",
    name: "DesertX",
    category: "越野冒險",
    tagline: "最狂野的夢想，已經實現",
    priceNTD: 1078000,
    hp: 110,
    torqueNm: 92,
    dryWeightKg: 202,
    displacementCc: 937,
    engine: "Testastretta 11° L-twin",
    colors: ["RR22 黑", "消光白"],
    thumb: "/bikes/thumbs/desertx.png",
  },
];

export const HERO_IMAGES = {
  hero1: "/bikes/hero/hero-1.jpg",
  hero2: "/bikes/hero/hero-2.jpg",
  hero3: "/bikes/hero/hero-3.jpg",
  hero4: "/bikes/hero/hero-4.jpg",
  monster: "/bikes/hero/hero-monster.jpg",
  lifestyle1: "/bikes/hero/lifestyle-1.jpg",
  lifestyle2: "/bikes/hero/lifestyle-2.jpg",
  lifestyle3: "/bikes/hero/lifestyle-3.jpg",
} as const;

export function formatNTD(n: number): string {
  return `NT$${n.toLocaleString("zh-TW")}`;
}

export function getModelById(id: string): DucatiModel | undefined {
  return ducatiModels.find((m) => m.id === id);
}

export function modelsByFamily(family: DucatiFamily): DucatiModel[] {
  return ducatiModels.filter((m) => m.family === family);
}

export const DUCATI_FAMILIES: DucatiFamily[] = [
  "Panigale",
  "Streetfighter",
  "Multistrada",
  "Monster",
  "Hypermotard",
  "SuperSport",
  "DesertX",
];

export const DUCATI_TAGLINES = [
  "終極方程式，隨時準備上賽道",
  "改寫旅行的規則",
  "為最大樂趣而製作",
  "任由道路決定您的旅途終點",
  "最狂野的夢想，已經實現",
  "肌肉、大膽、獨特",
];
