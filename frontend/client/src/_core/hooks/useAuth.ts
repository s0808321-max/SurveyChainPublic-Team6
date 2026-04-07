// client/src/_core/hooks/useAuth.ts（修改後）
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";
import { useWallet } from "@/contexts/WalletContext";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/" } =
    options ?? {};

  const { address, connect, ensureSepoliaNetwork } = useWallet();
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  /**
   * 完整的 Web3 登入流程：
   * 1. 確保 MetaMask 已連接
   * 2. 向後端取得 nonce
   * 3. 請 MetaMask 對訊息簽名
   * 4. 將簽名送往後端驗證，取得 session cookie
   * 5. 刷新 auth.me 查詢，更新 UI 狀態
   */
  const loginWithWallet = useCallback(async (): Promise<boolean> => {
    try {
      // 確保錢包已連接
      let walletAddress = address;
      if (!walletAddress) {
        await connect();
        // connect() 是非同步但不回傳地址，需等待 MetaMask 授權
        const accounts = await (window as any).ethereum?.request({
          method: "eth_accounts",
        }) as string[];
        walletAddress = accounts?.[0]?.toLowerCase() ?? null;
      }

      if (!walletAddress) {
        throw new Error("No wallet connected");
      }

      // 步驟一：取得 nonce
      const nonceRes = await fetch(
        `/api/auth/nonce?wallet=${encodeURIComponent(walletAddress)}`
      );
      if (!nonceRes.ok) throw new Error("Failed to get nonce");
      const { nonce, message } = await nonceRes.json() as {
        nonce: string;
        message: string;
      };

      // 步驟二：MetaMask 簽名（personal_sign）
      const signature = await (window as any).ethereum.request({
        method: "personal_sign",
        params: [message, walletAddress],
      }) as string;

      // 步驟三：送往後端驗證
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress, signature, nonce }),
        credentials: "include", // 確保 cookie 被設定
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json() as { error: string };
        throw new Error(err.error || "Verification failed");
      }

      // 步驟四：刷新用戶狀態
      await utils.auth.me.invalidate();
      return true;

    } catch (error: unknown) {
      const err = error as { code?: number; message?: string };
      // 使用者拒絕簽名（code 4001）不算錯誤，靜默處理
      if (err.code === 4001) return false;
      console.error("[loginWithWallet]", error);
      throw error;
    }
  }, [address, connect, utils]);

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => ({
    user: meQuery.data ?? null,
    loading: meQuery.isLoading || logoutMutation.isPending,
    error: meQuery.error ?? logoutMutation.error ?? null,
    isAuthenticated: Boolean(meQuery.data),
  }), [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;
    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
    loginWithWallet,
  };
}