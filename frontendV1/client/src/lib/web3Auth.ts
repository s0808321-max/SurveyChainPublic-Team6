// client/src/lib/web3Auth.ts
// 封裝完整的 Web3 登入流程：取得 nonce → MetaMask 簽名 → 後端驗證 → 存入 JWT

import { BrowserProvider } from "ethers";
import { setAuthToken } from "@/lib/api";

function parseJsonError(text: string, fallback: string): string {
  try {
    const o = JSON.parse(text) as { error?: string; message?: string };
    return o.error || o.message || fallback;
  } catch {
    return fallback;
  }
}

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
    const nonceBody = await nonceRes.text();

    if (!nonceRes.ok) {
      return {
        success: false,
        error: parseJsonError(nonceBody, "取得 nonce 失敗"),
      };
    }

    let nonce: string;
    try {
      nonce = (JSON.parse(nonceBody) as { nonce: string }).nonce;
    } catch {
      return {
        success: false,
        error: `後端回傳異常（非 JSON）。請確認 Vite 已 proxy /api 到 Go :8080。內容前 120 字：${nonceBody.slice(0, 120)}`,
      };
    }

    // ── 步驟二：EIP-191 簽名（與 Go crypto.Keccak256Hash + SigToPub 一致）
    // 避免部分錢包 personal_sign 參數順序／編碼差異導致驗證失敗
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const signerAddr = (await signer.getAddress()).toLowerCase();
    if (signerAddr !== walletAddress.toLowerCase()) {
      return {
        success: false,
        error:
          "MetaMask 目前選取的帳戶與頁面連線地址不一致，請在 MetaMask 切換到同一個地址後再試",
      };
    }

    const signature = await signer.signMessage(nonce);

    // ── 步驟三：將簽名送到 Go 後端驗證 ───────────────────────────────────────
    const verifyRes = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: walletAddress.toLowerCase(),
        signature,
      }),
    });

    const verifyBody = await verifyRes.text();

    if (!verifyRes.ok) {
      return {
        success: false,
        error: parseJsonError(verifyBody, "簽名驗證失敗"),
      };
    }

    let data: { success?: boolean; token?: string; wallet?: string };
    try {
      data = JSON.parse(verifyBody) as { success?: boolean; token?: string; wallet?: string };
    } catch {
      return { success: false, error: "驗證回傳非 JSON，請檢查後端與 proxy" };
    }

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
