import { SubschemaInfo } from '../schema.js';
import { createRemoteSubschema } from '../remoteSubschema.js';

export async function createCalendarSubschema(url) {
  console.log(` * calendar(${url})`);
  return createRemoteSubschema(url, { prefix: 'calendar' });
}
