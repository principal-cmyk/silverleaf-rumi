# Railway / production: rumi root CLI + bot/ WhatsApp service (nested package.json).
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY bot/package.json bot/package-lock.json ./bot/
# Ignore scripts here: root postinstall installs bot/ deps and would run
# before bot/package.json exists if the manifests are copied separately.
RUN npm ci --omit=dev --ignore-scripts --no-fund --no-audit \
 && npm ci --prefix bot --omit=dev --no-fund --no-audit

COPY . .

CMD ["npm", "start"]