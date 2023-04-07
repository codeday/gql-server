import { delegateToSchema } from '@graphql-tools/delegate';
import { TransformQuery } from '@graphql-tools/wrap';
import { batchDelegateToSchema } from '@graphql-tools/batch-delegate';
import { Kind, OperationTypeNode } from 'graphql';
import { SubschemaInfo } from '../schema.js';
import { createRemoteSubschema } from '../remoteSubschema.js';
import { addToSelectionSet } from '../utils/selectionsets.js';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */

type AccountSubschema = SubschemaInfo<'Account'>;

const createTypeDefs: AccountSubschema['createTypeDefs'] = (prefix) => {
  return `
    extend type ${prefix}Badge {
      details: CmsBadge
    }

    extend type ${prefix}User {
      sites: [CmsSite]
    }
  `;
};

const createResolvers: AccountSubschema['createResolvers'] = (schemas) => {
  return {
    AccountBadge: {
      details: {
        selectionSet: '{ id }',
        async resolve(parent, _args, context, info) {
          return batchDelegateToSchema({
            schema: schemas.cms,
            operation: OperationTypeNode.QUERY,
            fieldName: 'badges',
            key: parent.id,
            argsFromKeys: (ids) => ({
              where: { OR: [...(ids || []).map((id) => ({ id }))] },
            }),
            context,
            info,
            valuesFromResults: (results, keys) => keys?.map((key) => results.find((result) => result?.id === key)),
            transforms: [
              new TransformQuery({
                path: ['badges'],
                queryTransformer: (subtree) => ({
                  kind: Kind.SELECTION_SET,
                  selections: [
                    {
                      kind: Kind.FIELD,
                      name: {
                        kind: Kind.NAME,
                        value: 'items',
                      },
                      selectionSet: addToSelectionSet(subtree, '{ id }'),
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
    AccountUser: {
      sites: {
        selectionSet: '{ roles }',
        async resolve(parent, _args, context, info) {
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
};

export async function createAccountSubschema(httpEndpoint, wsEndpoint) {
  console.log(` * account(${httpEndpoint})`);
  return createRemoteSubschema({ httpEndpoint, wsEndpoint }, { createResolvers, createTypeDefs, prefix: 'account' });
}
