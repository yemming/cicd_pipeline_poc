/**
 * Sales Staff Grid（員工評估九宮格）— 純 constants / pure helpers
 *
 * 設計稿：docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html § 員工評估九宮格
 * 路由：/sales/manager/staff-grid
 * Proposal：docs/proposals/feature-rs-m3-staff-grid-phase1.md
 *
 * metadata 結構：employees.metadata.sales.grid_position
 *   = { attitude: 1-3, skill: 1-3, manual_override: boolean, evaluated_at: ISO }
 */

import type { SalesStaffMetadata } from "./sales-staff.constants";

export type GridAxis = 1 | 2 | 3;

export type GridPosition = {
  /** 態度軸（X）— 1=低 2=中 3=高（依本月接觸數推算） */
  attitude: GridAxis;
  /** 技能軸（Y）— 1=低 2=中 3=高（依本月成交台數推算） */
  skill: GridAxis;
  /** 主管手動拖曳過？true=永遠用此位置直到 reset */
  manual_override: boolean;
  /** ISO timestamp — 上次評估 / 拖曳的時間 */
  evaluated_at: string;
};

/**
 * 9 格命名表（key = "attitude-skill"）。
 * spec § 行 788-796 取的中文名，跟設計稿用詞一致。
 */
export const GRID_CELL_LABELS: Record<string, string> = {
  // attitude=3 (高態度) row
  "3-3": "全方位高手",
  "3-2": "安定高手",
  "3-1": "機會高手",
  // attitude=2 (中態度) row
  "2-3": "明日之星",
  "2-2": "中規中矩",
  "2-1": "食之無味",
  // attitude=1 (低態度) row
  "1-3": "急需磨練",
  "1-2": "難搞定",
  "1-1": "很危險",
};

/** 額外的 chip 顏色 token（看起來舒服而已、跟 spec 一致） */
export const GRID_CELL_TONE: Record<string, { bg: string; text: string; border: string }> = {
  "3-3": { bg: "#E8F5F0", text: "#0F6E56", border: "#C5DDD2" }, // teal — 頂尖
  "3-2": { bg: "#EAF4FB", text: "#185FA5", border: "#C5D8E8" }, // blue — 穩定
  "3-1": { bg: "#FDF3E3", text: "#854F0B", border: "#E8D8B2" }, // amber — 有潛力
  "2-3": { bg: "#EAF4FB", text: "#185FA5", border: "#C5D8E8" }, // blue — 投資型
  "2-2": { bg: "#F2F2F2", text: "#5A5955", border: "#D5D3CB" }, // gray — 中性
  "2-1": { bg: "#FDF3E3", text: "#854F0B", border: "#E8D8B2" }, // amber — 食之無味
  "1-3": { bg: "#EAF4FB", text: "#185FA5", border: "#C5D8E8" }, // blue — 新人
  "1-2": { bg: "#FDECEA", text: "#CC0000", border: "#F5AEAD" }, // red — 警告
  "1-1": { bg: "#FDECEA", text: "#CC0000", border: "#F5AEAD" }, // red — 危險
};

/** 9 格的進階說明（hover / 點擊顯示），來自 spec mcDetails */
export const GRID_CELL_ADVICE: Record<string, string> = {
  "3-3": "店內頂尖人才，建議讓其扮演導師角色，研究其成功模式並系統化複製。",
  "3-2": "表現穩定優秀。建議公開嘉勉、授權主導特定車系，定期關心職涯方向。",
  "3-1": "技巧熟練但積極性不足。建議一對一了解動機，給予更具挑戰的目標。",
  "2-3": "態度積極、技能發展中，最值得投資。建議系統化銷售訓練 + 高難度客戶磨練。",
  "2-2": "表現不過不失，有上升空間。建議細化週工作目標、配對安定高手學習。",
  "2-1": "意願有限、技能也欠缺。建議基礎培訓 + 簡單客戶建立信心。",
  "1-3": "態度極佳但技能生疏，通常為新進 RS。建議指定導師、提供完整話術腳本。",
  "1-2": "技能、態度均待加強。建議基礎培訓 + 明確改善目標。",
  "1-1": "技能與態度均低，最棘手的情況。建議立即一對一約談，評估去留意願。",
};

/* ─────────────────── 自動計算公式（brief 預設啟發式） ─────────────────── */

/** 技能軸：依本月成交台數推算 */
export function autoSkill(deals: number): GridAxis {
  if (deals >= 3) return 3;
  if (deals >= 1) return 2;
  return 1;
}

/** 態度軸：依本月接觸數（sales_leads count by rs_name）推算 */
export function autoAttitude(contacts: number): GridAxis {
  if (contacts >= 10) return 3;
  if (contacts >= 5) return 2;
  return 1;
}

/** 預設位置（無資料時用，落在 2-2 中規中矩） */
export const DEFAULT_GRID_POSITION: GridPosition = {
  attitude: 2,
  skill: 2,
  manual_override: false,
  evaluated_at: "1970-01-01T00:00:00.000Z",
};

/* ─────────────────── metadata 讀寫 helper ─────────────────── */

/** 從 metadata 取出 grid_position；沒有時依 contacts/deals 算自動值 */
export function resolveGridPosition(
  meta: SalesStaffMetadata | null | undefined,
  monthly: { contacts: number; deals: number },
): GridPosition {
  const stored = meta?.sales?.grid_position as Partial<GridPosition> | undefined;
  if (stored && stored.manual_override === true && isValidAxis(stored.attitude) && isValidAxis(stored.skill)) {
    return {
      attitude: stored.attitude,
      skill: stored.skill,
      manual_override: true,
      evaluated_at: stored.evaluated_at ?? new Date().toISOString(),
    };
  }
  return {
    attitude: autoAttitude(monthly.contacts),
    skill: autoSkill(monthly.deals),
    manual_override: false,
    evaluated_at: new Date().toISOString(),
  };
}

function isValidAxis(v: unknown): v is GridAxis {
  return v === 1 || v === 2 || v === 3;
}

/** 把 grid_position 寫回 metadata.sales（保留其他 keys） */
export function writeGridPosition(
  meta: SalesStaffMetadata | null | undefined,
  position: GridPosition,
): SalesStaffMetadata {
  const base = (meta ?? {}) as SalesStaffMetadata;
  return {
    ...base,
    sales: { ...(base.sales ?? {}), grid_position: position },
  };
}

/** 清掉 grid_position（reset all 用） */
export function clearGridPosition(
  meta: SalesStaffMetadata | null | undefined,
): SalesStaffMetadata {
  const base = (meta ?? {}) as SalesStaffMetadata;
  const sales = { ...(base.sales ?? {}) };
  delete (sales as { grid_position?: unknown }).grid_position;
  return { ...base, sales };
}

export function cellKey(attitude: GridAxis, skill: GridAxis): string {
  return `${attitude}-${skill}`;
}
