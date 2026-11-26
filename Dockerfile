# Railway / production: rumi root CLI + bot/ WhatsApp service (nested package.json).
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund --no-audit

COPY bot/package.json bot/package-lock.json ./bot/
RUN npm ci --prefix bot --omit=dev --no-fund --no-audit

COPY . .

CMD ["npm", "start"]