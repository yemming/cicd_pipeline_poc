export type WeatherKind =
  | "clear"
  | "cloudy"
  | "overcast"
  | "fog"
  | "rain"
  | "snow"
  | "thunder";

// WMO weather_code → 顯示類別
export function codeToKind(code: number): WeatherKind {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 95) return "thunder";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  return "cloudy";
}

export function kindLabel(kind: WeatherKind): string {
  switch (kind) {
    case "clear": return "晴";
    case "cloudy": return "多雲";
    case "overcast": return "陰";
    case "fog": return "霧";
    case "rain": return "雨";
    case "snow": return "雪";
    case "thunder": return "雷雨";
  }
}
