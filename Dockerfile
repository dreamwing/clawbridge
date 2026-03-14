FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Ensure data directories exist and are accessible
RUN mkdir -p data/logs && chown -R node:node /app

USER node
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]
