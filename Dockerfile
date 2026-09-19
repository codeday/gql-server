FROM node:16-alpine as builder

RUN mkdir /build
WORKDIR /build

COPY package.json /build
COPY yarn.lock /build
RUN yarn install --frozen-lockfile --ignore-engines

# RUN rm /app/node_modules/@graphql-tools/delegate/index.cjs.js
# COPY index.cjs.js /app/node_modules/@graphql-tools/delegate/index.cjs.js

COPY .swcrc /build
COPY .babelrc /build
COPY src/ /build/src
RUN yarn run build

FROM node:16-alpine
RUN mkdir /app
WORKDIR /app

COPY --from=builder /build/ /app/

CMD yarn run start
