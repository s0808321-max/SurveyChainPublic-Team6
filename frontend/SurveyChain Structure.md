# SurveyChain 專案目錄結構說明

> 本文件說明 Web3 Survey Platform（SurveyChain）每個資料夾與關鍵檔案的功用，適合新進開發者快速了解專案架構。

---

## 整體架構關係圖

```
瀏覽器（React + Vite）
    │
    ├─ /api/oauth/*  ──────────────────→  server/_core/oauth.ts（Node.js）
    ├─ /api/trpc/*   ──────────────────→  server/routers.ts（Node.js tRPC）
    └─ /api/surveys/* ─→ Express Proxy ─→  go-backend/（Go + Gin）
                                                │
                                                └─→  TiDB 資料庫
                                                      （drizzle/schema.ts 定義結構）

MetaMask（瀏覽器錢包擴充）
    └─ eth_sendTransaction ────────────→  contracts/SurveyLottery.sol（Sepolia 測試網）
                                                │
                                                └─→  Chainlink VRF（可驗證隨機抽獎）
```

---

## 根目錄（`/web3-survey-platform/`）

存放整個 monorepo 的設定檔與專案文件，前後端共用。

| 檔案 / 資料夾 | 功用 |
| :--- | :--- |
| `package.json` | Node.js 依賴清單與啟動腳本（`pnpm run dev`） |
| `vite.config.ts` | Vite 前端打包設定（路徑別名 `@/`、proxy 設定） |
| `tsconfig.json` | TypeScript 編譯設定（前後端共用） |
| `drizzle.config.ts` | Drizzle ORM 設定（資料庫連線、migration 路徑） |
| `vitest.config.ts` | 單元測試設定（vitest） |
| `components.json` | shadcn/ui 元件設定（主題色、路徑） |
| `todo.md` | 功能開發進度追蹤清單 |
| `DEPLOYMENT_GUIDE.md` | 智能合約部署完整指南 |
| `CHAINLINK_VRF_GUIDE.md` | Chainlink VRF 隨機抽獎整合說明 |
| `MONETIZATION_GUIDE.md` | 平台盈利模式規劃文件 |
| `THREE_CORE_FUNCTIONS.md` | 三大核心功能說明 |
| `TOKEN_TESTING_GUIDE.md` | 測試代幣使用指南 |
| `PROJECT_STRUCTURE.md` | 本文件：專案目錄結構說明 |

---

## `client/` — 前端（React + Vite）

使用者看到的所有介面，在瀏覽器中執行，不含任何私密資訊。

### `client/src/pages/` — 頁面元件

每個檔案對應一個路由頁面，由 `client/src/App.tsx` 統一管理路由。

| 檔案 | 路由 | 功用 |
| :--- | :--- | :--- |
| `Home.tsx` | `/` | 首頁 Landing Page，展示平台介紹與精選問卷 |
| `SurveyList.tsx` | `/surveys` | 問卷列表，支援狀態篩選（進行中 / 已結束） |
| `CreateSurvey.tsx` | `/create` | 問卷創建頁，設定題目、獎金、截止時間、參與費 |
| `SurveyDetail.tsx` | `/surveys/:id` | 問卷詳情頁，含填答、繳費、存入獎金、觸發抽獎 |
| `NotFound.tsx` | `*` | 404 找不到頁面 |
| `ComponentShowcase.tsx` | `/showcase` | 開發用元件展示頁（非正式功能） |

### `client/src/components/` — 可重用元件

| 檔案 | 功用 |
| :--- | :--- |
| `Navbar.tsx` | 頂部導覽列，含錢包連接按鈕與 Sepolia 網路狀態警告 |
| `SurveyCard.tsx` | 問卷卡片，顯示標題、獎金、截止時間、參與人數 |
| `DashboardLayout.tsx` | 側邊欄儀表板佈局（管理後台用，目前備用） |
| `DashboardLayoutSkeleton.tsx` | 儀表板載入骨架屏 |
| `AIChatBox.tsx` | AI 聊天介面元件（備用，目前未啟用） |
| `ErrorBoundary.tsx` | React 錯誤邊界，防止元件崩潰影響整頁 |
| `ui/` | shadcn/ui 基礎元件庫（Button、Card、Dialog、Toast 等） |

