import {
  FilterRootFields, FilterInputObjectFields, RenameObjectFields, RenameInterfaceFields,
} from '@graphql-tools/wrap';
import { loadSchema } from '@graphql-tools/load';
import { UrlLoader } from '@graphql-tools/url-loader';
import { delegateToSchema } from '@graphql-tools/delegate';

function getConnectionTypes(prefix) {
  return `
    extend type ${prefix}Post {
      author: AccountUser
    }

    extend type ${prefix}Post_Authoroverride {
      author: AccountUser
    }
  `;
}

function getConnectionResolvers(prefix, schemas) {
  return {
    [`${prefix}Post`]: {
      author: {
        selectionSet: '{ wpAuthor { slug } }',
        resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.account,
            operation: 'query',
            fieldName: 'getUser',
            args: {
              where: {
                username: parent.wpAuthor.slug,
              },
            },
            context,
            info,
          });
        },
      },
    },
    [`${prefix}Post_Authoroverride`]: {
      author: {
        selectionSet: '{ username }',
        resolve(parent, args, context, info) {
          if (!parent.username) return null;
          return delegateToSchema({
            schema: schemas.account,
            operation: 'query',
            fieldName: 'getUser',
            args: {
              where: {
                username: parent.username,
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

export default async function createWordpressSchema(uri) {
  const schema = await loadSchema(uri, { loaders: [new UrlLoader()] });
  return {
    schema,
    transforms: [
      new FilterRootFields((operation, name) => (name === 'post' || name === 'posts')),
      new FilterInputObjectFields((_, __, { type }) => type && String(type).indexOf('PostStatusEnum') === -1),
      new RenameInterfaceFields((typeName, fieldName) => (
        typeName === 'NodeWithAuthor' && fieldName === 'author' ? 'wpAuthor' : fieldName
      )),
      new RenameObjectFields((typeName, fieldName) => (
        ['MediaItem', 'Post', 'Page'].includes(typeName) && fieldName === 'author' ? 'wpAuthor' : fieldName
      )),
    ],
    getConnectionTypes,
    getConnectionResolvers,
  };
}
