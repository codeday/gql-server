import { SubschemaInfo } from '../schema.js';
import { createRemoteSubschema } from '../remoteSubschema.js';

export async function createAdvisorsSubschema(url): Promise<SubschemaInfo> {
  console.log(` * advisors(${url})`);
  return createRemoteSubschema(url);
}
