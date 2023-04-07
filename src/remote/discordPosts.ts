import { delegateToSchema } from '@graphql-tools/delegate';
import { OperationTypeNode } from 'graphql';
import { createRemoteSubschema } from '../remoteSubschema.js';
import { ResolversWithPrefix, SubschemaInfo } from '../schema.js';

function createTypeDefs(prefix) {
  return `
    extend type ${prefix}DiscordMessage {
      author: AccountUser
    }
  `;
}

function createResolvers(schemas): ResolversWithPrefix<'ShowYourWork'> {
  return {
    [`ShowYourWorkDiscordMessage`]: {
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
  return createRemoteSubschema(url, { createResolvers, createTypeDefs, prefix: 'showYourWork' });
}
