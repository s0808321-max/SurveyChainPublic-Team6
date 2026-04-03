package main

import (
	"log"
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

	// 初始化資料庫
	db.Init()

	// 建立 Gin 路由
	r := gin.Default()

	// CORS 設定（允許前端 localhost:5173 連線）
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "http://localhost:3000"},
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

	log.Println("Go 後端啟動，監聽 port 8080...")
	if err := r.Run(":8080"); err != nil {
		log.Fatalf("啟動失敗: %v", err)
	}
}
