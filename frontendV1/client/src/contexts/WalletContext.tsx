import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { clearAuthToken } from "@/lib/api";
import { SEPOLIA_CHAIN_ID, SEPOLIA_CHAIN_ID_HEX, SEPOLIA_NETWORK, isSepoliaNetwork } from "@/lib/network";

interface WalletContextType {
  address: string | null;
  chainId: number | null;
  isConnecting: boolean;
  isConnected: boolean;
  isCorrectNetwork: boolean;        // 是否在 Sepolia 網路
  isSwitchingNetwork: boolean;      // 是否正在切換網路
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToSepolia: () => Promise<boolean>; // 切換到 Sepolia，回傳是否成功
  ensureSepoliaNetwork: () => Promise<boolean>; // 確保在 Sepolia，若不是則自動切換
  formatAddress: (addr: string) => string;
}

const WalletContext = createContext<WalletContextType | null>(null);

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const isCorrectNetwork = isSepoliaNetwork(chainId);

  const handleAccountsChanged = useCallback((accounts: unknown) => {
    const accs = accounts as string[];
    clearAuthToken();
    if (accs.length === 0) {
      setAddress(null);
      setChainId(null);
    } else {
      setAddress(accs[0].toLowerCase());
      toast.info("已切換錢包帳戶", { description: "請重新進行需簽名登入的操作（建立問卷、提交問卷等）" });
    }
  }, []);

  const handleChainChanged = useCallback((chainIdHex: unknown) => {
    const newChainId = parseInt(chainIdHex as string, 16);
    setChainId(newChainId);
    if (newChainId === SEPOLIA_CHAIN_ID) {
      toast.success("已切換到 Sepolia 測試網", {
        description: "現在可以進行鏈上操作",
      });
    } else {
      toast.warning("網路已切換", {
        description: "請切換到 Sepolia 測試網以使用本平台",
      });
    }
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;

    // 檢查是否已連接
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const accs = accounts as string[];
        if (accs.length > 0) {
          setAddress(accs[0].toLowerCase());
          window.ethereum!.request({ method: "eth_chainId" }).then((id) => {
            setChainId(parseInt(id as string, 16));
          });
        }
      })
      .catch(console.error);

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, [handleAccountsChanged, handleChainChanged]);

  /**
   * 切換到 Sepolia 測試網
   * 若 MetaMask 尚未添加 Sepolia，會自動嘗試新增
   */
  const switchToSepolia = async (): Promise<boolean> => {
    if (!window.ethereum) {
      toast.error("請安裝 MetaMask 錢包");
      return false;
    }

    setIsSwitchingNetwork(true);
    try {
      // 先嘗試切換
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
      });
      return true;
    } catch (switchError: unknown) {
      const err = switchError as { code?: number; message?: string };
      // 錯誤碼 4902：MetaMask 尚未添加此網路，嘗試自動新增
      if (err.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [SEPOLIA_NETWORK],
          });
          return true;
        } catch (addError: unknown) {
          const addErr = addError as { code?: number; message?: string };
          if (addErr.code !== 4001) {
            toast.error("新增 Sepolia 網路失敗", { description: addErr.message });
          }
          return false;
        }
      } else if (err.code === 4001) {
        toast.error("用戶取消切換網路");
        return false;
      } else {
        toast.error("切換網路失敗", { description: err.message });
        return false;
      }
    } finally {
      setIsSwitchingNetwork(false);
    }
  };

  /**
   * 確保目前在 Sepolia 網路，若不是則自動切換
   * 在所有鏈上操作前呼叫此函數
   */
  const ensureSepoliaNetwork = async (): Promise<boolean> => {
    if (isSepoliaNetwork(chainId)) return true;
    toast.info("正在切換到 Sepolia 測試網...");
    return await switchToSepolia();
  };

  const connect = async () => {
    if (!window.ethereum) {
      toast.error("請安裝 MetaMask 錢包", {
        description: "前往 metamask.io 下載並安裝 MetaMask 瀏覽器擴充功能",
      });
      return;
    }

    setIsConnecting(true);
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const accs = accounts as string[];
      if (accs.length > 0) {
        setAddress(accs[0].toLowerCase());
        const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
        const currentChainId = parseInt(chainIdHex as string, 16);
        setChainId(currentChainId);

        toast.success("錢包連接成功", {
          description: `已連接：${formatAddress(accs[0])}`,
        });

        // 連接後若不在 Sepolia，提示切換（不強制，讓使用者自行決定）
        if (!isSepoliaNetwork(currentChainId)) {
          setTimeout(() => {
            toast.warning("請切換到 Sepolia 測試網", {
              description: "本平台的智能合約部署於 Sepolia 測試網",
              action: {
                label: "立即切換",
                onClick: () => switchToSepolia(),
              },
            });
          }, 1000);
        }
      }
    } catch (error: unknown) {
      const err = error as { code?: number; message?: string };
      if (err.code === 4001) {
        toast.error("用戶拒絕連接");
      } else {
        toast.error("連接失敗", { description: err.message });
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setAddress(null);
    setChainId(null);
    clearAuthToken();
    toast.info("錢包已斷開連接", { description: "已清除登入狀態，換帳戶後請重新簽名登入" });
  };

  return (
    <WalletContext.Provider
      value={{
        address,
        chainId,
        isConnecting,
        isConnected: !!address,
        isCorrectNetwork,
        isSwitchingNetwork,
        connect,
        disconnect,
        switchToSepolia,
        ensureSepoliaNetwork,
        formatAddress,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
