# DealerOS — Next.js 16（單階段）
# 改用 Dockerfile 的唯一理由：修 B-07 季報 PDF。
# @sparticuz/chromium 解出 /tmp/chromium 後啟動需要一串系統共享庫（libnss3 等），
# Zeabur 預設 zbpack 的 Node runtime image 沒有這些庫 → puppeteer.launch 失敗回 500。
# 單階段下 Zeabur 會自動把 dashboard 的環境變數（含 NEXT_PUBLIC_* 與 server secret）
# 注入到 build 與 runtime，行為與原 zbpack 一致，故本檔不寫死任何 env。
FROM node:20-bookworm-slim

WORKDIR /app

# headless Chromium runtime 依賴（修 B-07）
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 libxshmfence1 \
      libx11-6 libxcb1 libxext6 libxi6 libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

# 依賴：package-lock.json 已與 package.json 同步 → 用 npm ci（可重現、比 npm install 快）
COPY package*.json ./
RUN npm ci

# 原始碼 + build
COPY . .
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

ENV NODE_ENV=production

# 版本資訊（給 /api/version）：Zeabur 在 Git 服務的 build 階段注入 ZEABUR_GIT_COMMIT_SHA
# （https://zeabur.com/docs/en-US/deploy/config/environment-variables#git-information）。
# 手動 docker build 可用 --build-arg GIT_COMMIT_SHA=$(git rev-parse HEAD) 當 fallback。
# 兩者都沒有時 route 回 "unknown"。放在 build 之後，避免每個 commit 都讓前面的 layer cache 失效。
ARG ZEABUR_GIT_COMMIT_SHA
ARG GIT_COMMIT_SHA
ENV APP_COMMIT_SHA=${ZEABUR_GIT_COMMIT_SHA} \
    GIT_COMMIT_SHA=${GIT_COMMIT_SHA}
# Zeabur 注入 PORT；next start 會吃 PORT（預設 3000），由 Zeabur 自動偵測對應
CMD ["npm", "run", "start"]
