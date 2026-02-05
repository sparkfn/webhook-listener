FROM node:22-alpine

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src
COPY public ./public

RUN npm run build

ENV PORT=18800
ENV DATA_DIR=/data

VOLUME ["/data"]

EXPOSE 18800

CMD ["node", "dist/server.js"]
