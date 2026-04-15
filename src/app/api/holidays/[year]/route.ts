import { NextResponse } from "next/server";
import { getHolidayMap } from "@/lib/tw-holidays";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ year: string }> },
) {
  const { year: yearRaw } = await params;
  const year = Number.parseInt(yearRaw, 10);

  if (Number.isNaN(year) || year < 2017 || year > 2030) {
    return NextResponse.json(
      { error: "年份無效，支援範圍 2017–2030" },
      { status: 400 },
    );
  }

  const map = await getHolidayMap(year);
  return NextResponse.json(map);
}
