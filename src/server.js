import Express from 'express';
import http from 'http';
import { ApolloServer } from 'apollo-server-express';
import { graphqlUploadExpress } from 'graphql-upload';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import WebSocket from 'ws';
import { execute, subscribe } from 'graphql';
import createWordpressSchema from './remotes/wordpress';
import createContentfulSchema from './remotes/contentful';
import createDiscordPostsSchema from './remotes/discordPosts';
import createGithubSchema from './remotes/github';
import createShowcaseSchema from './remotes/showcase';
import createCalendarSchema from './remotes/calendar';
import createLabsSchema from './remotes/labs';
import createAdvisorsSchema from './remotes/advisors';
import createTwitchSchema from './remotes/twitch';
import createEmailSchema from './remotes/email';
import createGeoSchema from './remotes/geo';
import createClearSchema from "./remotes/clear";
import createAccountSchema from './remotes/account';
import createNotionSchema from './remotes/notion';
import createTermageddonSchema from './remotes/termageddon';
import { weave } from './schema';
import log from './plugins/log';

const port = process.env.PORT || 4000;

async function buildSchema() {
  console.log('Fetching sub-schemas...');
  const [
    blog,
    showYourWork,
    showcase,
    calendar,
    labs,
    advisors,
    clear,
    cms,
    account,
    geo,
    email,
    twitch,
    github,
    notion,
    termageddon,
  ] =
    await Promise.all([
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
      await createAccountSchema(process.env.ACCOUNT_URL ||"http://account-gql.codeday.cloud/graphql" , process.env.ACCOUNT_WS || "ws://account-gql.codeday.cloud/graphql"),
      await createGeoSchema(
        process.env.MAXMIND_ACCOUNT,
        process.env.MAXMIND_KEY
      ),
      await createEmailSchema(),
      await createTwitchSchema(
        process.env.TWITCH_CHANNEL,
        process.env.TWITCH_CLIENT_ID,
        process.env.TWITCH_CLIENT_SECRET
      ),
      await createGithubSchema(
        process.env.GITHUB_TOKEN,
      ),
      await createNotionSchema(
        process.env.NOTION_TOKEN,
      ),
      await (createTermageddonSchema()),
    ]);
  console.log('...sub-schemas fetched.');

  return weave({
    account,
    blog,
    cms,
    showYourWork,
    showcase,
    calendar,
    email,
    twitch,
    labs,
    advisors,
    geo,
    clear,
    github,
    notion,
    termageddon,
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
    }),
  });

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
    }, { server, path: '/subscriptions' });
    console.log(`Listening on http://0.0.0.0:${port}`);
  });
};
