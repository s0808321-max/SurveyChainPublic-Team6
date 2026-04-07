package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
	"web3survey/db"
	"web3survey/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Submit POST /api/surveys/:id/participate
func Submit(c *gin.Context) {
	surveyID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無效的問卷 ID"})
		return
	}

	var input models.SubmitAnswerInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	wallet := strings.ToLower(input.WalletAddress)

	// 檢查是否已經參與過
	var existing models.Participant
	result := db.DB.Where("survey_id = ? AND wallet_address = ?", surveyID, wallet).First(&existing)
	if result.Error == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "此錢包已經參與過這份問卷"})
		return
	}

	// 確認問卷存在且狀態為 active
	var survey models.Survey
	if err := db.DB.First(&survey, surveyID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "問卷不存在"})
		return
	}
	if survey.Status != "active" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "問卷目前不接受作答"})
		return
	}
	// 截止時間到：同步狀態並拒絕作答
	now := time.Now()
	if now.After(survey.Deadline) {
		_ = db.DB.Model(&survey).Updates(map[string]interface{}{
			"status":     "ended",
			"updated_at": now,
		}).Error
		c.JSON(http.StatusBadRequest, gin.H{"error": "問卷已截止，無法作答"})
		return
	}

	// 使用 Transaction 同時寫入參與者與答案
	var participant models.Participant
	err = db.DB.Transaction(func(tx *gorm.DB) error {
		participant = models.Participant{
			SurveyID:                uint(surveyID),
			WalletAddress:           wallet,
			IsWinner:                false,
			EntryFeePaid:            input.EntryFeePaid,
			EntryFeeTransactionHash: input.EntryFeeTransactionHash,
			SubmittedAt:             time.Now(),
		}
		if err := tx.Create(&participant).Error; err != nil {
			return err
		}

		for _, ans := range input.Answers {
			submission := models.Submission{
				ParticipantID: participant.ID,
				QuestionID:    ans.QuestionID,
				AnswerText:    ans.AnswerText,
			}
			if len(ans.SelectedOptionIDs) > 0 {
				b, _ := json.Marshal(ans.SelectedOptionIDs)
				submission.SelectedOptionIDs = string(b)
			}
			if err := tx.Create(&submission).Error; err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "提交答案失敗: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success":       true,
		"participantId": participant.ID,
	})
}

// CheckParticipation GET /api/surveys/:id/check-participation?wallet=0x...
func CheckParticipation(c *gin.Context) {
	surveyID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無效的問卷 ID"})
		return
	}

	wallet := strings.ToLower(c.Query("wallet"))
	if wallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 wallet 參數"})
		return
	}

	var participant models.Participant
	result := db.DB.Where("survey_id = ? AND wallet_address = ?", surveyID, wallet).First(&participant)

	if result.Error != nil {
		// 未參與
		c.JSON(http.StatusOK, gin.H{
			"participated": false,
			"isWinner":     false,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"participated":  true,
		"isWinner":      participant.IsWinner,
		"participantId": participant.ID,
	})
}

// ListParticipants GET /api/surveys/:id/participants
func ListParticipants(c *gin.Context) {
	surveyID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無效的問卷 ID"})
		return
	}

	var participants []models.Participant
	if err := db.DB.Where("survey_id = ?", surveyID).
		Order("submitted_at ASC").
		Find(&participants).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查詢參與者失敗"})
		return
	}

	c.JSON(http.StatusOK, participants)
}
