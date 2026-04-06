# 合約函數 ↔ 前端呼叫對照表

說明：

- **Selector**：以太坊函數選擇器（`keccak256(函數簽名)` 前 4 bytes），以專案內 `ethers`（與標準 Solidity ABI）計算。
- **`SurveyChainSystem.sol`**：倉庫內實際 Solidity 合約。
- **`contractABI.ts`（SurveyLottery）**：前端 ABI 檔註明對應 **`SurveyLottery.sol`**，與 `SurveyChainSystem.sol` **不是同一份合約**；若只部署 SurveyChainSystem，Navbar 的讀寫可能對不上鏈上程式。

---

## 1. `SurveyChainSystem.sol`（倉庫合約）

| Selector | 函數簽名（canonical） | mutability | 前端是否有呼叫 | 呼叫位置／備註 |
|----------|----------------------|------------|----------------|----------------|
| `0x1243fd99` | `createPoolA(string,uint256,uint256)` | payable | 有 | `CreateSurvey.tsx`：`ethers.Interface` + `encodeFunctionData` + `eth_sendTransaction` |
| `0x2269f1c9` | `voteA(uint256)` | nonpayable | **無** | Pool A 鏈上「投票／參與」應走此函數；目前未在 `src` 發現交易 |
| `0xc859eb7a` | `drawA(uint256)` | nonpayable | **意圖有，selector 不符** | `SurveyDetail.tsx` 註解為 `drawA`，實際使用 **`0x5a47af0e`**（見 §4） |
| `0xe47e7df7` | `createPoolB(string,uint8,uint256,uint256)` | nonpayable | **無** | |
| `0xf9f94fc5` | `betB(uint256,uint8)` | payable | **無** | |
| `0xb06d7c85` | `resolveAndDrawB(uint256,uint8)` | nonpayable | **無** | `SurveyDetail.tsx` 僅 toast，未送交易 |
| `0xdbc7d8fd` | `claim(uint8,uint256)` | nonpayable | **無（直接呼叫）** | 詳情頁文案提示使用者自行 `claim`；未用 `ethers` 封裝 |
| `0xd1058e59` | `claimAll()` | nonpayable | **無** | |
| `0xf14210a6` | `withdrawETH(uint256)` | nonpayable | **無** | `onlyOwner` |
| `0xa7ba3e2a` | `getPoolAInfo(uint256)` | view | **無** | |
| `0x7b37a067` | `getPoolBInfo(uint256)` | view | **無** | |
| `0x61def805` | `getPoolAParticipantCount(uint256)` | view | **無** | |
| `0x1f534e86` | `getPoolBPlayerCount(uint256)` | view | **無** | |
| `0x0de9bc86` | `getPoolBCorrectPlayerCount(uint256)` | view | **無** | |
| `0x364976ea` | `getPendingPrize()` | view | **無** | |
| `0xacd6d272` | `hasVotedA(uint256,address)` | view | **無** | |
| `0xd1494d96` | `hasBetB(uint256,address)` | view | **無** | |

合約內尚有 **internal** 的 `fulfillRandomWords`（Chainlink 回調），**不應由前端呼叫**，故不列入「前端整合」欄位。

---

## 2. `contractABI.ts` 所描述之 SurveyLottery 介面

以下 selector 皆由與 ABI 相同的函數簽名算出（`ethers.Interface`）。

