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
import { addAuthContext, addWsAuthContext } from './auth';
import { weave } from './schema';

const port = process.env.PORT || 4000;

const logger = syslog.createClient(process.env.SYSLOG_HOST, {
  port: process.env.SYSLOG_PORT,
  syslogHostname: `gql`,
});

export default async () => {
  globalThis.WebSocket = WebSocket;
  const wordpress = await createWordpressSchema('https://wp.codeday.org/graphql');
  const showYourWork = await createDiscordPostsSchema('http://discord-posts.codeday.cloud');
  const showcase = await createShowcaseSchema('http://showcase-gql.codeday.cloud/graphql', 'ws://showcase-gql.codeday.cloud/graphql');
  const calendar = await createCalendarSchema('http://calendar-gql.codeday.cloud/graphql');
  const labs = await createLabsSchema('http://labs-gql.codeday.cloud/graphql');
  const advisors = await createAdvisorsSchema('http://advisors-gql.codeday.cloud/graphql');
  const cms = await createContentfulSchema('d5pti1xheuyu', process.env.CONTENTFUL_TOKEN);
  const learn = await createLearnSchema('muw2pziidpat', process.env.CONTENTFUL_LEARN_TOKEN);
  const auth0 = await createAuth0Schema(
    process.env.AUTH0_DOMAIN,
    process.env.AUTH0_CLIENT_ID,
    process.env.AUTH0_CLIENT_SECRET
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
        requestDidStart({ schemaHash, context: { req }, ...rest }) {
          const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

          return {
            validationDidStart({ source, queryHash }) {
              logger.log([
                queryHash,
                ip,
                `QUERY`,
                `"${source?.split(`\n`).filter((line) => Boolean(line.trim())).join(' ').replace(/"/g, `'`)}"`,
                schemaHash,
              ].join(' '));
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
