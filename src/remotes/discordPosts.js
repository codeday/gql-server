import { loadSchema } from '@graphql-tools/load';
import { UrlLoader } from '@graphql-tools/url-loader';
import { delegateToSchema } from '@graphql-tools/delegate';

function getConnectionTypes(prefix) {
  return `
    extend type ${prefix}DiscordMessage {
      author: AccountUser
    }
  `;
}

function getConnectionResolvers(prefix, schemas) {
  return {
    [`${prefix}DiscordMessage`]: {
      author: {
        selectionSet: '{ userId }',
        resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.account,
            operation: 'query',
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

export default async function createDiscordPostsSchema(uri) {
  console.log(` * discordPosts(${uri})`);
  const schema = await loadSchema(uri, { loaders: [new UrlLoader()] });
  return {
    schema,
    transforms: [],
    getConnectionTypes,
    getConnectionResolvers,
  };
}
