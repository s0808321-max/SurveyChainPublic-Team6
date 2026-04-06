import { useWallet } from "@/contexts/WalletContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Wallet, FileText, Plus, LayoutList,
  AlertTriangle, CheckCircle2, CoinsIcon
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { SURVEY_LOTTERY_ABI } from "@/lib/contractABI";
import { toast } from "sonner";

// 合約地址（從環境變數或常數取得）
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";

export default function Navbar() {
  const {
    address, isConnecting, isConnected, isCorrectNetwork,
    isSwitchingNetwork, connect, disconnect, switchToSepolia, formatAddress,
  } = useWallet();
  const [location] = useLocation();

  // 待提領獎金狀態
  const [pendingAmount, setPendingAmount] = useState<bigint>(BigInt(0));
  const [isClaiming, setIsClaiming] = useState(false);
  const [wonSurveyIds, setWonSurveyIds] = useState<number[]>([]);

  // 查詢待提領金額
  const fetchPendingRewards = useCallback(async () => {
    if (!address || !isConnected || !isCorrectNetwork || !CONTRACT_ADDRESS) return;

    try {
      // 1. 從後端取得中獎的問卷 ID 列表
      const res = await fetch(`/api/users/${address}/won-surveys`);
      const data = await res.json();
      const ids: number[] = data.surveyIds || [];
      setWonSurveyIds(ids);

      if (ids.length === 0) {
        setPendingAmount(BigInt(0));
        return;
      }

      // 2. 呼叫合約查詢總待提領金額
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, SURVEY_LOTTERY_ABI, provider);
      const total: bigint = await contract.getTotalPendingReward(address, ids);
      setPendingAmount(total);
    } catch (err) {
      console.error("查詢待提領金額失敗", err);
    }
  }, [address, isConnected, isCorrectNetwork]);

  // 錢包連接或網路切換後自動查詢
  useEffect(() => {
    fetchPendingRewards();
    // 每 30 秒自動刷新
    const interval = setInterval(fetchPendingRewards, 30000);
    return () => clearInterval(interval);
  }, [fetchPendingRewards]);

  // 提領獎金（使用批量提領函數 claimMultiplePrizes）
  const handleClaim = async () => {
    if (!address || wonSurveyIds.length === 0 || pendingAmount === BigInt(0)) return;

    setIsClaiming(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, SURVEY_LOTTERY_ABI, signer);

      // 找出有待提領金額的問卷 ID
      const idsWithReward: number[] = [];
      for (const surveyId of wonSurveyIds) {
        const amount: bigint = await contract.getPendingReward(surveyId, address);
        if (amount > BigInt(0)) {
          idsWithReward.push(surveyId);
        }
      }

      if (idsWithReward.length === 0) {
        toast.info("目前沒有可提領的獎金");
        return;
      }

      // 使用批量提領（單一交易，節省 Gas）
      const tx = await contract.claimMultiplePrizes(idsWithReward);
      await tx.wait();
      
      toast.success("獎金提領成功！", {
        description: `已提領 ${idsWithReward.length} 個問卷的獎金`,
      });

      // 提領完成後刷新金額
      await fetchPendingRewards();
    } catch (err: unknown) {
      const error = err as { code?: number; message?: string };
      if (error.code === 4001) {
        toast.error("用戶取消交易");
      } else {
        toast.error(`提領失敗：${error.message || "未知錯誤"}`);
      }
    } finally {
      setIsClaiming(false);
    }
  };

  const navLinks = [
    { href: "/surveys", label: "問卷列表", icon: LayoutList },
    { href: "/create", label: "創建問卷", icon: Plus },
  ];

  const hasPending = pendingAmount > BigInt(0);
  const pendingEth = hasPending
    ? parseFloat(ethers.formatEther(pendingAmount)).toFixed(4)
    : "0";

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border shadow-sm">
        <div className="container flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-primary">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="font-['Space_Grotesk']">SurveyChain</span>
          </Link>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <Button
                  variant={location === href ? "default" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Button>
              </Link>
            ))}
          </div>

          {/* Wallet & Network Status */}
          <div className="flex items-center gap-2">
            {isConnected && address ? (
              <div className="flex items-center gap-2">
                {/* 網路狀態 */}
                {isCorrectNetwork ? (
                  <Badge
                    variant="outline"
                    className="gap-1.5 text-xs py-1 px-2 border-green-300 text-green-700 bg-green-50 hidden sm:flex"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Sepolia
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={switchToSepolia}
                    disabled={isSwitchingNetwork}
                    className="gap-1.5 text-xs border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 hidden sm:flex"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {isSwitchingNetwork ? "切換中..." : "切換到 Sepolia"}
                  </Button>
                )}

                {/* ★ 提領獎金按鈕 ★ */}
                <Button
                  size="sm"
                  variant={hasPending ? "default" : "outline"}
                  onClick={handleClaim}
                  disabled={!hasPending || isClaiming || !isCorrectNetwork}
                  className={
                    hasPending
                      ? "gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0 animate-pulse"
                      : "gap-1.5 text-xs text-muted-foreground"
                  }
                  title={hasPending ? `可提領 ${pendingEth} ETH` : "目前無待提領獎金"}
                >
                  <CoinsIcon className="w-3.5 h-3.5" />
                  {isClaiming
                    ? "提領中..."
                    : hasPending
                    ? `提領 ${pendingEth} ETH`
                    : "提領獎金"}
                </Button>

                {/* 錢包地址 */}
                <Badge
                  variant="outline"
                  className="gap-1.5 text-xs font-mono py-1.5 px-3 border-primary/30 text-primary bg-primary/5"
                >
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  {formatAddress(address)}
                </Badge>

                <Button variant="outline" size="sm" onClick={disconnect} className="text-xs">
                  斷開
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={connect}
                disabled={isConnecting}
                className="gap-2 gradient-primary text-white border-0"
              >
                <Wallet className="w-4 h-4" />
                {isConnecting ? "連接中..." : "連接錢包"}
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* 網路警告橫幅 */}
      {isConnected && !isCorrectNetwork && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-center gap-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>您目前不在 Sepolia 測試網。本平台的智能合約部署於 Sepolia，請切換網路以進行鏈上操作。</span>
          <Button
            variant="outline"
            size="sm"
            onClick={switchToSepolia}
            disabled={isSwitchingNetwork}
            className="border-amber-400 text-amber-800 hover:bg-amber-100 shrink-0 text-xs h-7"
          >
            {isSwitchingNetwork ? "切換中..." : "立即切換"}
          </Button>
        </div>
      )}
    </>
  );
}