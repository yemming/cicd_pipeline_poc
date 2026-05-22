import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['43.153.159.135'],
  // 關掉 Next.js 內建的左下角 dev 指示燈（demo 視覺乾淨優先）
  devIndicators: false,
  experimental: {
    serverActions: {
      // Next 16 預設 1MB；cropper 輸出無損 PNG 容易超過。
      // 拉到 25MB 給手卡錄音（5-10 分鐘 webm/opus 約 3-6MB、留 headroom）
      // 上游真正限制是 Gemini inline data 15MB、超過要走 File API（POC 不做）
      bodySizeLimit: '25mb',
    },
  },
};

export default nextConfig;