### `client/src/contexts/` — React Context（全域狀態）

| 檔案 | 功用 |
| :--- | :--- |
| `WalletContext.tsx` | 管理 MetaMask 錢包狀態（地址、網路、連接 / 切換函數） |
| `ThemeContext.tsx` | 管理深色 / 淺色主題切換 |

### `client/src/lib/` — 工具函數與 API 客戶端

| 檔案 | 功用 |
| :--- | :--- |
| `api.ts` | **REST API 客戶端**，所有對 Go 後端的 fetch 呼叫集中於此 |
| `contractABI.ts` | 智能合約 ABI 定義（`SurveyLottery.sol` 的函數簽章與事件） |
| `network.ts` | 網路常數（Sepolia chainId、合約地址讀取、ETH → Wei 轉換） |
| `trpc.ts` | tRPC 客戶端設定（僅用於 OAuth 認證相關呼叫） |
| `utils.ts` | 通用工具函數（如 `cn()` className 合併） |

### `client/public/` — 靜態公開資源

僅存放小型設定檔（`favicon.ico`、`robots.txt`）。**請勿**在此存放圖片或影片，大型靜態資源應上傳至 CDN。

---

## `server/` — Node.js 後端（Express + tRPC）

目前主要負責 **OAuth 認證**、**tRPC 路由**與**對 Go 後端的 Proxy 轉發**，業務邏輯已遷移至 Go 後端。

| 檔案 | 功用 |
| :--- | :--- |
| `routers.ts` | tRPC 路由定義（`auth.me`、`auth.logout`、`system.notifyOwner`） |
| `db.ts` | Drizzle ORM 資料庫查詢輔助函數（Node.js 用） |
| `storage.ts` | S3 檔案儲存輔助函數（`storagePut`、`storageGet`） |
| `chainEventListener.ts` | 鏈上事件監聽器（監聽合約 `LotteryDrawn` 事件並同步資料庫） |
| `auth.logout.test.ts` | 登出功能單元測試（vitest） |
| `survey.test.ts` | 問卷 API 單元測試（vitest） |

### `server/_core/` — Node.js 框架核心（請勿修改）

| 檔案 | 功用 |
| :--- | :--- |
| `index.ts` | Express 伺服器進入點，含對 Go 後端的 Proxy Middleware 設定 |
| `vite.ts` | Vite Dev Server 整合（開發模式的 HMR 熱更新） |
| `context.ts` | tRPC Context 建立（從 session cookie 解析用戶資訊） |
| `trpc.ts` | tRPC 初始化（`publicProcedure`、`protectedProcedure`） |
| `env.ts` | 環境變數型別定義與驗證 |

---

## `go-backend/` — Go 後端（Gin + GORM）

**核心業務邏輯所在**，處理所有問卷相關的 REST API，透過 Node.js Express Proxy 對外提供服務。

| 資料夾 / 檔案 | 功用 |
| :--- | :--- |
| `cmd/main.go` | Go 程式進入點，初始化資料庫連線並啟動 Gin 伺服器（port 8080） |
| `internal/db/db.go` | 資料庫連線設定，含 TiDB DSN 格式解析（`convertDSN` 函數） |
| `internal/models/models.go` | GORM 資料模型定義（`Survey`、`Question`、`Option`、`Participant`、`Submission`）與 DTO |
| `internal/handlers/survey.go` | 所有 API 的業務邏輯實作（問卷 CRUD、參與費驗證、抽獎執行） |
| `internal/routes/routes.go` | Gin 路由設定，將 URL 路徑對應到 handler 函數 |
| `bin/` | Go 編譯後的二進位執行檔（`go build` 產生） |
| `go.mod` / `go.sum` | Go 模組依賴清單與版本鎖定 |

### Go 後端提供的 API 端點

