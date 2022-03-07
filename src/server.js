import Express from 'express';
import http from 'http';
import { ApolloServer } from 'apollo-server-express';
import { graphqlUploadExpress } from 'graphql-upload';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import syslog from 'syslog-client';
import { default as WebSocket } from 'ws';
import ws from 'ws';
import { execute, subscribe } from 'graphql';
import createWordpressSchema from './remotes/wordpress';
import createContentfulSchema from './remotes/contentful';
import createLearnSchema from './remotes/learn';
import createDiscordPostsSchema from './remotes/discordPosts';
import createAuth0Schema from './remotes/auth0';
import createShowcaseSchema from './remotes/showcase';
import createCalendarSchema from './remotes/calendar';
import createLabsSchema from './remotes/labs';
import createAdvisorsSchema from './remotes/advisors';
import createTwitchSchema from './remotes/twitch';
import createGeoSchema from './remotes/geo';
import createClearSchema from "./remotes/clear";
import { addAuthContext, addWsAuthContext } from './auth';
import { weave } from './schema';

const port = process.env.PORT || 4000;

const logger = syslog.createClient(process.env.SYSLOG_HOST, {
  port: process.env.SYSLOG_PORT,
  syslogHostname: `gql`,
});

export default async () => {
  globalThis.WebSocket = WebSocket;
  const wordpress = await createWordpressSchema(process.env.WORDPRESS_URL || 'https://wp.codeday.org/graphql');
  const showYourWork = await createDiscordPostsSchema(
    process.env.SHOWYOURWORK_URL || 'http://discord-posts.codeday.cloud'
  );
  const showcase = await createShowcaseSchema(
    process.env.SHOWCASE_URL || 'http://showcase-gql.codeday.cloud/graphql',
    process.env.SHOWCASE_WS || 'ws://showcase-gql.codeday.cloud/graphql'
  );
  const calendar = await createCalendarSchema(process.env.CALENDAR_URL || 'http://calendar-gql.codeday.cloud/graphql');
  const labs = await createLabsSchema(process.env.LABS_URL || 'http://labs-gql.codeday.cloud/graphql');
  const advisors = await createAdvisorsSchema(process.env.ADVISORS_URL || 'http://advisors-gql.codeday.cloud/graphql');
  const clear = await createClearSchema(process.env.CLEAR_URL || 'http://clear-gql.codeday.cloud/graphql');
  const cms = await createContentfulSchema('d5pti1xheuyu', process.env.CONTENTFUL_TOKEN);
  const learn = await createLearnSchema('muw2pziidpat', process.env.CONTENTFUL_LEARN_TOKEN);
  const auth0 = await createAuth0Schema(
    process.env.AUTH0_DOMAIN,
    process.env.AUTH0_CLIENT_ID,
    process.env.AUTH0_CLIENT_SECRET
  );
  const geo = await createGeoSchema(
    process.env.MAXMIND_ACCOUNT,
    process.env.MAXMIND_KEY
  );
  const twitch = await createTwitchSchema(
    process.env.TWITCH_CHANNEL,
    process.env.TWITCH_CLIENT_ID,
    process.env.TWITCH_CLIENT_SECRET
  );
  const schema = weave({
    account: auth0,
    blog: wordpress,
    cms,
    showYourWork,
    showcase,
    calendar,
    twitch,
    learn,
    labs,
    advisors,
    geo,
    clear,
  });

  const apollo = new ApolloServer({
    schema,
    introspection: true,
    uploads: false,
    playground: {
      endpoint: '/',
      subscriptionEndpoint: '/subscriptions',
    },
    plugins: [
      {
        requestDidStart({ schemaHash, context: { req } }) {
          const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

          return {
            validationDidStart({ source, queryHash, request }) {
              logger.log([
                queryHash,
                ip,
                `QUERY`,
                `"${source?.split(`\n`).filter((line) => Boolean(line.trim())).join(' ').replace(/"/g, `'`)}"`,
                schemaHash,
              ].join(' '));
              if (request?.variables) {
                logger.log([
                  queryHash,
                  ip,
                  `QUERY_VARIABLES`,
                  `"${JSON.stringify(request.variables)}"`,
                  schemaHash,
                ].join(' '));
              }
              return (errs) => {
                (errs || []).forEach((e) => {
                  logger.log([
                    queryHash,
                    ip,
                    `PARSE_ERROR`,
                    `"${e?.toString().split(`\n`).join('; ')}"`,
                    `"${e?.stack?.split(`\n`).join('; ')}"`
                  ].join(' '));
                });
              }
            },

            didEncounterErrors({ queryHash, errors }) {
              console.log(errors);
              (errors || []).forEach((e) => {
                logger.log([
                  queryHash,
                  ip,
                  `EXEC_ERROR`,
                  `"${e?.toString().split(`\n`).join('; ')}"`,
                  `"${e?.stack?.split(`\n`).join('; ')}"`
                ].join(' '));
              });
            }
          }
        },
      }
    ],
    context: ({ req }) => ({
      headers: req?.headers,
      req,
      ...addAuthContext(req || {}),
    }),
  });


  const app = Express();
  app.use(graphqlUploadExpress({ maxFileSize: 100 * 1024 * 1024, maxFiles: 3 }));
  apollo.applyMiddleware({ app, path: '/' });

  app.timeout = 5 * 60 * 1000;
  app.keepAliveTimeout = 2 * 60 * 1000;
  app.headersTimeout = 5 * 60 * 1000;

  const server = http.createServer(app);

  server.listen(port, () => {
    new SubscriptionServer({
      schema,
      execute,
      subscribe,
      onConnect: (connectionParams, webSocket) => {
        return addWsAuthContext(connectionParams)
      }
    }, { server, path: '/subscriptions' });
    console.log(`Listening on http://0.0.0.0:${port}`);
  });
};
