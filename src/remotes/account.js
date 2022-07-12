import { wrapSchema, introspectSchema } from "@graphql-tools/wrap";
import makeRemoteTransport from "../remoteTransport";
import { delegateToSchema } from "@graphql-tools/delegate";
import { batchDelegateToSchema } from "@graphql-tools/batch-delegate";
import { TransformQuery } from "@graphql-tools/wrap";
import { Kind } from "graphql";
import { AddFieldToRequestTransform } from "../gql-utils";

function getConnectionTypes(prefix) {
  return `
    extend type ${prefix}Badge {
      details: CmsBadge
    }

    extend type ${prefix}User {
      sites: [CmsSite]
    }
  `;
}

function getConnectionResolvers(prefix, schemas) {
  return {
    [`${prefix}Badge`]: {
      details: {
        selectionSet: "{ id }",
        async resolve(parent, args, context, info) {
          return batchDelegateToSchema({
            schema: schemas.cms,
            operation: "query",
            fieldName: "badgeCollection",
            key: parent.id,
            argsFromKeys: (ids) => ({
              where: { OR: [...ids?.map((id) => ({ id }))] },
            }),
            context,
            info,
            valuesFromResults: (results, keys) =>
              keys?.map((key) => results.find((result) => result?.id === key)),
            transforms: [
              new AddFieldToRequestTransform(schemas.cms, "Badge", "id"),
              new TransformQuery({
                path: ["badgeCollection"],
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
    [`${prefix}User`]: {
      sites: {
        selectionSet: "{ roles }",
        async resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.cms,
            operation: "query",
            fieldName: "siteCollection",
            args: {
              where: {
                OR: [
                  ...parent.roles.map((role) => {
                    if (role.name == "Staff") return { type: "Volunteer" };
                    return { type: role.name };
                  }),
                  { type: "Student" },
                ],
              },
            },
            context,
            info,
            transforms: [
              new TransformQuery({
                path: ["siteCollection"],
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
                resultTransformer: (r) => r?.items,
              }),
            ],
          });
        },
      },
    },
  };
}

export default async function createAccountSchema(uri, wsUri) {
  console.log(` * account(${uri})`);
  const { executor, subscriber } = makeRemoteTransport(uri, wsUri, "");
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
