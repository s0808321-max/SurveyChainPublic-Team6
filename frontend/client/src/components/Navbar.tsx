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
import { SURVEY_CHAIN_ABI } from "@/lib/contractABI";
import { toast } from "sonner";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";

export default function Navbar() {
  const {
    address, isConnecting, isConnected, isCorrectNetwork,
    isSwitchingNetwork, connect, disconnect, switchToSepolia, formatAddress,
  } = useWallet();
  const [location] = useLocation();

  const [pendingAmount, setPendingAmount] = useState<bigint>(BigInt(0));
  const [isClaiming, setIsClaiming] = useState(false);
  // ★ 修正：新合約不需要 surveyIds，claimAll() 自動提領所有中獎
  const [hasWon, setHasWon] = useState(false);

  // ★ 修正：查詢待提領獎金改為呼叫新合約 getPendingPrize()
  //   舊版呼叫 /api/users/:address/won-surveys + getTotalPendingReward()
  //   新合約直接提供 getPendingPrize() view 函數，不需要後端中轉
  const fetchPendingRewards = useCallback(async () => {
    if (!address || !isConnected || !isCorrectNetwork || !CONTRACT_ADDRESS) return;

    try {
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, SURVEY_CHAIN_ABI, provider);

      // ★ 修正：呼叫新合約的 getPendingPrize()（呼叫者的待提領總額）
      const total: bigint = await contract.getPendingPrize();
      setPendingAmount(total);
      setHasWon(total > BigInt(0));
    } catch (err) {
      // 合約未部署或網路問題時靜默失敗，不影響其他功能
      console.warn("查詢待提領金額失敗（可能合約尚未部署）", err);
      setPendingAmount(BigInt(0));
      setHasWon(false);
    }
  }, [address, isConnected, isCorrectNetwork]);

  useEffect(() => {
    fetchPendingRewards();
    const interval = setInterval(fetchPendingRewards, 30000);
    return () => clearInterval(interval);
  }, [fetchPendingRewards]);

  // ★ 修正：提領改為呼叫新合約 claimAll()，一次提領所有中獎獎金
  //   舊版呼叫 claimMultiplePrizes(surveyIds[])，此函數在新合約不存在
  const handleClaim = async () => {
    if (!address || !hasWon || pendingAmount === BigInt(0)) return;
    if (!CONTRACT_ADDRESS) {
      toast.error("合約地址未設定");
      return;
    }

    setIsClaiming(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, SURVEY_CHAIN_ABI, signer);

      // ★ 修正：新合約使用 claimAll() 一次提領所有待領獎金
      const tx = await contract.claimAll();
      await tx.wait();

      toast.success("獎金提領成功！", {
        description: `已提領 ${ethers.formatEther(pendingAmount)} ETH`,
      });

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
    { href: "/create",  label: "創建問卷", icon: Plus },
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

                {/* 提領獎金按鈕 */}
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
