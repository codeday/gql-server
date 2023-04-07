import { TransformQuery } from '@graphql-tools/wrap';
import { delegateToSchema, SubschemaConfig } from '@graphql-tools/delegate';
import { Kind, OperationTypeNode } from 'graphql';
import { batchDelegateToSchema } from '@graphql-tools/batch-delegate';
import { ShowcasePhoto, Resolvers, ShowcaseProjectResolvers, ShowcaseProject } from '../generated/graphql.js';
import { SubschemaInfo } from '../schema.js';
import { createRemoteSubschema } from '../remoteSubschema.js';
import { addToSelectionSet } from '../utils/selectionsets.js';

const createTypeDefs = (prefix) => `
extend type ${prefix}Member {
  account: AccountUser
}

extend type ${prefix}Project {
  eventGroup: CmsEvent
  program: CmsProgram
  region: CmsRegion
}

extend type ${prefix}Photo {
  eventGroup: CmsEvent
  program: CmsProgram
  region: CmsRegion
}

extend type ${prefix}Award {
  info: CmsAward
}
  `;

function projectPhotoResolvers<T, V extends ShowcaseProject & ShowcasePhoto>(schemas): ShowcaseProjectResolvers<T, V> {
  return {
    program: {
      selectionSet: '{ programId }',
      async resolve(parent, args, context, info) {
        if (!parent.programId) return null;
        return batchDelegateToSchema({
          schema: schemas.cms,
          operation: OperationTypeNode.QUERY,
          fieldName: 'programCollection',
          key: parent.programId,
          argsFromKeys: (programIds) => ({
            where: { OR: [...programIds.map((webname) => ({ webname }))] },
          }),
          context,
          info,
          valuesFromResults: (results, keys) => keys.map((key) => results.find((result) => result.webname === key)),
          transforms: [
            new TransformQuery({
              path: ['programCollection'],
              queryTransformer: (subtree) => ({
                kind: Kind.SELECTION_SET,
                selections: [
                  {
                    kind: Kind.FIELD,
                    name: {
                      kind: Kind.NAME,
                      value: 'items',
                    },
                    selectionSet: addToSelectionSet(subtree, '{ webname }'),
                  },
                ],
              }),
              resultTransformer: (result) => result?.items || [],
            }),
          ],
        });
      },
    },

    eventGroup: {
      selectionSet: '{ eventGroupId }',
      async resolve(parent, args, context, info) {
        if (!parent.eventGroupId) return null;
        return batchDelegateToSchema({
          schema: schemas.cms,
          operation: OperationTypeNode.QUERY,
          fieldName: 'eventCollection',
          key: parent.eventGroupId,
          argsFromKeys: (eventGroupIds) => ({
            where: {
              OR: [
                ...eventGroupIds.map((eventGroupId) => ({
                  id: eventGroupId,
                })),
              ],
            },
          }),
          context,
          info,
          valuesFromResults: (results, keys) => keys.map((key) => results.find((result) => result.id === key)),
          transforms: [
            new TransformQuery({
              path: ['eventCollection'],
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

    region: {
      selectionSet: '{ regionId }',
      async resolve(parent, args, context, info) {
        if (!parent.regionId) return null;
        return batchDelegateToSchema({
          schema: schemas.cms,
          operation: OperationTypeNode.QUERY,
          fieldName: 'regionCollection',
          key: parent.regionId,
          argsFromKeys: (webnames) => ({
            where: { OR: [...webnames.map((webname) => ({ webname }))] },
          }),
          context,
          info,
          valuesFromResults: (results, keys) => keys.map((key) => results.find((result) => result.webname === key)),
          transforms: [
            new TransformQuery({
              path: ['regionCollection'],
              queryTransformer: (subtree) => ({
                kind: Kind.SELECTION_SET,
                selections: [
                  {
                    kind: Kind.FIELD,
                    name: { kind: Kind.NAME, value: 'items' },
                    selectionSet: addToSelectionSet(subtree, '{ webname }'),
                  },
                ],
              }),
              resultTransformer: (result) => result?.items || [],
            }),
          ],
        });
      },
    },
  };
}
function createResolvers(schemas: { [key: string]: SubschemaConfig }): Resolvers {
  return {
    [`ShowcaseMember`]: {
      account: {
        selectionSet: '{ username }',
        resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.account,
            operation: OperationTypeNode.QUERY,
            fieldName: 'getUser',
            args: {
              where: {
                username: parent.username,
              },
              fresh: true,
            },
            context,
            info,
          });
        },
      },
    },
    [`ShowcaseAward`]: {
      info: {
        selectionSet: '{ type }',
        async resolve(parent, args, context, info) {
          return batchDelegateToSchema({
            schema: schemas.cms,
            operation: OperationTypeNode.QUERY,
            fieldName: 'awardCollection',
            key: parent.type,
            argsFromKeys: (types) => ({
              where: { OR: [...types.map((type) => ({ id: type }))] },
            }),
            context,
            info,
            valuesFromResults: (results, keys) => keys.map((key) => results.find((result) => result.id === key)),
            transforms: [
              new TransformQuery({
                path: ['awardCollection'],
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
    [`ShowcaseProject`]: projectPhotoResolvers(schemas),
    [`ShowcasePhoto`]: projectPhotoResolvers(schemas),
  };
}

export async function createShowcaseSubschema(httpEndpoint: string, wsEndpoint: string): Promise<SubschemaInfo> {
  console.log(` * showcase(${httpEndpoint})`);
  return createRemoteSubschema({ httpEndpoint, wsEndpoint }, { createResolvers, createTypeDefs, prefix: 'showcase' });
}
