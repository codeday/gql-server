import { ApolloServer } from 'apollo-server';
import createWordpressSchema from './remotes/wordpress';
import createContentfulSchema from './remotes/contentful';
import createDiscordPostsSchema from './remotes/discordPosts';
import createAuth0Schema from './remotes/auth0';
import { addAuthContext } from './auth';
import { weave } from './schema';
import createShowcaseSchema from './remotes/showcase';

export default async () => {
  const wordpress = await createWordpressSchema('https://wp.codeday.org/graphql');
  const showYourWork = await createDiscordPostsSchema('http://discord-posts.codeday.cloud');
  const showcase = await createShowcaseSchema('http://showcase-gql.codeday.cloud/graphql');
  const contentful = await createContentfulSchema('d5pti1xheuyu', process.env.CONTENTFUL_TOKEN);
  const auth0 = await createAuth0Schema(
    process.env.AUTH0_DOMAIN,
    process.env.AUTH0_CLIENT_ID,
    process.env.AUTH0_CLIENT_SECRET
  );

  const schema = weave({
    account: auth0, blog: wordpress, cms: contentful, showYourWork, showcase,
  });

  const server = new ApolloServer({
    schema,
    introspection: true,
    context: ({ req }) => ({
      headers: req.headers,
      ...addAuthContext(req || {}),
    }),
  });

  server.listen().then(({ url }) => {
    // eslint-disable-next-line no-console
    console.log(`🚀  Server ready at ${url}`);
  });
};
