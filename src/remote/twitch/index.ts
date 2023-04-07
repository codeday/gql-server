/* eslint-disable camelcase */
// eslint-disable-next-line node/no-unpublished-import
import { dirname, join } from 'path';
import { addResolversToSchema } from '@graphql-tools/schema';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { loadSchema } from '@graphql-tools/load';
import { fileURLToPath } from 'node:url';
import { TwitchQueryResolvers } from '../../../generated/graphql.js';
import { SubschemaInfo } from '../../schema.js';
import { api } from '../../utils/fetch-api.js';

type Stream = {
  title: string;
  viewer_count: number;
  started_at: string;
  thumbnail_url: string;
};

let accessToken = '';
let expiresAt = 0;

export async function createTwitchSubschema(username, clientId, clientSecret): Promise<SubschemaInfo> {
  const baseSchema = await loadSchema(join(dirname(fileURLToPath(import.meta.url)), 'schema.gql'), {
    loaders: [new GraphQLFileLoader()],
  });

  const resolvers: { Query?: TwitchQueryResolvers } = {};

  resolvers.Query = {
    // @ts-ignore
    async live() {
      const now = Math.floor(+new Date() / 1000);
      if (expiresAt < now) {
        const qs = `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials&scope=`;
        const atResult = await api<{ access_token: string; expires_in: number }>(
          `https://id.twitch.tv/oauth2/token?${qs}`,
          { method: 'POST' },
        );
        const { access_token, expires_in } = atResult;
        accessToken = access_token;
        expiresAt = now + expires_in - 10;
      }

      const data = await api<Stream[]>(`https://api.twitch.tv/helix/streams?user_login=${username}`, {
        headers: {
          'Client-Id': clientId,
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!data || data.length === 0) return null;
      return {
        title: data[0].title,
        username,
        url: `https://twitch.tv/${username}`,
        startedAt: data[0].started_at,
        viewerCount: data[0].viewer_count || 0,
        thumbnail: ({ width, height }) => data[0].thumbnail_url.replace('{width}', width).replace('{height}', height),
      };
    },
  };

  const schema = addResolversToSchema({ schema: baseSchema, resolvers });

  return {
    subschema: { schema },
    prefix: 'twitch',
  };
}
