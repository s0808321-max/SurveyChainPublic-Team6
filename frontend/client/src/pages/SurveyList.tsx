import { useState, useEffect } from "react";
import { surveyApi, type SurveyWithCount } from "@/lib/api";
import SurveyCard from "@/components/SurveyCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Trophy } from "lucide-react";
import { Link } from "wouter";

const STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: "active", label: "進行中" },
  { value: "drawn", label: "已抽獎" },
  { value: "ended", label: "已結束" },
];

export default function SurveyList() {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const [surveys, setSurveys] = useState<SurveyWithCount[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    surveyApi.list(statusFilter || undefined)
      .then(setSurveys)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [statusFilter]);

  const filtered = surveys?.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    (s.description ?? "").toLowerCase().includes(search.toLowerCase())
  ) ?? [];

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
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
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
          </div>
        </div>

        {/* Stats */}
        {surveys && (
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              共 <strong className="text-foreground">{filtered.length}</strong> 個問卷
              {statusFilter && `（${STATUS_FILTERS.find((f) => f.value === statusFilter)?.label}）`}
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
