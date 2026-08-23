FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY server/package*.json ./server/

RUN npm install
RUN npm --prefix server install

COPY . .

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY package*.json ./
COPY server/package*.json ./server/

RUN npm install --omit=dev
RUN npm --prefix server install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/dist ./server/dist

EXPOSE 5000

CMD ["node", "server/dist/index.js"]
