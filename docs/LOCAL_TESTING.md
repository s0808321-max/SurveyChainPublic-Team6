# 本地測試步驟彙整

以下假設在 **macOS / Linux** 本機執行；埠號：**後端 8080**、**前端 5173**（與 `vite.config.ts`、`main.go` 一致）。

---

## 0. 環境需求

| 項目 | 說明 |
|------|------|
| **Go** | 1.21+（建議與 `go.mod` 相容） |
| **Node.js** | 18+（建議 LTS） |
| **PostgreSQL** | 15+（本機安裝或 Docker 皆可） |
| **瀏覽器** | 建議 Chrome + **MetaMask**（測試錢包登入與鏈上操作） |
| **（選用）鏈上測試** | **Sepolia** 測試網 + 少量 Sepolia ETH；部署或使用已部署的 `SurveyChainSystem` 合約位址 |

---

## 1. 啟動 PostgreSQL

**方式 A：Docker（與 `backend/README.md` 範例一致）**

```bash
docker run -d \
  --name web3survey-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=web3survey \
  -p 5432:5432 \
  postgres:15
```

**方式 B**：本機已安裝 PostgreSQL 時，自行建立資料庫 `web3survey`，並讓使用者密碼與下方 `.env` 一致。

---

## 2. 設定並啟動 Go 後端（`backend`）

```bash
cd backend
cp .env.example .env
```

編輯 **`.env`**（至少填資料庫密碼，與 Docker 或本機 PG 一致）：

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_NAME=web3survey
DB_SSLMODE=disable

# 建議本地也設一組固定值，避免與預設混淆
JWT_SECRET=local-dev-jwt-secret

# 若前端不是 localhost:5173，可再加（選用）
# FRONTEND_URL=http://localhost:5173
```

啟動：

```bash
go mod tidy
go run .
```

預期：

- 終端機出現資料表 **AutoMigrate** 成功與「監聽 port **8080**」。
- 健康檢查：`curl -s http://127.0.0.1:8080/health` 回傳 `{"status":"ok"}`。

---

## 3. 安裝並啟動前端（`frontend/client`）

```bash
cd frontend/client
npm install
npm run dev
```

瀏覽器開啟：**http://localhost:5173**

開發模式下，Vite 會把 **`/api/*` proxy 到 `http://127.0.0.1:8080`**，因此前端與後端需**同時**運行。

### 前端環境變數（選用）

在 `frontend/client` 新增 **`.env`** 或 **`.env.local`**（Vite 會讀取 `VITE_` 前綴）：

```env
# 已部署到 Sepolia 的合約位址；未設時仍可測「純後端問卷」流程，但建立問卷後自動上鏈等步驟會跳過或失敗
VITE_CONTRACT_ADDRESS=0x你的合約位址
```

修改 `.env` 後需**重啟** `npm run dev`。

---

## 4. 建議測試順序（由淺入深）

### 4.1 僅後端 + API（不需錢包）

1. 確認 `GET http://127.0.0.1:8080/health`。
2. 用 `curl` 或 Postman 測 `GET http://127.0.0.1:8080/api/surveys`（空列表應為 `[]`）。

### 4.2 前端 + 後端（不需鏈上合約）

1. 開啟 http://localhost:5173 瀏覽列表、靜態頁面。
2. **建立問卷**：需 **MetaMask 連線 + 簽名登入**（呼叫 `/api/auth/nonce`、`/api/auth/verify` 取得 JWT）。
3. 若**未**設定 `VITE_CONTRACT_ADDRESS` 或略過鏈上步驟，問卷仍可能寫入 DB；合約綁定、上鏈抽獎等需合約位址與正確 calldata（見 `docs/CONTRACT_FUNCTION_CALL_MAP.md`）。

### 4.3 完整鏈上流程（Sepolia）

1. MetaMask 切換到 **Sepolia**（前端 `WalletContext` 會引導）。
2. 設定 **`VITE_CONTRACT_ADDRESS`** 為已部署合約。
3. 依團隊部署流程準備 **Chainlink VRF** 等（`SurveyChainSystem` 建構子需 subscription id）；細節以 `contract` 部署文件為準（目前倉庫內 README 較簡略，需自行對照 Hardhat/Foundry 專案若有的話）。

---

## 5. 常見問題與限制

| 現象 | 可能原因 |
|------|----------|
| 後端無法啟動 | PostgreSQL 未起、`.env` 密碼／庫名錯誤、5432 被占用 |
| 前端 API 404 / 連線失敗 | 後端未在 8080 運行，或 proxy 被改壞 |
| 登入後建立問卷 401 | JWT 遺失；確認 `localStorage` 有 `auth_token`，且後端 `JWT_SECRET` 與簽發時一致 |
| Navbar「待提領獎金」異常 | `Navbar.tsx` 會請求 **`GET /api/users/:address/won-surveys`**，目前 **Go 路由未實作**，預期會失敗或無資料；不影響核心問卷 API，但領獎 UI 需後端補路由或改前端 |
| 鏈上交易失敗 | 手寫 function selector 與合約 ABI 可能不一致，請以 `docs/CONTRACT_FUNCTION_CALL_MAP.md` 為準並改用 `encodeFunctionData` 對齊部署版 |

---

## 6. 一鍵檢查清單

- [ ] PostgreSQL 可連線，`web3survey` 資料庫存在  
- [ ] `backend/.env` 已設定且 `go run .` 成功  
- [ ] `curl http://127.0.0.1:8080/health` 為 ok  
- [ ] `frontend/client` 已 `npm install` 且 `npm run dev`  
- [ ] 瀏覽器可開 http://localhost:5173  
- [ ] （選用）`VITE_CONTRACT_ADDRESS` + Sepolia ETH + MetaMask  

---

## 7. 相關文件

- [PROJECT_ARCHITECTURE.md](./PROJECT_ARCHITECTURE.md) — 架構與 API 列表  
- [CONTRACT_FUNCTION_CALL_MAP.md](./CONTRACT_FUNCTION_CALL_MAP.md) — 合約函數與前端呼叫對照  

---

*若專案路徑或指令有變更，請以倉庫內 `main.go`、`vite.config.ts` 為準。*
