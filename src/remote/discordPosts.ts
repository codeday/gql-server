import { delegateToSchema } from '@graphql-tools/delegate';
import { OperationTypeNode } from 'graphql';
import { createRemoteSubschema } from '../remoteSubschema.js';
import { SubschemaInfo } from '../schema.js';

function createTypeDefs(prefix) {
  return `
    extend type ${prefix}DiscordMessage {
      author: AccountUser
    }
  `;
}

function createResolvers(prefix, schemas) {
  return {
    [`${prefix}DiscordMessage`]: {
      author: {
        selectionSet: '{ userId }',
        resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.account,
            operation: OperationTypeNode.QUERY,
            fieldName: 'getUser',
            args: {
              where: {
                discordId: parent.userId,
              },
            },
            context,
            info,
          });
        },
      },
    },
  };
}

export async function createDiscordPostsSubschema(url): Promise<SubschemaInfo> {
  console.log(` * discordPosts(${url})`);
  return createRemoteSubschema(url, { createResolvers, createTypeDefs });
}

// export default async function createDiscordPostsSchema(uri) {
//   console.log(` * discordPosts(${uri})`);
//   const schema = await loadSchema(uri, { loaders: [new UrlLoader()] });
//   return {
//     schema,
//     transforms: [],
//     getConnectionTypes,
//     getConnectionResolvers,
//   };
// }
