package models

import "time"

// ─── 資料庫模型（對應資料表） ────────────────────────────────────────────────

// Survey 問卷主表
type Survey struct {
	ID                  uint       `gorm:"primaryKey;autoIncrement" json:"id"`
	Title               string     `gorm:"not null" json:"title"`
	Description         string     `json:"description"`
	CreatorAddress      string     `gorm:"not null" json:"creatorAddress"`
	RewardAmount        string     `gorm:"default:'0'" json:"rewardAmount"`
	RewardToken         string     `gorm:"default:'ETH'" json:"rewardToken"`
	WinnerCount         int        `gorm:"default:1" json:"winnerCount"`
	Deadline            time.Time  `json:"deadline"`
	Status              string     `gorm:"default:'draft'" json:"status"` // draft, active, ended, drawn
	ContractAddress     *string    `json:"contractAddress"`
	TransactionHash     *string    `json:"transactionHash"`
	WinnerAddresses     *string    `json:"winnerAddresses"`
	DrawTransactionHash *string    `json:"drawTransactionHash"`
	EntryFee            string     `gorm:"default:'0'" json:"entryFee"`
	EntryFeeCollected   string     `gorm:"default:'0'" json:"entryFeeCollected"`
	QualifiedAddresses  *string    `json:"qualifiedAddresses"`
	ContractPoolId      *int       `json:"contractPoolId"` // ★ 新增：合約裡的 Pool ID
	PoolType            *string    `json:"poolType"`       // ★ 新增："A" 或 "B"
	CreatedAt           time.Time  `json:"createdAt"`
	UpdatedAt           time.Time  `json:"updatedAt"`

	Questions []Question     `gorm:"foreignKey:SurveyID" json:"questions,omitempty"`
	Answers   []SurveyAnswer `gorm:"foreignKey:SurveyID" json:"answers,omitempty"`
}

// Question 題目
type Question struct {
	ID           uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	SurveyID     uint      `gorm:"not null;index" json:"surveyId"`
	QuestionText string    `gorm:"not null" json:"questionText"`
	QuestionType string    `gorm:"not null" json:"questionType"`
	OrderIndex   int       `gorm:"default:0" json:"orderIndex"`
	IsRequired   bool      `gorm:"default:true" json:"isRequired"`
	CreatedAt    time.Time `json:"createdAt"`

	Options []Option `gorm:"foreignKey:QuestionID" json:"options,omitempty"`
}

// Option 選項
type Option struct {
	ID         uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	QuestionID uint   `gorm:"not null;index" json:"questionId"`
	OptionText string `gorm:"not null" json:"optionText"`
	OrderIndex int    `gorm:"default:0" json:"orderIndex"`
}

// Participant 參與者
type Participant struct {
	ID                      uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	SurveyID                uint      `gorm:"not null;index" json:"surveyId"`
	WalletAddress           string    `gorm:"not null" json:"walletAddress"`
	IsWinner                bool      `gorm:"default:false" json:"isWinner"`
	EntryFeePaid            string    `gorm:"default:''" json:"entryFeePaid"`
	EntryFeeTransactionHash string    `gorm:"default:''" json:"entryFeeTransactionHash"`
	SubmittedAt             time.Time `json:"submittedAt"`
}

// Submission 答案
type Submission struct {
	ID                uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	ParticipantID     uint   `gorm:"not null;index" json:"participantId"`
	QuestionID        uint   `gorm:"not null;index" json:"questionId"`
	AnswerText        string `json:"answerText"`
	SelectedOptionIDs string `json:"selectedOptionIds"`
}

// SurveyAnswer 正確答案
type SurveyAnswer struct {
	ID                uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	SurveyID          uint   `gorm:"not null;index" json:"surveyId"`
	QuestionID        uint   `gorm:"not null;index" json:"questionId"`
	CorrectAnswerText string `json:"correctAnswerText"`
	CorrectOptionIDs  string `json:"correctOptionIds"`
}

// ─── DTO ─────────────────────────────────────────────────────────────────────

type SurveyWithCount struct {
	Survey
	ParticipantCount int `json:"participantCount"`
}

type CreateQuestionInput struct {
	QuestionText string   `json:"questionText" binding:"required"`
	QuestionType string   `json:"questionType" binding:"required,oneof=single multiple text"`
	IsRequired   bool     `json:"isRequired"`
	Options      []string `json:"options"`
}

type CreateSurveyInput struct {
	Title           string                `json:"title" binding:"required"`
	Description     string                `json:"description"`
	CreatorAddress  string                `json:"creatorAddress" binding:"required"`
	RewardAmount    string                `json:"rewardAmount"`
	RewardToken     string                `json:"rewardToken"`
	WinnerCount     int                   `json:"winnerCount"`
	Deadline        int64                 `json:"deadline" binding:"required"`
	ContractAddress string                `json:"contractAddress"`
	TransactionHash string                `json:"transactionHash"`
	EntryFee        string                `json:"entryFee"`
	Questions       []CreateQuestionInput `json:"questions" binding:"required,min=1"`
}

type UpdateStatusInput struct {
	Status              string   `json:"status" binding:"required,oneof=draft active ended drawn"`
	ContractAddress     string   `json:"contractAddress"`
	TransactionHash     string   `json:"transactionHash"`
	WinnerAddresses     []string `json:"winnerAddresses"`
	DrawTransactionHash string   `json:"drawTransactionHash"`
}

// UpdateContractInput ★ 新增 ContractPoolId 和 PoolType
type UpdateContractInput struct {
	ContractAddress string `json:"contractAddress" binding:"required"`
	TransactionHash string `json:"transactionHash"`
	ContractPoolId  *int   `json:"contractPoolId"` // ★ 新增
	PoolType        string `json:"poolType"`       // ★ 新增："A" 或 "B"
}

type DrawInput struct {
	// ★ 新增：鏈上 WinnersSelected 事件解析到的中獎者，優先於後端隨機抽
	WinnerAddresses     []string `json:"winnerAddresses"`
	CallerAddress       string `json:"callerAddress" binding:"required"`
	DrawTransactionHash string `json:"drawTransactionHash"`
}

type SubmitAnswerInput struct {
	WalletAddress           string        `json:"walletAddress" binding:"required"`
	EntryFeePaid            string        `json:"entryFeePaid"`
	EntryFeeTransactionHash string        `json:"entryFeeTransactionHash"`
	Answers                 []AnswerInput `json:"answers" binding:"required,min=1"`
}

type AnswerInput struct {
	QuestionID        uint   `json:"questionId" binding:"required"`
	AnswerText        string `json:"answerText"`
	SelectedOptionIDs []int  `json:"selectedOptionIds"`
}

type PublishAnswersInput struct {
	CallerAddress string               `json:"callerAddress" binding:"required"`
	Answers       []CorrectAnswerInput `json:"answers" binding:"required,min=1"`
}

type CorrectAnswerInput struct {
	QuestionID        uint   `json:"questionId" binding:"required"`
	CorrectAnswerText string `json:"correctAnswerText"`
	CorrectOptionIDs  []int  `json:"correctOptionIds"`
}
