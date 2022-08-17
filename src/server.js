import Express from 'express';
import http from 'http';
import { ApolloServer } from 'apollo-server-express';
import { graphqlUploadExpress } from 'graphql-upload';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { default as WebSocket } from 'ws';
import ws from 'ws';
import { execute, subscribe } from 'graphql';
import createWordpressSchema from './remotes/wordpress';
import createContentfulSchema from './remotes/contentful';
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
import log from './plugins/log';

const port = process.env.PORT || 4000;

async function buildSchema() {
  console.log('Fetching sub-schemas...');
  const [blog, showYourWork, showcase, calendar, labs, advisors, clear, cms, account, geo, twitch] = await Promise.all([
    await createWordpressSchema(process.env.WORDPRESS_URL || 'https://wp.codeday.org/graphql'),
    await createDiscordPostsSchema(process.env.SHOWYOURWORK_URL || 'http://discord-posts.codeday.cloud'),
    await createShowcaseSchema(
      process.env.SHOWCASE_URL || 'http://showcase-gql.codeday.cloud/graphql',
      process.env.SHOWCASE_WS || 'ws://showcase-gql.codeday.cloud/graphql'
    ),
    await createCalendarSchema(process.env.CALENDAR_URL || 'http://calendar-gql.codeday.cloud/graphql'),
    await createLabsSchema(process.env.LABS_URL || 'http://labs-gql.codeday.cloud/graphql'),
    await createAdvisorsSchema(process.env.ADVISORS_URL || 'http://advisors-gql.codeday.cloud/graphql'),
    await createClearSchema(process.env.CLEAR_URL || 'http://clear-gql.codeday.cloud/graphql'),
    await createContentfulSchema('d5pti1xheuyu', process.env.CONTENTFUL_TOKEN),
    await createAuth0Schema(
      process.env.AUTH0_DOMAIN,
      process.env.AUTH0_CLIENT_ID,
      process.env.AUTH0_CLIENT_SECRET
    ),
    await createGeoSchema(
      process.env.MAXMIND_ACCOUNT,
      process.env.MAXMIND_KEY
    ),
    await createTwitchSchema(
      process.env.TWITCH_CHANNEL,
      process.env.TWITCH_CLIENT_ID,
      process.env.TWITCH_CLIENT_SECRET
    ),
  ]);
  console.log('...sub-schemas fetched.');

  return weave({
    account,
    blog,
    cms,
    showYourWork,
    showcase,
    calendar,
    twitch,
    labs,
    advisors,
    geo,
    clear,
  });
}

export default async () => {
  globalThis.WebSocket = WebSocket;

  const schema = await buildSchema();

  const apollo = new ApolloServer({
    schema,
    introspection: true,
    uploads: false,
    playground: {
      endpoint: '/',
      subscriptionEndpoint: '/subscriptions',
    },
    plugins: [log],
    context: ({ req }) => ({
      headers: req?.headers,
      req,
      ...addAuthContext(req || {}),
    }),
  });

  setInterval(async () => {
    console.log(`Reloading schema...`);
    apollo.schema = await buildSchema();
    console.log(`...schema reloaded. (Subscriptions not reloaded.)`);
  }, 1000 * 60 * 15);

  const app = Express();
  app.use(graphqlUploadExpress({ maxFileSize: 250 * 1024 * 1024, maxFiles: 3 }));
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
