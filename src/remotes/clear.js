import { wrapSchema, introspectSchema } from "@graphql-tools/wrap";
import makeRemoteTransport from "../remoteTransport"
import { batchDelegateToSchema } from "@graphql-tools/batch-delegate";
import { delegateToSchema } from '@graphql-tools/delegate';
import { TransformQuery } from "@graphql-tools/wrap";
import { Kind } from "graphql";
import { AddFieldToRequestTransform } from "../gql-utils";

function getConnectionTypes(prefix) {
  return `
    extend type ${prefix}Event {
      region: CmsRegion
      cmsEventRestrictions: [CmsEventRestriction!]!
    }

    extend type ${prefix}EventGroup {
      cmsEventGroup: CmsEvent
    }

    extend type ${prefix}PublicPerson {
      account: AccountUser
    }
  `;
}

function getConnectionResolvers(prefix, schemas) {
  return {
    [`${prefix}Event`]: {
      region: {
        selectionSet: "{ contentfulWebname }",
        async resolve(parent, args, context, info) {
          if (!parent.contentfulWebname) return null;
          return batchDelegateToSchema({
            schema: schemas.cms,
            operation: "query",
            fieldName: "regionCollection",
            key: parent.contentfulWebname,
            argsFromKeys: (webnames) => ({ where: {OR: [...webnames?.map((webname) => ({webname}))]} }),
            context,
            info,
            valuesFromResults: (results, keys) =>
              keys?.map((key) =>
                results.find((result) => result?.webname === key)
              ) || [],
            transforms: [
              new AddFieldToRequestTransform(schemas.cms, "Region", "webname"),
              new TransformQuery({
                path: ['regionCollection'],
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
                resultTransformer: (result) =>  (result?.items || [])
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
            operation: 'query',
            fieldName: 'eventRestrictionCollection',
            args: {
              where: {
                id_in: parent.contentfulEventRestrictions,
              },
            },
            transforms: [
              new TransformQuery({
                path: ['eventRestrictionCollection'],
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
                resultTransformer: (result) =>  (result?.items || [])
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
        selectionSet: "{ contentfulId }",
        async resolve(parent, args, context, info) {
          if (!parent.contentfulId) return null;
          return delegateToSchema({
            schema: schemas.cms,
            operation: "query",
            fieldName: 'eventCollection',
            context,
            info,
            args: {
              where: {
                id: parent.contentfulId,
              },
            },
            transforms: [
              new TransformQuery({
                path: ['eventCollection'],
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
                resultTransformer: (result) =>  result?.items[0]
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
