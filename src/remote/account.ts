import { SubschemaConfig, delegateToSchema } from '@graphql-tools/delegate';
import { RenameObjectFields, TransformQuery } from '@graphql-tools/wrap';
import { batchDelegateToSchema } from '@graphql-tools/batch-delegate';
import { Kind, OperationTypeNode } from 'graphql';
import { Resolvers } from '../generated/graphql.js';
import { SubschemaInfo } from '../schema.js';
import { createRemoteSubschema } from '../remoteSubschema.js';
import { AddFieldToRequestTransform } from '../utils/gql-utils.js';

function createTypeDefs(prefix) {
  return `
    extend type ${prefix}Badge {
      details: CmsBadge
    }

    extend type ${prefix}User {
      sites: [CmsSite]
    }
  `;
}

function createResolvers(prefix: string, schemas: { [key: string]: SubschemaConfig }): Resolvers {
  return {
    [`${prefix}Badge`]: {
      details: {
        selectionSet: '{ id }',
        async resolve(parent, args, context, info) {
          return batchDelegateToSchema({
            schema: schemas.cms,
            operation: OperationTypeNode.QUERY,
            fieldName: 'badgeCollection',
            key: parent.id,
            argsFromKeys: (ids) => ({
              where: { OR: [...ids?.map((id) => ({ id }))] },
            }),
            context,
            info,
            valuesFromResults: (results, keys) => keys?.map((key) => results.find((result) => result?.id === key)),
            transforms: [
              new AddFieldToRequestTransform(schemas.cms, 'Badge', 'id'),
              new TransformQuery({
                path: ['badgeCollection'],
                queryTransformer: (subtree) => ({
                  kind: Kind.SELECTION_SET,
                  selections: [
                    {
                      kind: Kind.FIELD,
                      name: {
                        kind: Kind.NAME,
                        value: 'items',
                      },
                      selectionSet: subtree,
                    },
                  ],
                }),
                resultTransformer: (result) => result?.items || [],
              }),
            ],
          });
        },
      },
    },
    [`${prefix}User`]: {
      sites: {
        selectionSet: '{ roles }',
        async resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.cms,
            operation: OperationTypeNode.QUERY,
            fieldName: 'siteCollection',
            args: {
              where: {
                OR: [
                  ...parent.roles.map((role) => {
                    if (role.name === 'Staff') return { type: 'Volunteer' };
                    return { type: role.name };
                  }),
                  { type: 'Student' },
                ],
              },
            },
            context,
            info,
            transforms: [
              new TransformQuery({
                path: ['siteCollection'],
                queryTransformer: (subtree) => ({
                  kind: Kind.SELECTION_SET,
                  selections: [
                    {
                      kind: Kind.FIELD,
                      name: {
                        kind: Kind.NAME,
                        value: 'items',
                      },
                      selectionSet: subtree,
                    },
                  ],
                }),
                resultTransformer: (r) => r?.items,
              }),
            ],
          });
        },
      },
    },
  };
}

export async function createAccountSubschema(httpEndpoint, wsEndpoint): Promise<SubschemaInfo> {
  console.log(` * account(${httpEndpoint})`);
  return createRemoteSubschema({ httpEndpoint, wsEndpoint }, { createResolvers, createTypeDefs });
}
