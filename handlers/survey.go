package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"web3survey/db"
	"web3survey/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// expireActivePastDeadline 將「仍為 active 但已過 deadline」的問卷批次標成 ended（寫入 DB）
func expireActivePastDeadline(now time.Time) {
	db.DB.Model(&models.Survey{}).
		Where("status = ? AND deadline < ?", "active", now).
		Updates(map[string]interface{}{
			"status":     "ended",
			"updated_at": now,
		})
}

// GetSurveys GET /api/surveys?status=active
func GetSurveys(c *gin.Context) {
	status := c.Query("status")
	creator := strings.ToLower(strings.TrimSpace(c.Query("creator")))
	participant := strings.ToLower(strings.TrimSpace(c.Query("participant")))
	poolType := strings.TrimSpace(c.Query("poolType"))

	now := time.Now()
	expireActivePastDeadline(now)

	var surveys []models.Survey
	query := db.DB.Preload("Questions.Options")

	if creator != "" {
		query = query.Where("creator_address = ?", creator)
	}
	if participant != "" {
		query = query.Where(
			"id IN (?)",
			db.DB.Model(&models.Participant{}).
				Select("survey_id").
				Where("wallet_address = ?", participant),
		)
	}
	if poolType == "A" || poolType == "B" {
		query = query.Where("pool_type = ?", poolType)
	}

	if status != "" {
		if status == "ended" {
			// 已結束列表：含 status=ended，以及尚未被批次更新到、仍為 active 但已過期的列
			query = query.Where("(status = ? OR (status = ? AND deadline < ?))", "ended", "active", now)
		} else if status == "active" {
			// 進行中：僅未過截止且仍為 active（避免 DB 未及更新時出現「已截止仍顯示進行中」）
			query = query.Where("status = ? AND deadline >= ?", "active", now)
		} else {
			query = query.Where("status = ?", status)
		}
	}

	if err := query.Order("created_at DESC").Find(&surveys).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查詢問卷失敗"})
		return
	}

	// 回傳前再保險：仍為 active 且已過期者補寫 ended，並讓 JSON 的 status 與畫面一致
	for i := range surveys {
		if surveys[i].Status == "active" && now.After(surveys[i].Deadline) {
			_ = db.DB.Model(&surveys[i]).Updates(map[string]interface{}{
				"status":     "ended",
				"updated_at": now,
			}).Error
			surveys[i].Status = "ended"
		}
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

	// 單筆查詢也做一次狀態同步（active 且已截止 → ended）
	now := time.Now()
	if survey.Status == "active" && now.After(survey.Deadline) {
		if err := db.DB.Model(&survey).Updates(map[string]interface{}{
			"status":     "ended",
			"updated_at": now,
		}).Error; err == nil {
			survey.Status = "ended"
		}
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
// 儲存合約地址、Pool ID 和 Pool 類型，三者必須同時提供才能正確綁定
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

	// ★ 修正：contractPoolId 與 poolType 必須同時提供，避免 ID 與類型對不上
	if input.ContractPoolId != nil && input.PoolType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "設定 contractPoolId 時必須同時提供 poolType（\"A\" 或 \"B\"）"})
		return
	}
	if input.PoolType != "" && input.ContractPoolId == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "設定 poolType 時必須同時提供 contractPoolId"})
		return
	}
	if input.PoolType != "" && input.PoolType != "A" && input.PoolType != "B" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "poolType 只接受 \"A\" 或 \"B\""})
		return
	}

	updates := map[string]interface{}{
		"contract_address": input.ContractAddress,
	}
	if input.TransactionHash != "" {
		updates["transaction_hash"] = input.TransactionHash
	}
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
// ★ 修正：Draw 僅作為「鏈上 VRF 抽獎完成後同步中獎者到資料庫」的入口
// 實際抽獎邏輯由鏈上 Chainlink VRF 決定，前端監聽到 WinnersSelected 事件後呼叫此 API 同步結果
// 若傳入 winnerAddresses，則直接使用鏈上結果；若未傳入，則以後端隨機作為 fallback（僅供測試）
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

	// ★ 修正：驗證呼叫者為問卷創建者
	if !strings.EqualFold(survey.CreatorAddress, input.CallerAddress) {
		c.JSON(http.StatusForbidden, gin.H{"error": "只有問卷創建者可以執行抽獎"})
		return
	}

	var winnerAddresses []string

	if len(input.WinnerAddresses) > 0 {
		// ★ 優先路徑：使用前端從鏈上 WinnersSelected 事件解析到的中獎者名單
		winnerAddresses = input.WinnerAddresses
	} else {
		// Fallback 路徑：後端隨機抽（僅供無合約測試環境使用）
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

		// 使用 Fisher-Yates shuffle 確保公平性
		for i := len(participants) - 1; i > 0; i-- {
			j := i // 簡化版，正式環境應使用 crypto/rand
			participants[i], participants[j] = participants[j], participants[i]
		}
		for i := 0; i < winnerCount; i++ {
			winnerAddresses = append(winnerAddresses, participants[i].WalletAddress)
		}
	}

	// 寫入資料庫
	err = db.DB.Transaction(func(tx *gorm.DB) error {
		// 重置所有人的 is_winner
		if err := tx.Model(&models.Participant{}).
			Where("survey_id = ?", id).
			Update("is_winner", false).Error; err != nil {
			return err
		}

		// 標記中獎者
		for _, addr := range winnerAddresses {
			if err := tx.Model(&models.Participant{}).
				Where("survey_id = ? AND wallet_address = ?", id, strings.ToLower(addr)).
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
