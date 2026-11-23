# Build từ thư mục gốc repo: docker build -f backend/node/services/grading-worker/Dockerfile .
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

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
RUN npm ci --omit=dev --no-audit --no-fund

COPY tsconfig.base.json ./
COPY backend/contracts backend/contracts
COPY backend/node/packages/config backend/node/packages/config
COPY backend/node/packages/observability backend/node/packages/observability
COPY backend/node/services/grading-worker backend/node/services/grading-worker

USER node
EXPOSE 4002
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4002/health >/dev/null || exit 1
CMD ["node_modules/.bin/tsx", "backend/node/services/grading-worker/src/main.ts"]
