/**
 * SurveyLottery 智能合約 ABI
 * 對應 contracts/SurveyLottery.sol（Chainlink VRF v2.5 版本）
 *
 * 部署後請確認此 ABI 與實際部署的合約版本一致。
 */

export const SURVEY_LOTTERY_ABI = [
  // ─── 寫入函數（State-Changing） ───────────────────────────────────────────

  /**
   * createSurvey：創建問卷並存入初始獎金（可為 0，純參與費模式）
   * @param winnerCount 中獎名額
   * @param deadline    截止時間（Unix 秒）
   * @param entryFee    參與費（wei），0 表示免費
   * payable：可附帶 ETH 作為初始獎金
   */
  {
    name: "createSurvey",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "winnerCount", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "entryFee", type: "uint256" },
    ],
    outputs: [{ name: "surveyId", type: "uint256" }],
  },

  /**
   * fundSurvey：追加獎金（僅限創建者）
   * @param surveyId 問卷 ID
   * payable：附帶 ETH 追加到獎金池
   */
  {
    name: "fundSurvey",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "surveyId", type: "uint256" }],
    outputs: [],
  },

  /**
   * registerParticipant：參與問卷（若有參與費則需附帶對應 ETH）
   * @param surveyId 問卷 ID
   * payable：若 entryFee > 0 則需附帶對應 ETH
   */
  {
    name: "registerParticipant",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "surveyId", type: "uint256" }],
    outputs: [],
  },

  /**
   * requestLottery：觸發 Chainlink VRF 抽獎請求（僅限創建者，截止後才可呼叫）
   * @param surveyId 問卷 ID
   */
  {
    name: "requestLottery",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "surveyId", type: "uint256" }],
    outputs: [{ name: "requestId", type: "uint256" }],
  },

  // ─── 查詢函數（View / Pure） ──────────────────────────────────────────────

  /**
   * getSurveyInfo：取得問卷基本資訊
   */
  {
    name: "getSurveyInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "surveyId", type: "uint256" }],
    outputs: [
      { name: "creator", type: "address" },
      { name: "rewardAmount", type: "uint256" },
      { name: "entryFee", type: "uint256" },
      { name: "winnerCount", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "funded", type: "bool" },
      { name: "participantCount", type: "uint256" },
    ],
  },

  /**
   * getParticipants：取得所有參與者地址列表
   */
  {
    name: "getParticipants",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "surveyId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }],
  },

  /**
   * getWinners：取得中獎者地址列表（抽獎後才有值）
   */
  {
    name: "getWinners",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "surveyId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }],
  },

  /**
   * getContractBalance：取得合約目前鎖定的 ETH 總量（wei）
   */
  {
    name: "getContractBalance",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },

  /**
   * hasParticipated：查詢某地址是否已參與指定問卷
   */
  {
    name: "hasParticipated",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "surveyId", type: "uint256" },
      { name: "participant", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },

  /**
   * surveyCount：目前問卷總數
   */
  {
    name: "surveyCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },

  // ─── 事件（Events） ───────────────────────────────────────────────────────

  {
    name: "SurveyCreated",
    type: "event",
    inputs: [
      { name: "surveyId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "deadline", type: "uint256", indexed: false },
      { name: "entryFee", type: "uint256", indexed: false },
    ],
  },
  {
    name: "SurveyFunded",
    type: "event",
    inputs: [
      { name: "surveyId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "totalReward", type: "uint256", indexed: false },
    ],
  },
  {
    name: "ParticipantRegistered",
    type: "event",
    inputs: [
      { name: "surveyId", type: "uint256", indexed: true },
      { name: "participant", type: "address", indexed: true },
      { name: "entryFeePaid", type: "uint256", indexed: false },
    ],
  },
  {
    name: "LotteryRequested",
    type: "event",
    inputs: [
      { name: "surveyId", type: "uint256", indexed: true },
      { name: "requestId", type: "uint256", indexed: true },
    ],
  },
  {
    name: "LotteryDrawn",
    type: "event",
    inputs: [
      { name: "surveyId", type: "uint256", indexed: true },
      { name: "winners", type: "address[]", indexed: false },
      { name: "rewardPerWinner", type: "uint256", indexed: false },
    ],
  },
  // ─── 提領相關函數 ──────────────────────────────────────────────────────────

  /**
   * claimPrize：中獎者提領單一問卷的獎金
   * @param surveyId 問卷 ID
   */
  {
    name: "claimPrize",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "surveyId", type: "uint256" }],
    outputs: [],
  },

  /**
   * claimMultiplePrizes：批量提領多個問卷的獎金
   * @param surveyIds 問卷 ID 陣列
   */
  {
    name: "claimMultiplePrizes",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "surveyIds", type: "uint256[]" }],
    outputs: [],
  },

  /**
   * getPendingReward：查詢某用戶在指定問卷的待提領金額
   */
  {
    name: "getPendingReward",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "surveyId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },

  /**
   * getTotalPendingReward：批量查詢某用戶在多個問卷的待提領總金額
   */
  {
    name: "getTotalPendingReward",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "surveyIds", type: "uint256[]" },
    ],
    outputs: [{ name: "total", type: "uint256" }],
  },

  /**
   * isWinner：查詢某用戶是否為指定問卷的中獎者
   */
  {
    name: "isWinner",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "surveyId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },

  // ─── 提領相關事件 ──────────────────────────────────────────────────────────

  {
    name: "RewardClaimed",
    type: "event",
    inputs: [
      { name: "surveyId", type: "uint256", indexed: true },
      { name: "winner", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export type SurveyStatus = 0 | 1 | 2; // 0: Active, 1: Drawn, 2: Cancelled
