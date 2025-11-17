/* eslint-disable camelcase */
import fs from 'fs';
import path from 'path';
import { makeExecutableSchema } from '@graphql-tools/schema';
import fetch from 'node-fetch';
import LruCache from 'lru-cache';

const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();
const lru = new LruCache({ maxAge: 1000 * 60 * 5, max: 500 });

async function fetchTermageddon(key) {
  if (lru.has(key)) return lru.get(key);
  const result = await fetch(`https://embed.termageddon.com/api/render/${key}?origin=${process.env.TERMAGEDDON_ORIGIN}`);
  const resp = await result.text();
  lru.set(key, resp);
  return resp;
}

export default function createTermageddonSchema() {
  const resolvers = {};
  resolvers.Query = {
    async terms(_, { locale }) {
      const [privacyPolicy, tos, disclaimer, cookiePolicy] = await Promise.all([
        fetchTermageddon(process.env.TERMAGEDDON_PRIVACY_POLICY),
        fetchTermageddon(process.env.TERMAGEDDON_TOS),
        fetchTermageddon(process.env.TERMAGEDDON_DISCLAIMER),
        fetchTermageddon(process.env.TERMAGEDDON_COOKIE_POLICY),
      ]);
      return {
        privacyPolicy,
        tos,
        disclaimer,
        cookiePolicy,
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
