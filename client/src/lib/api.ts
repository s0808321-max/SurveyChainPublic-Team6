/**
 * REST API 客戶端
 * 對應 Go 後端（Gin）提供的 /api/* 路由
 * 前端透過 Vite proxy 將 /api/* 轉發到 Go 後端（port 8080）
 */

const BASE = "/api";

// ─── 通用 fetch 包裝 ──────────────────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (!res.ok) {
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
  entryFee: string;
  entryFeeCollected: string;
  createdAt: string;
  updatedAt: string;
  questions?: SurveyQuestion[];
  participantCount?: number;
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

// ─── 問卷 API ─────────────────────────────────────────────────────────────────

export const surveyApi = {
  /** 取得問卷列表（可選 status 篩選） */
  list: (status?: string): Promise<SurveyWithCount[]> => {
    const qs = status ? `?status=${status}` : "";
    return request<SurveyWithCount[]>(`/surveys${qs}`);
  },

  /** 取得單一問卷詳情（含題目、選項） */
  get: (id: number): Promise<Survey> => request<Survey>(`/surveys/${id}`),

  /** 創建新問卷 */
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
    request("/surveys", { method: "POST", body: JSON.stringify(data) }),

  /** 更新問卷狀態 */
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
    request(`/surveys/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  /** 更新問卷合約地址（鏈上部署後） */
  updateContract: (
    id: number,
    data: { contractAddress: string; transactionHash?: string }
  ): Promise<{ success: boolean }> =>
    request(`/surveys/${id}/contract`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  /** 執行抽獎 */
  draw: (
    id: number,
    data: { callerAddress: string; drawTransactionHash?: string }
  ): Promise<{ success: boolean; winners: string[] }> =>
    request(`/surveys/${id}/draw`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ─── 參與者 API ───────────────────────────────────────────────────────────────

export const participantApi = {
  /** 提交問卷答案 */
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
    request(`/surveys/${data.surveyId}/participate`, {
      method: "POST",
      body: JSON.stringify({
        walletAddress: data.walletAddress,
        entryFeePaid: data.entryFeePaid ?? "",
        entryFeeTransactionHash: data.entryFeeTransactionHash ?? "",
        answers: data.answers,
      }),
    }),

  /** 檢查錢包是否已參與 */
  checkParticipation: (
    surveyId: number,
    wallet: string
  ): Promise<{ participated: boolean; isWinner: boolean; participantId?: number }> =>
    request(
      `/surveys/${surveyId}/check-participation?wallet=${wallet.toLowerCase()}`
    ),

  /** 取得問卷所有參與者 */
  list: (surveyId: number): Promise<Participant[]> =>
    request(`/surveys/${surveyId}/participants`),
};
