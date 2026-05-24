import type { Metadata, Viewport } from "next";
import { Inter, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { HideNextDevTools } from "@/components/hide-next-devtools";
import { getCurrentBrand } from "@/lib/brands/current";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  preload: false,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "DealerOS | Luxury Automotive Management",
  description: "經銷商營運管理平台",
  icons: { icon: "/favicon.ico" },
};

// RWD 基礎：viewport 跟著裝置寬度，初始縮放 1。
// 不鎖 maximum-scale — dashboard 場景需要保留使用者放大數字的權利（無障礙）。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Material Symbols — loaded globally so all pages can use icons
const materialSymbolsHref =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 注意：不再在 <html> inline style 設 --color-brand-primary*。
  // 真正的 brand 顏色由 AppearanceProvider 內 `paletteCssVars()` 算出來、套到內層 <div>，
  // 兩邊都設會造成 hydration mismatch（root layout 用 env 寫死、provider 用 darken() 算）。
  // globals.css 內有 default fallback (#CC0000 / #A80000)、AppearanceProvider 外的頁面照樣有色。
  const brand = getCurrentBrand();
  return (
    <html
      lang="zh-Hant"
      className={`${inter.variable} ${manrope.variable} ${jetbrainsMono.variable}`}
      data-brand={brand.key}
    >
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href={materialSymbolsHref} rel="stylesheet" />
      </head>
      <body className="min-h-dvh bg-surface text-on-surface antialiased">
        {children}
        <HideNextDevTools />
      </body>
    </html>
  );
}
