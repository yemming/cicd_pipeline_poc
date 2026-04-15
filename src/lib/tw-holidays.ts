/**
 * 台灣國定假日資料層
 *
 * 資料來源：ruyut/TaiwanCalendar（由政府資料開放平台轉換）
 * CDN: https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/{year}.json
 *
 * 規則：
 *   - isHoliday = "1"：放假（含國定、補假、例假）
 *   - isHoliday = "0"：上班（含補班）
 *   - description 非空：國定假日名稱（例「春節」）
 */

export interface HolidayEntry {
  date: string;
  isHoliday: boolean;
  /** 補班日（原本是六/日但需上班） */
  isWorkday: boolean;
  description: string;
}

// 注意：ruyut/TaiwanCalendar 現行資料的 isHoliday 為 boolean；
// 舊版曾是 "1" / "0" 字串，為相容保留兩種判斷。
type RawEntry = {
  date: string;
  week?: string;
  isHoliday: boolean | string;
  description: string;
};

// 同一 Node.js process 內 memoize，重啟會清空（符合預期）
const CACHE: Record<number, Record<string, HolidayEntry>> = {};

function parseDate(raw: string): string {
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr).getDay();
}

async function fetchYear(year: number): Promise<Record<string, HolidayEntry>> {
  if (CACHE[year]) return CACHE[year];

  const url = `https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      console.warn(`[tw-holidays] 無法取得 ${year} 年資料，HTTP ${res.status}`);
      return {};
    }

    const raw = (await res.json()) as RawEntry[];
    const map: Record<string, HolidayEntry> = {};

    for (const item of raw) {
      const dateStr = parseDate(item.date);
      const dow = getDayOfWeek(dateStr);
      const isWeekend = dow === 0 || dow === 6;
      const isHoliday = item.isHoliday === true || item.isHoliday === "1";

      map[dateStr] = {
        date: dateStr,
        isHoliday,
        isWorkday: isWeekend && !isHoliday,
        description: item.description ?? "",
      };
    }

    CACHE[year] = map;
    return map;
  } catch (err) {
    console.warn(`[tw-holidays] fetch ${year} 失敗`, err);
    return {};
  }
}

export async function getHolidayMap(year: number): Promise<Record<string, HolidayEntry>> {
  return fetchYear(year);
}

function keyOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function isHoliday(year: number, month: number, day: number): Promise<boolean> {
  const map = await fetchYear(year);
  return map[keyOf(year, month, day)]?.isHoliday ?? false;
}

export async function getHolidayName(
  year: number,
  month: number,
  day: number,
): Promise<string> {
  const map = await fetchYear(year);
  return map[keyOf(year, month, day)]?.description ?? "";
}

export async function isCompensatoryWorkday(
  year: number,
  month: number,
  day: number,
): Promise<boolean> {
  const map = await fetchYear(year);
  return map[keyOf(year, month, day)]?.isWorkday ?? false;
}
