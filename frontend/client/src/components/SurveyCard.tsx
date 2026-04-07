import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Clock, Users, Trophy, ArrowRight } from "lucide-react";
import { Link } from "wouter";

interface SurveyCardProps {
  id: number;
  title: string;
  description?: string | null;
  rewardAmount: string;
  rewardToken: string;
  winnerCount: number;
  status: "draft" | "active" | "ended" | "drawn";
  deadline: Date;
  participantCount: number;
  creatorAddress: string;
  entryFee?: string | null; // 參與費（ETH）
}

const statusConfig = {
  draft: { label: "草稿", className: "bg-gray-100 text-gray-600 border-gray-200" },
  active: { label: "進行中", className: "bg-green-50 text-green-700 border-green-200" },
  ended: { label: "已結束", className: "bg-orange-50 text-orange-700 border-orange-200" },
  drawn: { label: "已抽獎", className: "bg-purple-50 text-purple-700 border-purple-200" },
};

function formatCountdown(deadline: Date): string {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  if (diff <= 0) return "已截止";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}天 ${hours}小時`;
  if (hours > 0) return `${hours}小時 ${minutes}分`;
  return `${minutes}分鐘`;
}

export default function SurveyCard({
  id,
  title,
  description,
  rewardAmount,
  rewardToken,
  winnerCount,
  status,
  deadline,
  participantCount,
  creatorAddress,
  entryFee,
}: SurveyCardProps) {
  const hasEntryFee = entryFee && parseFloat(entryFee) > 0;
  const deadlineDate = new Date(deadline);
  const deadlinePassed = deadlineDate.getTime() <= Date.now();
  // 後端可能尚未把 status 從 active 改成 ended；小卡與列表應與「截止時間」一致
  const displayStatus =
    status === "active" && deadlinePassed ? "ended" : status;
  const cfg = statusConfig[displayStatus] ?? {
    label: displayStatus,
    className: "bg-gray-100 text-gray-600 border-gray-200",
  };
  const countdown = formatCountdown(deadlineDate);

  return (
    <Card className="group hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 border-border bg-card overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-base text-foreground line-clamp-2 group-hover:text-primary transition-colors">
            {title}
          </h3>
          <Badge className={`shrink-0 text-xs border ${cfg.className}`}>
            {cfg.label}
          </Badge>
        </div>
        {description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{description}</p>
        )}
      </CardHeader>

      <CardContent className="pb-3">
        {/* Reward Info */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10 mb-3">
          <Trophy className="w-4 h-4 text-primary shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">獎金池</p>
            <p className="font-bold text-primary text-sm">
              {rewardAmount} {rewardToken}
            </p>
            {hasEntryFee && (
              <p className="text-xs text-amber-600 mt-0.5">參與費: {entryFee} ETH</p>
            )}
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-muted-foreground">中獎名額</p>
            <p className="font-semibold text-sm">{winnerCount} 名</p>
          </div>
        </div>
        {hasEntryFee && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-amber-50 border border-amber-200 mb-3">
            <span className="text-xs text-amber-700 font-medium">⚠️ 需繳納 {entryFee} ETH 參與費，繳納後自動累積到獎金池</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4 shrink-0" />
            <span>{participantCount} 人參與</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4 shrink-0" />
            <span
              className={
                displayStatus === "active" && countdown !== "已截止"
                  ? "text-orange-600 font-medium"
                  : ""
              }
            >
              {displayStatus === "active" ? countdown : deadlineDate.toLocaleDateString("zh-TW")}
            </span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-0">
        <Link href={`/survey/${id}`} className="w-full">
          <Button variant="outline" className="w-full gap-2 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all">
            查看詳情
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
