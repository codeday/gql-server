import { ManagementClient } from 'auth0';
import LruCache from 'lru-cache';
import {
  objectCamelToSnake, objectSnakeToCamel, filterNullOrUndefinedKeys, filterKeysKeep, filterKeysRemove, chunk,
} from '../../utils';
import { scopes, hasAnyOfScopes, requireAnyOfScopes } from '../../auth';

const userPublicFields = ['user_id', 'username', 'name', 'picture', 'pronoun', 'title', 'bio', 'badges', 'discord_id'];
const userPrivateFields = [
  'email',
  'blocked',
  'given_name',
  'family_name',
  'phone_number',
  'accept_tos',
  'display_name_format',
];
const topLevelFields = ['given_name', 'family_name', 'email', 'blocked', 'username', 'name', 'user_id'];

const cacheOutput = (lru, fn) => (args, context, ...rest) => {
  const varyHeaders = Object.keys(context?.headers || {})
    .filter((h) => h.toLowerCase().indexOf('authorization') >= 0)
    .reduce((accum, k) => ({ ...accum, [k]: context.headers[k] }), {});

  const key = JSON.stringify([args, varyHeaders]);
  if (!lru.has(key)) {
    lru.set(key, fn(args, context, ...rest));
  }
  return lru.get(key);
};

const findUsersFactory = (auth0) => async (query, ctx, perPage = 10, page = 0, escape = true) => {
  if (ctx.user) {
    query = { id: ctx.user }
  }
  // Convert query to Auth0 field names
  const snakeQuery = objectCamelToSnake(filterNullOrUndefinedKeys(query));
  if ('id' in snakeQuery) {
    snakeQuery.user_id = snakeQuery.id;
    delete snakeQuery.id;
  }

  // Remove any query fields that aren't allowed (in theory GQL should do this for us anyway)
  const filteredQuery = filterKeysKeep(snakeQuery, [...userPublicFields, ...userPrivateFields]);

  if (query.discordId) {
    filteredQuery['user_metadata.discord_id'] = query.discordId;
    delete filteredQuery.discord_id;
  }

  // Make sure the user has the proper scope to search by the specified fields
  if (Object.keys(filteredQuery).filter((k) => userPrivateFields.includes(k)).length > 0) {
    requireAnyOfScopes(ctx, [scopes.readUsers, ctx.user ? `read:user:${ctx.user}` : null])
  }

  // Make sure the user is searching for _something_
  if (Object.keys(filteredQuery).length === 0) {
    throw new Error('Cannot search users with 0 parameters.');
  }
  const renderedSearchTerms = escape
    ? Object.keys(filteredQuery).map((k) => `${k}:"${filteredQuery[k].replace(/"/g, '\\"')}"`)
    : Object.keys(filteredQuery).map((k) => `${k}:${filteredQuery[k]}`);

  const users = await auth0.getUsers({
    search_engine: 'v3',
    q: renderedSearchTerms.join(' AND '),
    per_page: perPage,
    page,
    fields: [
      ...userPublicFields,
      ...(hasAnyOfScopes(ctx, [scopes.readUsers, ctx.user ? `read:user:${ctx.user}` : null]) ? userPrivateFields : []),
      'user_metadata',
    ],
  });
  const newUsers = users
    .map((user) => ({ ...filterKeysRemove(user, ['user_metadata']), ...user.user_metadata }))
    .map((user) => filterKeysKeep(user, [
      ...userPublicFields,
      ...(hasAnyOfScopes(ctx, [scopes.readUsers, scopes.writeUsers, ctx.user ? `read:user:${ctx.user}` : null, ctx.user ? `write:user:${ctx.user}` : null]) ? userPrivateFields : []),
    ]))
    .map((user) => ({ ...objectSnakeToCamel(filterKeysRemove(user, ['user_id'])), id: user.user_id }));
  if (newUsers.length < 1) {
    throw new Error("No user(s) were found with that query.")
  }
  return newUsers
};

const getRolesForUserFactory = (auth0) => async (id) => auth0.getUserRoles({ id });

const findUsersByRoleFactory = (auth0) => async (roleId, ctx, perPage = 100, page = 0) => {
  const users = await auth0.getUsersInRole({ id: roleId, per_page: perPage, page });

  const searchStrings = chunk(users.map((u) => u.user_id), 25)
    .map((ids) => `(${ids.map((id) => `"${id}"`).join(' ')})`);

  const userChunks = await Promise.all(searchStrings.map(async (str) => (
    findUsersFactory(auth0)({ id: str }, ctx, 25, 0, false))));

  return userChunks.reduce((accum, c) => [...accum, ...c], []);
};

const updateUserFactory = (auth0) => async (where, ctx, updateFn) => {
  requireAnyOfScopes(ctx, [scopes.writeUsers, ctx.user ? `write:user:${ctx.user}` : null])
  let user = {}
  if (ctx.user) {
    user = (await findUsersFactory(auth0)({ id: ctx.user }, ctx, 1))[0]
  } else {
    user = (await findUsersFactory(auth0)(where, ctx, 1))[0];
  }
  const newUser = updateFn(user);

  // Find the changes and turn it into a mostly-final array
  const changedProps = objectCamelToSnake(Object.keys(newUser)
    .filter((k) => user[k] !== newUser[k])
    .reduce((accum, k) => ({ ...accum, [k]: newUser[k] }), {}));

  // Break into main user updates and user_metadata updates
  const toplevel = Object.keys(changedProps)
    .filter((k) => topLevelFields.includes(k))
    .reduce((accum, k) => ({ ...accum, [k]: changedProps[k] }), {});

  const metadata = Object.keys(changedProps)
    .filter((k) => !topLevelFields.includes(k))
    .reduce((accum, k) => ({ ...accum, [k]: changedProps[k] }), {});

  // Perform updates
  if (Object.keys(toplevel).length > 0) {
    await auth0.updateUser({ id: user.id }, {
      name: user.name,
      given_name: user.givenName,
      family_name: user.familyName,
      username: user.username,
      nickname: user.username,
      blocked: user.blocked,
      ...toplevel,
    });
  }
  if (Object.keys(metadata).length > 0) {
    const auth0Data = (await auth0.getUser({ id: user.id, fields: ['user_metadata'] })).user_metadata;
    await auth0.updateUserMetadata({ id: user.id }, {
      ...auth0Data,
      ...metadata,
    });
  }
};
const addRoleToUserFactory = (auth0) => async (id, roleId, ctx) => {
  requireAnyOfScopes(ctx, [scopes.writeUsers, ctx.user ? `write:user:${ctx.user}` : null])
  if (ctx.user) {
    id = ctx.user
  }
  return new Promise(function (resolve, reject) {
    auth0.assignRolestoUser({ id }, { roles: [roleId] }, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(true);
      }
    });
  });
}


export default function getResolvers(domain, clientId, clientSecret) {
  const auth0 = new ManagementClient({
    domain,
    clientId,
    clientSecret,
    scope: 'read:users read:roles',
  });

  const lru = new LruCache({ maxAge: 1000 * 60 * 5, max: 500 });

  return {
    findUsers: cacheOutput(lru, findUsersFactory(auth0)),
    findUsersUncached: findUsersFactory(auth0),
    findUsersByRole: cacheOutput(lru, findUsersByRoleFactory(auth0)),
    getRolesForUser: getRolesForUserFactory(auth0),
    updateUser: updateUserFactory(auth0),
    addRole: addRoleToUserFactory(auth0),
  };
}
