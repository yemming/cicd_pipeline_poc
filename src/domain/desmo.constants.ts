/**
 * C-26 Desmo 汽門保養到期 — 純計算常數 / 函式（client-safe）
 *
 * Desmodromic（汽門間隙）保養是 Ducati 引擎招牌維護項目，里程 / 時間到期需主動提醒。
 * 本檔無 server-only / supabase import，server helper 與 client 元件都可直接 import。
 *
 * 適用判定：Desmodromic 是 Ducati 技術 → 預設只有 brand='ducati' 套用；
 *   個別車型可用 vehicle_models.metadata.has_desmo=false 關閉、
 *   或 metadata.desmo_interval_km / desmo_interval_months 覆寫間隔。
 */

/** Ducati 現代 Testastretta 引擎汽門保養預設間隔（里程） */
export const DESMO_DEFAULT_INTERVAL_KM = 30000;
/** 預設時間間隔（月） */
export const DESMO_DEFAULT_INTERVAL_MONTHS = 24;
/** 「即將到期」門檻：距到期里程 km 內 */
export const DESMO_DUE_SOON_KM = 2000;
/** 「即將到期」門檻：距到期日天數內 */
export const DESMO_DUE_SOON_DAYS = 60;

export type DesmoStatus = "ok" | "due_soon" | "overdue";

export type DesmoInterval = { km: number; months: number };

export type DesmoModelMeta = {
  has_desmo?: boolean;
  desmo_interval_km?: number;
  desmo_interval_months?: number;
} | null;

/**
 * 解析某車型的 Desmo 保養間隔。回 null = 此 brand/車型不適用 Desmo（不顯示、不提醒）。
 */
export function resolveDesmoInterval(
  brandId: string | null | undefined,
  modelMeta: DesmoModelMeta,
): DesmoInterval | null {
  const meta = modelMeta ?? {};
  // 明確關閉
  if (meta.has_desmo === false) return null;
  // 預設僅 Ducati 套用；其他 brand 需 model 明確 has_desmo=true 才算
  const applicable = brandId === "ducati" || meta.has_desmo === true;
  if (!applicable) return null;
  const km =
    typeof meta.desmo_interval_km === "number" && meta.desmo_interval_km > 0
      ? meta.desmo_interval_km
      : DESMO_DEFAULT_INTERVAL_KM;
  const months =
    typeof meta.desmo_interval_months === "number" && meta.desmo_interval_months > 0
      ? meta.desmo_interval_months
      : DESMO_DEFAULT_INTERVAL_MONTHS;
  return { km, months };
}

/** YYYY-MM-DD（避免時區，純字串日期計算） */
function addMonths(dateStr: string, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const d = Number(m[3]);
  const ny = y + Math.floor(mo / 12);
  const nm = ((mo % 12) + 12) % 12;
  // 處理月底溢位（例 1/31 + 1mo → 取該月最後一天）
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/**
 * 由「上次汽門保養日 / 里程」+ 間隔推算到期日 / 到期里程。
 * 任一基準缺失則該維度回 null。
 */
export function computeDesmoDue(input: {
  lastDate: string | null;
  lastMileage: number | null;
  interval: DesmoInterval;
}): { dueDate: string | null; dueMileage: number | null } {
  const { lastDate, lastMileage, interval } = input;
  const dueDate = lastDate ? addMonths(lastDate, interval.months) : null;
  const dueMileage =
    lastMileage != null && lastMileage >= 0 ? lastMileage + interval.km : null;
  return { dueDate, dueMileage };
}

/**
 * 依到期日 / 到期里程 / 目前里程算狀態。todayStr 由 caller 傳（server 端 new Date）。
 * 里程超過或日期已過 → overdue；接近門檻 → due_soon；否則 ok。
 * 兩維度取「最嚴重」者。完全沒到期資料回 null（不顯示）。
 */
export function getDesmoStatus(input: {
  dueDate: string | null;
  dueMileage: number | null;
  currentMileage: number | null;
  todayStr: string;
}): DesmoStatus | null {
  const { dueDate, dueMileage, currentMileage, todayStr } = input;
  if (!dueDate && dueMileage == null) return null;

  let worst: DesmoStatus = "ok";
  const bump = (s: DesmoStatus) => {
    const rank: Record<DesmoStatus, number> = { ok: 0, due_soon: 1, overdue: 2 };
    if (rank[s] > rank[worst]) worst = s;
  };

  // 里程維度
  if (dueMileage != null && currentMileage != null) {
    if (currentMileage >= dueMileage) bump("overdue");
    else if (dueMileage - currentMileage <= DESMO_DUE_SOON_KM) bump("due_soon");
  }
  // 日期維度
  if (dueDate) {
    const dueMs = Date.parse(`${dueDate}T00:00:00Z`);
    const todayMs = Date.parse(`${todayStr}T00:00:00Z`);
    if (Number.isFinite(dueMs) && Number.isFinite(todayMs)) {
      const days = Math.round((dueMs - todayMs) / 86400000);
      if (days < 0) bump("overdue");
      else if (days <= DESMO_DUE_SOON_DAYS) bump("due_soon");
    }
  }
  return worst;
}

export const DESMO_STATUS_LABEL: Record<DesmoStatus, string> = {
  ok: "正常",
  due_soon: "即將到期",
  overdue: "已逾期",
};

export const DESMO_STATUS_BADGE: Record<DesmoStatus, { bg: string; fg: string }> = {
  ok: { bg: "#EAF3DE", fg: "#3B6D11" },
  due_soon: { bg: "#FDF3E3", fg: "#854F0B" },
  overdue: { bg: "#FDECEA", fg: "#CC0000" },
};
