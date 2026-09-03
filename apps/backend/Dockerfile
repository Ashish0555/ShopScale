FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY apps/backend/prisma ./apps/backend/prisma

RUN npm ci
RUN npm run db:generate -w apps/backend

FROM deps AS development

WORKDIR /app
COPY . .

EXPOSE 4000

CMD ["npm", "run", "dev", "-w", "apps/backend"]

FROM deps AS build

WORKDIR /app
COPY . .
RUN npm run build -w apps/backend

FROM node:20-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/backend/prisma ./apps/backend/prisma
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./apps/backend/dist

EXPOSE 4000

CMD ["npm", "run", "start", "-w", "apps/backend"]
