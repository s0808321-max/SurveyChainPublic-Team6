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

	// 附上每份問卷的參與者人數
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

	// 查詢參與者人數
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

	// Unix timestamp（毫秒）轉換為 time.Time
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

	// 使用 Transaction 確保問卷、題目、選項同時寫入成功
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
		winnerStr := string(b)
		updates["winner_addresses"] = winnerStr
	}

	if err := db.DB.Model(&models.Survey{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新狀態失敗"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// UpdateContract PATCH /api/surveys/:id/contract
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

	// 取得問卷
	var survey models.Survey
	if err := db.DB.First(&survey, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "問卷不存在"})
		return
	}

	// 取得所有參與者
	var participants []models.Participant
	if err := db.DB.Where("survey_id = ?", id).Find(&participants).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查詢參與者失敗"})
		return
	}

	if len(participants) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "沒有參與者，無法抽獎"})
		return
	}

	// 隨機抽出中獎者（不重複）
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

		// 更新問卷狀態為 drawn
		winnerJSON, _ := json.Marshal(winnerAddresses)
		winnerStr := string(winnerJSON)
		updates := map[string]interface{}{
			"status":           "drawn",
			"winner_addresses": winnerStr,
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

// 讓 fmt、strconv 不報 unused（保留供之後擴充用）
var _ = fmt.Sprintf
var _ = strconv.Itoa
