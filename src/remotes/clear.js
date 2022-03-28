import { wrapSchema, introspectSchema } from '@graphql-tools/wrap';
import makeRemoteTransport from '../remoteTransport';
import { delegateToSchema } from '@graphql-tools/delegate';
import { TransformQuery } from '@graphql-tools/wrap';
import { Kind } from 'graphql';


function getConnectionTypes(prefix) {
  return `
    extend type ${prefix}Event {
      region: CmsRegion
    }
  `;
}

function getConnectionResolvers(prefix, schemas) {
  return {
    [`${prefix}Event`]: {
      region: {
        selectionSet: '{ contentfulWebname }',
        async resolve(parent, args, context, info) {
          if (!parent.contentfulWebname) return null;
          return delegateToSchema({
            schema: schemas.cms,
            operation: 'query',
            fieldName: 'regionCollection',
            args: {
              where: {
                webname: parent.contentfulWebname,
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



export default async function createClearSchema(uri) {
  console.log(` * clear(${uri})`);
  const { executor, subscriber } = makeRemoteTransport(uri);
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
