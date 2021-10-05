import { wrapSchema, introspectSchema } from '@graphql-tools/wrap';
import makeRemoteTransport from '../remoteTransport';

export default async function createClearSchema(uri) {
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
