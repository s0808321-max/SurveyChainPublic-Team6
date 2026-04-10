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
	if err := godotenv.Load(); err != nil {
		log.Println("未找到 .env 檔案，使用系統環境變數")
	}

	if os.Getenv("JWT_SECRET") == "" {
		log.Println("[警告] JWT_SECRET 未設定，目前使用開發預設值")
	}

	db.Init()

	r := gin.Default()
	r.SetTrustedProxies(nil)

	// 前後端同一 domain，CORS 只需允許 localhost 開發環境
	allowOrigins := []string{
		"http://localhost:5173",
		"http://localhost:3000",
	}
	if frontendURL := os.Getenv("FRONTEND_URL"); frontendURL != "" {
		cleaned := strings.Trim(frontendURL, `"'`)
		allowOrigins = append(allowOrigins, cleaned)
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

	// API 路由
	routes.Register(r)

	// ★ 核心：服務前端靜態檔案
	// 前端 build 完的檔案在 ../frontend/client/dist
	// Railway build 時會先 build 前端，所以這個路徑會存在
	// Railway 會把整個 repo 放在 /app 執行
	// build 完前端的 dist 在 /app/frontend/client/dist
	staticPath := os.Getenv("STATIC_PATH")
	if staticPath == "" {
		staticPath = "/app/frontend/client/dist"
	}

	// 服務靜態資源（JS、CSS、圖片等）
	r.Static("/assets", staticPath+"/assets")

	// 所有非 /api、非 /health 的路由都回傳 index.html（React Router 用）
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		// /api/* 路由沒有找到才到這裡，回傳 404 JSON
		if strings.HasPrefix(path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "API 路由不存在"})
			return
		}
		// 其他所有路由回傳前端 index.html
		c.File(staticPath + "/index.html")
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("伺服器啟動，監聽 port %s，靜態檔案路徑：%s", port, staticPath)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("啟動失敗: %v", err)
	}
}
