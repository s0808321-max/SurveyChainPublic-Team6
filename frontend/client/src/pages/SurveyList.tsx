import { useState, useEffect } from "react";
import { surveyApi, type SurveyWithCount } from "@/lib/api";
import SurveyCard from "@/components/SurveyCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Trophy, User, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { useWallet } from "@/contexts/WalletContext";
import { toast } from "sonner";

const STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: "active", label: "進行中" },
  { value: "drawn", label: "已抽獎" },
  { value: "ended", label: "已結束" },
];

const POOL_FILTERS: { value: "" | "A" | "B"; label: string }[] = [
  { value: "", label: "全部池別" },
  { value: "A", label: "Pool A" },
  { value: "B", label: "Pool B" },
];

export default function SurveyList() {
  const [statusFilter, setStatusFilter] = useState("");
  const [poolTypeFilter, setPoolTypeFilter] = useState<"" | "A" | "B">("");
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine" | "participated">("all");

  const { address, isConnected } = useWallet();

  const [surveys, setSurveys] = useState<SurveyWithCount[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const creator = ownerFilter === "mine" ? (address ?? undefined) : undefined;
    const participant = ownerFilter === "participated" ? (address ?? undefined) : undefined;
    surveyApi.list(
      statusFilter || undefined,
      creator,
      participant,
      poolTypeFilter || undefined
    )
      .then(setSurveys)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [statusFilter, poolTypeFilter, ownerFilter, address]);

  const filtered = (surveys ?? []).filter((s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      (s.description ?? "").toLowerCase().includes(search.toLowerCase())
    );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-purple-900 text-white py-12">
        <div className="container">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">問卷列表</h1>
              <p className="text-slate-300">填寫問卷，有機會贏得加密貨幣獎金</p>
            </div>
            <Link href="/create">
              <Button className="gap-2 bg-purple-600 hover:bg-purple-700 text-white border-0">
                <Plus className="w-4 h-4" />
                創建問卷
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container py-8">
        {/* Filters */}
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜尋問卷..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.value}
                variant={statusFilter === f.value ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(f.value)}
                className="text-sm"
              >
                {f.label}
              </Button>
            ))}
            <Button
              variant={ownerFilter === "mine" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (ownerFilter !== "mine" && (!isConnected || !address)) {
                  toast.error("請先連接錢包", { description: "連接後即可篩選「我建立的問卷」" });
                  return;
                }
                setOwnerFilter((v) => (v === "mine" ? "all" : "mine"));
              }}
              className="text-sm gap-2"
              title={ownerFilter === "mine" ? "顯示全部問卷" : "只顯示我建立的問卷"}
            >
              <User className="w-4 h-4" />
              我建立的
            </Button>

            <Button
              variant={ownerFilter === "participated" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (ownerFilter !== "participated" && (!isConnected || !address)) {
                  toast.error("請先連接錢包", { description: "連接後即可篩選「我參與的問卷」" });
                  return;
                }
                setOwnerFilter((v) => (v === "participated" ? "all" : "participated"));
              }}
              className="text-sm gap-2"
              title={ownerFilter === "participated" ? "顯示全部問卷" : "只顯示我參與的問卷"}
            >
              <CheckCircle2 className="w-4 h-4" />
              我參與的
            </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground w-full sm:w-auto sm:mr-1">池別：</span>
            {POOL_FILTERS.map((f) => (
              <Button
                key={f.value || "all-pool"}
                variant={poolTypeFilter === f.value ? "default" : "outline"}
                size="sm"
                onClick={() => setPoolTypeFilter(f.value)}
                className="text-sm"
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Stats */}
        {surveys && (
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              共 <strong className="text-foreground">{filtered.length}</strong> 個問卷
              {statusFilter && `（${STATUS_FILTERS.find((f) => f.value === statusFilter)?.label}）`}
              {ownerFilter === "mine" && "（我建立的）"}
              {ownerFilter === "participated" && "（我參與的）"}
              {poolTypeFilter && `（${POOL_FILTERS.find((f) => f.value === poolTypeFilter)?.label}）`}
            </span>
          </div>
        )}

        {/* Survey Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-48 w-full rounded-xl" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Trophy className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground mb-2">
              {search ? "找不到符合的問卷" : "目前沒有問卷"}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search ? "請嘗試其他關鍵字" : "成為第一個創建問卷的人！"}
            </p>
            {!search && (
              <Link href="/create">
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  創建第一個問卷
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((s) => (
              <SurveyCard
                key={s.id}
                id={s.id}
                title={s.title}
                description={s.description}
                rewardAmount={s.rewardAmount}
                rewardToken={s.rewardToken}
                winnerCount={s.winnerCount}
                status={s.status}
                deadline={new Date(s.deadline)}
                participantCount={s.participantCount}
                creatorAddress={s.creatorAddress}
                entryFee={s.entryFee}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
