import type { Metadata } from "next";
import { Inter, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { HideNextDevTools } from "@/components/hide-next-devtools";

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

// Material Symbols — loaded globally so all pages can use icons
const materialSymbolsHref =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" className={`${inter.variable} ${manrope.variable} ${jetbrainsMono.variable}`}>
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
