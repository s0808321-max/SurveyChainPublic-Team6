# Web3 Survey Platform TODO

## 資料庫 & 後端
- [x] 設計並建立 surveys 資料表（問卷）
- [x] 設計並建立 questions 資料表（問題）
- [x] 設計並建立 options 資料表（選項）
- [x] 設計並建立 participants 資料表（參與者）
- [x] 設計並建立 submissions 資料表（提交答案）
- [x] 實作問卷 CRUD API（創建、查詢、更新）
- [x] 實作問題與選項 API
- [x] 實作參與者記錄 API（記錄錢包地址）
- [x] 實作答案提交 API
- [x] 實作抽獎邏輯 API（隨機選取中獎者）
- [x] 實作問卷狀態更新（進行中/已結束）

## 前端頁面
- [x] 首頁（Landing Page）
- [x] 問卷列表頁面（所有問卷、狀態篩選）
- [x] 問卷創建頁面（題目設計、獎金設定、截止時間）
- [x] 問卷填寫頁面（顯示題目、收集答案、連接錢包）
- [x] 問卷詳情頁面（獎金池、參與人數、剩餘時間、中獎者）
- [x] 問卷管理頁面（創建者操作：存入獎金、執行抽獎）

## Web3 功能
- [x] MetaMask 錢包連接功能（WalletContext）
- [x] 顯示錢包地址（縮短格式）
- [x] 存入獎金（MetaMask eth_sendTransaction）
- [x] 抽獎轉帳（後端隨機抽獎 + 鏈上互動說明）
- [x] 網路切換提示（Sepolia 測試網）

## 智能合約 & 文件
- [x] 撰寫 SurveyLottery.sol 智能合約程式碼（三大核心功能）
- [x] 撰寫 Hardhat 部署腳本（deploy.js）
- [x] 撰寫 Hardhat 測試腳本（SurveyLottery.test.js）
- [x] 撰寫完整部署與測試指南（DEPLOYMENT_GUIDE.md）

## 測試
- [x] 後端 API 單元測試（vitest，13 個測試全部通過）
- [x] 前端流程驗證（瀏覽器截圖確認）

## Go 後端改寫
- [x] 初始化 Go 模組（go mod init）並安裝 Gin、GORM、go-sql-driver
- [x] 建立 Go 專案目錄結構（models、handlers、routes、db）
- [x] 實作資料庫連線與 GORM 模型（Survey、Question、Option、Participant、Submission）
- [x] 實作問卷 API（GET /surveys、POST /surveys、GET /surveys/:id）
- [x] 實作參與者 API（POST /surveys/:id/participate、GET /surveys/:id/participants）
- [x] 實作抽獎 API（POST /surveys/:id/draw）
- [x] 實作問卷狀態更新 API（PATCH /surveys/:id/status）
- [x] 前端調整：將 tRPC 呼叫改為 REST fetch（建立 client/src/lib/api.ts）
- [x] 撰寫 Go 後端單元測試（11 個測試全部通過）
- [x] 撰寫 Go 後端啟動與部署說明（go-backend/README.md）

## Chainlink VRF v2.5 整合
- [x] 改寫智能合約整合 Chainlink VRF v2.5（訂閱模式）
- [x] 更新 Hardhat 部署腳本（含 VRF 訂閱設定）
- [x] 更新 Hardhat 測試腳本（Mock VRF Coordinator）
- [x] 更新前端：requestLottery + 輪詢等待 VRF 回調
- [x] 後端新增事件監聽器：同步 LotteryDrawn 事件到資料庫（chainEventListener.ts）
- [x] 撰寫 Chainlink VRF 整合說明文件（CHAINLINK_VRF_GUIDE.md）

## 參與費（Entry Fee）機制
- [x] 合約新增 entryFee 欄位（發問者可設定，0 表示免費）
- [x] 合約 registerParticipant 改為 payable，驗證繳費金額並累積到 rewardAmount
- [x] 合約新增 entryFeeCollected 欄位追蹤累積的參與費總額
- [x] 合約 createSurvey 允許 msg.value 為 0（純參與費模式）或 > 0（混合模式）
- [x] 後端 Schema 新增 entryFee 欄位
- [x] 後端 API 更新：createSurvey 傳入 entryFee 參數
- [x] 前端創建問卷頁面：新增「參與費設定」欄位
- [x] 前端問卷詳情頁面：顯示參與費金額，繳費後才能提交
- [x] 前端問卷列表：顯示是否需要參與費

## Sepolia 網路強制切換與合約地址整合
- [x] 建立網路常數設定檔（SEPOLIA_CHAIN_ID、RPC URL、區塊瀏覽器連結）
- [x] 建立合約 ABI 模組（SurveyLottery ABI JSON）
- [x] WalletContext 新增 isCorrectNetwork 狀態和 switchToSepolia 函數
- [x] Navbar 顯示網路狀態警告（非 Sepolia 時提示切換）
- [x] SurveyDetail 所有鏈上操作前強制切換到 Sepolia
- [x] SurveyDetail 存入獎金使用真實合約地址和 ABI
- [x] SurveyDetail 繳納參與費使用真實合約地址和 ABI
- [x] SurveyDetail 觸發抽獎使用真實合約地址和 ABI
- [x] 後端 API 支援 contractAddress 欄位更更新（原已支援）
- [x] 前端創建問卷後可設定合約地址（透過 VITE_CONTRACT_ADDRESS 環境變數）

## Go 後端完整遷移（取代 Node.js tRPC）
- [x] 補全 Go models.go：新增 entryFee、entryFeeCollected 欄位與 SurveyWithCount、SubmitSurveyInput DTO
- [x] 補全 Go handlers/survey.go：對齊所有 Node.js 路由（updateContract、entryFee 邏輯）
- [x] 修正 Go db.go：convertDSN 函數正確解析 TiDB mysql:// URL 格式（含 SSL）
- [x] 修正 Go ORDER BY 欄位名稱（camelCase 對應資料庫實際欄位 `createdAt`）
- [x] 建立前端 REST API 客戶端（client/src/lib/api.ts），取代所有 tRPC 呼叫
- [x] 更新 SurveyList.tsx：改用 REST API
- [x] 更新 Home.tsx：改用 REST API
- [x] 更新 CreateSurvey.tsx：改用 REST API
- [x] 更新 SurveyDetail.tsx：改用 REST API
- [x] 在 Node.js Express 加入 http-proxy-middleware，將 /api/surveys、/health 轉發到 Go（port 8080）
- [x] 修正 vite.ts catch-all handler，讓 /api/* 請求通過到 proxy
- [x] 更新 package.json：新增 dev:go、dev:all 腳本
- [x] 確認 contracts/hardhat.config.js 設定完整（Sepolia/Mainnet/Etherscan）
- [x] 確認 contracts/.env.example 包含所有必要環境變數

## 程式碼整理
- [x] 清除 server/routers.ts 中廢棄的 survey/participant tRPC 路由，只保留 auth 與 system
