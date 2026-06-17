# Tupi Ingestion Service

FROM node:20-alpine

WORKDIR /app

# Copia dependências e instala
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o código compilado
COPY dist/ ./dist/

CMD ["node", "dist/index.js"]
