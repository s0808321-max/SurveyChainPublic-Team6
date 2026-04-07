/**
 * SurveyChainSystem 智能合約 ABI
 * 對應 contracts/SurveyChainSystem.sol（Chainlink VRF v2.5 版本）
 *
 * ★ 此 ABI 已完全重寫以對應新合約，舊版 SurveyLottery.sol 的函數已全部移除。
 * 部署後請確認此 ABI 與實際部署的合約版本一致。
 */

export const SURVEY_CHAIN_ABI = [
  // ─── Pool A：投票抽獎 ────────────────────────────────────────────────────

  {
    name: "createPoolA",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "_title",  type: "string"  },
      { name: "_maxW",   type: "uint256" },
      { name: "_min",    type: "uint256" },
    ],
    outputs: [],
  },

  {
    name: "voteA",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_id", type: "uint256" }],
    outputs: [],
  },

  {
    name: "drawA",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_id", type: "uint256" }],
    outputs: [],
  },

  // ─── Pool B：題目競猜（下注） ─────────────────────────────────────────────

  {
    name: "createPoolB",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_q",        type: "string"  },
      { name: "_optCount", type: "uint8"   },
      { name: "_maxW",     type: "uint256" },
      { name: "_min",      type: "uint256" },
    ],
    outputs: [],
  },

  {
    name: "betB",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "_id",     type: "uint256" },
      { name: "_choice", type: "uint8"   },
    ],
    outputs: [],
  },

  {
    name: "resolveAndDrawB",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_id",     type: "uint256" },
      { name: "_answer", type: "uint8"   },
    ],
    outputs: [],
  },

  // ─── 領獎 ─────────────────────────────────────────────────────────────────

  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_type", type: "uint8"   },
      { name: "_id",   type: "uint256" },
    ],
    outputs: [],
  },

  {
    name: "claimAll",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },

  // ─── 查詢：Pool A ──────────────────────────────────────────────────────────

  {
    name: "getPoolAInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "title",            type: "string"  },
          { name: "prizePool",        type: "uint256" },
          { name: "maxWinners",       type: "uint256" },
          { name: "deadline",         type: "uint256" },
          { name: "participantCount", type: "uint256" },
          { name: "isDrawn",          type: "bool"    },
        ],
      },
    ],
  },

  {
    name: "getPoolAParticipantCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },

  {
    name: "hasVotedA",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_id",   type: "uint256" },
      { name: "_user", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },

  // ─── 查詢：Pool B ──────────────────────────────────────────────────────────

  {
    name: "getPoolBInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "question",           type: "string"  },
          { name: "optionCount",        type: "uint8"   },
          { name: "maxWinners",         type: "uint256" },
          { name: "deadline",           type: "uint256" },
          { name: "prizePool",          type: "uint256" },
          { name: "creator",            type: "address" },
          { name: "playerCount",        type: "uint256" },
          { name: "correctPlayerCount", type: "uint256" },
          { name: "correctAnswer",      type: "uint8"   },
          { name: "isResolved",         type: "bool"    },
          { name: "isDrawn",            type: "bool"    },
        ],
      },
    ],
  },

  {
    name: "getPoolBPlayerCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },

  {
    name: "getPoolBCorrectPlayerCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },

  {
    name: "hasBetB",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_id",   type: "uint256" },
      { name: "_user", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },

  // ─── 查詢：獎金 ───────────────────────────────────────────────────────────

  {
    name: "getPendingPrize",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "total", type: "uint256" }],
  },

  {
    name: "isWinner",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "",      type: "uint8"   },
      { name: "",      type: "uint256" },
      { name: "",      type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },

  {
    name: "prizePerWinner",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint8"   },
      { name: "", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },

  {
    name: "lockedPrize",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },

  // ─── 查詢：計數器 ─────────────────────────────────────────────────────────

  {
    name: "countA",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },

  {
    name: "countB",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },

  // ─── 事件 ─────────────────────────────────────────────────────────────────

  {
    name: "PoolACreated",
    type: "event",
    inputs: [
      { name: "id",        type: "uint256", indexed: true  },
      { name: "title",     type: "string",  indexed: false },
      { name: "prizePool", type: "uint256", indexed: false },
      { name: "deadline",  type: "uint256", indexed: false },
    ],
  },

  {
    name: "PoolBCreated",
    type: "event",
    inputs: [
      { name: "id",       type: "uint256", indexed: true  },
      { name: "question", type: "string",  indexed: false },
      { name: "deadline", type: "uint256", indexed: false },
    ],
  },

  {
    name: "DrawRequested",
    type: "event",
    inputs: [
      { name: "poolType",  type: "uint8",   indexed: true  },
      { name: "poolId",    type: "uint256", indexed: true  },
      { name: "requestId", type: "uint256", indexed: false },
    ],
  },

  {
    name: "WinnersSelected",
    type: "event",
    inputs: [
      { name: "poolType",      type: "uint8",   indexed: true  },
      { name: "poolId",        type: "uint256", indexed: true  },
      { name: "winnerCount",   type: "uint256", indexed: false },
      { name: "prizePerWinner",type: "uint256", indexed: false },
    ],
  },

  {
    name: "Claimed",
    type: "event",
    inputs: [
      { name: "poolType", type: "uint8",   indexed: true  },
      { name: "poolId",   type: "uint256", indexed: true  },
      { name: "winner",   type: "address", indexed: true  },
      { name: "amount",   type: "uint256", indexed: false },
    ],
  },

  {
    name: "NoWinnersRefunded",
    type: "event",
    inputs: [
      { name: "poolBId",  type: "uint256", indexed: true  },
      { name: "creator",  type: "address", indexed: false },
      { name: "amount",   type: "uint256", indexed: false },
    ],
  },
] as const;

// 向後相容：舊程式碼引用 SURVEY_LOTTERY_ABI 的地方暫時指向新 ABI
// ★ 待清理：請將所有 import { SURVEY_LOTTERY_ABI } 改為 import { SURVEY_CHAIN_ABI }
export const SURVEY_LOTTERY_ABI = SURVEY_CHAIN_ABI;
