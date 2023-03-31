import { SubschemaConfig } from '@graphql-tools/delegate';
import { RenameObjectFields } from '@graphql-tools/wrap';
import { createRemoteSubschema } from '../remoteSubschema.js';

export async function createAccountSchema(httpEndpoint, wsEndpoint): Promise<SubschemaConfig> {
  const transforms = [];
  return createRemoteSubschema({ httpEndpoint, wsEndpoint });
}
