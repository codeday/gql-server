import { ApolloServer } from 'apollo-server'
import { weaveSchemas } from 'graphql-weaver'
import { createPrismicSchema } from './remotes/prismic'
import { createWordpressSchema } from './remotes/wordpress';

export default async () => {
  const schema = await weaveSchemas({
    endpoints: [
      /* Wordpress post schemas */
      {
        namespace: 'newsroom',
        typePrefix: 'Newsroom',
        schema: createWordpressSchema('https://wp-newsroom.srnd.org/graphql')
      },
      {
        namespace: 'blog',
        typePrefix: 'Blog',
        schema: createWordpressSchema('https://wp-blog.srnd.org/graphql')
      },


      /* Prismic CMS Schemas */
      {
        namespace: 'help',
        typePrefix: 'Help',
        schema: createPrismicSchema('https://srnd-helpcenter.prismic.io/graphql')
      },
      {
        namespace: 'globalConfig',
        typePrefix: 'Global',
        schema: createPrismicSchema('https://srnd-global.prismic.io/graphql')
      },


      /* Create the website layout schemas in a subsection to keep them more orderly. */
      {
        namespace: 'www',
        typePrefix: 'WebLayout',
        schema: weaveSchemas({
          endpoints: [
            {
              namespace: 'wwwSrndOrg',
              typePrefix: 'WwwSrndOrg',
              schema: createPrismicSchema('http://srnd-www.prismic.io/graphql')
            },
            {
              namespace: 'wwwCodeDayOrg',
              typePrefix: 'wwwCodeDayOrg',
              schema: createPrismicSchema('http://srnd-codeday.prismic.io/graphql')
            },
          ]
        })
      }
    ]
  })

  const server = new ApolloServer({
    schema,
    introspection: true,
  });

  server.listen().then(({ url }) => {
    console.log(`🚀  Server ready at ${url}`);
  });
}