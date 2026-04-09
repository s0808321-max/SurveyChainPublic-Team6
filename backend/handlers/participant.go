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

// ListSubmissions GET /api/surveys/:id/submissions
// Pool A 截止後公開顯示所有參與者作答（資料來源：DB submissions）
func ListSubmissions(c *gin.Context) {
	surveyID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無效的問卷 ID"})
		return
	}

	// 1) 確認問卷存在、且為 Pool A、且已截止
	var survey models.Survey
	if err := db.DB.First(&survey, surveyID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "問卷不存在"})
		return
	}
	// 只有發問者可查看所有作答（JWT middleware 會寫入 wallet）
	rawWallet, _ := c.Get("wallet")
	wallet, _ := rawWallet.(string)
	wallet = strings.ToLower(strings.TrimSpace(wallet))
	if wallet == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登入"})
		return
	}
	if strings.ToLower(survey.CreatorAddress) != wallet {
		c.JSON(http.StatusForbidden, gin.H{"error": "只有發問者可以查看所有作答"})
		return
	}
	if survey.PoolType == nil || *survey.PoolType != "A" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "僅支援 Pool A 問卷公開作答"})
		return
	}
	now := time.Now()
	if now.Before(survey.Deadline) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "問卷尚未截止，無法公開作答"})
		return
	}

	// 2) 取得參與者（維持穩定順序）
	var participants []models.Participant
	if err := db.DB.Where("survey_id = ?", surveyID).
		Order("submitted_at ASC").
		Find(&participants).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查詢參與者失敗"})
		return
	}

	type respAnswer struct {
		QuestionID        uint   `json:"questionId"`
		AnswerText        string `json:"answerText,omitempty"`
		SelectedOptionIDs []int  `json:"selectedOptionIds,omitempty"`
	}
	type respRow struct {
		ParticipantID uint         `json:"participantId"`
		WalletAddress string       `json:"walletAddress"`
		SubmittedAt   time.Time    `json:"submittedAt"`
		Answers       []respAnswer `json:"answers"`
	}

	if len(participants) == 0 {
		c.JSON(http.StatusOK, []respRow{})
		return
	}

	// 3) 一次抓出所有 submissions，再依 participant 分組
	ids := make([]uint, 0, len(participants))
	for _, p := range participants {
		ids = append(ids, p.ID)
	}

	var subs []models.Submission
	if err := db.DB.Where("participant_id IN ?", ids).
		Order("participant_id ASC, question_id ASC").
		Find(&subs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查詢作答失敗"})
		return
	}

	byParticipant := make(map[uint][]respAnswer, len(participants))
	for _, s := range subs {
		a := respAnswer{
			QuestionID: s.QuestionID,
			AnswerText: s.AnswerText,
		}
		if strings.TrimSpace(s.SelectedOptionIDs) != "" {
			var optIDs []int
			if err := json.Unmarshal([]byte(s.SelectedOptionIDs), &optIDs); err == nil && len(optIDs) > 0 {
				a.SelectedOptionIDs = optIDs
			}
		}
		byParticipant[s.ParticipantID] = append(byParticipant[s.ParticipantID], a)
	}

	out := make([]respRow, 0, len(participants))
	for _, p := range participants {
		out = append(out, respRow{
			ParticipantID: p.ID,
			WalletAddress: p.WalletAddress,
			SubmittedAt:   p.SubmittedAt,
			Answers:       byParticipant[p.ID],
		})
	}

	c.JSON(http.StatusOK, out)
}
