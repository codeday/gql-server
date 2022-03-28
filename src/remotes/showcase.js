import makeRemoteTransport from '../remoteTransport';
import { wrapSchema, introspectSchema } from '@graphql-tools/wrap';
import { delegateToSchema } from '@graphql-tools/delegate';
import { TransformQuery } from '@graphql-tools/wrap';
import { Kind } from 'graphql';

function getConnectionTypes(prefix) {
  return `
    extend type ${prefix}Member {
      account: AccountUser
    }

    extend type ${prefix}Project {
      eventGroup: CmsEvent
      program: CmsProgram
      region: CmsRegion
    }

    extend type ${prefix}Award {
      info: CmsAward
    }
  `;
}

function getConnectionResolvers(prefix, schemas) {
  return {
    [`${prefix}Member`]: {
      account: {
        selectionSet: '{ username }',
        resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.account,
            operation: 'query',
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
    [`${prefix}Award`]: {
      info: {
        selectionSet: '{ type }',
        async resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.cms,
            operation: 'query',
            fieldName: 'awardCollection',
            args: {
              where: {
                id: parent.type,
              },
              limit: 1,
            },
            context,
            info,
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
                      selectionSet: subtree,
                    },
                  ],
                }),
                resultTransformer: (r) => r?.items[0],
              }),
            ],
          });
        },
      },
    },
    [`${prefix}Project`]: {
      program: {
        selectionSet: '{ programId }',
        async resolve(parent, args, context, info) {
          if (!parent.programId) return null;
          return delegateToSchema({
            schema: schemas.cms,
            operation: 'query',
            fieldName: 'programCollection',
            args: {
              where: {
                webname: parent.programId,
              },
              limit: 1,
            },
            context,
            info,
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
                      selectionSet: subtree,
                    },
                  ],
                }),
                resultTransformer: (r) => r?.items[0],
              }),
            ],
          });
        },
      },

      eventGroup: {
        selectionSet: '{ eventGroupId }',
        async resolve(parent, args, context, info) {
          if (!parent.eventGroupId) return null;
          return delegateToSchema({
            schema: schemas.cms,
            operation: 'query',
            fieldName: 'eventCollection',
            args: {
              where: {
                id: parent.eventGroupId,
              },
              limit: 1,
            },
            context,
            info,
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
                      selectionSet: subtree,
                    },
                  ],
                }),
                resultTransformer: (r) => r?.items[0],
              }),
            ],
          });
        },
      },

      region: {
        selectionSet: '{ regionId }',
        async resolve(parent, args, context, info) {
          if (!parent.regionId) return null;
          return delegateToSchema({
            schema: schemas.cms,
            operation: 'query',
            fieldName: 'regionCollection',
            args: {
              where: {
                webname: parent.regionId,
              },
              limit: 1,
            },
            context,
            info,
            transforms: [
              new TransformQuery({
                path: ['regionCollection'],
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
                resultTransformer: (r) => r?.items[0],
              }),
            ],
          });
        },
      },
    }
  };
}


export default async function createShowcaseSchema(uri, wsUri) {
  console.log(` * showcase(${uri})`);
  const { executor, subscriber } = makeRemoteTransport(uri, wsUri);
  const schema = wrapSchema({
    schema: await introspectSchema(executor),
    executor,
    subscriber,
  });

  return {
    schema,
    transforms: [],
    getConnectionTypes,
    getConnectionResolvers,
  };
}
