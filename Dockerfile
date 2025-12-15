FROM node:20-slim

WORKDIR /app

# Accept build arg
ARG NUXT_UI_PRO_LICENSE
ENV NUXT_UI_PRO_LICENSE=$NUXT_UI_PRO_LICENSE

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV NITRO_PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
