package db

import (
	"log"
	"os"
	"web3survey/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DB 是全域資料庫連線實例
var DB *gorm.DB

// Init 初始化 PostgreSQL 連線並自動建立資料表
func Init() {
	dsn := buildDSN()

	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		log.Fatalf("資料庫連線失敗: %v", err)
	}

	// 自動建立／更新資料表結構
	err = DB.AutoMigrate(
		&models.Survey{},
		&models.Question{},
		&models.Option{},
		&models.Participant{},
		&models.Submission{},
		&models.SurveyAnswer{},
	)
	if err != nil {
		log.Fatalf("AutoMigrate 失敗: %v", err)
	}

	log.Println("資料庫連線成功，資料表已同步")
}

// buildDSN 優先使用 DATABASE_URL（Railway PostgreSQL 提供），否則從各別環境變數組合
func buildDSN() string {
	// ★ Railway 提供的完整連線字串，直接使用
	if url := os.Getenv("DATABASE_URL"); url != "" {
		log.Println("使用 DATABASE_URL 連線資料庫")
		return url
	}

	host := getEnv("DB_HOST", "localhost")
	port := getEnv("DB_PORT", "5432")
	user := getEnv("DB_USER", "postgres")
	password := getEnv("DB_PASSWORD", "")
	dbname := getEnv("DB_NAME", "web3survey")
	sslmode := getEnv("DB_SSLMODE", "disable")

	log.Printf("使用分散環境變數連線資料庫：%s@%s:%s/%s", user, host, port, dbname)
	return "host=" + host + " port=" + port + " user=" + user +
		" password=" + password + " dbname=" + dbname +
		" sslmode=" + sslmode + " TimeZone=Asia/Taipei"
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
