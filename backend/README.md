# Go 後端啟動指南

## 專案結構

```
backend/
├── main.go                  # 程式入口
├── go.mod                   # Go 模組定義
├── .env.example             # 環境變數範例
├── db/
│   └── db.go                # 資料庫連線與 AutoMigrate
├── models/
│   └── models.go            # GORM 模型 + DTO 定義
├── handlers/
│   ├── survey.go            # 問卷相關 API 處理
│   └── participant.go       # 參與者相關 API 處理
└── routes/
    └── routes.go            # 路由註冊
```

## 快速啟動

### 1. 安裝依賴套件

```bash
cd backend
go mod tidy
```

### 2. 設定環境變數

```bash
cp .env.example .env
# 編輯 .env，填入你的 PostgreSQL 連線資訊
```

### 3. 確認 PostgreSQL 已啟動

```bash
# 本機使用 Docker 啟動 PostgreSQL（如果還沒有的話）
docker run -d \
  --name web3survey-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=web3survey \
  -p 5432:5432 \
  postgres:15
```

### 4. 啟動後端

```bash
go run .
```

啟動後會自動建立資料表，監聽 `http://localhost:8080`

---

## API 路由一覽

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | /health | 健康檢查 |
| GET | /api/surveys | 取得問卷列表（可加 ?status=active） |
| GET | /api/surveys/:id | 取得單一問卷詳情 |
| POST | /api/surveys | 建立新問卷 |
| PATCH | /api/surveys/:id/status | 更新問卷狀態 |
| PATCH | /api/surveys/:id/contract | 更新合約地址 |
| POST | /api/surveys/:id/draw | 執行抽獎 |
| POST | /api/surveys/:id/participate | 提交問卷答案 |
| GET | /api/surveys/:id/check-participation | 檢查錢包是否已參與 |
| GET | /api/surveys/:id/participants | 取得所有參與者 |

---

## 前端整合說明

前端透過 Vite proxy 將 `/api/*` 轉發到此後端（port 8080）。
請確認 `vite.config.ts` 有以下設定：

```ts
server: {
  proxy: {
    '/api': 'http://localhost:8080',
  }
}
```
