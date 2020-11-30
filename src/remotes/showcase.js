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
            },
            context,
            info,
          });
        },
      },
    },
    [`${prefix}Project`]: {
      eventGroup: {
        selectionSet: '{ eventGroupId }',
        async resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.cms,
            operation: 'query',
            fieldName: 'eventCollection',
            args: {
              where: {
                id: parent.id,
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
    }
  };
}


export default async function createShowcaseSchema(uri, wsUri) {
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
