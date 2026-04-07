import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import {
  surveyApi,
  participantApi,
  type Survey,
  type SurveyQuestion,
  type RevealAnswersResponse,
} from "@/lib/api";
import { loginWithWallet } from "@/lib/web3Auth";
import { useWallet } from "@/contexts/WalletContext";
import { CONTRACT_ADDRESS, ethToWeiHex, getEtherscanTxUrl } from "@/lib/network";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Trophy,
  Clock,
  Users,
  Wallet,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Shuffle,
  Copy,
  ArrowLeft,
  BookOpen,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Link } from "wouter";

/** 與 CreateSurvey Pool B 一致：依 order 第一題、2～10 個選項的選擇題（作為 betB 題目） */
function getPoolBChainQuestion(survey: Survey): SurveyQuestion | null {
  const qs = [...(survey.questions ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  for (const q of qs) {
    if (q.questionType === "text") continue;
    const n = (q.options ?? []).filter((o) => o.optionText?.trim()).length;
    if (n >= 2 && n <= 10) return q;
  }
  return null;
}

/** betB 的 _choice：選項依 orderIndex 排序後的 0-based 索引 */
function choiceIndexForBetB(
  q: SurveyQuestion,
  selectedOptionIds: number[] | undefined
): number | null {
  if (!selectedOptionIds?.length) return null;
  const picked = selectedOptionIds[0];
  const sorted = [...(q.options ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const idx = sorted.findIndex((o) => o.id === picked);
  if (idx < 0 || idx > 255) return null;
  return idx;
}

function Countdown({ deadline }: { deadline: Date }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const diff = new Date(deadline).getTime() - now.getTime();
  if (diff <= 0) return <span className="text-red-500 font-semibold">已截止</span>;

  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  return (
    <div className="flex gap-2 text-center">
      {[{ v: d, l: "天" }, { v: h, l: "時" }, { v: m, l: "分" }, { v: s, l: "秒" }].map(({ v, l }) => (
        <div key={l} className="bg-primary/10 rounded-lg px-3 py-2 min-w-[3rem]">
          <div className="text-xl font-bold text-primary">{String(v).padStart(2, "0")}</div>
          <div className="text-xs text-muted-foreground">{l}</div>
        </div>
      ))}
    </div>
  );
}

// ★ 新增：解析交易回執中的 WinnersSelected 事件，取得中獎者地址
async function parseWinnersFromReceipt(txHash: string): Promise<string[]> {
  if (!window.ethereum) return [];
  try {
    // 輪詢等待回執（VRF 回調需要額外時間）
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const receipt = await window.ethereum.request({
        method: "eth_getTransactionReceipt",
        params: [txHash],
      }) as { logs: { topics: string[]; data: string; address: string }[] } | null;

      if (!receipt) continue;

      // WinnersSelected event topic: keccak256("WinnersSelected(uint8,uint256,uint256,uint256)")
      // topics[1]=poolType, topics[2]=poolId — 實際中獎者需另查 isWinner mapping
      // 由於 WinnersSelected 不包含地址列表，改為監聽個別 Claimed 事件或查合約狀態
      // 這裡返回空陣列，由後端 draw API fallback 處理
      return [];
    }
  } catch (e) {
    console.error("解析交易回執失敗", e);
  }
  return [];
}

// ★ 確保已登入（有 JWT），若未登入則觸發 MetaMask 簽名流程
async function ensureAuthenticated(address: string): Promise<boolean> {
  const { getAuthToken } = await import("@/lib/api");
  if (getAuthToken()) return true;
  const result = await loginWithWallet(address);
  if (!result.success) {
    toast.error("登入失敗，請重試", { description: result.error });
    return false;
  }
  return true;
}

export default function SurveyDetail() {
  const params = useParams<{ id: string }>();
  const surveyId = parseInt(params.id ?? "0");
  const [, navigate] = useLocation();
  const { address, isConnected, connect, formatAddress, ensureSepoliaNetwork } = useWallet();

  const [answers, setAnswers] = useState<Record<number, { text?: string; optionIds?: number[] }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  /** 參與費單位數（每單位 = 建立問卷時設定的 entryFee ETH），預設 1 */
  const [entryFeeUnits, setEntryFeeUnits] = useState(1);

  const [isPublishing, setIsPublishing] = useState(false);
  const [isRevealingAnswers, setIsRevealingAnswers] = useState(false);
  const [revealResult, setRevealResult] = useState<RevealAnswersResponse | null>(null);
  const [correctAnswers, setCorrectAnswers] = useState<Record<number, number[]>>({});
  const [showRevealPanel, setShowRevealPanel] = useState(false);

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [participation, setParticipation] = useState<{ participated: boolean; isWinner: boolean } | null>(null);
  const participationFetchId = useRef(0);

  const fetchSurvey = useCallback(async () => {
    if (!surveyId || Number.isNaN(surveyId)) {
      setSurvey(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setSurvey(null);
    try {
      const data = await surveyApi.get(surveyId);
      setSurvey(data);
    } catch (err) {
      console.error(err);
      setSurvey(null);
    } finally {
      setIsLoading(false);
    }
  }, [surveyId]);

  /** @param preserveWhileRefetching 提交成功後重抓時設 true，避免先清空 state 造成表單短暫重新出現 */
  const fetchParticipation = useCallback(async (preserveWhileRefetching = false) => {
    if (!surveyId) return;
    if (!address) {
      participationFetchId.current += 1;
      setParticipation(null);
      return;
    }
    const fetchId = ++participationFetchId.current;
    if (!preserveWhileRefetching) {
      setParticipation(null);
    }
    try {
      const data = await participantApi.checkParticipation(surveyId, address);
      if (fetchId === participationFetchId.current) {
        setParticipation(data);
      }
    } catch (err) {
      console.error(err);
      if (fetchId === participationFetchId.current) {
        setParticipation(null);
      }
    }
  }, [surveyId, address]);

  useEffect(() => { fetchSurvey(); }, [fetchSurvey]);
  useEffect(() => { fetchParticipation(); }, [fetchParticipation]);

  const isDeadlinePassed = survey ? new Date() > new Date(survey.deadline) : false;
  const isCreator = survey && address && survey.creatorAddress.toLowerCase() === address.toLowerCase();

  const handlePublishSurvey = async () => {
    if (!address || !survey) return;
    if (!await ensureAuthenticated(address)) return;
    setIsPublishing(true);
    try {
      await surveyApi.updateStatus(surveyId, { status: "active" });
      toast.success("問卷已發布", { description: "參與者現在可以填寫問卷" });
      await fetchSurvey();
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error("發布失敗", { description: e.message });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSelectOption = (questionId: number, optionId: number, isMultiple: boolean) => {
    setAnswers((prev) => {
      const current = prev[questionId]?.optionIds ?? [];
      if (isMultiple) {
        const updated = current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
        return { ...prev, [questionId]: { optionIds: updated } };
      } else {
        return { ...prev, [questionId]: { optionIds: [optionId] } };
      }
    });
  };

  const handleSubmit = async () => {
    if (!isConnected || !address) { toast.error("請先連接錢包"); return; }
    if (!survey) return;

    const fee = parseFloat(survey.entryFee ?? "0");
    const units = Math.max(1, Math.floor(Number(entryFeeUnits)) || 1);

    const answerList = (survey.questions ?? []).map((q) => ({
      questionId: q.id,
      answerText: answers[q.id]?.text,
      selectedOptionIds: answers[q.id]?.optionIds,
    }));

    for (const q of (survey.questions ?? [])) {
      if (!q.isRequired) continue;
      const ans = answers[q.id];
      if (q.questionType === "text" && !ans?.text?.trim()) { toast.error(`請回答第 ${q.orderIndex + 1} 題`); return; }
      if (q.questionType !== "text" && (!ans?.optionIds || ans.optionIds.length === 0)) { toast.error(`請回答第 ${q.orderIndex + 1} 題`); return; }
    }

    if (survey.poolType === "B" && fee > 0) {
      const chainQ = getPoolBChainQuestion(survey);
      if (!chainQ) {
        toast.error("問卷缺少符合 Pool B 的選擇題（2～10 個選項）");
        return;
      }
      const sel = answers[chainQ.id]?.optionIds;
      if (!sel?.length || sel.length !== 1) {
        toast.error("Pool B 需在對應選擇題選擇一個選項", { description: "betB 需單一選項" });
        return;
      }
      if (choiceIndexForBetB(chainQ, sel) === null) {
        toast.error("選項無法對應鏈上索引，請重新選擇");
        return;
      }
    }

    // ★ 確認已登入
    if (!await ensureAuthenticated(address)) return;

    setIsSubmitting(true);
    try {
      let entryFeeTransactionHash: string | undefined;
      let entryFeePaid: string | undefined;

      if (fee > 0) {
        const onSepolia = await ensureSepoliaNetwork();
        if (!onSepolia) return;

        const contractAddr = survey.contractAddress || CONTRACT_ADDRESS;
        if (!contractAddr) {
          toast.error("合約尚未部署");
          return;
        }
        if (!window.ethereum) {
          toast.error("需要 MetaMask");
          return;
        }

        const { ethers } = await import("ethers");
        const weiTotal = ethers.parseEther(survey.entryFee!) * BigInt(units);
        const weiHex = `0x${weiTotal.toString(16)}`;

        let calldata: string;
        let gasHex: string;
        let toastMsg: string;

        if (survey.poolType === "B") {
          if (!survey.contractPoolId) {
            toast.error("此問卷尚未綁定鏈上 Pool B（contractPoolId）");
            return;
          }
          const chainQ = getPoolBChainQuestion(survey);
          const choiceIdx = chainQ
            ? choiceIndexForBetB(chainQ, answers[chainQ.id]?.optionIds)
            : null;
          if (!chainQ || choiceIdx === null) {
            toast.error("無法建立 betB 交易，請確認選擇題答案");
            return;
          }
          const iface = new ethers.Interface([
            "function betB(uint256 _id, uint8 _choice) payable",
          ]);
          calldata = iface.encodeFunctionData("betB", [BigInt(survey.contractPoolId), choiceIdx]);
          gasHex = "0x4c4b40";
          toastMsg = "請在錢包確認 betB（參與費）交易…";
        } else {
          const fnSelector = "0x4e71d92d";
          const surveyIdHex = surveyId.toString(16).padStart(64, "0");
          calldata = `${fnSelector}${surveyIdHex}`;
          gasHex = "0x30000";
          toastMsg = "請在錢包確認參與費交易…";
        }

        toast.info(toastMsg, { duration: 4000 });
        const txHash = await window.ethereum.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: address,
              to: contractAddr,
              value: weiHex,
              data: calldata,
              gas: gasHex,
            },
          ],
        }) as string;

        entryFeeTransactionHash = txHash;
        entryFeePaid = ethers.formatEther(weiTotal);
      }

      await participantApi.submit({
        surveyId,
        walletAddress: address,
        answers: answerList,
        entryFeePaid: fee > 0 ? entryFeePaid : undefined,
        entryFeeTransactionHash: fee > 0 ? entryFeeTransactionHash : undefined,
      });
      toast.success("提交成功！", {
        description:
          survey.poolType === "B" && fee > 0 ? "betB 已送出，答案已記錄" : "您的答案已記錄，祝您中獎！",
      });
      await fetchSurvey();
      await fetchParticipation(true);
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string };
      if (e.code === 4001) {
        toast.error("已取消交易");
      } else {
        toast.error("提交失敗", { description: e.message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFundContract = async () => {
    if (!window.ethereum || !address || !survey) return;
    const onSepolia = await ensureSepoliaNetwork();
    if (!onSepolia) return;

    const contractAddr = survey.contractAddress || CONTRACT_ADDRESS;
    if (!contractAddr) { toast.error("合約尚未部署"); return; }

    if (!await ensureAuthenticated(address)) return;

    setIsFunding(true);
    try {
      const fnSelector = "0x5b4b5a6b";
      const surveyIdHex = surveyId.toString(16).padStart(64, "0");
      const data = `${fnSelector}${surveyIdHex}`;

      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: contractAddr, value: ethToWeiHex(survey.rewardAmount), data, gas: "0x30000" }],
      }) as string;

      await fetchSurvey();
      toast.success("獎金存入成功！", {
        action: { label: "查看交易", onClick: () => window.open(getEtherscanTxUrl(txHash), "_blank") },
      });
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string };
      if (e.code !== 4001) toast.error("存入失敗", { description: e.message });
    } finally {
      setIsFunding(false);
    }
  };

  const handleDraw = async () => {
    if (!window.ethereum || !address || !survey) return;
    const onSepolia = await ensureSepoliaNetwork();
    if (!onSepolia) return;

    const contractAddr = survey.contractAddress || CONTRACT_ADDRESS;
    if (!contractAddr) { toast.error("合約尚未部署"); return; }

    if (!await ensureAuthenticated(address)) return;

    // ★ 修正：依據 poolType 呼叫正確的合約函數
    //   Pool A → drawA(poolId)
    //   Pool B → resolveAndDrawB(poolId, correctAnswer)（需另外實作）
    const poolId = survey.contractPoolId;
    const poolType = survey.poolType ?? "A";

    if (!poolId) {
      toast.error("找不到合約 Pool ID", { description: "請確認問卷已正確綁定合約" });
      return;
    }

    setIsDrawing(true);
    try {
      let txHash: string;

      if (poolType === "A") {
        // drawA(uint256 _id)
        // keccak256("drawA(uint256)") 前 4 bytes = 0x5a47af0e
        const fnSelector = "0x5a47af0e";
        const poolIdHex = poolId.toString(16).padStart(64, "0");
        const calldata = `${fnSelector}${poolIdHex}`;

        txHash = await window.ethereum.request({
          method: "eth_sendTransaction",
          params: [{ from: address, to: contractAddr, data: calldata, gas: "0x50000" }],
        }) as string;
      } else {
        toast.error("Pool B 抽獎請使用 resolveAndDrawB 流程");
        return;
      }

      toast.info("Chainlink VRF 抽獎請求已送出", {
        description: "等待 Chainlink 節點回調（約 30-60 秒）",
        duration: 8000,
        action: { label: "查看交易", onClick: () => window.open(getEtherscanTxUrl(txHash), "_blank") },
      });

      // ★ 修正：同步後端時帶入 drawTransactionHash，
      //   winnerAddresses 由後端透過鏈上 isWinner mapping 查詢（或事件監聽器同步）
      await surveyApi.draw(surveyId, {
        callerAddress: address,
        drawTransactionHash: txHash,
        // winnerAddresses 留空，等 VRF 回調後由事件監聽器填入
      });

      await fetchSurvey();
      toast.success("抽獎請求已同步至資料庫", {
        description: "VRF 回調完成後中獎者將自動更新",
      });
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string };
      if (e.code !== 4001) toast.error("抽獎請求失敗", { description: e.message });
    } finally {
      setIsDrawing(false);
    }
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    toast.success("地址已複製");
  };

  const toggleCorrectOption = (questionId: number, optionId: number, isMultiple: boolean) => {
    setCorrectAnswers((prev) => {
      const current = prev[questionId] ?? [];
      if (isMultiple) {
        const updated = current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
        return { ...prev, [questionId]: updated };
      } else {
        return { ...prev, [questionId]: [optionId] };
      }
    });
  };

  const handleRevealAnswers = async () => {
    if (!address || !survey) return;

    if (!await ensureAuthenticated(address)) return;

    const gradableQuestions = (survey.questions ?? []).filter((q) => q.questionType !== "text");
    for (const q of gradableQuestions) {
      if (!correctAnswers[q.id] || correctAnswers[q.id].length === 0) {
        toast.error(`請為第 ${q.orderIndex + 1} 題設定正確答案`);
        return;
      }
    }
    if (gradableQuestions.length === 0) {
      toast.error("此問卷沒有選擇題，無法公布答案");
      return;
    }
    setIsRevealingAnswers(true);
    try {
      const answersPayload = gradableQuestions.map((q) => ({
        questionId: q.id,
        correctOptionIds: correctAnswers[q.id] ?? [],
      }));
      const result = await surveyApi.revealAnswers(surveyId, {
        callerAddress: address,
        answers: answersPayload,
      });
      setRevealResult(result);
      await fetchSurvey();
      const qCount = result?.qualifiedCount ?? 0;
      const totalP = result?.totalParticipants ?? 0;
      const graded = result?.gradedQuestionCount ?? 0;
      toast.success(`答案公布完成！${qCount} 位完全答對，可進行抽籤`, {
        description: `共 ${totalP} 位參與者，${graded} 道題核對`,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : (() => {
                try { return JSON.stringify(err); } catch { return String(err); }
              })();
      toast.error("公布答案失敗", { description: msg || "未知錯誤" });
    } finally {
      setIsRevealingAnswers(false);
    }
  };

  const handleDrawFromQualified = async () => {
    if (!window.ethereum || !address || !survey) return;
    const onSepolia = await ensureSepoliaNetwork();
    if (!onSepolia) return;
    const contractAddr = survey.contractAddress || CONTRACT_ADDRESS;
    if (!contractAddr) { toast.error("合約尚未部署"); return; }

    if (!await ensureAuthenticated(address)) return;

    let qualifiedAddrs: string[] = [];
    try {
      const qualified = await surveyApi.getQualified(surveyId);
      qualifiedAddrs = qualified.qualifiedAddresses;
    } catch {
      toast.error("無法取得資格名單");
      return;
    }
    if (qualifiedAddrs.length === 0) {
      toast.error("沒有符合資格的參與者，無法抽獎");
      return;
    }

    const poolId = survey.contractPoolId;
    if (!poolId) { toast.error("找不到合約 Pool ID"); return; }

    setIsDrawing(true);
    try {
      // drawA(uint256 _id) — 在合約已過截止時間後呼叫
      const fnSelector = "0x5a47af0e";
      const poolIdHex = poolId.toString(16).padStart(64, "0");
      const lotteryData = `${fnSelector}${poolIdHex}`;

      const lotteryTxHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: contractAddr, data: lotteryData, gas: "0x50000" }],
      }) as string;

      toast.info("Chainlink VRF 抽獎請求已送出", {
        description: "等待 Chainlink 節點回調（約 30-60 秒），回調完成後中獎者將自動收到 ETH",
        duration: 8000,
        action: { label: "查看交易", onClick: () => window.open(getEtherscanTxUrl(lotteryTxHash), "_blank") },
      });

      // ★ 修正：同步後端，不帶 winnerAddresses（等 VRF 回調後由事件監聽器填入）
      await surveyApi.draw(surveyId, {
        callerAddress: address,
        drawTransactionHash: lotteryTxHash,
      });
      await fetchSurvey();
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string };
      if (e.code !== 4001) toast.error("抽獎請求失敗", { description: e.message });
    } finally {
      setIsDrawing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container py-8 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="container py-20 text-center">
        <AlertCircle className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">問卷不存在</h2>
        <Link href="/surveys">
          <Button variant="outline" className="gap-2 mt-4">
            <ArrowLeft className="w-4 h-4" />
            返回列表
          </Button>
        </Link>
      </div>
    );
  }

  const statusConfig: Record<string, { label: string; className: string }> = {
    draft:  { label: "草稿",   className: "bg-gray-100 text-gray-600" },
    active: { label: "進行中", className: "bg-green-50 text-green-700" },
    ended:  { label: "已結束", className: "bg-orange-50 text-orange-700" },
    drawn:  { label: "已抽獎", className: "bg-purple-50 text-purple-700" },
  };
  const statusCfg = statusConfig[survey.status] ?? {
    label: survey.status || "未知",
    className: "bg-gray-100 text-gray-600",
  };

  // 解析 winnerAddresses（JSON string 或 string[]）
  const winnerList: string[] = (() => {
    if (!survey.winnerAddresses) return [];
    if (typeof survey.winnerAddresses === "string") {
      try { return JSON.parse(survey.winnerAddresses); } catch { return []; }
    }
    return survey.winnerAddresses as unknown as string[];
  })();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-purple-900 text-white py-10">
        <div className="container max-w-4xl mx-auto">
          <Link href="/surveys">
            <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white mb-4 gap-2 -ml-2">
              <ArrowLeft className="w-4 h-4" />
              返回列表
            </Button>
          </Link>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Badge className={`${statusCfg.className} border-0`}>{statusCfg.label}</Badge>
                <span className="text-slate-400 text-sm">
                  由 {formatAddress(survey.creatorAddress)} 創建
                </span>
                {/* ★ 新增：顯示合約 Pool ID 方便除錯 */}
                {survey.contractPoolId && (
                  <span className="text-slate-500 text-xs font-mono">
                    Pool {survey.poolType}-{survey.contractPoolId}
                  </span>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">{survey.title}</h1>
              {survey.description && (
                <p className="text-slate-300 text-sm leading-relaxed">{survey.description}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container max-w-4xl mx-auto py-8 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center">
            <CardContent className="pt-4 pb-4">
              <Trophy className="w-6 h-6 text-primary mx-auto mb-1" />
              <p className="text-xl font-bold text-primary">{survey.rewardAmount} ETH</p>
              <p className="text-xs text-muted-foreground">獎金池</p>
              {parseFloat(survey.entryFee ?? "0") > 0 && (
                <p className="text-xs text-amber-600 mt-0.5">參與費: {survey.entryFee} ETH</p>
              )}
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-4 pb-4">
              <Users className="w-6 h-6 text-blue-500 mx-auto mb-1" />
              <p className="text-xl font-bold">{survey.participantCount}</p>
              <p className="text-xs text-muted-foreground">參與人數</p>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-4 pb-4">
              <Trophy className="w-6 h-6 text-yellow-500 mx-auto mb-1" />
              <p className="text-xl font-bold">{survey.winnerCount}</p>
              <p className="text-xs text-muted-foreground">中獎名額</p>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-4 pb-4">
              <Clock className="w-6 h-6 text-orange-500 mx-auto mb-1" />
              <p className="text-sm font-semibold">
                {new Date(survey.deadline).toLocaleDateString("zh-TW")}
              </p>
              <p className="text-xs text-muted-foreground">截止日期</p>
            </CardContent>
          </Card>
        </div>

        {/* 題目預覽：與是否可填寫無關，避免「進行中但已截止」等情況整頁像空白 */}
        {(survey.questions ?? []).length === 0 && (
          <Card className="border-dashed border-amber-200 bg-amber-50/50">
            <CardContent className="pt-4 pb-4 text-sm text-amber-900">
              此問卷目前沒有題目資料（後端未回傳 <span className="font-mono">questions</span>
              ）。若你剛建立問卷，請確認建立 API 有寫入題目；或重新整理頁面。
            </CardContent>
          </Card>
        )}
        {(survey.questions ?? []).length > 0 && (
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">問卷題目</CardTitle>
              <p className="text-xs text-muted-foreground font-normal">
                {survey.status === "active" && !isDeadlinePassed && !participation?.participated
                  ? "請在下方「填寫問卷」區塊作答並提交"
                  : survey.status === "active" && !isDeadlinePassed && participation?.participated
                    ? "您已提交此問卷，題目如下供檢視"
                    : survey.status === "active" && isDeadlinePassed
                      ? "此問卷已超過截止時間，僅供檢視題目"
                      : "題目預覽"}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {(survey.questions ?? []).map((q, qi) => (
                <div key={q.id} className="space-y-2">
                  <div className="flex gap-2">
                    <span className="text-xs font-bold text-primary bg-primary/10 rounded-full w-6 h-6 flex items-center justify-center shrink-0">
                      {qi + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{q.questionText}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {q.questionType === "single" ? "單選" : q.questionType === "multiple" ? "多選" : "簡答"}
                        {q.isRequired && <span className="text-red-500 ml-1">必填</span>}
                      </p>
                    </div>
                  </div>
                  {q.questionType !== "text" && (q.options ?? []).length > 0 && (
                    <ul className="ml-8 space-y-1.5 text-sm text-muted-foreground list-disc list-inside">
                      {(q.options ?? []).map((opt) => (
                        <li key={opt.id}>{opt.optionText}</li>
                      ))}
                    </ul>
                  )}
                  {qi < (survey.questions ?? []).length - 1 && <Separator />}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* 草稿：後端建立預設 draft，須發布後才會出現「填寫問卷」 */}
        {survey.status === "draft" && isCreator && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="pt-4 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="font-medium text-amber-900">此問卷為草稿，尚未開放填寫</p>
                <p className="text-xs text-amber-800/90 mt-1">
                  發布後狀態會變為「進行中」，參與者才能看到題目與選項。
                </p>
              </div>
              <Button
                size="sm"
                className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white border-0"
                disabled={isPublishing || !isConnected}
                onClick={handlePublishSurvey}
              >
                {isPublishing ? "發布中…" : "發布問卷"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Countdown */}
        {survey.status === "active" && !isDeadlinePassed && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-sm mb-1">距離截止還有</p>
                  <p className="text-xs text-muted-foreground">截止後將自動觸發抽獎</p>
                </div>
                <Countdown deadline={new Date(survey.deadline)} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ★ 修正：已抽獎狀態改為顯示「請至鏈上領獎」提示，移除原本直接顯示中獎地址的區塊
             理由：中獎者由鏈上 Chainlink VRF 決定，後端 winnerAddresses 可能尚未同步
                   應引導用戶直接至合約 claim() 領獎，而非依賴後端快取的地址
        */}
        {survey.status === "drawn" && (
          <Card className="border-purple-200 bg-purple-50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-purple-800">
                <Trophy className="w-5 h-5 text-purple-600" />
                抽獎已完成
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 顯示自己是否中獎 */}
              {participation?.isWinner && (
                <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <CheckCircle2 className="w-5 h-5 text-yellow-600 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-yellow-800">🎉 恭喜您中獎了！</p>
                    <p className="text-xs text-yellow-700 mt-0.5">
                      請至智能合約呼叫 claim() 領取獎金
                    </p>
                  </div>
                </div>
              )}

              {/* 引導前往 Etherscan 查詢 */}
              <div className="p-3 bg-white rounded-lg border border-purple-100 text-sm space-y-2">
                <p className="text-muted-foreground">中獎者由 Chainlink VRF 在鏈上決定，請至合約查詢：</p>
                {survey.contractAddress && (
                  <a
                    href={`https://sepolia.etherscan.io/address/${survey.contractAddress}#readContract`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline text-sm font-medium"
                  >
                    在 Etherscan 查詢合約
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {survey.drawTransactionHash && (
                  <div>
                    <p className="text-xs text-muted-foreground">抽獎交易：</p>
                    <a
                      href={getEtherscanTxUrl(survey.drawTransactionHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-mono"
                    >
                      {survey.drawTransactionHash.slice(0, 24)}...
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Creator Actions */}
        {isCreator && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-blue-800 text-base flex items-center gap-2">
                <Wallet className="w-5 h-5" />
                問卷管理（創建者）
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {survey.status === "active" && !survey.transactionHash && (
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-blue-100">
                  <div>
                    <p className="text-sm font-medium">存入獎金</p>
                    <p className="text-xs text-muted-foreground">
                      將 {survey.rewardAmount} ETH 存入智能合約
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleFundContract}
                    disabled={isFunding || !isConnected}
                    className="gap-2 bg-blue-600 hover:bg-blue-700 text-white border-0"
                  >
                    <Wallet className="w-4 h-4" />
                    {isFunding ? "處理中..." : "存入獎金"}
                  </Button>
                </div>
              )}

              {/* Pool A：截止後直接觸發 Chainlink VRF 抽獎（不需要公布答案） */}
              {survey.poolType === "A" &&
                (survey.status === "active" || survey.status === "ended") &&
                isDeadlinePassed &&
                (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-purple-100">
                    <div>
                      <p className="text-sm font-medium">觸發 Chainlink VRF 抽獎（Pool A）</p>
                      <p className="text-xs text-muted-foreground">
                        從所有已參與者中抽出 {survey.winnerCount} 位中獎者（合約 drawA）
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleDraw}
                      disabled={isDrawing}
                      className="gap-2 bg-purple-600 hover:bg-purple-700 text-white border-0"
                    >
                      <Shuffle className="w-4 h-4" />
                      {isDrawing ? "抽獎中...請稍候" : "Chainlink VRF 抽獎"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    需已綁定合約位址與 <span className="font-mono">contractPoolId</span>；送出後需等待 VRF 回調（約 30–60 秒）。
                  </p>
                </div>
              )}

              {/* 步驟一：公布答案（僅 Pool B 需要；Pool A 為投票抽獎，沒有「正確答案」概念） */}
              {survey.poolType === "B" &&
                (survey.status === "active" || survey.status === "ended") &&
                isDeadlinePassed &&
                !revealResult &&
                !survey.qualifiedAddresses && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-blue-100">
                    <div>
                      <p className="text-sm font-medium">步驟一：公布正確答案</p>
                      <p className="text-xs text-muted-foreground">
                        設定每道題的正確答案，系統自動核對 {survey.participantCount} 位作答者
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setShowRevealPanel(!showRevealPanel)}
                      className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white border-0"
                    >
                      <BookOpen className="w-4 h-4" />
                      {showRevealPanel ? <><ChevronUp className="w-3 h-3" />收起</> : <>設定答案<ChevronDown className="w-3 h-3" /></>}
                    </Button>
                  </div>

                  {showRevealPanel && (
                    <div className="p-4 bg-white rounded-xl border border-indigo-100 space-y-4">
                      <p className="text-xs text-muted-foreground">請為每道選擇題勾選正確答案，文字題不需設定。</p>
                      {(survey.questions ?? []).filter((q) => q.questionType !== "text").map((q, qi) => (
                        <div key={q.id} className="space-y-2">
                          <p className="text-sm font-medium">
                            <span className="text-indigo-600 font-bold mr-1">Q{qi + 1}.</span>
                            {q.questionText}
                            <span className="text-xs text-muted-foreground ml-2">
                              ({q.questionType === "multiple" ? "多選" : "單選"})
                            </span>
                          </p>
                          <div className="space-y-1 ml-4">
                            {(q.options ?? []).map((opt) => {
                              const isSelected = correctAnswers[q.id]?.includes(opt.id) ?? false;
                              return (
                                <button
                                  key={opt.id}
                                  onClick={() => toggleCorrectOption(q.id, opt.id, q.questionType === "multiple")}
                                  className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                                    isSelected
                                      ? "border-green-400 bg-green-50 text-green-800 font-medium"
                                      : "border-border hover:border-green-300 hover:bg-green-50/50"
                                  }`}
                                >
                                  <span className={`inline-flex items-center justify-center w-4 h-4 rounded-${q.questionType === "multiple" ? "md" : "full"} border mr-2 text-xs shrink-0 ${
                                    isSelected ? "border-green-500 bg-green-500 text-white" : "border-muted-foreground"
                                  }`}>
                                    {isSelected && "✓"}
                                  </span>
                                  {opt.optionText}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <Button
                        onClick={handleRevealAnswers}
                        disabled={isRevealingAnswers}
                        className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white border-0"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        {isRevealingAnswers ? "核對中...請稍候" : "確認答案並核對作答者"}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* 步驟二：觸發 Chainlink VRF 抽獎（Pool B 需先公布答案 → 取得 qualified；Pool A 不走此區塊） */}
              {survey.poolType === "B" && (revealResult || survey.qualifiedAddresses) && survey.status !== "drawn" && (
                <div className="space-y-3">
                  <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck className="w-5 h-5 text-green-600" />
                      <p className="font-semibold text-green-800 text-sm">答案已公布，資格名單已確定</p>
                    </div>
                    {revealResult && (
                      <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                        <div className="bg-white rounded-lg p-2 border border-green-100">
                          <p className="text-lg font-bold text-slate-800">{revealResult.totalParticipants}</p>
                          <p className="text-xs text-muted-foreground">總參與者</p>
                        </div>
                        <div className="bg-white rounded-lg p-2 border border-green-100">
                          <p className="text-lg font-bold text-green-700">{revealResult.qualifiedCount}</p>
                          <p className="text-xs text-muted-foreground">資格人數</p>
                        </div>
                        <div className="bg-white rounded-lg p-2 border border-green-100">
                          <p className="text-lg font-bold text-indigo-700">{revealResult.gradedQuestionCount}</p>
                          <p className="text-xs text-muted-foreground">核對題數</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-purple-100">
                    <div>
                      <p className="text-sm font-medium">步驟二：觸發 Chainlink VRF 抽獎</p>
                      <p className="text-xs text-muted-foreground">
                        從 {revealResult?.qualifiedCount ?? "?"} 位完全答對者中抽出 {survey.winnerCount} 位中獎者
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleDrawFromQualified}
                      disabled={isDrawing || (revealResult?.qualifiedCount ?? 0) === 0}
                      className="gap-2 bg-purple-600 hover:bg-purple-700 text-white border-0"
                    >
                      <Shuffle className="w-4 h-4" />
                      {isDrawing ? "抽獎中...請稍候" : "Chainlink VRF 抽獎"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Already Participated */}
        {participation?.participated && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                <div>
                  <p className="font-medium text-green-800 text-sm">您已參與此問卷</p>
                  <p className="text-xs text-green-600">
                    {participation.isWinner ? "🎉 恭喜您中獎了！請至合約 claim() 領取獎金" : "等待抽獎結果..."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Survey Form */}
        {survey.status === "active" && !isDeadlinePassed && !participation?.participated && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">填寫問卷</CardTitle>
              {!isConnected && (
                <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg border border-orange-200 mt-2">
                  <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
                  <p className="text-sm text-orange-700">請先連接錢包才能提交問卷</p>
                  <Button size="sm" onClick={connect} className="ml-auto bg-orange-600 hover:bg-orange-700 text-white border-0">
                    連接錢包
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {(survey.questions ?? []).map((q, qi) => (
                <div key={q.id} className="space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-bold text-primary bg-primary/10 rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                      {qi + 1}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {q.questionText}
                        {q.isRequired && <span className="text-red-500 ml-1">*</span>}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {q.questionType === "single" ? "單選" : q.questionType === "multiple" ? "多選" : "簡答"}
                      </p>
                    </div>
                  </div>

                  {q.questionType === "text" ? (
                    <Textarea
                      placeholder="請輸入您的回答..."
                      value={answers[q.id]?.text ?? ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [q.id]: { text: e.target.value } }))
                      }
                      rows={3}
                      className="resize-none ml-8"
                    />
                  ) : (
                    <div className="space-y-2 ml-8">
                      {(q.options ?? []).map((opt) => {
                        const selected = answers[q.id]?.optionIds?.includes(opt.id) ?? false;
                        return (
                          <button
                            key={opt.id}
                            onClick={() => handleSelectOption(q.id, opt.id, q.questionType === "multiple")}
                            className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all ${
                              selected
                                ? "border-primary bg-primary/10 text-primary font-medium"
                                : "border-border hover:border-primary/50 hover:bg-muted/50"
                            }`}
                          >
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-${q.questionType === "multiple" ? "md" : "full"} border mr-3 text-xs shrink-0 ${
                              selected ? "border-primary bg-primary text-white" : "border-muted-foreground"
                            }`}>
                              {selected && "✓"}
                            </span>
                            {opt.optionText}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {qi < (survey.questions ?? []).length - 1 && <Separator className="mt-4" />}
                </div>
              ))}

              {/* 參與費：單位數（提交時一併送鏈上並寫入後端） */}
              {parseFloat(survey.entryFee ?? "0") > 0 && (
                <div className="p-4 rounded-xl border-2 border-amber-200 bg-amber-50">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    <span className="font-semibold text-sm text-amber-800">
                      參與費：每單位 {survey.entryFee} ETH
                    </span>
                  </div>
                  <p className="text-xs text-amber-700 mb-3">
                    {survey.poolType === "B"
                      ? "此參與費將於提交時以合約 betB 送出（金額 = 單位數 × 每單位），並累積至獎金池。"
                      : "此參與費將於按下「提交問卷並參與抽獎」時一併送出，並累積至獎金池。"}
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                      <label htmlFor="entry-fee-units" className="text-xs text-muted-foreground">
                        投入單位數（正整數）
                      </label>
                      <Input
                        id="entry-fee-units"
                        type="number"
                        min={1}
                        step={1}
                        className="w-28 h-9"
                        value={entryFeeUnits}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          setEntryFeeUnits(Number.isFinite(v) && v >= 1 ? v : 1);
                        }}
                      />
                    </div>
                    <p className="text-sm text-amber-900 pb-1">
                      預計送出{" "}
                      <span className="font-mono font-semibold">
                        {(parseFloat(survey.entryFee ?? "0") * Math.max(1, entryFeeUnits || 1)).toFixed(6)}
                      </span>{" "}
                      ETH
                    </p>
                  </div>
                </div>
              )}

              {isConnected && address && (
                <div className="p-3 bg-muted/50 rounded-lg border border-border text-sm">
                  <p className="text-muted-foreground">
                    提交後，您的錢包地址將被記錄為參與者：
                    <span className="font-mono text-foreground ml-1">{formatAddress(address)}</span>
                  </p>
                </div>
              )}

              <Button
                className="w-full gap-2 gradient-primary text-white border-0 h-11"
                onClick={handleSubmit}
                disabled={
                  isSubmitting ||
                  !isConnected ||
                  (parseFloat(survey.entryFee ?? "0") > 0 &&
                    !(survey.contractAddress || CONTRACT_ADDRESS)) ||
                  (parseFloat(survey.entryFee ?? "0") > 0 &&
                    survey.poolType === "B" &&
                    !survey.contractPoolId)
                }
              >
                {isSubmitting ? "提交中..." : "提交問卷並參與抽獎"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Deadline Passed but not drawn */}
        {isDeadlinePassed && survey.status === "active" && !isCreator && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="pt-4 pb-4 text-center">
              <Clock className="w-8 h-8 text-orange-500 mx-auto mb-2" />
              <p className="font-medium text-orange-800">問卷已截止</p>
              <p className="text-sm text-orange-600">等待問卷創建者執行抽獎...</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
