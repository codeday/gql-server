import {
  RenameTypes, WrapFields,
} from '@graphql-tools/wrap';
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';
import { stitchSchemas } from '@graphql-tools/stitch';
import map from 'map-obj';

export function namespace(fieldPrefix, typePrefix, schema) {
  const wrapFields = ['Query', 'Mutation', 'Subscription']
    .map((operation) => {
      const type = schema[`get${operation}Type`]();
      if (type) {
        return new WrapFields(type.name, [fieldPrefix], [typePrefix + type.name]);
      }
      return null;
    }).filter((f) => f);

  return [
    new RenameTypes((t) => typePrefix + t),
    ...wrapFields,
  ];
}

export function weave(components) {
  const allRawSchemas = map(components, (k, v) => [k, v.schema]);

  const renderedComponents = Object.values(map(components, (k, v) => {
    const fieldPrefix = k.charAt(0).toLowerCase() + k.slice(1);
    const typePrefix = k.charAt(0).toUpperCase() + k.slice(1);

    const subschema = {
      schema: v.schema,
      transforms: [
        ...(v.transforms || []),
        ...namespace(fieldPrefix, typePrefix, v.schema),
      ],
    };
    const typeDefs = 'getConnectionTypes' in v && v.getConnectionTypes(typePrefix);
    const resolvers = `getConnectionResolvers` in v && v.getConnectionResolvers(typePrefix, allRawSchemas);

    return [k, { subschema, typeDefs, resolvers }];
  }));

  const resolve = (type) => renderedComponents.map((v) => v[type]).filter((v) => v);

  const schemas = {
    subschemas: resolve('subschema'),
    typeDefs: mergeTypeDefs(resolve('typeDefs')),
    resolvers: mergeResolvers(resolve('resolvers')),
  };
  return stitchSchemas(schemas);
}
