package routes

import (
	"web3survey/handlers"

	"github.com/gin-gonic/gin"
)

// Register 註冊所有 /api/* 路由
func Register(r *gin.Engine) {
	api := r.Group("/api")

	surveys := api.Group("/surveys")
	{
		// 問卷 CRUD
		surveys.GET("", handlers.GetSurveys)           // GET  /api/surveys
		surveys.GET("/:id", handlers.GetSurvey)        // GET  /api/surveys/:id
		surveys.POST("", handlers.CreateSurvey)        // POST /api/surveys

		// 問卷狀態與合約更新
		surveys.PATCH("/:id/status", handlers.UpdateStatus)     // PATCH /api/surveys/:id/status
		surveys.PATCH("/:id/contract", handlers.UpdateContract)  // PATCH /api/surveys/:id/contract

		// 抽獎
		surveys.POST("/:id/draw", handlers.Draw) // POST /api/surveys/:id/draw

		// 參與者
		surveys.POST("/:id/participate", handlers.Submit)                    // POST /api/surveys/:id/participate
		surveys.GET("/:id/check-participation", handlers.CheckParticipation) // GET  /api/surveys/:id/check-participation
		surveys.GET("/:id/participants", handlers.ListParticipants)          // GET  /api/surveys/:id/participants
	}
}
