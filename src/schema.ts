// import { SubschemaInfo } from './schema';
import { SubschemaConfig } from '@graphql-tools/delegate';
import { mergeResolvers } from '@graphql-tools/merge';
import { stitchSchemas } from '@graphql-tools/stitch';
import { IResolvers, TypeSource } from '@graphql-tools/utils';
import { RenameTypes, WrapType } from '@graphql-tools/wrap';
import mapObject from 'map-obj';
import { createAccountSchema, createContentfulSubschema } from './remote/index.js';

export interface SubschemaInfo {
  subschema: SubschemaConfig;
  createTypeDefs: (prefix: string) => TypeSource;
  createResolvers: (prefix: string, subschemaInfo?: { [key: string]: SubschemaConfig }) => IResolvers;
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
    // subschemaConfigTransforms: [
    //   (subschemaConf) => {
    //     return {
    //       ...subschemaConf,
    //       transforms: [...(subschemaConf.transforms || []), ...transforms],
    //     };
    //   },
    // ],
  });
}
