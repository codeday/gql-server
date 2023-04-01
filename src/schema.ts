/* eslint-disable import/no-cycle */
// import { SubschemaInfo } from './schema';
import { SubschemaConfig } from '@graphql-tools/delegate';
import { mergeResolvers } from '@graphql-tools/merge';
import { stitchSchemas } from '@graphql-tools/stitch';
import { IResolvers, TypeSource } from '@graphql-tools/utils';
import { RenameTypes, WrapType } from '@graphql-tools/wrap';
import mapObject from 'map-obj';

import { GraphQLSchema } from 'graphql';
import {
  createContentfulSubschema,
  createAccountSubschema,
  createClearSubschema,
  createShowcaseSubschema,
  createAdvisorsSubschema,
  createCalendarSubschema,
  createDiscordPostsSubschema,
  createLabsSubschema,
  createWordpressSubschema,
  createGeoSubschema,
  createGithubSubschema,
  createTwitchSubschema,
  createEmailSubschema,
} from './remote/index.js';

export interface SubschemaInfo {
  subschema: SubschemaConfig;
  createTypeDefs?: (prefix: string) => TypeSource;
  createResolvers?: (prefix: string, subschemaInfo?: { [key: string]: SubschemaConfig }) => IResolvers;
}

function namescapeTransforms(prefix: string, schema: SubschemaConfig) {
  const fieldPrefix = prefix.charAt(0).toLowerCase() + prefix.slice(1);
  const typePrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  const renameFields = ['Query', 'Mutation'];
  const wrapFields = renameFields
    .map((fieldType) => {
      const fieldName = schema.schema[`get${fieldType}Type`]()?.name;
      if (!fieldName) return;
      return new WrapType(fieldName, `${typePrefix}${fieldName}`, fieldPrefix);
    })
    .filter((field) => field);
  return [new RenameTypes((name) => (name === 'Upload' ? name : `${typePrefix}${name}`)), ...wrapFields];
}
// import { createSchema } from './schema.js';

export async function fetchSubschemaInfo() {
  console.log('Fetching sub-schemas...');
  const [blog, showYourWork, showcase, calendar, labs, advisors, clear, cms, account, geo, email, twitch, github] =
    await Promise.all([
      await createWordpressSubschema(process.env.WORDPRESS_URL || 'https://wp.codeday.org/graphql'),
      await createDiscordPostsSubschema(process.env.SHOWYOURWORK_URL || 'http://discord-posts.codeday.cloud'),
      await createShowcaseSubschema(
        process.env.SHOWCASE_URL || 'http://showcase-gql.codeday.cloud/graphql',
        process.env.SHOWCASE_WS || 'ws://showcase-gql.codeday.cloud/graphql',
      ),
      await createCalendarSubschema(process.env.CALENDAR_URL || 'http://calendar-gql.codeday.cloud/graphql'),
      await createLabsSubschema(process.env.LABS_URL || 'http://labs-gql.codeday.cloud/graphql'),
      await createAdvisorsSubschema(process.env.ADVISORS_URL || 'http://advisors-gql.codeday.cloud/graphql'),
      await createClearSubschema(process.env.CLEAR_URL || 'http://clear-gql.codeday.cloud/graphql'),
      await createContentfulSubschema('d5pti1xheuyu', process.env.CONTENTFUL_TOKEN),
      await createAccountSubschema(
        process.env.ACCOUNT_URL || 'http://account-gql.codeday.cloud/graphql',
        process.env.ACCOUNT_WS || 'ws://account-gql.codeday.cloud/graphql',
      ),
      await createGeoSubschema(process.env.MAXMIND_ACCOUNT, process.env.MAXMIND_KEY),
      await createEmailSubschema(),
      await createTwitchSubschema(
        process.env.TWITCH_CHANNEL,
        process.env.TWITCH_CLIENT_ID,
        process.env.TWITCH_CLIENT_SECRET,
      ),
      await createGithubSubschema(process.env.GITHUB_TOKEN),
    ]);
  // return createSchema({
  return { account, blog, cms, showYourWork, showcase, calendar, email, twitch, labs, advisors, geo, clear, github };
  // });
}
export function createSchema(subschemaInfo: { [prefix: string]: SubschemaInfo }) {
  const schemaInfo = Object.keys(subschemaInfo).map((key) => ({ prefix: key, ...subschemaInfo[key] }));
  schemaInfo.forEach(({ subschema, prefix }) => {
    // eslint-disable-next-line no-param-reassign
    (subschema.transforms = subschema.transforms || []).push(...namescapeTransforms(prefix, subschema));
  });
  const {
    prefix: prefixes,
    subschema: subschemas,
    typeDefs,
    resolvers,
  } = schemaInfo.reduce(
    (accum, info) => {
      Object.keys(info).forEach((prop) => {
        const { prefix } = info;
        if (prop.startsWith('create') && info[prop] instanceof Function) {
          const arrayProp =
            prop.substring('create'.length).charAt(0).toLowerCase() + prop.substring('create'.length + 1);
          const typePrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
          accum[arrayProp].push(
            info[prop](
              typePrefix,
              mapObject(subschemaInfo, (k: string, v) => [k, v.subschema]),
            ),
          );
          return;
        }
        accum[prop].push(info[prop] instanceof Function ? info[prop](info) : info[prop]);
      });
      return accum;
    },
    {
      prefix: [] as string[],
      subschema: [] as SubschemaConfig[],
      typeDefs: [] as TypeSource[],
      resolvers: [] as IResolvers[],
    },
  );

  return stitchSchemas({
    subschemas,
    typeDefs,
    resolvers: mergeResolvers(resolvers),
    inheritResolversFromInterfaces: true,
    mergeDirectives: true,
    mergeTypes: true,
  });
}

export class SchemaLoader {
  public schema: GraphQLSchema | null = null;

  public loadedSubschemas: { [key: string]: SubschemaInfo }[] = [];

  private intervalId: NodeJS.Timeout | null = null;

  async reload() {
    const subschemaInfo = await fetchSubschemaInfo();
    this.loadedSubschemas = Object.keys(subschemaInfo).map((key) => ({
      [key]: subschemaInfo[key],
    }));
    this.schema = createSchema(subschemaInfo);
    return this.schema;
  }

  autoRefresh(interval = 3000) {
    this.stopAutoRefresh();
    this.intervalId = setTimeout(async () => {
      await this.reload();
      this.intervalId = null;
      this.autoRefresh(interval);
    }, interval);
  }

  stopAutoRefresh() {
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
