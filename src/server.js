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
import { addAuthContext } from './auth';
import { weave } from './schema';

const port = process.env.PORT || 4000;

export default async () => {
  globalThis.WebSocket = WebSocket;
  const wordpress = await createWordpressSchema('https://wp.codeday.org/graphql');
  const showYourWork = await createDiscordPostsSchema('http://discord-posts.codeday.cloud');
  // const showcase = await createShowcaseSchema('http://showcase-gql.codeday.cloud/graphql');
  const showcase = await createShowcaseSchema('http://localhost:5000/graphql', 'ws://localhost:5000/graphql');
  const calendar = await createCalendarSchema('http://calendar-gql.codeday.cloud/graphql');
  const contentful = await createContentfulSchema('d5pti1xheuyu', process.env.CONTENTFUL_TOKEN);
  const auth0 = await createAuth0Schema(
    process.env.AUTH0_DOMAIN,
    process.env.AUTH0_CLIENT_ID,
    process.env.AUTH0_CLIENT_SECRET
  );

  const schema = weave({
    account: auth0,
    blog: wordpress,
    cms: contentful,
    showYourWork,
    showcase,
    calendar
  });

  const apollo = new ApolloServer({
    schema,
    introspection: true,
    uploads: false,
    playground: {
      endpoint: '/',
      subscriptionEndpoint: '/subscriptions',
    },
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
      }, { server, path: '/subscriptions'});
    console.log(`Listening on http://0.0.0.0:${port}`);
  });
};
