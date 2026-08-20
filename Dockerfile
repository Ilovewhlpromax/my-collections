# 我的收藏展览 · Zeabur 容器部署
# Zeabur 会自动识别本 Dockerfile 构建镜像
FROM node:20-alpine

WORKDIR /app

# 复制站点与服务器（无 npm 依赖，无需 install）
COPY . .

EXPOSE 8080

# Zeabur 会注入 PORT / SUPABASE_URL / SUPABASE_ANON_KEY 等环境变量
CMD ["node", "server.js"]
