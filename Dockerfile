FROM node:20-slim

WORKDIR /app

# TEMP hardcoded license (remove later)
ENV NUXT_UI_PRO_LICENSE=1BEFD730-F461-4D63-B338-94FC804AE532

# 🔥 Increase Node heap for build (IMPORTANT)
ENV NODE_OPTIONS=--max-old-space-size=4096

# Install deps
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Generate ZenStack
RUN npx zenstack generate

# Build Nuxt
RUN npm run build

ENV NODE_ENV=production
ENV NITRO_PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
