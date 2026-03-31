import { useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { surveyApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Plus,
  Trash2,
  Wallet,
  Trophy,
  Clock,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";

type QuestionType = "single" | "multiple" | "text";

interface QuestionInput {
  questionText: string;
  questionType: QuestionType;
  isRequired: boolean;
  options: string[];
}

const defaultQuestion = (): QuestionInput => ({
  questionText: "",
  questionType: "single",
  isRequired: true,
  options: ["", ""],
});

export default function CreateSurvey() {
  const { address, isConnected, connect } = useWallet();
  const [, navigate] = useLocation();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rewardAmount, setRewardAmount] = useState("");
  const [entryFee, setEntryFee] = useState(""); // 參與費
  const [winnerCount, setWinnerCount] = useState(1);
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineTime, setDeadlineTime] = useState("23:59");
  const [questions, setQuestions] = useState<QuestionInput[]>([defaultQuestion()]);

  const [isCreating, setIsCreating] = useState(false);

  const addQuestion = () => setQuestions((prev) => [...prev, defaultQuestion()]);

  const removeQuestion = (i: number) =>
    setQuestions((prev) => prev.filter((_, idx) => idx !== i));

  const updateQuestion = (i: number, field: keyof QuestionInput, value: unknown) =>
    setQuestions((prev) =>
      prev.map((q, idx) => {
        if (idx !== i) return q;
        const updated = { ...q, [field]: value };
        if (field === "questionType" && value === "text") {
          updated.options = [];
        } else if (field === "questionType" && updated.options.length < 2) {
          updated.options = ["", ""];
        }
        return updated;
      })
    );

  const addOption = (qi: number) =>
    setQuestions((prev) =>
      prev.map((q, idx) =>
        idx === qi ? { ...q, options: [...q.options, ""] } : q
      )
    );

  const removeOption = (qi: number, oi: number) =>
    setQuestions((prev) =>
      prev.map((q, idx) =>
        idx === qi ? { ...q, options: q.options.filter((_, i) => i !== oi) } : q
      )
    );

  const updateOption = (qi: number, oi: number, value: string) =>
    setQuestions((prev) =>
      prev.map((q, idx) =>
        idx === qi
          ? { ...q, options: q.options.map((o, i) => (i === oi ? value : o)) }
          : q
      )
    );

  const handleSubmit = async () => {
    if (!isConnected || !address) {
      toast.error("請先連接錢包");
      return;
    }
    if (!title.trim()) {
      toast.error("請輸入問卷標題");
      return;
    }
    if (!rewardAmount || parseFloat(rewardAmount) <= 0) {
      toast.error("請輸入有效的獎金金額");
      return;
    }
    if (!deadlineDate) {
      toast.error("請設定截止日期");
      return;
    }
    const deadline = new Date(`${deadlineDate}T${deadlineTime}`);
    if (deadline <= new Date()) {
      toast.error("截止時間必須在未來");
      return;
    }
    for (const q of questions) {
      if (!q.questionText.trim()) {
        toast.error("請填寫所有問題的題目");
        return;
      }
      if (q.questionType !== "text") {
        const validOptions = q.options.filter((o) => o.trim());
        if (validOptions.length < 2) {
          toast.error("選擇題至少需要 2 個選項");
          return;
        }
      }
    }

    setIsCreating(true);
    try {
      const data = await surveyApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        creatorAddress: address,
        rewardAmount,
        rewardToken: "ETH",
        winnerCount,
        deadline: deadline.getTime(),
        entryFee: entryFee && parseFloat(entryFee) > 0 ? entryFee : "0",
        questions: questions.map((q) => ({
          ...q,
          options: q.questionType !== "text" ? q.options.filter((o) => o.trim()) : undefined,
        })),
      });
      toast.success("問卷創建成功！", {
        description: `問卷 ID: ${data.surveyId}，請前往詳情頁面完成獎金存入`,
      });
      navigate(`/survey/${data.surveyId}`);
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error("創建失敗", { description: e.message });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-purple-900 text-white py-10">
        <div className="container">
          <h1 className="text-3xl font-bold mb-2">創建問卷</h1>
          <p className="text-slate-300">設計問卷、設定獎金，讓參與者有機會贏得加密貨幣</p>
        </div>
      </div>

      <div className="container py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Wallet Warning */}
          {!isConnected && (
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-orange-800">需要連接錢包</p>
                    <p className="text-xs text-orange-600">創建問卷前請先連接 MetaMask 錢包</p>
                  </div>
                  <Button size="sm" onClick={connect} className="gap-2 bg-orange-600 hover:bg-orange-700 text-white border-0">
                    <Wallet className="w-4 h-4" />
                    連接錢包
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="w-5 h-5 text-primary" />
                基本資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">問卷標題 *</Label>
                <Input
                  id="title"
                  placeholder="例如：2026 年消費者行為調查"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="description">問卷描述</Label>
                <Textarea
                  id="description"
                  placeholder="簡短描述問卷目的和內容..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1.5 resize-none"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Reward Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Trophy className="w-5 h-5 text-primary" />
                獎金設定
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="reward">發問者初始獎金 (ETH) *</Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="reward"
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.1"
                      value={rewardAmount}
                      onChange={(e) => setRewardAmount(e.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">ETH</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">發問者預先存入的基礎獎金</p>
                </div>
                <div>
                  <Label htmlFor="winners">中獎名額 *</Label>
                  <Input
                    id="winners"
                    type="number"
                    min="1"
                    max="100"
                    value={winnerCount}
                    onChange={(e) => setWinnerCount(parseInt(e.target.value) || 1)}
                    className="mt-1.5"
                  />
                </div>
              </div>

              {/* 參與費設定 */}
              <div className="border border-border rounded-xl p-4 bg-muted/30 space-y-3">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-medium">參與費設定（選填）</span>
                </div>
                <div>
                  <Label htmlFor="entryFee">參與費 (ETH)</Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="entryFee"
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.01（輸入 0 或留空為免費）"
                      value={entryFee}
                      onChange={(e) => setEntryFee(e.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">ETH</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    參與者需繳納此金額才能加入問卷，繳納的參與費將自動累積到獎金池
                  </p>
                </div>
                {entryFee && parseFloat(entryFee) > 0 && (
                  <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    <p>⚠️ 參與者需先將 <strong>{entryFee} ETH</strong> 轉入合約才能填寫問卷</p>
                    <p className="mt-0.5">獎金池 = 初始獎金 + 所有參與者繳納的參與費總和</p>
                  </div>
                )}
              </div>

              {/* 獎金池預覽 */}
              {rewardAmount && parseFloat(rewardAmount) > 0 && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-sm space-y-1">
                  <p className="text-muted-foreground">
                    基礎獎金池：
                    <strong className="text-primary ml-1">{rewardAmount} ETH</strong>
                  </p>
                  {entryFee && parseFloat(entryFee) > 0 && (
                    <p className="text-muted-foreground">
                      每位參與者額外責獻：
                      <strong className="text-amber-600 ml-1">+{entryFee} ETH</strong>
                      <span className="ml-1 text-xs">(自動累積到獎金池)</span>
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    每位中獎者可獲得：
                    <strong className="text-primary ml-1">
                      {(parseFloat(rewardAmount) / winnerCount).toFixed(6)} ETH
                    </strong>
                    <span className="ml-1 text-xs">（不含參與費累積部分）</span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Deadline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="w-5 h-5 text-primary" />
                截止時間
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="date">截止日期 *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={deadlineDate}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setDeadlineDate(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="time">截止時間</Label>
                  <Input
                    id="time"
                    type="time"
                    value={deadlineTime}
                    onChange={(e) => setDeadlineTime(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Questions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="w-5 h-5 text-primary" />
                  問卷題目
                  <Badge variant="secondary">{questions.length} 題</Badge>
                </CardTitle>
                <Button variant="outline" size="sm" onClick={addQuestion} className="gap-2">
                  <Plus className="w-4 h-4" />
                  新增題目
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {questions.map((q, qi) => (
                <div key={qi} className="border border-border rounded-xl p-4 space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">第 {qi + 1} 題</Badge>
                    {questions.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeQuestion(qi)}
                        className="text-destructive hover:text-destructive h-7 w-7 p-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div>
                    <Label>題目 *</Label>
                    <Input
                      placeholder="輸入問題..."
                      value={q.questionText}
                      onChange={(e) => updateQuestion(qi, "questionText", e.target.value)}
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label>題目類型</Label>
                    <Select
                      value={q.questionType}
                      onValueChange={(v) => updateQuestion(qi, "questionType", v)}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">單選題</SelectItem>
                        <SelectItem value="multiple">多選題</SelectItem>
                        <SelectItem value="text">簡答題</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {q.questionType !== "text" && (
                    <div className="space-y-2">
                      <Label>選項</Label>
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex gap-2">
                          <Input
                            placeholder={`選項 ${oi + 1}`}
                            value={opt}
                            onChange={(e) => updateOption(qi, oi, e.target.value)}
                            className="flex-1"
                          />
                          {q.options.length > 2 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeOption(qi, oi)}
                              className="text-destructive hover:text-destructive h-9 w-9 p-0 shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => addOption(qi)}
                        className="gap-2 text-primary hover:text-primary"
                      >
                        <Plus className="w-4 h-4" />
                        新增選項
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex gap-4">
            <Button
              className="flex-1 gap-2 gradient-primary text-white border-0 h-12 text-base"
              onClick={handleSubmit}
              disabled={isCreating || !isConnected}
            >
              {isCreating ? (
                "創建中..."
              ) : (
                <>
                  <Trophy className="w-5 h-5" />
                  創建問卷
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            創建後請前往問卷詳情頁面，透過 MetaMask 存入獎金以啟動智能合約
          </p>
        </div>
      </div>
    </div>
  );
}
