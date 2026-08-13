FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p uploads data

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/index.js"]
