// client/src/lib/web3Auth.ts
// 封裝完整的 Web3 登入流程：取得 nonce → MetaMask 簽名 → 後端驗證 → 存入 JWT

import { setAuthToken } from "@/lib/api";

export interface Web3AuthResult {
  success: boolean;
  walletAddress?: string;
  error?: string;
}

/**
 * 完整的 Web3 登入流程
 * @param walletAddress - 已連接的錢包地址（來自 WalletContext）
 * @returns 登入結果
 */
export async function loginWithWallet(
  walletAddress: string
): Promise<Web3AuthResult> {
  if (!window.ethereum) {
    return { success: false, error: "MetaMask 未安裝" };
  }

  try {
    // ── 步驟一：向 Go 後端取得 nonce ─────────────────────────────────────────
    const nonceRes = await fetch(
      `/api/auth/nonce?wallet=${encodeURIComponent(walletAddress.toLowerCase())}`
    );

    if (!nonceRes.ok) {
      const err = await nonceRes.json();
      return { success: false, error: err.error || "取得 nonce 失敗" };
    }

    const { nonce } = await nonceRes.json();

    // ── 步驟二：請求 MetaMask 對 nonce 簽名 ──────────────────────────────────
    const signature = await window.ethereum.request({
      method: "personal_sign",
      params: [nonce, walletAddress],
    }) as string;

    // ── 步驟三：將簽名送到 Go 後端驗證 ───────────────────────────────────────
    const verifyRes = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: walletAddress.toLowerCase(),
        signature,
      }),
    });

    if (!verifyRes.ok) {
      const err = await verifyRes.json();
      return { success: false, error: err.error || "簽名驗證失敗" };
    }

    const data = await verifyRes.json();

    // ★ 修正：將後端回傳的 JWT token 存入 localStorage，供後續 API 請求使用
    if (data.token) {
      setAuthToken(data.token);
    }

    return { success: true, walletAddress: data.wallet };
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    if (err.code === 4001) {
      return { success: false, error: "用戶拒絕簽名" };
    }
    return { success: false, error: err.message || "登入失敗" };
  }
}
