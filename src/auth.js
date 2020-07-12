import { verify } from 'jsonwebtoken';

export const scopes = {
  readUsers: 'read:users',
  readUserRoles: 'read:roles',
  readBlogUnpublished: 'read:blog_unpublished',
};

export const hasScope = (ctx, scope) => (ctx.scopes || []).includes(scope);
export const requireScope = (ctx, scope) => {
  if (!hasScope(ctx, scope)) {
    throw new Error(`Your request requires the scope ${scope}.`);
  }
  return true;
};

export const addAuthContext = ({ headers }) => {
  if (!headers || !('authorization' in headers) || !headers.authorization) return { scopes: [] };

  const [authType, token] = headers.authorization.split(/\s+/);
  if (authType !== 'Bearer' || !token) return { scopes: [] };

  const { scopes: grantedScopes } = verify(token, process.env.TOKEN_SECRET);
  return { scopes: grantedScopes.split(/\s+/g) };
};
