import { NextResponse } from "next/server";

/**
 * Open-Meteo 騎士氣象 proxy
 * - 零 API key，免費
 * - 台北 lat/lng 預設，可 query param 覆寫
 *
 * query: ?lat=25.03&lng=121.56
 */

export interface HourlyPoint {
  time: string;          // ISO 2026-04-15T14:00
  hour: number;          // 14
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  precipProb: number;    // %
  precipMm: number;
  windKmh: number;
  weatherCode: number;
  riderScore: number;    // 0–100 騎士適合度
}

export interface WeatherResponse {
  location: { lat: number; lng: number; label: string };
  current: { tempC: number; feelsLikeC: number; code: number; windKmh: number };
  hourly: HourlyPoint[];
  warmupSuggestion: string;
}

function scoreHour(p: {
  tempC: number; precipProb: number; precipMm: number; windKmh: number; humidity: number; code: number;
}): number {
  let s = 100;
  // 雨：機率 + 量
  s -= p.precipProb * 0.5;
  s -= Math.min(30, p.precipMm * 10);
  // 溫度：22–28 最佳，<10 或 >34 扣大量
  if (p.tempC < 10) s -= (10 - p.tempC) * 4;
  else if (p.tempC < 18) s -= (18 - p.tempC) * 1.5;
  else if (p.tempC > 32) s -= (p.tempC - 32) * 3;
  // 風：< 25 km/h OK，> 40 扣
  if (p.windKmh > 25) s -= (p.windKmh - 25) * 1.2;
  // 濕度：> 85% 較悶（易起霧）
  if (p.humidity > 85) s -= (p.humidity - 85) * 0.8;
  // Weather code 90+ = 雷雨，直接扣大量
  if (p.code >= 95) s -= 35;
  return Math.max(0, Math.min(100, Math.round(s)));
}

function pickWarmup(hourly: HourlyPoint[]): string {
  // 找未來 12 小時內分數 > 75 的最早時段
  const upcoming = hourly.filter((h) => h.riderScore >= 75);
  if (upcoming.length === 0) {
    return "今日天氣不理想，建議安排室內維護或待日後擇吉";
  }
  const best = upcoming[0];
  const localHour = best.hour;
  return `建議 ${String(localHour).padStart(2, "0")}:00 前完成暖胎，該時段出車適合度 ${best.riderScore}/100`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat") ?? "25.0330");
  const lng = Number(url.searchParams.get("lng") ?? "121.5654");

  const apiUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
    `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,wind_speed_10m,weather_code` +
    `&forecast_days=2&timezone=Asia%2FTaipei`;

  try {
    const res = await fetch(apiUrl, { next: { revalidate: 1800 } }); // 30 min ISR
    if (!res.ok) {
      return NextResponse.json({ error: `Weather API ${res.status}` }, { status: 502 });
    }

    const raw = (await res.json()) as {
      current: {
        temperature_2m: number;
        apparent_temperature: number;
        weather_code: number;
        wind_speed_10m: number;
      };
      hourly: {
        time: string[];
        temperature_2m: number[];
        apparent_temperature: number[];
        relative_humidity_2m: number[];
        precipitation_probability: number[];
        precipitation: number[];
        wind_speed_10m: number[];
        weather_code: number[];
      };
    };

    const now = new Date();
    const hourly: HourlyPoint[] = raw.hourly.time
      .map((t, i) => {
        const point = {
          tempC: raw.hourly.temperature_2m[i],
          feelsLikeC: raw.hourly.apparent_temperature[i],
          humidity: raw.hourly.relative_humidity_2m[i],
          precipProb: raw.hourly.precipitation_probability[i] ?? 0,
          precipMm: raw.hourly.precipitation[i] ?? 0,
          windKmh: raw.hourly.wind_speed_10m[i],
          code: raw.hourly.weather_code[i],
        };
        return {
          time: t,
          hour: new Date(t).getHours(),
          tempC: point.tempC,
          feelsLikeC: point.feelsLikeC,
          humidity: point.humidity,
          precipProb: point.precipProb,
          precipMm: point.precipMm,
          windKmh: point.windKmh,
          weatherCode: point.code,
          riderScore: scoreHour(point),
        };
      })
      // 只要從「現在」起 24 小時內
      .filter((p) => {
        const d = new Date(p.time);
        return d >= new Date(now.getTime() - 3600 * 1000) &&
               d <= new Date(now.getTime() + 24 * 3600 * 1000);
      });

    const response: WeatherResponse = {
      location: { lat, lng, label: "台北 Taipei" },
      current: {
        tempC: raw.current.temperature_2m,
        feelsLikeC: raw.current.apparent_temperature,
        code: raw.current.weather_code,
        windKmh: raw.current.wind_speed_10m,
      },
      hourly,
      warmupSuggestion: pickWarmup(hourly),
    };

    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
