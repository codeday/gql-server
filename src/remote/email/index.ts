import { addResolversToSchema } from '@graphql-tools/schema';
import fetch from 'node-fetch';
import { JSONObjectResolver, JSONObjectDefinition } from 'graphql-scalars';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { loadSchema } from '@graphql-tools/load';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SubschemaInfo } from '../../schema.js';

export async function createEmailSubschema(): Promise<SubschemaInfo> {
  const baseSchema = await loadSchema(
    [JSONObjectDefinition, join(dirname(fileURLToPath(import.meta.url)), 'schema.gql')],
    {
      loaders: [new GraphQLFileLoader()],
    },
  );

  const resolvers = {
    JSONObject: JSONObjectResolver,
    Query: {
      status() {
        return true;
      },
    },
    Mutation: {
      async subscribe(parent, args) {
        const res = await fetch(`https://emailoctopus.com/api/1.6/lists/${args.list}/contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: process.env.EMAIL_OCTOPUS_TOKEN,
            email_address: args.email,
            fields: { ...args.fields, FirstName: args.firstName, LastName: args.lastName },
          }),
        });
        return true;
      },
    },
  };

  const schema = addResolversToSchema({ schema: baseSchema, resolvers });

  return {
    subschema: { schema },
    createTypeDefs: () => [JSONObjectDefinition],
    prefix: "email"
  };
}
