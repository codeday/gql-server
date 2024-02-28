import { SubschemaConfig } from '@graphql-tools/delegate';
import { buildGraphQLWSExecutor } from '@graphql-tools/executor-graphql-ws';
import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import { schemaFromExecutor } from '@graphql-tools/wrap';
import { createClient } from 'graphql-ws';
import WebSocket from 'ws';
import { SubschemaInfo, namespaceTransforms } from './schema.js';

interface RemoteSchemaEndpoint {
  httpEndpoint: string;
  wsEndpoint: string;
}

interface RemoteSubschemaExecutorConfig {
  headers?: Record<string, string>;
  forwardHeaders?: string[];
}

function buildCombinedExecutor(endpoint: string | RemoteSchemaEndpoint, options: RemoteSubschemaExecutorConfig) {
  const httpEndpoint = typeof endpoint === 'string' ? endpoint : endpoint.httpEndpoint;
  const { headers = {}, forwardHeaders = [], ...rest } = options;
  const httpExecutor = buildHTTPExecutor({
    endpoint: httpEndpoint,
    headers: (request) => {
      // forward all user headers starting with 'x-' or listed in forwardHeaders
      const userHeaders = request?.context?.req?.headers || {};
      const headersToForward = Object.fromEntries(
        Object.entries(userHeaders).filter(([key]) => forwardHeaders.includes(key) || key.startsWith('x-')),
      ) as RemoteSubschemaExecutorConfig['headers'];

      return { ...headers, ...headersToForward };
    },
    ...(rest || {}),
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
    const { headers, forwardHeaders, createTypeDefs = () => [], createResolvers = () => ({}), ...rest } = this.options;

    const executor = buildCombinedExecutor(this.endpoint, { headers, forwardHeaders });
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
    forwardHeaders = [],
    ...rest
  } = options;

  const executor = buildCombinedExecutor(endpoint, { headers, forwardHeaders });

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
