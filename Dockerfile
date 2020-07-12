FROM node:alpine

RUN mkdir /app
WORKDIR /app

COPY package.json /app
COPY yarn.lock /app
RUN yarn install

COPY src /app/src
RUN yarn run build

CMD yarn run start
