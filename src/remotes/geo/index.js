/* eslint-disable camelcase */
import fs from 'fs';
import path from 'path';
import { makeExecutableSchema } from '@graphql-tools/schema';
import fetch from 'node-fetch';
import LruCache from 'lru-cache';

const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();

const cache = new LruCache({ max: 1024 * 5, maxAge: 1000 * 60 * 60 * 24 });

export default function createGeoSchema(account, key) {
  const resolvers = {};
  resolvers.Query = {
    async mine(_, __, { req }) {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();

      if (cache.has(ip)) return cache.get(ip);

      const result = await fetch(`https://geoip.maxmind.com/geoip/v2.1/city/${ip}`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${account}:${key}`).toString('base64')}`,
        },
      });

      const data = await result.json();
      const subdivision = (data?.subdivisions || [])[0] || {};
      const res = {
        lat: data?.location?.latitude,
        lng: data?.location?.longitude,
        accuracy: data?.location?.accuracy_radius,
        tz: data?.location?.time_zone,
        country: data?.country?.iso_code,
        countryName: data?.country?.names?.en,
        subdivision: subdivision?.iso_code,
        subdivisionName: subdivision?.names?.en,
        cityName: data?.city?.names?.en,
        postalCode: data?.postal?.code,
        isp: data?.traits?.isp,
        organization: data?.traits?.organization,
        ip,
      };
      cache.set(ip, res);
      return res;
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
