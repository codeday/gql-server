/* eslint-disable import/no-cycle */
import { SubschemaConfig } from '@graphql-tools/delegate';
import { stitchSchemas } from '@graphql-tools/stitch';
import { IResolvers, TypeSource } from '@graphql-tools/utils';
import { RenameTypes, WrapType } from '@graphql-tools/wrap';

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
import { Resolvers } from './generated/graphql.js';

type NoStringIndex<T> = { [K in keyof T as string extends K ? never : K]: T[K] };
type HomomorphicProps<T> = NoStringIndex<{ [K in keyof T]: T[K] }>;
export type ResolversWithPrefix<Prefix extends string, TResolvers extends IResolvers = Resolvers & IResolvers> = Pick<
  HomomorphicProps<TResolvers>,
  Extract<keyof HomomorphicProps<TResolvers>, `${Capitalize<Prefix>}${string}`>
>;

export interface SubschemaInfo<Prefix extends string = string, TResolvers extends IResolvers = IResolvers & Resolvers> {
  prefix: Prefix;
  subschema: SubschemaConfig;
  createTypeDefs?: (prefix: string) => TypeSource;
  createResolvers?: (subschemaInfo?: { [key: string]: SubschemaConfig }) => ResolversWithPrefix<Prefix, TResolvers>;
}

export function namespaceTransforms(prefix: string, schema: SubschemaConfig | GraphQLSchema) {
  if (!prefix) return [];
  // eslint-disable-next-line no-underscore-dangle
  const _schema = schema instanceof GraphQLSchema ? schema : schema.schema;
  const fieldPrefix = prefix.charAt(0).toLowerCase() + prefix.slice(1);
  const typePrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  const renameFields = ['Query', 'Mutation'];
  const wrapFields = renameFields
    .map((fieldType) => {
      const fieldName = _schema[`get${fieldType}Type`]()?.name;
      if (!fieldName) return;
      return new WrapType(fieldName, `${typePrefix}${fieldName}`, fieldPrefix);
    })
    .filter((field) => field);
  return [new RenameTypes((name) => (name === 'Upload' ? name : `${typePrefix}${name}`)), ...wrapFields];
}

export function createLocalSubschema<Prefix extends string | '' = ''>(
  options: SubschemaConfig & { prefix: Prefix } & Omit<Partial<SubschemaInfo<Prefix>>, 'subschema'>,
): SubschemaInfo {
  const {
    schema,
    prefix = '',
    createTypeDefs = () => [],
    createResolvers = () => ({}),
    transforms = [],
    ...rest
  } = options;
  return {
    subschema: { schema, transforms: [...namespaceTransforms(prefix, schema), ...transforms], ...rest },
    createResolvers: createResolvers as SubschemaInfo<Prefix>['createResolvers'],
    createTypeDefs,
    prefix: prefix.toLowerCase() as Prefix,
  };
}

export async function fetchSubschemaInfo() {
  console.log('Fetching sub-schemas...');
  return Promise.all([
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
}
export function createSchema(subschemasInfo: SubschemaInfo[]) {
  const subschemaInfo = [...subschemasInfo];
  const resolvers = [];
  const typeDefs = [];

  const subschemas = subschemaInfo.map((info) => info.subschema);
  subschemaInfo.forEach(({ createTypeDefs, createResolvers, prefix }) => {
    if (createTypeDefs) typeDefs.push(createTypeDefs(prefix.charAt(0).toUpperCase() + prefix.slice(1)));
    if (createResolvers) {
      resolvers.push(
        createResolvers(subschemaInfo.reduce((map, info) => ({ ...map, [info.prefix]: info.subschema }), {})),
      );
    }
  });

  return stitchSchemas({
    subschemas,
    typeDefs,
    resolvers,
    inheritResolversFromInterfaces: true,
    mergeDirectives: true,
    mergeTypes: true,
  });
}
