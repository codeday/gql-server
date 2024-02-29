import { createRemoteSubschema } from '../remoteSubschema.js';

export async function createAdvisorsSubschema(url) {
  console.log(` * advisors(${url})`);
  return createRemoteSubschema(url, { prefix: 'advisors' });
}
