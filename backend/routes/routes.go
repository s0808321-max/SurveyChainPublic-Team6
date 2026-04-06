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
			auth.GET("/nonce", handlers.GetNonce)
			auth.POST("/verify", handlers.VerifySignature)
		}

		// ─── 問卷路由 ─────────────────────────────────────────────────────────────
		surveys := api.Group("/surveys")
		{
			// 公開路由（不需要登入）
			surveys.GET("", handlers.GetSurveys)
			surveys.GET("/:id", handlers.GetSurvey)
			surveys.GET("/:id/participants", handlers.ListParticipants)
			surveys.GET("/:id/check-participation", handlers.CheckParticipation)
			surveys.GET("/:id/qualified", handlers.GetQualifiedParticipants) // ★ 新增

			// 需要登入的路由
			surveys.POST("", middleware.AuthRequired(), handlers.CreateSurvey)
			surveys.PATCH("/:id/status", middleware.AuthRequired(), handlers.UpdateStatus)
			surveys.PATCH("/:id/contract", middleware.AuthRequired(), handlers.UpdateContract)
			surveys.POST("/:id/draw", middleware.AuthRequired(), handlers.Draw)
			surveys.POST("/:id/participate", middleware.AuthRequired(), handlers.Submit)
			surveys.POST("/:id/answers", middleware.AuthRequired(), handlers.PublishAnswers) // ★ 新增
		}
	}
