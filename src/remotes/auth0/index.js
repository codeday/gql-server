import fs from 'fs';
import path from 'path';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { scopes, requireScope } from '../../auth';
import query from './query';

const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();

export default function createAuth0Schema(domain, clientId, clientSecret) {
  const { findUsers, getRolesForUser } = query(domain, clientId, clientSecret);

  const resolvers = {};
  resolvers.Query = {
    getUser: async (_, { where }, ctx) => (await findUsers(where, ctx))[0] || null,
    searchUsers: async (_, { where }, ctx) => findUsers(where, ctx),
  };
  resolvers.User = {
    roles: async ({ id }, _, ctx) => requireScope(ctx, scopes.readUserRoles) && getRolesForUser(id),
  };

  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  return { schema };
}
