FROM node:13-alpine

RUN mkdir /app
WORKDIR /app

COPY package.json /app
COPY yarn.lock /app
RUN yarn install

COPY . /app
RUN yarn run build

CMD yarn run start
