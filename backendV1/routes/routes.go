package routes

import (
	"web3survey/handlers"
	"web3survey/middleware"

	"github.com/gin-gonic/gin"
)

// Register 註冊所有 /api/* 路由
func Register(r *gin.Engine) {
	api := r.Group("/api")

	// ─── 驗證路由（不需要登入） ──────────────────────────────────────────────
	auth := api.Group("/auth")
	{
		auth.GET("/nonce", handlers.GetNonce)        // GET  /api/auth/nonce?wallet=0x...
		auth.POST("/verify", handlers.VerifySignature) // POST /api/auth/verify
	}

	// ─── 問卷路由 ─────────────────────────────────────────────────────────────
	surveys := api.Group("/surveys")
	{
		// 公開路由（不需要登入）
		surveys.GET("", handlers.GetSurveys)                                    // GET  /api/surveys
		surveys.GET("/:id", handlers.GetSurvey)                                 // GET  /api/surveys/:id
		surveys.GET("/:id/participants", handlers.ListParticipants)             // GET  /api/surveys/:id/participants
		surveys.GET("/:id/check-participation", handlers.CheckParticipation)    // GET  /api/surveys/:id/check-participation

		// 需要登入的路由
		surveys.POST("", middleware.AuthRequired(), handlers.CreateSurvey)                          // POST  /api/surveys
		surveys.PATCH("/:id/status", middleware.AuthRequired(), handlers.UpdateStatus)              // PATCH /api/surveys/:id/status
		surveys.PATCH("/:id/contract", middleware.AuthRequired(), handlers.UpdateContract)          // PATCH /api/surveys/:id/contract
		surveys.POST("/:id/draw", middleware.AuthRequired(), handlers.Draw)                         // POST  /api/surveys/:id/draw
		surveys.POST("/:id/participate", middleware.AuthRequired(), handlers.Submit)                // POST  /api/surveys/:id/participate
	}
}
