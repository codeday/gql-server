import { IResolvers } from '@graphql-tools/utils';
import { TransformQuery } from '@graphql-tools/wrap';
import { delegateToSchema, SubschemaConfig } from '@graphql-tools/delegate';
import { Kind } from 'graphql';
import { Resolvers, ResolversTypes } from '../generated/graphql.js';
import { SubschemaInfo } from '../schema.js';
import { createRemoteSubschema } from '../remoteSubschema.js';
import { AddFieldToRequestTransform } from '../utils/gql-utils.js';

const createTypeDefs = (prefix) => `
extend type ${prefix}Event {
  region(locale: String): CmsRegion
  cmsEventRestrictions(locale: String): [CmsEventRestriction!]!
}

extend type ${prefix}EventGroup {
  cmsEventGroup(locale: String): CmsEvent
}

extend type ${prefix}PublicPerson {
  account: AccountUser
}
  `;

function createResolvers(prefix: string, schemas: { [key: string]: SubschemaConfig }): Resolvers {
  return {
    [`${prefix}Event`]: {
      region: {
        selectionSet: '{ contentfulWebname }',
        async resolve(parent, args, context, info) {
          if (!parent.contentfulWebname) return null;
          return delegateToSchema({
            schema: schemas.cms,
            // operation: OperationTypeNode.QUERY,
            fieldName: 'regions',
            context,
            info,
            args: {
              where: {
                webname: parent.contentfulWebname,
              },
              limit: 1,
              ...args,
            },
            transforms: [
              new AddFieldToRequestTransform(schemas.cms, 'Region', 'webname'),
              new TransformQuery({
                path: ['regions'],
                queryTransformer: (subtree) => ({
                  kind: Kind.SELECTION_SET,
                  selections: [
                    {
                      kind: Kind.FIELD,
                      name: { kind: Kind.NAME, value: 'items' },
                      selectionSet: subtree,
                    },
                  ],
                }),
                resultTransformer: (result) => result?.items[0],
              }),
            ],
          });
        },
      },

      cmsEventRestrictions: {
        selectionSet: '{ contentfulEventRestrictions }',
        async resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.cms,
            // operation: OperationTypeNode.QUERY,
            fieldName: 'eventRestrictions',
            args: {
              where: {
                id_in: parent.contentfulEventRestrictions,
              },
              limit: 1,
              ...args,
            },
            transforms: [
              new TransformQuery({
                path: ['eventRestrictions'],
                queryTransformer: (subtree) => ({
                  kind: Kind.SELECTION_SET,
                  selections: [
                    {
                      kind: Kind.FIELD,
                      name: { kind: Kind.NAME, value: 'items' },
                      selectionSet: subtree,
                    },
                  ],
                }),
                resultTransformer: (result) => result?.items || [],
              }),
            ],
            context,
            info,
          });
        },
      },
    },

    [`${prefix}EventGroup`]: {
      cmsEventGroup: {
        selectionSet: '{ contentfulId }',
        async resolve(parent, args, context, info) {
          if (!parent.contentfulId) return null;
          return delegateToSchema({
            schema: schemas.cms,
            // operation: OperationTypeNode.QUERY,
            fieldName: 'events',
            context,
            info,
            args: {
              where: {
                id: parent.contentfulId,
              },
              limit: 1,
              ...args,
            },
            transforms: [
              new TransformQuery({
                path: ['events'],
                queryTransformer: (subtree) => ({
                  kind: Kind.SELECTION_SET,
                  selections: [
                    {
                      kind: Kind.FIELD,
                      name: { kind: Kind.NAME, value: 'items' },
                      selectionSet: subtree,
                    },
                  ],
                }),
                resultTransformer: (result) => result?.items[0],
              }),
            ],
          });
        },
      },
    },

    [`${prefix}PublicPerson`]: {
      account: {
        selectionSet: '{ username }',
        resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.account,
            // operation: OperationTypeNode.QUERY,
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
export async function createClearSubschema(url: string): Promise<SubschemaInfo> {
  console.log(` * clear(${url})`);
  return createRemoteSubschema(url, { createResolvers, createTypeDefs });
}