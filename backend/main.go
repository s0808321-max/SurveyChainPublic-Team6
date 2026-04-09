package main

import (
	"log"
	"net/http"
	"os"
	"strings"
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

	if os.Getenv("JWT_SECRET") == "" {
		log.Println("[警告] JWT_SECRET 未設定，目前使用開發預設值。正式環境請務必設定此變數！")
	}

	// 初始化資料庫
	db.Init()

	// 讀取 PORT（Railway 會自動注入）
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// 建立 Gin 路由
	r := gin.Default()
	r.SetTrustedProxies(nil)

	// CORS 設定（允許所有 origin，因為前端由同一服務 serve，主要供本地開發用）
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

	// 註冊所有 API 路由（前綴 /api）
	routes.Register(r)

	// ★ Serve 前端靜態檔案（/dist 目錄由 Dockerfile 建置時複製進來）
	r.Static("/assets", "./dist/assets")
	r.StaticFile("/favicon.ico", "./dist/favicon.ico")

	// ★ 所有非 /api 路由都回傳 index.html（SPA fallback）
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		// /api/* 路由找不到時回傳 404 JSON，其餘回傳 index.html
		if strings.HasPrefix(path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "路由不存在"})
			return
		}
		c.File("./dist/index.html")
	})

	log.Printf("Go 後端啟動，監聽 port %s...", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("啟動失敗: %v", err)
	}
}
