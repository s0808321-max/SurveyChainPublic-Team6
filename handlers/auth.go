package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gin-gonic/gin"
)

// ─── Nonce 暫存（記憶體，5分鐘有效） ────────────────────────────────────────

type nonceEntry struct {
	nonce     string
	expiresAt time.Time
}

var (
	nonceMu    sync.Mutex
	nonceStore = make(map[string]nonceEntry) // key: 小寫錢包地址
)

// ─── Auth Handlers ───────────────────────────────────────────────────────────

// GetNonce GET /api/auth/nonce?wallet=0x...
// 產生隨機 nonce 並暫存，前端用 MetaMask 簽名這個 nonce
func GetNonce(c *gin.Context) {
	wallet := strings.ToLower(c.Query("wallet"))
	if wallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 wallet 參數"})
		return
	}

	// 產生 32 bytes 隨機 nonce
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "產生 nonce 失敗"})
		return
	}
	nonce := hex.EncodeToString(b)

	// 暫存 nonce（5 分鐘有效）
	nonceMu.Lock()
	nonceStore[wallet] = nonceEntry{
		nonce:     nonce,
		expiresAt: time.Now().Add(5 * time.Minute),
	}
	nonceMu.Unlock()

	c.JSON(http.StatusOK, gin.H{"nonce": nonce})
}

// VerifySignature POST /api/auth/verify
// 驗證 MetaMask 簽名，成功後回傳 JWT token
func VerifySignature(c *gin.Context) {
	var input struct {
		Wallet    string `json:"wallet" binding:"required"`
		Signature string `json:"signature" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	wallet := strings.ToLower(input.Wallet)

	// 取出暫存的 nonce
	nonceMu.Lock()
	entry, exists := nonceStore[wallet]
	nonceMu.Unlock()

	if !exists {
		c.JSON(http.StatusBadRequest, gin.H{"error": "請先取得 nonce"})
		return
	}
	if time.Now().After(entry.expiresAt) {
		nonceMu.Lock()
		delete(nonceStore, wallet)
		nonceMu.Unlock()
		c.JSON(http.StatusBadRequest, gin.H{"error": "nonce 已過期，請重新取得"})
		return
	}

	// 驗證簽名
	message := fmt.Sprintf("\x19Ethereum Signed Message:\n%d%s", len(entry.nonce), entry.nonce)
	hash := crypto.Keccak256Hash([]byte(message))

	sigBytes, err := hex.DecodeString(strings.TrimPrefix(input.Signature, "0x"))
	if err != nil || len(sigBytes) != 65 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "簽名格式錯誤"})
		return
	}

	// MetaMask 簽名的 v 值是 27 或 28，需轉換為 0 或 1
	if sigBytes[64] >= 27 {
		sigBytes[64] -= 27
	}

	pubKey, err := crypto.SigToPub(hash.Bytes(), sigBytes)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "簽名驗證失敗"})
		return
	}

	recoveredAddr := crypto.PubkeyToAddress(*pubKey)
	if !strings.EqualFold(recoveredAddr.Hex(), common.HexToAddress(wallet).Hex()) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "簽名地址不符"})
		return
	}

	// 驗證成功，刪除已用過的 nonce
	nonceMu.Lock()
	delete(nonceStore, wallet)
	nonceMu.Unlock()

	// 產生 JWT token（24 小時有效）
	token, err := generateJWT(wallet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "產生 token 失敗"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"token":   token,
		"wallet":  wallet,
	})
}

// ─── JWT 工具函數 ─────────────────────────────────────────────────────────────

func generateJWT(wallet string) (string, error) {
	secret := getJWTSecret()

	claims := jwt.MapClaims{
		"wallet": wallet,
		"exp":    time.Now().Add(24 * time.Hour).Unix(),
		"iat":    time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func getJWTSecret() string {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		// 開發環境預設值（正式環境請務必設定環境變數）
		return "dev-secret-please-change-in-production"
	}
	return secret
}
