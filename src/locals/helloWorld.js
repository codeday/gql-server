import { makeExecutableSchema } from 'graphql-tools';
import { gql } from 'apollo-server';

export default () => {
    const typeDefs = gql`
        type Query {
            helloWorld: String
        }
    `;

    const resolvers = {
        Query: {
            helloWorld: () => `Hello, friend! Welcome to the SRND GraphQL server! A lot of endpoints are intentionally public. Feel free to poke around!`
        }
    }

    return makeExecutableSchema({ typeDefs, resolvers });
}