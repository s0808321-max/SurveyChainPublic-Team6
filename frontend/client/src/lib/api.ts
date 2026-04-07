/**
 * REST API 客戶端
 * 對應 Go 後端（Gin）提供的 /api/* 路由
 * 前端透過 Vite proxy 將 /api/* 轉發到 Go 後端（port 8080）
 */

const BASE = "/api";

// ─── JWT Token 管理 ──────────────────────────────────────────────────────────

// ★ 新增：在 localStorage 存取 JWT token
export function getAuthToken(): string | null {
  return localStorage.getItem("auth_token");
}

export function setAuthToken(token: string): void {
  localStorage.setItem("auth_token", token);
}

export function clearAuthToken(): void {
  localStorage.removeItem("auth_token");
}

// ─── 通用 fetch 包裝 ──────────────────────────────────────────────────────────

// ★ 修正：加入 requiresAuth 參數，需要登入的路由自動帶上 Authorization header
async function request<T>(
  path: string,
  options?: RequestInit,
  requiresAuth = false
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  // ★ 核心修正：若需要認證，從 localStorage 取出 JWT token 加入 header
  if (requiresAuth) {
    const token = getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    // ★ 新增：401 時清除失效 token，讓使用者重新登入
    if (res.status === 401) {
      clearAuthToken();
    }
    let errMsg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      errMsg = body.error || body.message || errMsg;
    } catch {
      // ignore parse error
    }
    throw new Error(errMsg);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── 型別定義（與 Go models 對應） ───────────────────────────────────────────

export interface QuestionOption {
  id: number;
  questionId: number;
  optionText: string;
  orderIndex: number;
}

export interface SurveyQuestion {
  id: number;
  surveyId: number;
  questionText: string;
  questionType: "single" | "multiple" | "text";
  orderIndex: number;
  isRequired: boolean;
  createdAt: string;
  options?: QuestionOption[];
  qualifiedAddresses?: string[] | null;
}

export interface Survey {
  id: number;
  title: string;
  description: string;
  creatorAddress: string;
  rewardAmount: string;
  rewardToken: string;
  winnerCount: number;
  deadline: string;
  status: "draft" | "active" | "ended" | "drawn";
  contractAddress?: string | null;
  transactionHash?: string | null;
  winnerAddresses?: string | null;
  drawTransactionHash?: string | null;
  qualifiedAddresses?: string | string[] | null;
  entryFee: string;
  entryFeeCollected: string;
  // ★ 新增：合約 Pool ID 與 Pool 類型（對應合約的 countA/countB）
  contractPoolId?: number | null;
  poolType?: "A" | "B" | null;
  createdAt: string;
  updatedAt: string;
  questions?: SurveyQuestion[];
  participantCount?: number;
}

export interface RevealAnswersResponse {
  success: boolean;
  qualifiedCount: number;
  totalParticipants: number;
  gradedQuestionCount: number;
  qualifiedAddresses: string[];
}

export interface SurveyWithCount extends Survey {
  participantCount: number;
}

export interface Participant {
  id: number;
  surveyId: number;
  walletAddress: string;
  isWinner: boolean;
  submittedAt: string;
}

// ─── 認證 API ─────────────────────────────────────────────────────────────────

export const authApi = {
  /** 取得 nonce（用於 MetaMask 簽名） */
  getNonce: (wallet: string): Promise<{ nonce: string }> =>
    request(`/auth/nonce?wallet=${wallet.toLowerCase()}`),

  /** 驗證 MetaMask 簽名，成功後取得 JWT token */
  verify: (wallet: string, signature: string): Promise<{ success: boolean; token: string; wallet: string }> =>
    request("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ wallet, signature }),
    }),
};

// ─── 問卷 API ─────────────────────────────────────────────────────────────────

