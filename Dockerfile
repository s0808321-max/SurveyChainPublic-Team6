# ─── Stage 1: Build Frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend/client/package.json frontend/client/package-lock.json ./
RUN npm ci

COPY frontend/client/ ./

# 前端不需要 VITE_API_BASE_URL，因為和後端同源（/api 就是本機）
# 只需要傳入合約地址
ARG VITE_CONTRACT_ADDRESS=""
ENV VITE_CONTRACT_ADDRESS=$VITE_CONTRACT_ADDRESS

RUN npm run build

# ─── Stage 2: Build Backend ────────────────────────────────────────────────────
FROM golang:1.24-alpine AS backend-builder

WORKDIR /app

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./

RUN CGO_ENABLED=0 GOOS=linux go build -o server ./main.go

# ─── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM alpine:latest

WORKDIR /app

RUN apk --no-cache add ca-certificates tzdata

# 複製 Go 執行檔
COPY --from=backend-builder /app/server ./server

# ★ 複製前端 build 產物到 /app/dist（Go 會 serve 這個目錄）
COPY --from=frontend-builder /frontend/dist ./dist

EXPOSE 8080

CMD ["./server"]
