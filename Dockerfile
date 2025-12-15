FROM node:20-slim

WORKDIR /app

# 🔴 TEMPORARY: hardcode license (REMOVE LATER)
ENV NUXT_UI_PRO_LICENSE=1BEFD730-F461-4D63-B338-94FC804AE532

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV NITRO_PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
