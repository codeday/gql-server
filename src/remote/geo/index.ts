import { dirname, join } from 'path';
import { addResolversToSchema } from '@graphql-tools/schema';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { loadSchema } from '@graphql-tools/load';
import { fileURLToPath } from 'node:url';
import { WebServiceClient } from '@maxmind/geoip2-node';
import LruCache from 'lru-cache';
import { SubschemaInfo, createLocalSubschema } from '../../schema.js';
import { GeoGeoResult, GeoQueryResolvers } from '../../generated/graphql.js';

const cache = new LruCache({ max: 1024 * 5, ttl: 1000 * 60 * 60 * 24 });

export async function createGeoSubschema(account, key): Promise<SubschemaInfo> {
  const client = new WebServiceClient(account, key);

  const baseSchema = await loadSchema(join(dirname(fileURLToPath(import.meta.url)), 'schema.gql'), {
    loaders: [new GraphQLFileLoader()],
  });
  const resolvers: { Query?: GeoQueryResolvers } = {};

  resolvers.Query = {
    async mine(_, __, { req }): Promise<GeoGeoResult> {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();
      if (cache.has(ip)) return cache.get(ip);
      const city = await client.city(ip);
      const subdivision = city.subdivisions[0];
      const res = {
        lat: city?.location?.latitude,
        lng: city?.location?.longitude,
        accuracy: city?.location?.accuracyRadius,
        tz: city?.location?.timeZone,
        country: city?.country?.isoCode,
        countryName: city?.country?.names?.en,
        subdivision: subdivision?.isoCode,
        subdivisionName: subdivision?.names?.en,
        cityName: city?.city?.names?.en,
        postalCode: city?.postal?.code,
        isp: city?.traits?.isp,
        organization: city?.traits?.organization,
        ip,
      };

      cache.set(ip, res);
      return res;
    },
  };

  const schema = addResolversToSchema({ schema: baseSchema, resolvers });
  return createLocalSubschema({schema, prefix: 'geo'})
}
