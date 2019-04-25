import {makeRemoteExecutableSchema, introspectSchema} from 'graphql-tools';
import { HttpLink } from 'apollo-link-http';
import fetch from 'node-fetch';

export const createRemoteSchema = async (uri) => {
    const link = new HttpLink({ uri, fetch });
    const schema = await introspectSchema(link);
    return makeRemoteExecutableSchema({ schema, link });
}