import fs from 'fs';
import path from 'path';
import { delegateToSchema } from '@graphql-tools/delegate';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { TransformQuery } from '@graphql-tools/wrap';
import { Kind } from 'graphql';
import { scopes, requireScope, hasScope } from '../../auth';
import query from './query';
import LruCache from 'lru-cache';
import fetch from "node-fetch";
import { formatName } from './utils';
import { GraphQLUpload } from 'apollo-server';
import Uploader from '@codeday/uploader-node';

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
const uploader = new Uploader(process.env.UPLOADER_URL, process.env.UPLOADER_SECRET);
export default function createAuth0Schema(domain, clientId, clientSecret) {
  const {
    findUsers,
    findUsersUncached,
    getRolesForUser,
    findUsersByRole,
    updateUser,
    addRole
  } = query(domain, clientId, clientSecret);

  const resolvers = {};
  resolvers.FileUpload = GraphQLUpload
  resolvers.Query = {
    getUser: async (_, { where, fresh }, ctx) => {
      const fn = fresh ? findUsersUncached : findUsers;
      return (await fn(where, ctx))[0] || null
    },
    getDisplayedBadges: async (_, { where, fresh }, ctx) => {
      const fn = findUsersUncached;
      const user = (await fn(where, ctx))[0] || null
      if (user.badges) {
        const displayedBadges = user.badges.filter((b) => b.displayed === true).slice(0, 3)
        return (displayedBadges.length > 0 ? displayedBadges : user.badges.slice(0, 3))
      }
      return null
    },
    searchUsers: async (_, { where }, ctx) => findUsers(where, ctx),
    roleUsers: async (_, { roleId }, ctx) => findUsersByRole(roleId, ctx),
  };
  resolvers.Mutation = {
    updateUser: async (_, { username, updates }, ctx) => {
      await updateUser(username, ctx, (prev) => {
        const newUser = {
          ...prev,
          ...updates
        }
        newUser.name = (updates.displayNameFormat ? formatName(newUser.displayNameFormat, newUser.givenName, newUser.familyName) : newUser.name)
        return newUser;
      });
    },
    updateAuthUser: async (_, { updates }, ctx) => {
      if (!ctx.user) {
        throw Error("Sorry! You don't have permission to do this. Please refresh the page and try again.")
      } else if (updates.username && updates.username !== updates.username.replace(/[^a-zA-Z0-9\-_]/g, '')) {
        throw new Error('Username can only consist of letters, numbers, and _ or -.');
      } else if (!updates.familyName && typeof updates.familyName !== 'undefined') {
        throw new Error('Name is required.');
      } else if (!updates.givenName && typeof updates.givenName !== 'undefined') {
        throw new Error('Name is required.');
      }
      await updateUser(null, ctx, (prev) => {
        const newUser = {
          ...prev,
          ...updates
        }
        newUser.name = formatName(newUser.displayNameFormat, newUser.givenName, newUser.familyName)
        return newUser;
      });
    },
    grantBadge: async (_, { where, badge }, ctx) => {
      await updateUser(where, ctx, (prev) => ({
        ...prev,
        badges: [
          ...(prev.badges || []).filter((b) => b.id !== badge.id),
          badge,
        ]
      }));
    },
    revokeBadge: async (_, { where, badge }, ctx) => {
      await updateUser(where, ctx, (prev) => ({
        ...prev,
        badges: [
          ...(prev.badges || []).filter((b) => b.id !== badge.id)
        ]
      }));
    },
    uploadPicture: async (_, { upload }, ctx) => {
      const { createReadStream, filename } = await upload;
      console.log(filename)
      const chunks = [];
      // eslint-disable-next-line no-restricted-syntax
      for await (const chunk of createReadStream()) {
        chunks.push(chunk);
      }
      const uploadBuffer = Buffer.concat(chunks);

      const result = await uploader.image(uploadBuffer, filename || '_.jpg');

      return result.url
    },
    addRole: async (_, {id, roleId}, ctx) => {
      addRole(id, roleId, ctx)
    }
  }
  const lru = new LruCache({ maxAge: 1000 * 60 * 5, max: 500 });
  resolvers.User = {
    roles: async ({ id }, _, ctx) => {
      if (!hasScope(ctx, scopes.readUserRoles) && !hasScope(ctx, `read:${ctx.user}`)) {
        throw new Error(`Your request requires the scope ${scopes.readUserRoles}.`);
      }
      return getRolesForUser(id)
    },
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
    discordInformation: async ({ discordId }) => {
      if (!discordId) return null;
      let result = lru.get(discordId);

      if (!result) {
        const response = await fetch("https://discordapp.com/api/users/" + discordId, {
          method: "GET",
          headers: { "Authorization": "Bot " + process.env.DISCORD_BOT_TOKEN }
        })
        const data = await response.json();
        result = data ? {
          username: data.username,
          discriminator: data.discriminator,
          handle: `@${data.username}#${data.discriminator}`,
          tag: `<@${discordId}>`,
          avatar: "https://cdn.discordapp.com/avatars/" + discordId + "/" + data.avatar
        } : null;
        lru.set(discordId, result);
      }

      return result;
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
