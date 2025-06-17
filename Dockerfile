FROM node:18-slim

# 安裝必要的依賴
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 設定環境變數
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 建立工作目錄
WORKDIR /app

# 複製專案檔案
COPY package*.json ./
RUN npm install

COPY . .

# 啟動應用程式
CMD ["npm", "start"] 