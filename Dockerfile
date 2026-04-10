# ── 階段一：Build 前端 ──────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend/client

# ★ 接收 build-time 環境變數（合約地址）
ARG VITE_CONTRACT_ADDRESS
ENV VITE_CONTRACT_ADDRESS=$VITE_CONTRACT_ADDRESS

COPY frontend/client/package*.json ./
RUN npm install

COPY frontend/client/ ./
RUN npm run build

# ── 階段二：Build 後端 ──────────────────────────────────────────────────────
FROM golang:1.24-alpine AS backend-builder

WORKDIR /app/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN go build -o server .

# ── 階段三：最終執行階段 ────────────────────────────────────────────────────
FROM alpine:latest

WORKDIR /app

COPY --from=frontend-builder /app/frontend/client/dist ./frontend/client/dist
COPY --from=backend-builder /app/backend/server ./backend/server

RUN chmod +x ./backend/server

EXPOSE 8080

CMD ["./backend/server"]
