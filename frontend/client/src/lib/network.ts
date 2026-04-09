/**
 * 區塊鏈網路常數設定
 * 本平台部署於 Sepolia 測試網（chainId: 11155111）
 */

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

export const SEPOLIA_NETWORK = {
  chainId: SEPOLIA_CHAIN_ID_HEX,
  chainName: "Sepolia Testnet",
  nativeCurrency: {
    name: "Sepolia ETH",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: ["https://rpc.sepolia.org", "https://ethereum-sepolia-rpc.publicnode.com"],
  blockExplorerUrls: ["https://sepolia.etherscan.io"],
};

/**
 * 合約地址設定
 * 將 VITE_CONTRACT_ADDRESS 設為已部署合約（團隊 Sepolia／Remix 位址見 `frontend/client/.env.example`）
 */
export const CONTRACT_ADDRESS: string =
  (import.meta.env.VITE_CONTRACT_ADDRESS as string) || "";

/**
 * 檢查是否為 Sepolia 網路
 */
export function isSepoliaNetwork(chainId: number | null): boolean {
  return chainId === SEPOLIA_CHAIN_ID;
}

/**
 * 格式化 ETH 金額（wei → ETH 字串）
 */
export function weiToEth(wei: bigint): string {
  const eth = Number(wei) / 1e18;
  return eth.toFixed(6);
}

/**
 * 格式化 ETH 金額（ETH 字串 → wei hex）
 */
export function ethToWeiHex(eth: string): string {
  const wei = BigInt(Math.floor(parseFloat(eth) * 1e18));
  return `0x${wei.toString(16)}`;
}

/**
 * 取得 Etherscan 交易連結
 */
export function getEtherscanTxUrl(txHash: string): string {
  return `https://sepolia.etherscan.io/tx/${txHash}`;
}

/**
 * 取得 Etherscan 地址連結
 */
export function getEtherscanAddressUrl(address: string): string {
  return `https://sepolia.etherscan.io/address/${address}`;
}
