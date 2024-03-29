import { wrapSchema, introspectSchema } from '@graphql-tools/wrap';
import makeRemoteTransport from '../remoteTransport';

export default async function createAdvisorsSchema(uri) {
  console.log(` * advisors(${uri})`);
  const { executor, subscriber } = makeRemoteTransport(uri);
  const schema = wrapSchema({
    schema: await introspectSchema(executor),
    executor,
    subscriber,
  });
  return {
    schema,
    transforms: [],
  };
}
