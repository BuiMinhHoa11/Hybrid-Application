# Build từ thư mục gốc repo: docker build -f frontend/Dockerfile .
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/contracts/package.json backend/contracts/
COPY backend/node/packages/auth/package.json backend/node/packages/auth/
COPY backend/node/packages/config/package.json backend/node/packages/config/
COPY database/node/package.json database/node/
COPY backend/node/packages/observability/package.json backend/node/packages/observability/
COPY backend/node/services/public-api/package.json backend/node/services/public-api/
COPY backend/node/services/private-api/package.json backend/node/services/private-api/
COPY backend/node/services/grading-worker/package.json backend/node/services/grading-worker/
COPY frontend/package.json frontend/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY backend/contracts backend/contracts
COPY frontend frontend
RUN npm run build -w @uniexam/frontend

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health >/dev/null || exit 1
