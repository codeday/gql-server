FROM node:11
WORKDIR /app
COPY package-lock.json package.json .babelrc ./
COPY src/ ./src
RUN npm install
RUN npm run build

CMD [ "node", "dist/index.js" ]
EXPOSE 4000