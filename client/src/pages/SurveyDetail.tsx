import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { surveyApi, participantApi, type Survey } from "@/lib/api";
import { useWallet } from "@/contexts/WalletContext";
import { CONTRACT_ADDRESS, ethToWeiHex, getEtherscanTxUrl } from "@/lib/network";
import { SURVEY_LOTTERY_ABI } from "@/lib/contractABI";
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
} from "lucide-react";
import { Link } from "wouter";

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

export default function SurveyDetail() {
  const params = useParams<{ id: string }>();
  const surveyId = parseInt(params.id ?? "0");
  const [, navigate] = useLocation();
  const { address, isConnected, connect, formatAddress, ensureSepoliaNetwork, isCorrectNetwork } = useWallet();

  const [answers, setAnswers] = useState<Record<number, { text?: string; optionIds?: number[] }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [isPayingEntryFee, setIsPayingEntryFee] = useState(false);
  const [entryFeeTxHash, setEntryFeeTxHash] = useState<string | null>(null); // 參與費交易 hash

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [participation, setParticipation] = useState<{ participated: boolean; isWinner: boolean } | null>(null);

  const fetchSurvey = useCallback(async () => {
    if (!surveyId) return;
    try {
      const data = await surveyApi.get(surveyId);
      setSurvey(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [surveyId]);

  const fetchParticipation = useCallback(async () => {
    if (!address || !surveyId) return;
    try {
      const data = await participantApi.checkParticipation(surveyId, address);
      setParticipation(data);
    } catch (err) {
      console.error(err);
    }
  }, [surveyId, address]);

  useEffect(() => { fetchSurvey(); }, [fetchSurvey]);
  useEffect(() => { fetchParticipation(); }, [fetchParticipation]);

  const isDeadlinePassed = survey ? new Date() > new Date(survey.deadline) : false;
  const isCreator = survey && address && survey.creatorAddress.toLowerCase() === address.toLowerCase();

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

  // 繳納參與費：呼叫合約 registerParticipant（payable，附帶 entryFee ETH）
  const handlePayEntryFee = async () => {
    if (!window.ethereum || !address || !survey) return;
    const entryFee = parseFloat(survey.entryFee ?? "0");
    if (entryFee <= 0) return;

    // 確保在 Sepolia 網路
    const onSepolia = await ensureSepoliaNetwork();
    if (!onSepolia) return;

    // 確認合約地址已設定
    const contractAddr = survey.contractAddress || CONTRACT_ADDRESS;
    if (!contractAddr) {
      toast.error("合約尚未部署", {
        description: "請先部署智能合約並在問卷中設定合約地址，參考 DEPLOYMENT_GUIDE.md",
      });
      return;
    }

    setIsPayingEntryFee(true);
    try {
      // 編碼 registerParticipant(surveyId) 的 calldata
      // function selector: keccak256("registerParticipant(uint256)") 前 4 bytes
      const fnSelector = "0x4e71d92d"; // registerParticipant(uint256) selector
      const surveyIdHex = surveyId.toString(16).padStart(64, "0");
      const data = `${fnSelector}${surveyIdHex}`;

      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{
          from: address,
          to: contractAddr,
          value: ethToWeiHex(survey.entryFee ?? "0"),
          data,
          gas: "0x30000", // 196608 gas，足夠執行 registerParticipant
        }],
      }) as string;

      setEntryFeeTxHash(txHash);
      toast.success("參與費繳納成功！", {
        description: `交易已送出，現在可以填寫問卷`,
        action: {
          label: "查看交易",
          onClick: () => window.open(getEtherscanTxUrl(txHash), "_blank"),
        },
      });
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string };
      if (e.code !== 4001) toast.error("繳納失敗", { description: e.message });
    } finally {
      setIsPayingEntryFee(false);
    }
  };

  const handleSubmit = async () => {
    if (!isConnected || !address) {
      toast.error("請先連接錢包");
      return;
    }
    if (!survey) return;

    // 若有參與費，驗證是否已繳納
    const entryFee = parseFloat(survey.entryFee ?? "0");
    if (entryFee > 0 && !entryFeeTxHash) {
      toast.error("請先繳納參與費", {
        description: `需要繳納 ${survey.entryFee} ETH 才能填寫此問卷`,
      });
      return;
    }

    const answerList = (survey.questions ?? []).map((q) => ({
      questionId: q.id,
      answerText: answers[q.id]?.text,
      selectedOptionIds: answers[q.id]?.optionIds,
    }));

    // Validate required questions
    for (const q of (survey.questions ?? [])) {
      if (!q.isRequired) continue;
      const ans = answers[q.id];
      if (q.questionType === "text" && !ans?.text?.trim()) {
        toast.error(`請回答第 ${q.orderIndex + 1} 題`);
        return;
      }
      if (q.questionType !== "text" && (!ans?.optionIds || ans.optionIds.length === 0)) {
        toast.error(`請回答第 ${q.orderIndex + 1} 題`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await participantApi.submit({
        surveyId,
        walletAddress: address,
        answers: answerList,
        entryFeePaid: entryFee > 0 ? survey.entryFee : undefined,
        entryFeeTransactionHash: entryFeeTxHash ?? undefined,
      });
      toast.success("提交成功！", { description: "您的答案已記錄，祝您中獎！" });
      await fetchSurvey();
      await fetchParticipation();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFundContract = async () => {
    if (!window.ethereum || !address || !survey) return;

    // 確保在 Sepolia 網路
    const onSepolia = await ensureSepoliaNetwork();
    if (!onSepolia) return;

    // 確認合約地址已設定
    const contractAddr = survey.contractAddress || CONTRACT_ADDRESS;
    if (!contractAddr) {
      toast.error("合約尚未部署", {
        description: "請先部署智能合約並在問卷中設定合約地址，參考 DEPLOYMENT_GUIDE.md",
      });
      return;
    }

    setIsFunding(true);
    try {
      // 編碼 fundSurvey(surveyId) 的 calldata
      // function selector: keccak256("fundSurvey(uint256)") 前 4 bytes
      const fnSelector = "0x5b4b5a6b"; // fundSurvey(uint256) selector
      const surveyIdHex = surveyId.toString(16).padStart(64, "0");
      const data = `${fnSelector}${surveyIdHex}`;

      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{
          from: address,
          to: contractAddr,
          value: ethToWeiHex(survey.rewardAmount),
          data,
          gas: "0x30000",
        }],
      }) as string;

      await fetchSurvey();
      toast.success("獎金存入成功！", {
        description: `ETH 已鎖入合約，等待截止後抽獎`,
        action: {
          label: "查看交易",
          onClick: () => window.open(getEtherscanTxUrl(txHash), "_blank"),
        },
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

    // 確保在 Sepolia 網路
    const onSepolia = await ensureSepoliaNetwork();
    if (!onSepolia) return;

    // 確認合約地址已設定
    const contractAddr = survey.contractAddress || CONTRACT_ADDRESS;
    if (!contractAddr) {
      toast.error("合約尚未部署", {
        description: "請先部署智能合約並在問卷中設定合約地址，參考 DEPLOYMENT_GUIDE.md",
      });
      return;
    }

    setIsDrawing(true);
    try {
      // 呼叫合約 requestLottery(surveyId)，觸發 Chainlink VRF 抽獎請求
      // function selector: keccak256("requestLottery(uint256)") 前 4 bytes
      const fnSelector = "0x8a4068dd"; // requestLottery(uint256) selector
      const surveyIdHex = surveyId.toString(16).padStart(64, "0");
      const data = `${fnSelector}${surveyIdHex}`;

      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{
          from: address,
          to: contractAddr,
          data,
          gas: "0x50000", // 327680 gas，VRF 請求需要較多 gas
        }],
      }) as string;

      toast.info("Chainlink VRF 抽獎請求已送出", {
        description: "等待 Chainlink 節點回調（約 30-60 秒），回調完成後中獎者將自動收到 ETH",
        duration: 8000,
        action: {
          label: "查看交易",
          onClick: () => window.open(getEtherscanTxUrl(txHash), "_blank"),
        },
      });

      // 同步後端資料庫（記錄抽獎請求的交易 hash）
      const drawResult = await surveyApi.draw(surveyId, {
        callerAddress: address,
        drawTransactionHash: txHash,
      });
      await fetchSurvey();
      toast.success(`抽獎完成！共 ${drawResult.winners.length} 位中獎者`, {
        description: drawResult.winners.map(formatAddress).join(", "),
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

  const statusConfig = {
    draft: { label: "草稿", className: "bg-gray-100 text-gray-600" },
    active: { label: "進行中", className: "bg-green-50 text-green-700" },
    ended: { label: "已結束", className: "bg-orange-50 text-orange-700" },
    drawn: { label: "已抽獎", className: "bg-purple-50 text-purple-700" },
  };
  const statusCfg = statusConfig[survey.status];

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

        {/* Winners Announcement */}
        {survey.status === "drawn" && survey.winnerAddresses && survey.winnerAddresses.length > 0 && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-yellow-800">
                <Trophy className="w-5 h-5 text-yellow-600" />
                中獎者公告
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(typeof survey.winnerAddresses === "string"
            ? JSON.parse(survey.winnerAddresses)
            : survey.winnerAddresses as string[]
          ).map((addr: string, i: number) => (
                <div key={addr} className="flex items-center justify-between p-3 bg-white rounded-lg border border-yellow-100">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-yellow-100 flex items-center justify-center text-xs font-bold text-yellow-700">
                      {i + 1}
                    </div>
                    <span className="font-mono text-sm">{addr}</span>
                    {addr.toLowerCase() === address?.toLowerCase() && (
                      <Badge className="bg-yellow-500 text-white text-xs border-0">您中獎了！</Badge>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copyAddress(addr)} className="h-7 w-7 p-0">
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              {survey.drawTransactionHash && (
                <p className="text-xs text-muted-foreground mt-2">
                  抽獎交易：
                  <a
                    href={`https://sepolia.etherscan.io/tx/${survey.drawTransactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {survey.drawTransactionHash.slice(0, 20)}...
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              )}
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
              {(survey.status === "active" || survey.status === "ended") && isDeadlinePassed && (
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-blue-100">
                  <div>
                    <p className="text-sm font-medium">執行抽獎</p>
                    <p className="text-xs text-muted-foreground">
                      從 {survey.participantCount} 位參與者中抽出 {survey.winnerCount} 位中獎者
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleDraw}
                    disabled={isDrawing || survey.participantCount === 0}
                    className="gap-2 bg-purple-600 hover:bg-purple-700 text-white border-0"
                  >
                    <Shuffle className="w-4 h-4" />
                    {isDrawing ? "抽獎中..." : "執行抽獎"}
                  </Button>
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
                    {participation.isWinner ? "🎉 恭喜您中獎了！" : "等待抽獎結果..."}
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

              {/* 參與費繳納區塊 */}
              {parseFloat(survey.entryFee ?? "0") > 0 && (
                <div className={`p-4 rounded-xl border-2 ${
                  entryFeeTxHash
                    ? "border-green-200 bg-green-50"
                    : "border-amber-200 bg-amber-50"
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    {entryFeeTxHash ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-600" />
                    )}
                    <span className={`font-semibold text-sm ${
                      entryFeeTxHash ? "text-green-800" : "text-amber-800"
                    }`}>
                      {entryFeeTxHash ? "參與費已繳納" : `需繳納參與費 ${survey.entryFee} ETH`}
                    </span>
                  </div>
                  {entryFeeTxHash ? (
                    <p className="text-xs text-green-700">
                      交易：<span className="font-mono">{entryFeeTxHash.slice(0, 20)}...</span>
                      ，參與費已累積到獎金池，請填寫問卷並提交
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-amber-700 mb-3">
                        此參與費將自動累積到獎金池，提升所有參與者的中獎獎金
                      </p>
                      <Button
                        size="sm"
                        onClick={handlePayEntryFee}
                        disabled={isPayingEntryFee || !isConnected}
                        className="gap-2 bg-amber-600 hover:bg-amber-700 text-white border-0 w-full"
                      >
                        <Wallet className="w-4 h-4" />
                        {isPayingEntryFee ? "處理中..." : `繳納 ${survey.entryFee} ETH 參與費`}
                      </Button>
                    </>
                  )}
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
                  (parseFloat(survey.entryFee ?? "0") > 0 && !entryFeeTxHash)
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
