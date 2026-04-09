package main

import (
	"log"
	"os"
	"web3survey/db"
	"web3survey/routes"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// 載入 .env 檔案（找不到也不中斷，適合正式環境）
	if err := godotenv.Load(); err != nil {
		log.Println("未找到 .env 檔案，使用系統環境變數")
	}

	// JWT_SECRET 警告
	if os.Getenv("JWT_SECRET") == "" {
		log.Println("[警告] JWT_SECRET 未設定，目前使用開發預設值。正式環境請務必設定此變數！")
	}

	// 初始化資料庫
	db.Init()

	// 建立 Gin 路由
	r := gin.Default()
	r.SetTrustedProxies(nil)

	// CORS：允許 localhost 開發 + Railway 正式前端
	allowOrigins := []string{"http://localhost:5173", "http://localhost:3000"}
	if frontendURL := os.Getenv("FRONTEND_URL"); frontendURL != "" {
		allowOrigins = append(allowOrigins, frontendURL)
	}

	r.Use(cors.New(cors.Config{
		AllowOrigins:     allowOrigins,
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	// 健康檢查
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// 註冊所有 API 路由
	routes.Register(r)

	// ★ 修正：讀取 Railway 動態分配的 PORT 環境變數
	// Railway 會將實際 port 寫入 PORT，硬寫 :8080 會讓 load balancer 找不到服務
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080" // 本機開發 fallback
	}

	log.Printf("Go 後端啟動，監聽 port %s...", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("啟動失敗: %v", err)
	}
}
