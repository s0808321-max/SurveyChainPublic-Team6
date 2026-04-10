package db

import (
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"
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

// buildDSN 組合 PostgreSQL 連線字串
// ★ 修正：優先讀取 DATABASE_URL（Railway PostgreSQL 外掛提供的完整連線字串）
// 若無則 fallback 到個別環境變數（本機開發用）
func buildDSN() string {
	// Railway 提供的完整 URL，格式：
	// postgresql://user:password@host:port/dbname?sslmode=require
	if rawURL := os.Getenv("DATABASE_URL"); rawURL != "" {
		dsn, err := convertURLtoDSN(rawURL)
		if err != nil {
			log.Printf("[警告] DATABASE_URL 解析失敗（%v），改用個別環境變數", err)
		} else {
			log.Println("使用 DATABASE_URL 連線資料庫")
			return dsn
		}
	}

	// Fallback：個別環境變數（本機 / 自架 PostgreSQL）
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

// convertURLtoDSN 將 postgresql://user:pass@host:port/dbname?sslmode=xxx
// 轉換為 GORM PostgreSQL driver 接受的 DSN 格式
func convertURLtoDSN(rawURL string) (string, error) {
	// 將 postgresql:// 前綴統一成 postgres://（url.Parse 接受兩種）
	normalized := strings.Replace(rawURL, "postgresql://", "postgres://", 1)

	u, err := url.Parse(normalized)
	if err != nil {
		return "", fmt.Errorf("URL 解析失敗: %w", err)
	}

	host := u.Hostname()
	port := u.Port()
	if port == "" {
		port = "5432"
	}
	user := u.User.Username()
	password, _ := u.User.Password()
	dbname := strings.TrimPrefix(u.Path, "/")

	// 讀取 sslmode query param，Railway 通常為 require
	sslmode := u.Query().Get("sslmode")
	if sslmode == "" {
		sslmode = "require"
	}

	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s TimeZone=Asia/Taipei",
		host, port, user, password, dbname, sslmode,
	), nil
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
