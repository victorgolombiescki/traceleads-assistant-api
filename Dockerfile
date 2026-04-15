FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build && \
    test -f dist/index.js && echo "✅ dist/index.js" || (echo "❌ build sem dist/index.js" && ls -la dist && exit 1)

FROM node:20-alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /usr/src/app/dist ./dist

RUN apk add --no-cache wget && \
    test -f dist/index.js && echo "✅ dist/index.js (production)" || exit 1

EXPOSE 7071

ENV ASSISTANT_HTTP_PORT=7071
ENV PORT=7071

CMD ["node", "dist/index.js"]
