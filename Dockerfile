FROM node:20-bullseye-slim

WORKDIR /app

ENV NODE_OPTIONS=--max-old-space-size=4096
ENV NUXT_UI_PRO_LICENSE=1BEFD730-F461-4D63-B338-94FC804AE532

RUN apt-get update && apt-get install -y \
  openssl \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install deps
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Generate ZenStack (outputs to node_modules/.zenstack)
RUN npx zenstack generate

# Build Nuxt (creates .output/server)
RUN npm run build

# 🔥 CRITICAL: copy ZenStack runtime INTO Nitro server bundle
RUN mkdir -p .output/server/node_modules/.zenstack \
  && cp -r node_modules/.zenstack/* .output/server/node_modules/.zenstack/

ENV NODE_ENV=production
ENV NITRO_PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
