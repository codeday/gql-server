import { ApolloServer } from 'apollo-server';
import createWordpressSchema from './remotes/wordpress';
import createContentfulSchema from './remotes/contentful';
import createAuth0Schema from './remotes/auth0';
import { addAuthContext } from './auth';
import { weave } from './schema';

export default async () => {
  const wordpress = await createWordpressSchema('https://wp.codeday.org/graphql');
  const contentful = await createContentfulSchema('d5pti1xheuyu', process.env.CONTENTFUL_TOKEN);
  const auth0 = await createAuth0Schema(
    process.env.AUTH0_DOMAIN,
    process.env.AUTH0_CLIENT_ID,
    process.env.AUTH0_CLIENT_SECRET
  );

  const schema = weave({ account: auth0, blog: wordpress, cms: contentful });

  const server = new ApolloServer({
    schema,
    introspection: true,
    context: ({ req }) => ({
      ...addAuthContext(req || {}),
    }),
  });

  server.listen().then(({ url }) => {
    // eslint-disable-next-line no-console
    console.log(`🚀  Server ready at ${url}`);
  });
};
