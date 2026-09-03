FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    APP_PORT=6769

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node bot.js register_command.js ./
RUN mkdir -p /app/temp /app/gifs && chown -R node:node /app

USER node

EXPOSE 6769

CMD ["node", "bot.js"]
