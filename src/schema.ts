import { SubschemaConfig } from '@graphql-tools/delegate';
import { mergeSchemas } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { createAccountSchema, createContentfulSubschema } from './remote/index.js';

function namespaceTransform(fieldPrefix, typePrefix, schema) {}

function createSchema(schemas: { [prefix: string]: SubschemaConfig }) {
  const subschemas = Object.keys(schemas).map((prefix) => schemas[prefix]);
  const transforms = [];

  return stitchSchemas({
    subschemas,
    subschemaConfigTransforms: [
      (subschemaConf) => {
        return {
          ...subschemaConf,
          transforms: [...subschemaConf.transforms, ...transforms],
        };
      },
    ],
  });
}

export async function buildSchema() {
  console.log('Fetching sub-schemas...');
  const [cms, account] = await Promise.all([
    createContentfulSubschema('d5pti1xheuyu', process.env.CONTENTFUL_TOKEN),
    createAccountSchema(
      process.env.ACCOUNT_URL || 'http://account-gql.codeday.cloud/graphql',
      process.env.ACCOUNT_WS || 'ws://account-gql.codeday.cloud/graphql',
    ),
  ]);
  return createSchema({ cms, account });
}
