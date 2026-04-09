import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { surveyApi, type SurveyWithCount } from "@/lib/api";
import { ArrowRight, Trophy, Shield, Zap, Users, FileText, Wallet } from "lucide-react";
import { Link } from "wouter";
import SurveyCard from "@/components/SurveyCard";

const features = [
  {
    icon: Shield,
    title: "智能合約保障",
    description: "獎金由智能合約託管，透明公正，無法被篡改或挪用",
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    icon: Zap,
    title: "自動抽獎機制",
    description: "截止時間到達後，智能合約自動執行抽獎並即時轉帳獎金",
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    icon: Wallet,
    title: "錢包直接參與",
    description: "連接 MetaMask 即可參與問卷，獎金直接發送到您的錢包地址",
    color: "text-green-600",
    bg: "bg-green-50",
  },
  {
    icon: Users,
    title: "去中心化透明",
    description: "所有參與記錄上鏈，任何人都可以驗證抽獎結果的公正性",
    color: "text-orange-600",
    bg: "bg-orange-50",
  },
];

const steps = [
  { step: "01", title: "創建問卷", desc: "設計問卷題目，設定獎金金額與截止時間" },
  { step: "02", title: "存入獎金", desc: "透過 MetaMask 將獎金存入智能合約" },
  { step: "03", title: "參與填寫", desc: "連接錢包，填寫問卷，地址自動記錄" },
  { step: "04", title: "自動抽獎", desc: "截止後智能合約隨機抽出中獎者並轉帳" },
];

export default function Home() {
  const [surveys, setSurveys] = useState<SurveyWithCount[]>([]);
  useEffect(() => {
    surveyApi.list("active").then((data) => setSurveys(data.slice(0, 3))).catch(console.error);
  }, []);
  const activeSurveys = surveys;

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djZoNnYtNmgtNnptMCAwdi02aC02djZoNnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-40" />
        <div className="container relative py-24 md:py-32">
          <div className="max-w-3xl">
            <Badge className="mb-6 bg-purple-500/20 text-purple-200 border-purple-500/30 text-sm px-4 py-1.5">
              Web3 × 問卷調查
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              填問卷，贏加密貨幣
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
                智能合約自動抽獎
              </span>
            </h1>
            <p className="text-lg md:text-xl text-slate-300 mb-8 leading-relaxed">
              SurveyChain 將問卷調查與區塊鏈技術結合。發起者存入獎金，參與者填寫問卷，
              截止後智能合約自動公正抽獎並即時發放獎金。
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/create">
                <Button size="lg" className="gap-2 bg-purple-600 hover:bg-purple-700 text-white border-0 px-8">
                  <FileText className="w-5 h-5" />
                  創建問卷
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Link href="/surveys">
                <Button size="lg" variant="outline" className="gap-2 border-white/30 text-white hover:bg-white/10 px-8">
                  <Trophy className="w-5 h-5" />
                  瀏覽問卷
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Floating Stats */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-4">
          {[
            { label: "智能合約保障", value: "100%" },
            { label: "自動抽獎", value: "即時" },
            { label: "Gas 費用", value: "最低" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/20 w-36">
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-slate-300 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-background">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">為什麼選擇 SurveyChain？</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              結合 Web3 技術的透明性與問卷調查的便利性，打造公平可信的激勵機制
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f) => (
              <Card key={f.title} className="border-border hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center mb-4`}>
                    <f.icon className={`w-6 h-6 ${f.color}`} />
                  </div>
                  <h3 className="font-semibold mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-slate-50">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">如何運作？</h2>
            <p className="text-muted-foreground text-lg">四個簡單步驟，完成去中心化問卷抽獎</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
            {steps.map((s, i) => (
              <div key={s.step} className="relative">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold shadow-lg shadow-primary/30">
                    {s.step}
                  </div>
                  <h3 className="font-semibold mb-2">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </div>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[calc(50%+2rem)] w-[calc(100%-4rem)] h-0.5 bg-primary/20" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Active Surveys */}
      {activeSurveys.length > 0 && (
        <section className="py-20 bg-background">
          <div className="container">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold mb-2">進行中的問卷</h2>
                <p className="text-muted-foreground">填寫問卷，有機會贏得加密貨幣獎金</p>
              </div>
              <Link href="/surveys">
                <Button variant="outline" className="gap-2">
                  查看全部
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeSurveys.map((s) => (
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
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
        <div className="container text-center">
          <h2 className="text-3xl font-bold mb-4">準備好了嗎？</h2>
          <p className="text-purple-100 text-lg mb-8 max-w-xl mx-auto">
            連接您的 MetaMask 錢包，立即創建問卷或參與抽獎
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/create">
              <Button size="lg" className="bg-white text-purple-700 hover:bg-purple-50 gap-2 px-8">
                <FileText className="w-5 h-5" />
                創建問卷
              </Button>
            </Link>
            <Link href="/surveys">
              <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 gap-2 px-8">
                <Trophy className="w-5 h-5" />
                參與問卷
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-8">
        <div className="container text-center">
          <p className="text-sm">© 2026 SurveyChain. 基於區塊鏈的問卷抽獎平台。</p>
          <p className="text-xs mt-2 text-slate-500">本平台為教學示範用途，智能合約部署於 Sepolia 測試網</p>
        </div>
      </footer>
    </div>
  );
}
