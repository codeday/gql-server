import fs from 'fs';
import path from 'path';
import { delegateToSchema } from '@graphql-tools/delegate';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { TransformQuery } from '@graphql-tools/wrap';
import { Kind } from 'graphql';
import { scopes, requireScope } from '../../auth';
import query from './query';
import LruCache from 'lru-cache';
import fetch from "node-fetch";

const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();

function getConnectionTypes(prefix) {
  return `
    extend type ${prefix}UserBadge {
      details: CmsBadge
    }
  `;
}

function getConnectionResolvers(prefix, schemas) {
  return {
    [`${prefix}UserBadge`]: {
      details: {
        selectionSet: '{ id }',
        async resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.cms,
            operation: 'query',
            fieldName: 'badgeCollection',
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
                path: ['badgeCollection'],
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
  };
}

export default function createAuth0Schema(domain, clientId, clientSecret) {
  const {
    findUsers,
    findUsersUncached,
    getRolesForUser,
    findUsersByRole,
    updateUser
  } = query(domain, clientId, clientSecret);

  const resolvers = {};
  resolvers.Query = {
    getUser: async (_, { where, fresh }, ctx) => {
      const fn = fresh ? findUsersUncached : findUsers;
      return (await fn(where, ctx))[0] || null
    },
    searchUsers: async (_, { where }, ctx) => findUsers(where, ctx),
    roleUsers: async (_, { roleId }, ctx) => findUsersByRole(roleId, ctx),
  };
  resolvers.Mutation = {
    updateUser: async (_, { username, updates }, ctx) => {
      await updateUser(username, ctx, (prev) => ({
        ...prev,
        ...updates
      }));
    },
    grantBadge: async (_, { username, badge }, ctx) => {
      await updateUser(username, ctx, (prev) => ({
        ...prev,
        badges: [
          ...(prev.badges || []).filter((b) => b.id !== badge.id),
          badge,
        ]
      }));
    }
  }
  const lru = new LruCache({ maxAge: 1000 * 60 * 5, max: 500 });
  resolvers.User = {
    roles: async ({ id }, _, ctx) => requireScope(ctx, scopes.readUserRoles) && getRolesForUser(id),
    picture: async ({ picture }, { transform }) => {
      if (!transform || Object.keys(transform).length === 0) return picture;

      if (picture.match(/gravatar\.com/)) {
        const maxDimension = Math.max(transform.width || 0, transform.height || 0);
        const sizelessUrl = picture.replace(/s=\d+/, '');
        return `${sizelessUrl}${sizelessUrl.match(/\?/) ? '&' : '?'}s=${maxDimension}`;
      }

      const imgArgs = Object.keys(transform)
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(transform[key]).toLowerCase()}`)
        .join(';');

      return picture
        .replace(/https:\/\/img.codeday.org\/[a-zA-Z0-9]+\//, `https://img.codeday.org/${imgArgs}/`);
    },
    discordInformation: async({ discordId }) => {
      let result = lru.get(discordId);

      if (!result) {
        const response = await fetch("https://discordapp.com/api/users/" + discordId, {
          method: "GET",
          headers: {"Authorization": "Bot " + process.env.DISCORD_BOT_TOKEN}
        })
        const data = await response.json();
        result = {
          username: data.username,
          discriminator: data.discriminator,
          avatar: "https://cdn.discordapp.com/avatars/" + discordId + "/" + data.avatar
        };
        lru.set(discordId, result);
      }

      return result
    }
  };

  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  return {
    schema,
    getConnectionTypes,
    getConnectionResolvers,
  };
}
