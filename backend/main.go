package main

import (
	"log"
	"os"
	"strings"
	"web3survey/db"
	"web3survey/routes"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("未找到 .env 檔案，使用系統環境變數")
	}

	if os.Getenv("JWT_SECRET") == "" {
		log.Println("[警告] JWT_SECRET 未設定，目前使用開發預設值")
	}

	db.Init()

	r := gin.Default()
	r.SetTrustedProxies(nil)

	// ★ 修正：收集所有允許的 Origin，並去除值裡可能夾帶的引號
	allowOrigins := []string{
		"http://localhost:5173",
		"http://localhost:3000",
	}

	if frontendURL := os.Getenv("FRONTEND_URL"); frontendURL != "" {
		// 去除 Railway Variables 可能夾帶的引號
		cleaned := strings.Trim(frontendURL, `"'`)
		allowOrigins = append(allowOrigins, cleaned)
		log.Printf("CORS 允許來源：%s", cleaned)
	}

	r.Use(cors.New(cors.Config{
		AllowOrigins:     allowOrigins,
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	routes.Register(r)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Go 後端啟動，監聽 port %s...", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("啟動失敗: %v", err)
	}
}
