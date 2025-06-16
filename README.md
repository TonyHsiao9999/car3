# 長照接送預約自動化

這個專案使用 Node.js 和 Puppeteer 來自動化預約長照接送服務的流程。

## 功能特點

- 自動在每週一和週四凌晨執行預約
- 使用 Puppeteer 進行網頁自動化操作
- 支援環境變數配置
- 錯誤處理和日誌記錄

## 安裝步驟

1. 安裝依賴：
```bash
npm install
```

2. 設定環境變數：
複製 `.env.example` 到 `.env` 並填入以下資訊：
```
ID_NUMBER=你的身分證字號
PASSWORD=你的密碼
PICKUP_LOCATION=上車地點
DROP_OFF_ADDRESS=下車地址
```

3. 執行腳本：
```bash
npm start
```

## 部署到 Zeabur

1. 在 Zeabur 上建立新的 Node.js 專案
2. 將程式碼推送到 Git 倉庫
3. 在 Zeabur 專案設定中設定環境變數
4. 部署專案

## 注意事項

- 請確保環境變數中的資訊正確
- 建議定期檢查預約結果
- 程式會在每週一和週四凌晨自動執行 