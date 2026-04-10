# ── 階段一：Build 前端 ──────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend/client

# 先複製 package.json 安裝依賴（利用 Docker 快取）
COPY frontend/client/package*.json ./
RUN npm install

# 複製前端原始碼並 build
COPY frontend/client/ ./
RUN npm run build

# ── 階段二：Build 後端 ──────────────────────────────────────────────────────
FROM golang:1.24-alpine AS backend-builder

WORKDIR /app/backend

# 先複製 go.mod 下載依賴（利用 Docker 快取）
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# 複製後端原始碼並 build
COPY backend/ ./
RUN go build -o server .

# ── 階段三：最終執行階段 ────────────────────────────────────────────────────
FROM alpine:latest

WORKDIR /app

# 從前端 builder 複製 dist 靜態檔案
COPY --from=frontend-builder /app/frontend/client/dist ./frontend/client/dist

# 從後端 builder 複製執行檔
COPY --from=backend-builder /app/backend/server ./backend/server

# 確保執行檔有執行權限
RUN chmod +x ./backend/server

EXPOSE 8080

CMD ["./backend/server"]
