import { SubschemaConfig } from '@graphql-tools/delegate';
import { RenameObjectFields } from '@graphql-tools/wrap';
import { SubschemaInfo } from '../schema.js';
import { createRemoteSubschema } from '../remoteSubschema.js';

export async function createAccountSchema(httpEndpoint, wsEndpoint): Promise<SubschemaInfo> {
  const transforms = [];
  return createRemoteSubschema({ httpEndpoint, wsEndpoint });
}
