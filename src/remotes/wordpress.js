import { transformSchema, RenameTypes, RenameRootFields, FilterRootFields } from 'graphql-tools';
import { createRemoteSchema } from './util';

export default async (type, url) => {
    const schema = await createRemoteSchema(url);
    return transformSchema(schema, [
        new RenameTypes((name) => `${type}_${name}`),
        new FilterRootFields((operation, name) => name == 'posts'),
        new RenameRootFields(() => type.toLowerCase())
    ]);
}