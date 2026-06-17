FROM node:20-alpine

WORKDIR /app

# Copia package.json e instala TODAS as dependências (incluindo devDependencies para compilar)
COPY package*.json ./
RUN npm ci

# Copia o código fonte e compila TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Remove devDependencies após o build
RUN npm prune --omit=dev

CMD ["node", "dist/index.js"]
