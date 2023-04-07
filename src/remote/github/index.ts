/* eslint-disable camelcase */
import { dirname, join } from 'path';
import { addResolversToSchema, makeExecutableSchema } from '@graphql-tools/schema';
import { delegateToSchema } from '@graphql-tools/delegate';
import fetch from 'node-fetch';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { loadSchema, loadSchemaSync } from '@graphql-tools/load';
import { OperationTypeNode } from 'graphql';
import { fileURLToPath } from 'node:url';
import LruCache from 'lru-cache';
import { SubschemaInfo, createLocalSubschema } from '../../schema.js';
import { GithubQueryResolvers } from '../../generated/graphql.js';
import { api } from '../../utils/fetch-api.js';

function createTypeDefs(prefix) {
  return `
    extend type ${prefix}Contributor {
      account: AccountUser
    }
  `;
}

function createResolvers(schemas) {
  return {
    GithubContributor: {
      account: {
        selectionSet: '{ username }',
        resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.account,
            operation: OperationTypeNode.QUERY,
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
query GetContributorsQuery($owner: String!, $repository: String!, $branch: String!, $path: String) {
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
`;

type GithubQuery = {
  repository: {
    object: {
      history: {
        nodes: any[];
      };
    };
  };
};
const lru = new LruCache<string, any[]>({ ttl: 1000 * 60 * 5, max: 500 });

export async function createGithubSubschema(token): Promise<SubschemaInfo> {
  const baseSchema = await loadSchema(join(dirname(fileURLToPath(import.meta.url)), 'schema.gql'), {
    loaders: [new GraphQLFileLoader()],
  });

  const resolvers: { Query?: GithubQueryResolvers } = {};
  resolvers.Query = {
    async contributors(_, { owner, repository, branch = 'main', path }, __, info) {
      const cacheKey = `${owner}/${repository}/${branch || 'main'}/${path}`;
      if (!lru.has(cacheKey)) {
        const result = await api<GithubQuery>(`https://api.github.com/graphql`, {
          method: 'POST',
          body: JSON.stringify({
            query: CONTRIBUTORS_QUERY,
            variables: {
              owner: owner || 'codeday',
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

        const allContributors = result?.repository?.object?.history?.nodes?.map((n) => n.author?.user?.login);
        lru.set(cacheKey, [...new Set(allContributors)]);
      }
      return lru.get(cacheKey).map((username) => ({ username }));
    },
  };

  const schema = addResolversToSchema({ schema: baseSchema, resolvers });
  return createLocalSubschema({ schema, createResolvers, createTypeDefs, prefix: 'github' });

  // return {
  //   subschema: { schema },
  //   createResolvers,
  //   createTypeDefs,
  //   prefix: 'github',
  // };
}
