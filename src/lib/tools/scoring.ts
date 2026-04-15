/**
 * 工具箱專用：從 ducati-models 衍生的評分與殘值表
 */

import { ducatiModels, type DucatiModel } from "@/lib/ducati-models";

/** 依家族給定的 5 年殘值率（台灣 2023-2025 二手市場抽樣均值，demo 數據） */
const RESIDUAL_BY_FAMILY: Record<string, number[]> = {
  Panigale:      [0.86, 0.74, 0.63, 0.55, 0.48],
  Streetfighter: [0.85, 0.72, 0.61, 0.53, 0.46],
  Multistrada:   [0.88, 0.78, 0.68, 0.60, 0.53],
  Monster:       [0.82, 0.69, 0.58, 0.50, 0.43],
  Hypermotard:   [0.81, 0.68, 0.56, 0.48, 0.41],
  SuperSport:    [0.82, 0.70, 0.59, 0.51, 0.44],
  DesertX:       [0.86, 0.74, 0.62, 0.54, 0.47],
  Scrambler:     [0.80, 0.67, 0.55, 0.47, 0.40],
};

/** 家族 → 電控精準度（0–100）*/
const ELECTRONICS_BY_FAMILY: Record<string, number> = {
  Panigale: 98, Streetfighter: 95, Multistrada: 96,
  Diavel: 92, Monster: 86, Hypermotard: 84,
  SuperSport: 88, DesertX: 88, Scrambler: 72,
};

/** 家族 → 聲浪情緒價值（0–100）*/
const SOUND_BY_FAMILY: Record<string, number> = {
  Panigale: 96, Streetfighter: 94, Multistrada: 88,
  Diavel: 92, Monster: 85, Hypermotard: 88,
  SuperSport: 86, DesertX: 82, Scrambler: 80,
};

export function getResidual(model: DucatiModel): number[] {
  return RESIDUAL_BY_FAMILY[model.family] ?? [0.82, 0.70, 0.58, 0.50, 0.43];
}

export function getElectronicsScore(model: DucatiModel): number {
  return ELECTRONICS_BY_FAMILY[model.family] ?? 80;
}

export function getSoundScore(model: DucatiModel): number {
  return SOUND_BY_FAMILY[model.family] ?? 80;
}

export const DEFAULT_MODEL: DucatiModel = ducatiModels.find((m) => m.id === "panigale-v4-s") ?? ducatiModels[0];

/** 競品對照：跨品牌非規格維度 */
export interface RivalScore {
  brand: string;
  key: string;
  model: string;
  electronics: number;
  sound: number;
  heritage: number;
  soul: number;
  precision: number;
  accent: string;
}

export const RIVAL_SCORES: RivalScore[] = [
  { brand: "Ducati", key: "ducati", model: "Panigale V4 S",
    electronics: 98, sound: 96, heritage: 95, soul: 97, precision: 96, accent: "#CC0000" },
  { brand: "BMW",    key: "bmw",    model: "M 1000 RR",
    electronics: 94, sound: 72, heritage: 82, soul: 68, precision: 95, accent: "#1E40AF" },
  { brand: "KTM",    key: "ktm",    model: "RC 8C",
    electronics: 88, sound: 84, heritage: 70, soul: 83, precision: 86, accent: "#F97316" },
  { brand: "Aprilia",key: "aprilia",model: "RSV4 Factory",
    electronics: 92, sound: 89, heritage: 85, soul: 88, precision: 90, accent: "#000000" },
];

export const COMPARISON_AXES = [
  { key: "electronics", label: "電控精準度" },
  { key: "sound",       label: "聲浪情緒" },
  { key: "heritage",    label: "品牌底蘊" },
  { key: "soul",        label: "靈魂濃度" },
  { key: "precision",   label: "製造工藝" },
] as const;
