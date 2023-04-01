// eslint-disable-next-line node/no-unpublished-import
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema: 'http://localhost:4000',
  generates: {
    'generated/graphql.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        useIndexSignature: true,
        noSchemaStitching: false,
      },
    },
  },
};

export default config;
