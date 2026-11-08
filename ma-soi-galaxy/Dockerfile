FROM node:22-alpine
WORKDIR /app
COPY package.json server.js game.js roles.js arcade.js chess-engine.js content.seed.json ./
COPY public ./public
COPY tests ./tests
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV PORT=3000
ENV DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "server.js"]
