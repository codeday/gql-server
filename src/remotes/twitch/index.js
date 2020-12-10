/* eslint-disable camelcase */
import fs from 'fs';
import path from 'path';
import { makeExecutableSchema } from '@graphql-tools/schema';
import fetch from 'node-fetch';

const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();

let accessToken = '';
let expiresAt = 0;

export default function createTwitchSchema(username, clientId, clientSecret) {
  const resolvers = {};
  resolvers.Query = {
    async live() {
      const now = Math.floor(+new Date() / 1000);
      if (expiresAt < now) {
        const qs = `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials&scope=`;
        const atResult = await fetch(`https://id.twitch.tv/oauth2/token?${qs}`, { method: 'POST' });
        const { access_token, expires_in } = await atResult.json();
        accessToken = access_token;
        expiresAt = (now + expires_in) - 10;
      }

      const result = await fetch(`https://api.twitch.tv/helix/streams?user_login=${username}`, {
        headers: {
          'Client-Id': clientId,
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const { data } = await result.json();

      if (!data || data.length === 0) return null;
      return {
        title: data[0].title,
        username,
        url: `https://twitch.tv/${username}`,
        startedAt: data[0].started_at,
        viewerCount: data[0].viewer_count || 0,
        thumbnail: ({ width, height }) => data[0].thumbnail_url
          .replace('{width}', width)
          .replace('{height}', height),
      };
    },
  };

  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  return {
    schema,
  };
}
