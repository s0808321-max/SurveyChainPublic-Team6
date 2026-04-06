package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"web3survey/db"
	"web3survey/models"

	"github.com/gin-gonic/gin"
)

// PublishAnswers POST /api/surveys/:id/answers
// 發題者公布每道題目的正確答案
func PublishAnswers(c *gin.Context) {
	surveyID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無效的問卷 ID"})
		return
	}

	var input models.PublishAnswersInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 確認問卷存在
	var survey models.Survey
	if err := db.DB.First(&survey, surveyID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "問卷不存在"})
		return
	}

	// 確認是發題者本人操作
	if !strings.EqualFold(survey.CreatorAddress, input.CallerAddress) {
		c.JSON(http.StatusForbidden, gin.H{"error": "只有發題者可以公布答案"})
		return
	}

	// 確認問卷已結束
	if survey.Status != "ended" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "問卷尚未結束，無法公布答案"})
		return
	}

	// 刪除舊的正確答案（如果已公布過）並重新寫入
	db.DB.Where("survey_id = ?", surveyID).Delete(&models.SurveyAnswer{})

	for _, ans := range input.Answers {
		correctOptionIDsJSON := "[]"
		if len(ans.CorrectOptionIDs) > 0 {
			b, _ := json.Marshal(ans.CorrectOptionIDs)
			correctOptionIDsJSON = string(b)
		}

		surveyAnswer := models.SurveyAnswer{
			SurveyID:          uint(surveyID),
			QuestionID:        ans.QuestionID,
			CorrectAnswerText: ans.CorrectAnswerText,
			CorrectOptionIDs:  correctOptionIDsJSON,
		}
		if err := db.DB.Create(&surveyAnswer).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "儲存正確答案失敗"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "正確答案已公布",
	})
}

// GetQualifiedParticipants GET /api/surveys/:id/qualified
// 系統自動核對所有作答者答案，回傳完全答對的錢包地址名單
func GetQualifiedParticipants(c *gin.Context) {
	surveyID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無效的問卷 ID"})
		return
	}

	// 取得所有正確答案
	var correctAnswers []models.SurveyAnswer
	if err := db.DB.Where("survey_id = ?", surveyID).Find(&correctAnswers).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查詢正確答案失敗"})
		return
	}
	if len(correctAnswers) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "尚未公布正確答案"})
		return
	}

	// 建立正確答案的 map（key: questionId）
	correctMap := make(map[uint]models.SurveyAnswer)
	for _, a := range correctAnswers {
		correctMap[a.QuestionID] = a
	}

	// 取得所有參與者
	var participants []models.Participant
	if err := db.DB.Where("survey_id = ?", surveyID).Find(&participants).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查詢參與者失敗"})
		return
	}

	// 逐一核對每位參與者的答案
	qualifiedAddresses := []string{}

	for _, p := range participants {
		var submissions []models.Submission
		db.DB.Where("participant_id = ?", p.ID).Find(&submissions)

		allCorrect := true
		for _, sub := range submissions {
			correct, ok := correctMap[sub.QuestionID]
			if !ok {
				continue
			}

			if !isAnswerCorrect(sub, correct) {
				allCorrect = false
				break
			}
		}

		if allCorrect {
			qualifiedAddresses = append(qualifiedAddresses, p.WalletAddress)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":          true,
		"qualifiedCount":   len(qualifiedAddresses),
		"qualifiedAddresses": qualifiedAddresses,
	})
}

// isAnswerCorrect 核對單道題目的答案是否正確
func isAnswerCorrect(sub models.Submission, correct models.SurveyAnswer) bool {
	// 文字題：直接比對（忽略大小寫和前後空白）
	if correct.CorrectAnswerText != "" {
		return strings.EqualFold(
			strings.TrimSpace(sub.AnswerText),
			strings.TrimSpace(correct.CorrectAnswerText),
		)
	}

	// 選擇題：比對選項 ID 列表
	var subOptions []int
	var correctOptions []int

	json.Unmarshal([]byte(sub.SelectedOptionIDs), &subOptions)
	json.Unmarshal([]byte(correct.CorrectOptionIDs), &correctOptions)

	if len(subOptions) != len(correctOptions) {
		return false
	}

	// 建立 set 比對（不考慮順序）
	correctSet := make(map[int]bool)
	for _, id := range correctOptions {
		correctSet[id] = true
	}
	for _, id := range subOptions {
		if !correctSet[id] {
			return false
		}
	}

	return true
}
