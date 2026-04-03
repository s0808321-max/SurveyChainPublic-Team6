package models

import "time"

// ─── 資料庫模型（對應資料表） ────────────────────────────────────────────────

// Survey 問卷主表
type Survey struct {
	ID                   uint       `gorm:"primaryKey;autoIncrement" json:"id"`
	Title                string     `gorm:"not null" json:"title"`
	Description          string     `json:"description"`
	CreatorAddress       string     `gorm:"not null" json:"creatorAddress"`
	RewardAmount         string     `gorm:"default:'0'" json:"rewardAmount"`
	RewardToken          string     `gorm:"default:'ETH'" json:"rewardToken"`
	WinnerCount          int        `gorm:"default:1" json:"winnerCount"`
	Deadline             time.Time  `json:"deadline"`
	Status               string     `gorm:"default:'draft'" json:"status"` // draft, active, ended, drawn
	ContractAddress      *string    `json:"contractAddress"`
	TransactionHash      *string    `json:"transactionHash"`
	WinnerAddresses      *string    `json:"winnerAddresses"`       // JSON 字串，例如 ["0x123","0x456"]
	DrawTransactionHash  *string    `json:"drawTransactionHash"`
	EntryFee             string     `gorm:"default:'0'" json:"entryFee"`
	EntryFeeCollected    string     `gorm:"default:'0'" json:"entryFeeCollected"`
	CreatedAt            time.Time  `json:"createdAt"`
	UpdatedAt            time.Time  `json:"updatedAt"`

	// 關聯（GORM 會自動 JOIN）
	Questions []Question `gorm:"foreignKey:SurveyID" json:"questions,omitempty"`
}

// Question 題目
type Question struct {
	ID           uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	SurveyID     uint      `gorm:"not null;index" json:"surveyId"`
	QuestionText string    `gorm:"not null" json:"questionText"`
	QuestionType string    `gorm:"not null" json:"questionType"` // single, multiple, text
	OrderIndex   int       `gorm:"default:0" json:"orderIndex"`
	IsRequired   bool      `gorm:"default:true" json:"isRequired"`
	CreatedAt    time.Time `json:"createdAt"`

	// 關聯
	Options []Option `gorm:"foreignKey:QuestionID" json:"options,omitempty"`
}

// Option 選項（單選／多選題用）
type Option struct {
	ID          uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	QuestionID  uint   `gorm:"not null;index" json:"questionId"`
	OptionText  string `gorm:"not null" json:"optionText"`
	OrderIndex  int    `gorm:"default:0" json:"orderIndex"`
}

// Participant 參與者（一份問卷一個錢包只能參與一次）
type Participant struct {
	ID                      uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	SurveyID                uint      `gorm:"not null;index" json:"surveyId"`
	WalletAddress           string    `gorm:"not null" json:"walletAddress"`
	IsWinner                bool      `gorm:"default:false" json:"isWinner"`
	EntryFeePaid            string    `gorm:"default:''" json:"entryFeePaid"`
	EntryFeeTransactionHash string    `gorm:"default:''" json:"entryFeeTransactionHash"`
	SubmittedAt             time.Time `json:"submittedAt"`
}

// Submission 答案（每位參與者對每道題目的回答）
type Submission struct {
	ID              uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	ParticipantID   uint   `gorm:"not null;index" json:"participantId"`
	QuestionID      uint   `gorm:"not null;index" json:"questionId"`
	AnswerText      string `json:"answerText"`        // 文字題
	SelectedOptionIDs string `json:"selectedOptionIds"` // JSON 字串，例如 [1,3]
}

// ─── DTO（Request / Response 用，不對應資料表） ──────────────────────────────

// SurveyWithCount 問卷列表用，附帶參與者人數
type SurveyWithCount struct {
	Survey
	ParticipantCount int `json:"participantCount"`
}

// CreateQuestionInput 建立題目時的輸入格式
type CreateQuestionInput struct {
	QuestionText string   `json:"questionText" binding:"required"`
	QuestionType string   `json:"questionType" binding:"required,oneof=single multiple text"`
	IsRequired   bool     `json:"isRequired"`
	Options      []string `json:"options"` // 選項文字列表
}

// CreateSurveyInput 建立問卷時的輸入格式
type CreateSurveyInput struct {
	Title           string                `json:"title" binding:"required"`
	Description     string                `json:"description"`
	CreatorAddress  string                `json:"creatorAddress" binding:"required"`
	RewardAmount    string                `json:"rewardAmount"`
	RewardToken     string                `json:"rewardToken"`
	WinnerCount     int                   `json:"winnerCount"`
	Deadline        int64                 `json:"deadline" binding:"required"` // Unix timestamp（毫秒）
	ContractAddress string                `json:"contractAddress"`
	TransactionHash string                `json:"transactionHash"`
	EntryFee        string                `json:"entryFee"`
	Questions       []CreateQuestionInput `json:"questions" binding:"required,min=1"`
}

// UpdateStatusInput 更新問卷狀態的輸入格式
type UpdateStatusInput struct {
	Status              string   `json:"status" binding:"required,oneof=draft active ended drawn"`
	ContractAddress     string   `json:"contractAddress"`
	TransactionHash     string   `json:"transactionHash"`
	WinnerAddresses     []string `json:"winnerAddresses"`
	DrawTransactionHash string   `json:"drawTransactionHash"`
}

// UpdateContractInput 更新合約地址的輸入格式
type UpdateContractInput struct {
	ContractAddress string `json:"contractAddress" binding:"required"`
	TransactionHash string `json:"transactionHash"`
}

// DrawInput 執行抽獎的輸入格式
type DrawInput struct {
	CallerAddress       string `json:"callerAddress" binding:"required"`
	DrawTransactionHash string `json:"drawTransactionHash"`
}

// SubmitAnswerInput 提交答案的輸入格式
type SubmitAnswerInput struct {
	WalletAddress           string        `json:"walletAddress" binding:"required"`
	EntryFeePaid            string        `json:"entryFeePaid"`
	EntryFeeTransactionHash string        `json:"entryFeeTransactionHash"`
	Answers                 []AnswerInput `json:"answers" binding:"required,min=1"`
}

// AnswerInput 單道題目的回答
type AnswerInput struct {
	QuestionID        uint   `json:"questionId" binding:"required"`
	AnswerText        string `json:"answerText"`
	SelectedOptionIDs []int  `json:"selectedOptionIds"`
}
