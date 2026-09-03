FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json

RUN npm install

FROM deps AS development

WORKDIR /app
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "-w", "apps/frontend"]

FROM deps AS build

WORKDIR /app
COPY . .
RUN npm run build -w apps/frontend

FROM node:20-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/frontend/.next/standalone ./
COPY --from=build /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build /app/apps/frontend/public ./apps/frontend/public

EXPOSE 3000

CMD ["node", "apps/frontend/server.js"]
