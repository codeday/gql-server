import fs from 'fs';
import path from 'path';
import { delegateToSchema } from '@graphql-tools/delegate';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { TransformQuery } from '@graphql-tools/wrap';
import { Kind } from 'graphql';
import { scopes, requireAnyOfScopes } from '../../auth';
import query from './query';
import LruCache from 'lru-cache';
import fetch from "node-fetch";
import { formatName } from './utils';
import { GraphQLUpload } from 'apollo-server';
import Uploader from '@codeday/uploader-node';
import phone from 'phone';

const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();
const MAX_DISPLAYED_BADGES = 3;

function getConnectionTypes(prefix) {
  return `
    extend type ${prefix}UserBadge {
      details: CmsBadge
    }
    
    extend type ${prefix}User {
      sites: [CmsSite]
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
    [`${prefix}User`]: {
      sites: {
        selectionSet: '{ roles }',
        async resolve(parent, args, context, info) {
          requireAnyOfScopes(context, [scopes.readUsers, context.user ? `read:user:${context.user}` : null])
          return delegateToSchema({
            schema: schemas.cms,
            operation: 'query',
            fieldName: 'siteCollection',
            args: {
              where: {
                OR: [...parent.roles.map((role) => {
                  if (role.name == "Staff") return { type: "Volunteer" };
                  return { type: role.name };
                }), { type: "Student" }]
              }
            },
            context,
            info,
            transforms: [
              new TransformQuery({
                path: ['siteCollection'],
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
                resultTransformer: (r) => r?.items,
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
      const fn = fresh ? findUsersUncached : findUsers;
      const user = (await fn(where, ctx))[0]
      if (!user) {
        throw new Error("Couldn't find any users with those paramaters.")
      }
      if (!user.badges) return []

      let displayedBadges = user.badges.filter((b) => b.displayed === true).slice(0, MAX_DISPLAYED_BADGES)
      if (displayedBadges.length < 1) {
        displayedBadges = user.badges.slice(0, MAX_DISPLAYED_BADGES)
        displayedBadges.map((badge, index) => { badge.displayed = true; badge.order = index })
      }
      return displayedBadges
    },
    searchUsers: async (_, { where }, ctx) => findUsers(where, ctx),
    roleUsers: async (_, { roleId }, ctx) => findUsersByRole(roleId, ctx),
  };
  resolvers.Mutation = {
    updateUser: async (_, { username, updates }, ctx) => {
      if (!ctx.user && !username) {
        throw new Error("Please specify a user to update.")
      } else if (updates.username && updates.username !== updates.username.replace(/[^a-zA-Z0-9\-_]/g, '')) {
        throw new Error('Username can only consist of letters, numbers, and _ or -.');
      } else if (!updates.familyName && typeof updates.familyName !== 'undefined') {
        throw new Error('Name is required.');
      } else if (!updates.givenName && typeof updates.givenName !== 'undefined') {
        throw new Error('Name is required.');
      }
      if (updates.phoneNumber) {
        updates.phoneNumber = phone(updates.phoneNumber)[0]
      }
      await updateUser({ username }, ctx, (prev) => {
        if (prev.username && updates.username) throw new Error("You cannot change your username!")
        const newUser = {
          ...prev,
          ...updates
        }
        newUser.name = (updates.displayNameFormat ? formatName(newUser.displayNameFormat, newUser.givenName, newUser.familyName) : newUser.name)
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
    setDisplayedBadges: async (_, { where, badges }, ctx) => {
      if (!ctx.user && !where) {
        throw new Error("Please specify a user to update.")
      } else if (badges.length > MAX_DISPLAYED_BADGES) {
        throw new Error("Displayed badges cannot be more than 3.")
      }
      where = ctx.user ? { id: ctx.user } : where

      await updateUser(where, ctx, (prev) => {
        const displayedBadges = prev.badges.filter((badge) => badges.some((e) => e.id === badge.id));
        displayedBadges.map((badge, index) => { badge.order = badges.find(x => x.id === badge.id).order; })
        displayedBadges.sort((a, b) => a.order - b.order)
        displayedBadges.map((badge, index) => { badge.displayed = true; badge.order = index; })

        const notDisplayedBadges = prev.badges.filter((badge) => !badges.some(e => e.id === badge.id))
        notDisplayedBadges.map((badge) => { badge.displayed = false; badge.order = null; })

        return { ...prev, badges: [...displayedBadges, ...notDisplayedBadges] }
      });
    },
    uploadProfilePicture: async (_, { where, upload }, ctx) => {
      requireAnyOfScopes(ctx, [scopes.writeUsers, ctx.user ? `write:user:${ctx.user}` : null])
      where = ctx.user ? { id: ctx.user } : where
      const { createReadStream, filename } = await upload;
      const chunks = [];
      // eslint-disable-next-line no-restricted-syntax
      for await (const chunk of createReadStream()) {
        chunks.push(chunk);
      }
      const uploadBuffer = Buffer.concat(chunks);

      const result = await uploader.image(uploadBuffer, filename || '_.jpg');
      if (!result.url) {
        throw new Error("An error occured while uploading your picture. Please refresh the page and try again.")
      }
      await updateUser(where, ctx, (prev) => ({ ...prev, picture: result.urlResize.replace(/{(width|height)}/g, 256) }))

      return result.urlResize.replace(/{(width|height)}/g, 256)
    },
    addRole: async (_, { id, roleId }, ctx) => {
      addRole(id, roleId, ctx)
    }
  }
  const lru = new LruCache({ maxAge: 1000 * 60 * 5, max: 500 });
  resolvers.User = {
    roles: async ({ id }, _, ctx) => {
      requireAnyOfScopes(ctx, [scopes.readUserRoles, ctx.user ? `read:user:${ctx.user}` : null])
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
    },
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
