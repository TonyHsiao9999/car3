# 長照訂車自動化腳本

這個專案是一個自動化腳本，用於預約長照接送服務。

## 環境變數設定

在 Zeabur 的環境變數設定中，需要設定以下變數：

- `CAR_BOOKING_ID`: 身分證字號
- `CAR_BOOKING_PASSWORD`: 密碼

## 排程設定

腳本會自動在每週一和週四的午夜（00:00）執行。

## 本地開發

1. 安裝依賴：
```bash
npm install
```

2. 建立 `.env` 檔案並設定環境變數：
```
CAR_BOOKING_ID=你的身分證字號
CAR_BOOKING_PASSWORD=你的密碼
```

3. 執行腳本：
```bash
npm start
```

## 部署到 Zeabur

1. 將程式碼推送到 GitHub 倉庫
2. 在 Zeabur 中建立新專案
3. 選擇 GitHub 倉庫
4. 設定環境變數
5. 部署專案

## 注意事項

- 請確保環境變數中的資訊正確
- 建議定期檢查預約結果
- 程式會在每週一和週四凌晨自動執行 