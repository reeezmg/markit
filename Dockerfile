FROM node:20-bullseye-slim

WORKDIR /app

ENV NODE_OPTIONS=--max-old-space-size=4096
ENV NUXT_UI_PRO_LICENSE=1BEFD730-F461-4D63-B338-94FC804AE532

RUN apt-get update && apt-get install -y \
  openssl \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

# 🔥 Generate ZenStack
RUN npx zenstack generate

# 🔥 CRITICAL: make .zenstack resolvable at runtime
RUN mkdir -p node_modules/.zenstack \
  && cp -r .zenstack/* node_modules/.zenstack/

# Build Nuxt
RUN npm run build

ENV NODE_ENV=production
ENV NITRO_PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
