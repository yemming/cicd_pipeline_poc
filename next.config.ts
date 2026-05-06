import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['43.153.159.135'],
  // 關掉 Next.js 內建的左下角 dev 指示燈（demo 視覺乾淨優先）
  devIndicators: false,
  experimental: {
    serverActions: {
      // Next 16 預設 1MB；cropper 輸出無損 PNG 容易超過。
      // 拉到 5MB 給 brand badge / feedback 留言附件 / 未來其他大檔上傳都夠用。
      bodySizeLimit: '5mb',
    },
  },
};

export default nextConfig;
