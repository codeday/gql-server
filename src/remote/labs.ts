import { delegateToSchema } from '@graphql-tools/delegate';
import { OperationTypeNode } from 'graphql';
import { SubschemaInfo } from '../schema.js';
import { createRemoteSubschema } from '../remoteSubschema.js';

function createTypeDefs(prefix) {
  return `
    extend type ${prefix}Student {
      account: AccountUser
    }

    extend type ${prefix}Mentor {
      account: AccountUser
      manager: AccountUser
    }
  `;
}

function createResolvers(prefix, schemas) {
  const resolve = (k) => (parent, args, context, info) =>
    parent[k]
      ? delegateToSchema({
          schema: schemas.account,
          operation: OperationTypeNode.QUERY,
          fieldName: 'getUser',
          args: {
            where: {
              username: parent[k],
            },
          },
          context,
          info,
        })
      : null;
  return {
    [`${prefix}Student`]: {
      account: {
        selectionSet: '{ username }',
        resolve: resolve('username'),
      },
    },
    [`${prefix}Mentor`]: {
      account: {
        selectionSet: '{ username }',
        resolve: resolve('username'),
      },
      manager: {
        selectionSet: '{ managerUsername }',
        resolve: resolve('managerUsername'),
      },
    },
  };
}

export async function createLabsSubschema(url): Promise<SubschemaInfo> {
  console.log(` * labs(${url})`);
  return createRemoteSubschema(url, { createResolvers, createTypeDefs });
}

// export default async function createLabsSchema(uri) {
//   console.log(` * labs(${uri})`);
//   const { executor, subscriber } = makeRemoteTransport(uri);
//   const schema = wrapSchema({
//     schema: await introspectSchema(executor),
//     executor,
//     subscriber,
//   });
//   return {
//     schema,
//     transforms: [],
//     getConnectionTypes,
//     getConnectionResolvers,
//   };
// }
