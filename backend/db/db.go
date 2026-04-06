package db

import (
	"fmt"
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
		&models.SurveyAnswer{}, // ★ 修正：補上 SurveyAnswer，否則 PublishAnswers 會失敗
	)
	if err != nil {
		log.Fatalf("AutoMigrate 失敗: %v", err)
	}

	log.Println("資料庫連線成功，資料表已同步")
}

// buildDSN 從環境變數組合 PostgreSQL 連線字串
func buildDSN() string {
	host := getEnv("DB_HOST", "localhost")
	port := getEnv("DB_PORT", "5432")
	user := getEnv("DB_USER", "postgres")
	password := getEnv("DB_PASSWORD", "")
	dbname := getEnv("DB_NAME", "web3survey")
	sslmode := getEnv("DB_SSLMODE", "disable")

	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s TimeZone=Asia/Taipei",
		host, port, user, password, dbname, sslmode,
	)
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
