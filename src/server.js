import { ApolloServer } from 'apollo-server';
import { mergeSchemas } from 'graphql-tools';
import wordpress from "./remotes/wordpress";
import helloWorld from "./locals/helloWorld";

export default async () => {

  // Fetch schema types
  const schema = mergeSchemas({ schemas: await Promise.all([
    wordpress('Newsroom', 'https://wp-newsroom.srnd.org/graphql'),
    wordpress('Blog', 'https://wp-blog.srnd.org/graphql'),
    helloWorld(),
  ]) });

  const server = new ApolloServer({ schema });

  server.listen().then(({ url }) => {
    console.log(`🚀  Server ready at ${url}`);
  });
}