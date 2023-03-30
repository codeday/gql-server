import { wrapSchema, introspectSchema } from "@graphql-tools/wrap";
import makeRemoteTransport from "../remoteTransport"
import { batchDelegateToSchema } from "@graphql-tools/batch-delegate";
import { applySchemaTransforms, delegateToSchema } from '@graphql-tools/delegate';
import { TransformQuery } from "@graphql-tools/wrap";
import { Kind } from "graphql";
import { transformedSchemas } from '../schema';
import { AddFieldToRequestTransform } from "../gql-utils";
import { transformSchema } from 'apollo-server-express';

function getConnectionTypes(prefix) {
  return `
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
}

function getConnectionResolvers(prefix, schemas) {
  return {
    [`${prefix}Event`]: {
      region: {
        selectionSet: "{ contentfulWebname }",
        async resolve(parent, args, context, info) {
          if (!parent.contentfulWebname) return null;
          return delegateToSchema({
            schema: transformedSchemas.cms,
            operation: "query",
            fieldName: "regions",
            context,
            info,
            args: {
              where: {
                webname: parent.contentfulWebname,
              },
              limit: 1,
              ...args
            },
            transforms: [
              new AddFieldToRequestTransform(schemas.cms, "Region", "webname"),
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
                resultTransformer: (result) =>  result?.items[0],
              }),
            ],
          });
        },
      },

      cmsEventRestrictions: {
        selectionSet: '{ contentfulEventRestrictions }',
        async resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: transformedSchemas.cms,
            operation: 'query',
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
            schema: transformedSchemas.cms,
            operation: "query",
            fieldName: 'events',
            context,
            info,
            args: {
              where: {
                id: parent.contentfulId,
              },
              limit: 1,
              ...args
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
