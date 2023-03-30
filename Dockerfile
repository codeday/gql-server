FROM node:13-alpine

RUN mkdir /app
WORKDIR /app

COPY package.json /app
COPY yarn.lock /app
RUN yarn install --frozen-lockfile

COPY . /app
RUN rm /app/node_modules/@graphql-tools/delegate/index.cjs.js
COPY index.cjs.js /app/node_modules/@graphql-tools/delegate/index.cjs.js
RUN yarn run build

CMD yarn run start
