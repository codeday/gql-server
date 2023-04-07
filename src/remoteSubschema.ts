import { SubschemaConfig } from '@graphql-tools/delegate';
import { buildGraphQLWSExecutor } from '@graphql-tools/executor-graphql-ws';
import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import { RenameTypes, WrapType, schemaFromExecutor } from '@graphql-tools/wrap';
import { createClient } from 'graphql-ws';
import WebSocket from 'ws';
import { SubschemaInfo } from './schema.js';
import { GraphQLSchema } from 'graphql';
import { namespaceTransforms } from './schema.js';

interface RemoteSchemaEndpoint {
  httpEndpoint: string;
  wsEndpoint: string;
}

interface RemoteSubschemaExecutorConfig {
  headers?: Record<string, string>;
}

function buildCombinedExecutor(endpoint: string | RemoteSchemaEndpoint, options: RemoteSubschemaExecutorConfig) {
  const httpEndpoint = typeof endpoint === 'string' ? endpoint : endpoint.httpEndpoint;
  const httpExecutor = buildHTTPExecutor({
    endpoint: httpEndpoint,
    ...(options || {}),
  });

  if (typeof endpoint === 'string') return httpExecutor;

  const wsClient = createClient({
    url: endpoint.wsEndpoint,
    webSocketImpl: WebSocket,
  });

  const wsExecutor = buildGraphQLWSExecutor(wsClient);

  return (executorRequest) => {
    if (executorRequest.operationType === 'subscription') {
      return wsExecutor(executorRequest);
    }
    return httpExecutor(executorRequest);
  };
}

export class RemoteSubschema<Prefix extends string> {
  constructor(
    public endpoint: string | RemoteSchemaEndpoint,
    public options: RemoteSubschemaExecutorConfig &
      Omit<SubschemaConfig, 'schema' | 'executor'> &
      Omit<Partial<SubschemaInfo<Prefix>>, 'schema'> = {},
  ) {
    this.endpoint = endpoint;
    this.options = options;
  }

  async createSubschema() {
    const { headers, createTypeDefs = () => [], createResolvers = () => ({}), ...rest } = this.options;

    const executor = buildCombinedExecutor(this.endpoint, { headers });
    return {
      subschema: {
        schema: await schemaFromExecutor(executor),
        executor,
        ...rest,
      },
      createResolvers,
      createTypeDefs,
    };
  }
}

export async function createRemoteSubschema<Prefix extends string | '' = ''>(
  endpoint: string | RemoteSchemaEndpoint,
  options: RemoteSubschemaExecutorConfig &
    Omit<SubschemaConfig, 'schema' | 'executor'> & { prefix: Prefix } & Omit<
      Partial<SubschemaInfo<Prefix>>,
      'subschema'
    >,
): Promise<SubschemaInfo<Prefix>> {
  const {
    headers,
    prefix = '',
    createTypeDefs = () => [],
    createResolvers = () => ({}),
    transforms = [],
    ...rest
  } = options;

  const executor = buildCombinedExecutor(endpoint, { headers });

  const subschema = {
    schema: await schemaFromExecutor(executor),
    executor,
    transforms,
    ...rest,
  };
  subschema.transforms.push(...namespaceTransforms(prefix, subschema));

  return {
    subschema,
    createResolvers: createResolvers as SubschemaInfo<Prefix>['createResolvers'],
    createTypeDefs,
    prefix: prefix as Prefix,
  };
}
