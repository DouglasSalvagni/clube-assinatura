# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install --legacy-peer-deps --no-audit --no-fund

FROM dependencies AS source
COPY tsconfig.base.json ./
COPY apps ./apps

FROM source AS api-build
RUN npm run build -w @club-platform/api

FROM source AS worker-build
RUN npm run build -w @club-platform/worker

FROM source AS web-build
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_PRODUCT_NAME=ClubFlow
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_PRODUCT_NAME=$NEXT_PUBLIC_PRODUCT_NAME
RUN npm run build -w @club-platform/web

FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=api-build /app /app
EXPOSE 4003
CMD ["node", "apps/api/dist/src/main.js"]

FROM node:22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=worker-build /app /app
CMD ["node", "apps/worker/dist/main.js"]

FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
COPY --from=web-build /app /app
EXPOSE 4002
CMD ["npm", "run", "start", "-w", "@club-platform/web"]
