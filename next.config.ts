import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['43.153.159.135'],
  // 關掉 Next.js 內建的左下角 dev 指示燈（demo 視覺乾淨優先）
  devIndicators: false,
};

export default nextConfig;
