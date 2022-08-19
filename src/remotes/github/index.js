/* eslint-disable camelcase */
import fs from 'fs';
import path from 'path';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { delegateToSchema } from '@graphql-tools/delegate';
import fetch from 'node-fetch';
import LruCache from 'lru-cache';

const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();

function getConnectionTypes(prefix) {
  return `
    extend type ${prefix}Contributor {
      account: AccountUser
    }
  `;
}

function getConnectionResolvers(prefix, schemas) {
  return {
    [`${prefix}Contributor`]: {
      account: {
        selectionSet: '{ username }',
        resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.account,
            operation: 'query',
            fieldName: 'getUser',
            args: {
              where: {
                githubUsername: parent.username,
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

const CONTRIBUTORS_QUERY = `
query GetContributorsQuery($owner: String!, $repository: String!, $branch: String!, $path: String!) {
  repository(owner: $owner, name: $repository) {
    object(expression: $branch) {
      ... on Commit {
        history(first: 100, path: $path) {
          nodes {
            author {
              user {
                login
              }
            }
          }
        }
      }
    }
  }}
`

const lru = new LruCache({ maxAge: 1000 * 60 * 5, max: 500 });

export default function createGithubSchema(token) {
  const resolvers = {};
  resolvers.Query = {
    async contributors(_, { owner, repository, branch, path }) {
      const cacheKey = `${owner}/${repository}/${branch || 'main'}/${path}`;
      if (!lru.has(cacheKey)) {
        const result = await fetch(`https://api.github.com/graphql`, {
          method: 'POST',
          body: JSON.stringify({
            query: CONTRIBUTORS_QUERY,
            variables: {
              owner,
              repository,
              branch: branch || 'main',
              path,
            },
          }),
          headers: {
            Authorization: `bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        const resp = await result.json();

        const allContributors = resp?.data?.repository?.object?.history?.nodes
          ?.map((n) => n.author?.user?.login );

        lru.set(cacheKey, [...new Set(allContributors)]);
      }
      return lru.get(cacheKey).map((username) => ({ username }));
    },
  };

  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  return {
    schema,
    transforms: [],
    getConnectionTypes,
    getConnectionResolvers,
  };
}
