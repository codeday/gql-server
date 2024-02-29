/* eslint-disable no-console */
import { GraphQLRequestContext } from '@apollo/server';

type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export const LoggingPlugin = {
  // Fires whenever a GraphQL request is received from a client.
  async requestDidStart(requestContext: GraphQLRequestContext<{}>) {
    const isIntrospectionQuery = requestContext.request.operationName === 'IntrospectionQuery';
    if (!isIntrospectionQuery) {
      // print query in single line :)
      console.log();
      console.log(
        `Request started! Query:\n${requestContext.request.query.replace(/\n/g, '').replace(/\s+/g, ' ').trim()}`,
      );
    }
    return {
      async didEncounterErrors(requestCtx: WithRequired<GraphQLRequestContext<{}>, 'errors'>) {
        console.log(`errors found${isIntrospectionQuery ? ' on introspection query' : ''}:`);
        requestCtx.errors.forEach((error, index) => {
          console.log('error: ', index + 1);
          console.error(error);
        });
      },
    };
  },
};
