import {
  FilterRootFields,
  FilterInputObjectFields,
  RenameObjectFields,
  RenameInterfaceFields,
} from '@graphql-tools/wrap';
import { delegateToSchema } from '@graphql-tools/delegate';
import { OperationTypeNode } from 'graphql';
import { createRemoteSubschema } from '../remoteSubschema.js';
import type { SubschemaInfo } from '../schema.js';

function createTypeDefs(prefix) {
  return `
    extend type ${prefix}Post {
      author: AccountUser
    }
  `;
}

function createResolvers(schemas) {
  return {
    [`BlogPost`]: {
      author: {
        selectionSet: '{ wpAuthor { node { slug } } authorOverride { username title } }',
        async resolve(parent, args, context, info) {
          const result = await delegateToSchema({
            schema: schemas.account,
            operation: OperationTypeNode.QUERY,
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

export async function createWordpressSubschema(url: string): Promise<SubschemaInfo> {
  console.log(` * showcase(${url})`);

  const transforms = [
    new FilterRootFields((operation, name) => name === 'post' || name === 'posts' || name === 'createComment'),
    new FilterInputObjectFields((_, __, { type }) => type && String(type).indexOf('PostStatusEnum') === -1),
    new RenameInterfaceFields((typeName, fieldName) =>
      typeName === 'NodeWithAuthor' && fieldName === 'author' ? 'wpAuthor' : fieldName,
    ),
    new RenameObjectFields((typeName, fieldName) =>
      ['MediaItem', 'Post', 'Page'].includes(typeName) && fieldName === 'author' ? 'wpAuthor' : fieldName,
    ),
  ];

  return createRemoteSubschema(url, { createResolvers, createTypeDefs, transforms, prefix: 'blog' });
}
