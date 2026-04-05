package handlers

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"
	"web3survey/db"
	"web3survey/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetSurveys GET /api/surveys?status=active
func GetSurveys(c *gin.Context) {
	status := c.Query("status")

	var surveys []models.Survey
	query := db.DB.Preload("Questions.Options")

	if status != "" {
		query = query.Where("status = ?", status)
	}

	if err := query.Order("created_at DESC").Find(&surveys).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查詢問卷失敗"})
		return
	}

	result := make([]models.SurveyWithCount, len(surveys))
	for i, s := range surveys {
		var count int64
		db.DB.Model(&models.Participant{}).Where("survey_id = ?", s.ID).Count(&count)
		result[i] = models.SurveyWithCount{
			Survey:           s,
			ParticipantCount: int(count),
		}
	}

	c.JSON(http.StatusOK, result)
}

// GetSurvey GET /api/surveys/:id
func GetSurvey(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無效的問卷 ID"})
		return
	}

	var survey models.Survey
	if err := db.DB.Preload("Questions.Options").First(&survey, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "問卷不存在"})
		return
	}

	var count int64
	db.DB.Model(&models.Participant{}).Where("survey_id = ?", id).Count(&count)

	c.JSON(http.StatusOK, models.SurveyWithCount{
		Survey:           survey,
		ParticipantCount: int(count),
	})
}

// CreateSurvey POST /api/surveys
func CreateSurvey(c *gin.Context) {
	var input models.CreateSurveyInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	deadline := time.UnixMilli(input.Deadline)

	survey := models.Survey{
		Title:          input.Title,
		Description:    input.Description,
		CreatorAddress: strings.ToLower(input.CreatorAddress),
		RewardAmount:   defaultStr(input.RewardAmount, "0"),
		RewardToken:    defaultStr(input.RewardToken, "ETH"),
		WinnerCount:    defaultInt(input.WinnerCount, 1),
		Deadline:       deadline,
		Status:         "draft",
		EntryFee:       defaultStr(input.EntryFee, "0"),
	}

	if input.ContractAddress != "" {
		survey.ContractAddress = &input.ContractAddress
	}
	if input.TransactionHash != "" {
		survey.TransactionHash = &input.TransactionHash
	}

	err := db.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&survey).Error; err != nil {
			return err
		}

		for i, q := range input.Questions {
			question := models.Question{
				SurveyID:     survey.ID,
				QuestionText: q.QuestionText,
				QuestionType: q.QuestionType,
				OrderIndex:   i,
				IsRequired:   q.IsRequired,
			}
			if err := tx.Create(&question).Error; err != nil {
				return err
			}

			for j, optText := range q.Options {
				option := models.Option{
					QuestionID: question.ID,
					OptionText: optText,
					OrderIndex: j,
				}
				if err := tx.Create(&option).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "建立問卷失敗: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success":  true,
		"surveyId": survey.ID,
	})
}

// UpdateStatus PATCH /api/surveys/:id/status
func UpdateStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無效的問卷 ID"})
		return
	}

	var input models.UpdateStatusInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{
		"status": input.Status,
	}
	if input.ContractAddress != "" {
		updates["contract_address"] = input.ContractAddress
	}
	if input.TransactionHash != "" {
		updates["transaction_hash"] = input.TransactionHash
	}
	if input.DrawTransactionHash != "" {
		updates["draw_transaction_hash"] = input.DrawTransactionHash
	}
	if len(input.WinnerAddresses) > 0 {
		b, _ := json.Marshal(input.WinnerAddresses)
		updates["winner_addresses"] = string(b)
	}

	if err := db.DB.Model(&models.Survey{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新狀態失敗"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// UpdateContract PATCH /api/surveys/:id/contract
// ★ 新增支援 contractPoolId 和 poolType
func UpdateContract(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無效的問卷 ID"})
		return
	}

	var input models.UpdateContractInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{
		"contract_address": input.ContractAddress,
	}
	if input.TransactionHash != "" {
		updates["transaction_hash"] = input.TransactionHash
	}
	// ★ 新增：儲存合約 Pool ID 和類型
	if input.ContractPoolId != nil {
		updates["contract_pool_id"] = input.ContractPoolId
	}
	if input.PoolType != "" {
		updates["pool_type"] = input.PoolType
	}

	if err := db.DB.Model(&models.Survey{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新合約地址失敗"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// Draw POST /api/surveys/:id/draw
func Draw(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無效的問卷 ID"})
		return
	}

	var input models.DrawInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var survey models.Survey
	if err := db.DB.First(&survey, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "問卷不存在"})
		return
	}

	var participants []models.Participant
	if err := db.DB.Where("survey_id = ?", id).Find(&participants).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查詢參與者失敗"})
		return
	}

	if len(participants) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "沒有參與者，無法抽獎"})
		return
	}

	winnerCount := survey.WinnerCount
	if winnerCount > len(participants) {
		winnerCount = len(participants)
	}

	rand.Shuffle(len(participants), func(i, j int) {
		participants[i], participants[j] = participants[j], participants[i]
	})

	winners := participants[:winnerCount]
	winnerAddresses := make([]string, len(winners))

	err = db.DB.Transaction(func(tx *gorm.DB) error {
		for i, w := range winners {
			winnerAddresses[i] = w.WalletAddress
			if err := tx.Model(&models.Participant{}).
				Where("id = ?", w.ID).
				Update("is_winner", true).Error; err != nil {
				return err
			}
		}

		winnerJSON, _ := json.Marshal(winnerAddresses)
		updates := map[string]interface{}{
			"status":           "drawn",
			"winner_addresses": string(winnerJSON),
		}
		if input.DrawTransactionHash != "" {
			updates["draw_transaction_hash"] = input.DrawTransactionHash
		}
		return tx.Model(&models.Survey{}).Where("id = ?", id).Updates(updates).Error
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "抽獎失敗: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"winners": winnerAddresses,
	})
}

// ─── 工具函數 ────────────────────────────────────────────────────────────────

func defaultStr(s, fallback string) string {
	if s == "" {
		return fallback
	}
	return s
}

func defaultInt(v, fallback int) int {
	if v == 0 {
		return fallback
	}
	return v
}

var _ = fmt.Sprintf
var _ = strconv.Itoa
