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

function createResolvers(schemas) {
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
    [`LabsStudent`]: {
      account: {
        selectionSet: '{ username }',
        resolve: resolve('username'),
      },
    },
    [`LabsMentor`]: {
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
  return createRemoteSubschema(url, { createResolvers, createTypeDefs, prefix: 'labs' });
}