| 方法 | 路徑 | 功用 |
| :--- | :--- | :--- |
| `GET` | `/health` | 健康檢查 |
| `GET` | `/api/surveys` | 取得問卷列表 |
| `POST` | `/api/surveys` | 創建新問卷 |
| `GET` | `/api/surveys/:id` | 取得單一問卷詳情 |
| `PATCH` | `/api/surveys/:id/status` | 更新問卷狀態 |
| `PATCH` | `/api/surveys/:id/contract` | 更新合約地址 |
| `POST` | `/api/surveys/:id/participate` | 提交問卷答案 |
| `GET` | `/api/surveys/:id/participants` | 取得參與者列表 |
| `GET` | `/api/surveys/:id/check-participation` | 檢查錢包是否已參與 |
| `POST` | `/api/surveys/:id/draw` | 執行後端抽獎 |

---

## `contracts/` — 智能合約（Solidity + Hardhat）

部署到 Sepolia 測試網的鏈上程式碼，負責資金託管與可驗證隨機抽獎。

| 檔案 | 功用 |
| :--- | :--- |
| `SurveyLottery.sol` | 核心智能合約：問卷創建、參與費收取、Chainlink VRF 抽獎、獎金自動發放 |
| `deploy.js` | Hardhat 部署腳本（部署合約到 Sepolia 並設定 VRF 訂閱） |
| `SurveyLottery.test.js` | Hardhat 測試腳本（使用 Mock VRF Coordinator 在本地測試） |
| `hardhat.config.js` | Hardhat 設定（Sepolia / Mainnet 網路、Etherscan 驗證、Gas 報告） |
| `.env.example` | 環境變數範本（私鑰、RPC URL、VRF 訂閱 ID 等，複製為 `.env` 後填入真實值） |
| `.gitignore` | 排除 `.env`、`artifacts/`、`cache/`、`node_modules/`，防止私鑰洩漏 |

### 合約函數呼叫點（前端觸發）

| 合約函數 | 觸發頁面 | 觸發時機 |
| :--- | :--- | :--- |
| `fundSurvey(surveyId)` | `SurveyDetail.tsx` | 創建者點擊「存入獎金」 |
| `registerParticipant(surveyId)` | `SurveyDetail.tsx` | 參與者點擊「繳納參與費」 |
| `requestLottery(surveyId)` | `SurveyDetail.tsx` | 創建者點擊「執行抽獎」 |
| `createSurvey(...)` | *(ABI 已定義，前端尚未呼叫)* | 預留給未來鏈上創建問卷 |

---

## `drizzle/` — 資料庫 Schema 與 Migration（Node.js 用）

| 檔案 | 功用 |
| :--- | :--- |
| `schema.ts` | 資料庫表格定義（Drizzle ORM TypeScript Schema，為 Go GORM 的對應版本） |
| `relations.ts` | 表格關聯定義（一對多關係：問卷 → 題目 → 選項） |
| `0000_*.sql` | 初始資料庫建表 Migration |
| `0001_*.sql` | 新增 entryFee 相關欄位 Migration |
| `0002_*.sql` | 最新結構調整 Migration |
| `meta/` | Drizzle 自動生成的 migration 元資料（勿手動修改） |
| `migrations/` | Migration 執行記錄 |

---

## `shared/` — 前後端共用型別

| 檔案 | 功用 |
| :--- | :--- |
| `const.ts` | 共用常數（如問卷狀態枚舉、API 路徑） |
| `types.ts` | 共用 TypeScript 型別定義（前後端共用的介面） |

---

## `patches/` — 套件修補檔

存放 `pnpm patch` 產生的套件修補檔，用於修正第三方套件的問題，不影響業務邏輯。

---

## 開發時的修改範圍建議

| 需求 | 應修改的位置 |
| :--- | :--- |
| 新增 UI 頁面 | `client/src/pages/` + `client/src/App.tsx` |
| 新增可重用元件 | `client/src/components/` |
| 新增 / 修改 REST API | `go-backend/internal/handlers/survey.go` + `go-backend/internal/routes/routes.go` |
| 修改資料庫結構 | `drizzle/schema.ts`（產生 migration）+ `go-backend/internal/models/models.go` |
| 修改智能合約邏輯 | `contracts/SurveyLottery.sol` + 重新部署 |
| 新增認證 / 登入邏輯 | `server/routers.ts`（tRPC）+ `server/_core/oauth.ts` |
| 修改全域樣式 | `client/src/index.css` |

---

*文件版本：1.0 | 最後更新：2026-03-30*
