import { ManagementClient } from 'auth0';
import LruCache from 'lru-cache';
import {
  objectCamelToSnake, objectSnakeToCamel, filterNullOrUndefinedKeys, filterKeysKeep, filterKeysRemove, chunk,
} from '../../utils';
import { scopes, requireScope, hasScope } from '../../auth';

const userPublicFields = ['user_id', 'username', 'name', 'picture', 'pronoun', 'title'];
const userPrivateFields = ['email', 'blocked', 'given_name', 'family_name', 'phone_number'];

const cacheOutput = (lru, fn) => (...args) => {
  const key = JSON.stringify(args);
  if (!lru.has(key)) {
    lru.set(key, fn(...args));
  }
  return lru.get(key);
};

const findUsersFactory = (auth0) => async (query, ctx, perPage = 10, page = 0, escape = true) => {
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
  }

  // Make sure the user has the proper scope to search by the specified fields
  if (Object.keys(filteredQuery).filter((k) => userPrivateFields.includes(k)).length > 0) {
    requireScope(ctx, scopes.readUsers);
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
      ...(hasScope(ctx, scopes.readUsers) ? userPrivateFields : []),
      'user_metadata',
    ],
  });

  return users
    .map((user) => ({ ...filterKeysRemove(user, ['user_metadata']), ...user.user_metadata }))
    .map((user) => filterKeysKeep(user, [
      ...userPublicFields,
      ...(hasScope(ctx, scopes.readUsers) ? user.userPrivateFields : []),
    ]))
    .map((user) => ({ ...objectSnakeToCamel(filterKeysRemove(user, ['user_id'])), id: user.user_id }));
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

export default function getResolvers(domain, clientId, clientSecret) {
  const auth0 = new ManagementClient({
    domain,
    clientId,
    clientSecret,
    scope: 'read:users read:roles',
  });

  const lru = new LruCache({ maxAge: 60 * 60 * 1000, max: 500 });

  return {
    findUsers: cacheOutput(lru, findUsersFactory(auth0)),
    findUsersByRole: cacheOutput(lru, findUsersByRoleFactory(auth0)),
    getRolesForUser: getRolesForUserFactory(auth0),
  };
}
