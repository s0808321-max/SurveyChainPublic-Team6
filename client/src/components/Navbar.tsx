import { useWallet } from "@/contexts/WalletContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, FileText, Plus, LayoutList, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function Navbar() {
  const {
    address,
    isConnecting,
    isConnected,
    isCorrectNetwork,
    isSwitchingNetwork,
    connect,
    disconnect,
    switchToSepolia,
    formatAddress,
  } = useWallet();
  const [location] = useLocation();

  const navLinks = [
    { href: "/surveys", label: "問卷列表", icon: LayoutList },
    { href: "/create", label: "創建問卷", icon: Plus },
  ];

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
                {/* 網路狀態指示器 */}
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

      {/* 網路警告橫幅：連接錢包但不在 Sepolia 時顯示 */}
      {isConnected && !isCorrectNetwork && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-center gap-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            您目前不在 Sepolia 測試網。本平台的智能合約部署於 Sepolia，請切換網路以進行鏈上操作。
          </span>
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
