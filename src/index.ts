/* eslint-disable no-promise-executor-return */
/* eslint-disable import/first */
import * as dotenv from 'dotenv';

dotenv.config();

// The ApolloServer constructor requires two parameters: your schema
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { GRAPHQL_WS, SubscriptionServer } from 'subscriptions-transport-ws';
import { execute, subscribe } from 'graphql';
import { GRAPHQL_TRANSPORT_WS_PROTOCOL } from 'graphql-ws';
import { SchemaLoader } from './schema.js';
import { LoggingPlugin } from './utils.js';

interface Context {}

const loader = new SchemaLoader();
await loader.reload();
loader.autoRefresh(1000 * 60 * 5);

const app = express();
const httpServer = createServer(app);

// graphql-ws
const graphqlWs = new WebSocketServer({ noServer: true });
useServer({ schema: loader.schema }, graphqlWs);

// subscriptions-transport-ws
const subTransWs = new WebSocketServer({ noServer: true });
SubscriptionServer.create(
  {
    schema: loader.schema,
    execute,
    subscribe,
  },
  subTransWs,
);

const graphQLWsServerCleanup = useServer({ schema: loader.schema }, graphqlWs);
const subTransWsServerCleanup = useServer({ schema: loader.schema }, subTransWs);

const server = new ApolloServer<Context>({
  schema: loader.schema,
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await graphQLWsServerCleanup.dispose();
            await subTransWsServerCleanup.dispose();
          },
        };
      },
    },
    LoggingPlugin
  ],
});
await server.start();

// listen for upgrades and delegate requests according to the WS subprotocol
httpServer.on('upgrade', (req, socket, head) => {
  // extract websocket subprotocol from header
  const protocol = req.headers['sec-websocket-protocol'];
  const protocols = Array.isArray(protocol) ? protocol : protocol?.split(',').map((p) => p.trim());

  // decide which websocket server to use
  const wss =
    protocols?.includes(GRAPHQL_WS) && // subscriptions-transport-ws subprotocol
    !protocols.includes(GRAPHQL_TRANSPORT_WS_PROTOCOL) // graphql-ws subprotocol
      ? subTransWs
      : // graphql-ws will welcome its own subprotocol and
        // gracefully reject invalid ones. if the client supports
        // both transports, graphql-ws will prevail
        graphqlWs;
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

app.use(
  '/',
  cors<cors.CorsRequest>(),
  bodyParser.json(),
  expressMiddleware(server, {
    context: async ({ req }) => ({ token: req.headers.token }),
  }),
);

const PORT = 4000;


await new Promise<any>((resolve) => httpServer.listen({ port: PORT }, resolve as () => void));
console.log(`🚀 Server ready at http://localhost:4000/`);
