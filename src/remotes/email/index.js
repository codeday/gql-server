/* eslint-disable camelcase */
import fs from 'fs';
import path from 'path';
import { makeExecutableSchema } from '@graphql-tools/schema';
import fetch from 'node-fetch';
import FormData from 'form-data';
import {JSONObjectResolver, JSONObjectDefinition} from 'graphql-scalars';

const typeDefs = [JSONObjectDefinition, fs.readFileSync(path.join(__dirname, 'schema.gql')).toString()];

export default function createEmailSchema() {
  const resolvers = {
    JSONObject: JSONObjectResolver,

    Query: {
      status() { return true; },
    },

    Mutation: {
      async subscribe(parent, args) {
        const res = await fetch(`https://emailoctopus.com/api/1.6/lists/${args.list}/contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', },
          body: JSON.stringify({
            api_key: process.env.EMAIL_OCTOPUS_TOKEN,
            email_address: args.email,
            fields: { ...args.fields, FirstName: args.firstName, LastName: args.lastName },
          }),
        });
        return true;
      },
    },
  };

  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  return {
    schema,
  };
}