| Selector | 函數簽名 | mutability | 前端是否有呼叫 | 呼叫位置／備註 |
|----------|----------|------------|----------------|----------------|
| `0x8c01d3b8` | `createSurvey(uint256,uint256,uint256)` | payable | **無** | |
| `0xb041f58a` | `fundSurvey(uint256)` | payable | **意圖類似，selector 不符** | `SurveyDetail.tsx` 手寫 **`0x5b4b5a6b`**（見 §4） |
| `0x53703f5c` | `registerParticipant(uint256)` | payable | **意圖類似，selector 不符** | `SurveyDetail.tsx` 手寫 **`0x4e71d92d`**（見 §4） |
| `0xc91ceb0e` | `requestLottery(uint256)` | nonpayable | **無** | 若對應舊版「抽獎請求」，目前未用此 selector |
| `0x2e8f3413` | `getSurveyInfo(uint256)` | view | **無** | |
| `0xc1e3bd3e` | `getParticipants(uint256)` | view | **無** | |
| `0x6b1426a4` | `getWinners(uint256)` | view | **無** | |
| `0x6f9fb98a` | `getContractBalance()` | view | **無** | |
| `0xa34398a2` | `hasParticipated(uint256,address)` | view | **無** | |
| `0xe804f4c0` | `surveyCount()` | view | **無** | |
| `0xd7098154` | `claimPrize(uint256)` | nonpayable | **無** | |
| `0xc503b251` | `claimMultiplePrizes(uint256[])` | nonpayable | **有** | `Navbar.tsx`：`contract.claimMultiplePrizes(idsWithReward)` |
| `0xc59b1f3c` | `getPendingReward(uint256,address)` | view | **有** | `Navbar.tsx`：迴圈查詢 |
| `0x26a1b62a` | `getTotalPendingReward(address,uint256[])` | view | **有** | `Navbar.tsx`：`getTotalPendingReward` |
| `0xbdd415af` | `isWinner(uint256,address)` | view | **無** | ABI 有定義，前端未呼叫 |

---

## 3. 前端檔案與合約互動方式（摘要）

| 檔案 | 合約位址來源 | 互動方式 | 涉及函數（名稱／意圖） |
|------|----------------|----------|-------------------------|
| `CreateSurvey.tsx` | `VITE_CONTRACT_ADDRESS` | `encodeFunctionData` + `eth_sendTransaction` | SurveyChain：**`createPoolA`** |
| `SurveyDetail.tsx` | `survey.contractAddress` 或 `VITE_CONTRACT_ADDRESS` | 手寫 `data`（4 byte selector + 參數） | 見 §4；參數多為 **後端問卷 `id`** 或 **`contractPoolId`** |
| `Navbar.tsx` | `VITE_CONTRACT_ADDRESS` | `ethers.Contract` + ABI | SurveyLottery：**`getTotalPendingReward`**、**`getPendingReward`**、**`claimMultiplePrizes`** |

後端 **Go** 不發送合約交易；僅 **錢包簽名驗證**使用 `go-ethereum`（與上表無關）。

---

## 4. `SurveyDetail.tsx` 手寫 Selector 與標準值對照（重要）

下列為程式碼中寫死的 selector，與 **同一專案內 `ethers` 依標準 ABI 算出**的數值比對。

| 用途（程式註解／上下文） | 手寫 selector | 若為 SurveyChain **`drawA(uint256)`** 標準值 | 若為 SurveyLottery **`registerParticipant`** / **`fundSurvey`** 標準值 |
|--------------------------|---------------|---------------------------------------------|------------------------------------------------------------------------|
| 參與費 `handlePayEntryFee` | `0x4e71d92d` | `voteA` = **`0x2269f1c9`** | `registerParticipant` = **`0x53703f5c`** |
| 獎金存入 `handleFundContract` | `0x5b4b5a6b` | — | `fundSurvey` = **`0xb041f58a`** |
| 抽獎 `handleDraw` / `handleDrawFromQualified` | `0x5a47af0e` | `drawA` = **`0xc859eb7a`** | `requestLottery` = **`0xc91ceb0e`**（語意不同） |

**結論**：手寫的三個 selector **與** SurveyChainSystem **及** SurveyLottery ABI **的標準 selector 皆不一致**。部署前請用實際編譯產物或 `cast sig "<signature>"` 再核對一次，並建議改為 **`Interface.encodeFunctionData`**，避免硬編碼錯誤。

---

## 5. 重新產生本表之指令（可選）

在 `frontend/client` 目錄下已安裝 `ethers` 時，可用下列方式重算 selector（範例）：

```bash
cd frontend/client
node -e "const {Interface}=require('ethers'); const i=new Interface(['function drawA(uint256)']); console.log(i.getFunction('drawA').selector);"
```

---

*本文件依倉庫內 `contract/.../SurveyChainSystem.sol` 與 `frontend/client/src/lib/contractABI.ts` 整理；合約改版後請同步更新。*
