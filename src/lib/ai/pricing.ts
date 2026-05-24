/**
 * Gemini 2.5 Flash + embedding pricing — client-safe constants.
 * 不放在 ai-usage.ts 因為那是 'use server' file（只能 export async function）。
 */

export const PRICING = {
  TEXT_INPUT_PER_M: 0.3,
  AUDIO_INPUT_PER_M: 1.0,
  OUTPUT_PER_M: 2.5,
  EMBEDDING_PER_M: 0.15,
} as const;

export const USD_TO_TWD = 32;
