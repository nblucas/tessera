# Build from the repo root: docker build -f backend/Dockerfile .
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --workspace shared
COPY shared shared
COPY contracts/abi contracts/abi
COPY backend backend
EXPOSE 3000
CMD ["npm", "start", "--workspace", "backend"]
