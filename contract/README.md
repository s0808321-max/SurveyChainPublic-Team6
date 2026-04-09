# SurveyChain 合約（`SurveyChainSystem`）

## 原始碼

- 主合約：`contracts/contracts/SurveyChainSystem.sol`（Chainlink VRF v2.5 等依賴在 Remix 中由 GitHub 匯入編譯）

## 已部署（Sepolia）

| 項目 | 值 |
|------|-----|
| **網路** | Sepolia（chainId `11155111`） |
| **部署方式** | Remix IDE |
| **合約地址** | `0x4a40a9273F312a2D5C5c1Fa056C6B5b603336F2A` |
| **Etherscan** | [Sepolia 合約頁](https://sepolia.etherscan.io/address/0x4a40a9273F312a2D5C5c1Fa056C6B5b603336F2A) |

## 前端連線

在 `frontend/client` 建立 `.env` 或 `.env.local`（可參考同目錄 `.env.example`）：

```env
VITE_CONTRACT_ADDRESS=0x4a40a9273F312a2D5C5c1Fa056C6B5b603336F2A
```

修改後需重啟 `npm run dev`。
