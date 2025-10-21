# backend/Dockerfile

FROM node:20-alpine AS build
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci

COPY backend/. .
COPY tsconfig.base.json /tsconfig.base.json

RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY backend/.env.example ./.env

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "dist/index.js"]
