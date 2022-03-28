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
  `;
}

function getConnectionResolvers(prefix, schemas) {
  return {
    [`${prefix}Post`]: {
      author: {
        selectionSet: '{ wpAuthor { node { slug } } authorOverride { username title } }',
        async resolve(parent, args, context, info) {
          const result = await delegateToSchema({
            schema: schemas.account,
            operation: 'query',
            fieldName: 'getUser',
            args: {
              where: {
                username: parent.authorOverride?.username || parent.wpAuthor.node.slug,
              },
            },
            context,
            info,
          });

          return {
            ...result,
            ...(parent.authorOverride?.title ? { title: parent.authorOverride.title } : {}),
          };
        },
      },
    },
  };
}

export default async function createWordpressSchema(uri) {
  console.log(` * wordpress(${uri})`);
  const schema = await loadSchema(uri, { loaders: [new UrlLoader()] });
  return {
    schema,
    transforms: [
      new FilterRootFields((operation, name) => (name === 'post' || name === 'posts' || name === 'createComment')),
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
