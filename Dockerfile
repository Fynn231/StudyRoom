FROM node:24.15.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
COPY extension ./extension
COPY scripts ./scripts
RUN npm run build

FROM node:24.15.0-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# Runtime uses Node's tsx loader; no npm lifecycle scripts or personal AI runner.
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/protocol.ts src/aiStudy.ts src/profileModel.ts ./src/
COPY src/planning/schema.ts src/planning/scheduler.ts src/planning/savedSchedule.ts ./src/planning/
USER node
EXPOSE 10000
CMD ["node", "--import", "tsx", "server/start.ts"]
