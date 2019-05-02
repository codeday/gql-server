import { transformSchema, FilterRootFields } from 'graphql-tools';
import {makeRemoteExecutableSchema, introspectSchema} from 'graphql-tools';
import { HttpLink } from 'apollo-link-http';
import fetch from 'node-fetch';

export const createWordpressSchema = async (uri) => {
    const link = new HttpLink({ uri, fetch });
    const schema = await introspectSchema(link);
    return transformSchema(
        makeRemoteExecutableSchema({ schema, link }),
        [
            new FilterRootFields((operation, name) => (name == 'post' || name == 'posts')),
        ]
    );
}