export const surveyApi = {
  /** 取得問卷列表（可選 status 篩選） */
  list: (
    status?: string,
    creator?: string,
    participant?: string,
    poolType?: "A" | "B"
  ): Promise<SurveyWithCount[]> => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (creator) qs.set("creator", creator);
    if (participant) qs.set("participant", participant);
    if (poolType) qs.set("poolType", poolType);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<SurveyWithCount[]>(`/surveys${suffix}`);
  },

  /** 取得單一問卷詳情（含題目、選項） */
  get: (id: number): Promise<Survey> => request<Survey>(`/surveys/${id}`),

  /** 創建新問卷 - ★ 修正：requiresAuth = true */
  create: (data: {
    title: string;
    description?: string;
    creatorAddress: string;
    rewardAmount: string;
    rewardToken?: string;
    winnerCount?: number;
    deadline: number;
    contractAddress?: string;
    transactionHash?: string;
    entryFee?: string;
    questions: {
      questionText: string;
      questionType: "single" | "multiple" | "text";
      isRequired?: boolean;
      options?: string[];
    }[];
  }): Promise<{ success: boolean; surveyId: number }> =>
    request("/surveys", { method: "POST", body: JSON.stringify(data) }, true),

  /** 更新問卷狀態 - ★ 修正：requiresAuth = true */
  updateStatus: (
    id: number,
    data: {
      status: "draft" | "active" | "ended" | "drawn";
      contractAddress?: string;
      transactionHash?: string;
      winnerAddresses?: string[];
      drawTransactionHash?: string;
    }
  ): Promise<{ success: boolean }> =>
    request(
      `/surveys/${id}/status`,
      { method: "PATCH", body: JSON.stringify(data) },
      true
    ),

  /** 更新問卷合約地址 - ★ 修正：requiresAuth = true，加入 contractPoolId 與 poolType */
  updateContract: (
    id: number,
    data: {
      contractAddress: string;
      transactionHash?: string;
      contractPoolId?: number; // ★ 合約內的 Pool ID（從 1 開始）
      poolType?: "A" | "B";   // ★ Pool 類型，必須與 contractPoolId 同時提供
    }
  ): Promise<{ success: boolean }> =>
    request(
      `/surveys/${id}/contract`,
      { method: "PATCH", body: JSON.stringify(data) },
      true
    ),

  /** 執行抽獎 - ★ 修正：requiresAuth = true，加入 winnerAddresses（鏈上結果） */
  draw: (
    id: number,
    data: {
      callerAddress: string;
      drawTransactionHash?: string;
      winnerAddresses?: string[]; // ★ 從鏈上 WinnersSelected 事件解析到的中獎者
    }
  ): Promise<{ success: boolean; winners: string[] }> =>
    request(
      `/surveys/${id}/draw`,
      { method: "POST", body: JSON.stringify(data) },
      true
    ),

  /** 創建者公布選擇題正確答案 - ★ 修正：requiresAuth = true */
  revealAnswers: (
    id: number,
    data: {
      callerAddress: string;
      answers: {
        questionId: number;
        correctOptionIds: number[];
      }[];
    }
  ): Promise<RevealAnswersResponse> =>
    request(
      `/surveys/${id}/answers`,
      { method: "POST", body: JSON.stringify(data) },
      true
    ),

  /** 取得可進入鏈上抽獎的資格地址列表 */
  getQualified: (id: number): Promise<{
    success: boolean;
    qualifiedCount: number;
    qualifiedAddresses: string[]; // ★ 修正：欄位名稱已與後端對齊
  }> => request(`/surveys/${id}/qualified`),
};

// ─── 參與者 API ───────────────────────────────────────────────────────────────

export const participantApi = {
  /** 提交問卷答案 - ★ 修正：requiresAuth = true */
  submit: (data: {
    surveyId: number;
    walletAddress: string;
    entryFeePaid?: string;
    entryFeeTransactionHash?: string;
    answers: {
      questionId: number;
      answerText?: string;
      selectedOptionIds?: number[];
    }[];
  }): Promise<{ success: boolean; participantId: number }> =>
    request(
      `/surveys/${data.surveyId}/participate`,
      {
        method: "POST",
        body: JSON.stringify({
          walletAddress: data.walletAddress,
          entryFeePaid: data.entryFeePaid ?? "",
          entryFeeTransactionHash: data.entryFeeTransactionHash ?? "",
          answers: data.answers,
        }),
      },
      true // ★ 需要 JWT
    ),

  /** 檢查錢包是否已參與（公開路由，不需要 JWT） */
  checkParticipation: (
    surveyId: number,
    wallet: string
  ): Promise<{ participated: boolean; isWinner: boolean; participantId?: number }> =>
    request(
      `/surveys/${surveyId}/check-participation?wallet=${wallet.toLowerCase()}`
    ),

  /** 取得問卷所有參與者（公開路由） */
  list: (surveyId: number): Promise<Participant[]> =>
    request(`/surveys/${surveyId}/participants`),
};
