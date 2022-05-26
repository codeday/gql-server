import makeRemoteTransport from "../remoteTransport";
import { wrapSchema, introspectSchema } from "@graphql-tools/wrap";
import { AddSelectionSets, delegateToSchema } from "@graphql-tools/delegate";
import { TransformQuery } from "@graphql-tools/wrap";
import { Kind } from "graphql";
import { batchDelegateToSchema } from "@graphql-tools/batch-delegate";
import {
  AddFieldToDelegatedRequest,
  AddFieldToRequestTransform,
} from "../gql-utils";

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
        selectionSet: "{ username }",
        resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.account,
            operation: "query",
            fieldName: "getUser",
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
        selectionSet: "{ type }",
        async resolve(parent, args, context, info) {
          return batchDelegateToSchema({
            schema: schemas.cms,
            operation: "query",
            fieldName: "awardCollection",
            key: parent.type,
            argsFromKeys: (types) => ({
              where: { OR: [...types.map((type) => ({ id: type }))] },
            }),
            context,
            info,
            valuesFromResults: (results, keys) =>
              keys.map((key) => results.find((result) => result.id === key)),
            transforms: [
              new AddFieldToRequestTransform(schemas.cms, "Award", "id"),
              new TransformQuery({
                path: ["awardCollection"],
                queryTransformer: (subtree) => ({
                  kind: Kind.SELECTION_SET,
                  selections: [
                    {
                      kind: Kind.FIELD,
                      name: {
                        kind: Kind.NAME,
                        value: "items",
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
    [`${prefix}Project`]: {
      program: {
        selectionSet: "{ programId }",
        async resolve(parent, args, context, info) {
          if (!parent.programId) return null;
          return batchDelegateToSchema({
            schema: schemas.cms,
            operation: "query",
            fieldName: "programCollection",
            key: parent.programId,
            argsFromKeys: (programIds) => ({
              where: { OR: [...programIds.map((webname) => ({ webname }))] },
            }),
            context,
            info,
            valuesFromResults: (results, keys) =>
              keys.map((key) =>
                results.find((result) => result.webname === key)
              ),
            transforms: [
              new AddFieldToRequestTransform(schemas.cms, "Program", "webname"),
              new TransformQuery({
                path: ["programCollection"],
                queryTransformer: (subtree) => ({
                  kind: Kind.SELECTION_SET,
                  selections: [
                    {
                      kind: Kind.FIELD,
                      name: {
                        kind: Kind.NAME,
                        value: "items",
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

      eventGroup: {
        selectionSet: "{ eventGroupId }",
        async resolve(parent, args, context, info) {
          if (!parent.eventGroupId) return null;
          return batchDelegateToSchema({
            schema: schemas.cms,
            operation: "query",
            fieldName: "eventCollection",
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
            valuesFromResults: (results, keys) =>
              keys.map((key) => results.find((result) => result.id === key)),
            transforms: [
              new AddFieldToRequestTransform(schemas.cms, "Event", "id"),
              new TransformQuery({
                path: ["eventCollection"],
                queryTransformer: (subtree) => ({
                  kind: Kind.SELECTION_SET,
                  selections: [
                    {
                      kind: Kind.FIELD,
                      name: {
                        kind: Kind.NAME,
                        value: "items",
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

      region: {
        selectionSet: "{ regionId }",
        async resolve(parent, args, context, info) {
          if (!parent.regionId) return null;
          return batchDelegateToSchema({
            schema: schemas.cms,
            operation: "query",
            fieldName: "regionCollection",
            key: parent.regionId,
            argsFromKeys: (webnames) => ({
              where: { OR: [...webnames.map((webname) => ({ webname }))] },
            }),
            context,
            info,
            valuesFromResults: (results, keys) =>
              keys.map((key) =>
                results.find((result) => result.webname === key)
              ),
            transforms: [
              new AddFieldToRequestTransform(schemas.cms, "Region", "webname"),
              new TransformQuery({
                path: ["regionCollection"],
                queryTransformer: (subtree) => ({
                  kind: Kind.SELECTION_SET,
                  selections: [
                    {
                      kind: Kind.FIELD,
                      name: { kind: Kind.NAME, value: "items" },
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
