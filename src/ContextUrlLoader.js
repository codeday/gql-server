
import { print, Kind, parse, buildASTSchema } from 'graphql';
import {
  observableToAsyncIterable,
} from '@graphql-tools/utils';
import { isWebUri } from 'valid-url';
import { fetch as crossFetch } from 'cross-fetch';
import { introspectSchema, wrapSchema } from '@graphql-tools/wrap';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import { w3cwebsocket } from 'websocket';

export class ContextUrlLoader {
  loaderId() {
    return 'url';
  }

  async canLoad(pointer, options) {
    return this.canLoadSync(pointer, options);
  }

  canLoadSync(pointer, _options) {
    return !!isWebUri(pointer);
  }

  buildAsyncExecutor({
    pointer,
    fetch,
    extraHeaders,
    defaultMethod,
    useGETForQueries,
  }) {
    const HTTP_URL = switchProtocols(pointer, {
      wss: 'https',
      ws: 'http',
    });
    return async ({ document, variables, context }) => {
      let method = defaultMethod;
      if (useGETForQueries) {
        method = 'GET';
        for (const definition of document.definitions) {
          if (definition.kind === Kind.OPERATION_DEFINITION) {
            if (definition.operation !== 'query') {
              method = defaultMethod;
            }
          }
        }
      }

      let fetchResult;
      const query = print(document);
      switch (method) {
        case 'GET':
          const urlObj = new URL(HTTP_URL);
          urlObj.searchParams.set('query', query);
          if (variables && Object.keys(variables).length > 0) {
            urlObj.searchParams.set('variables', JSON.stringify(variables));
          }
          const finalUrl = urlObj.toString();
          fetchResult = await fetch(finalUrl, {
            method: 'GET',
            headers: extraHeaders,
            context: context || {},
          });
          break;
        case 'POST':
          fetchResult = await fetch(HTTP_URL, {
            method: 'POST',
            body: JSON.stringify({
              query,
              variables,
            }),
            headers: extraHeaders,
            context: context || {},
          });
          break;
      }
      return fetchResult.json();
    };
  }

  buildSubscriber(pointer, webSocketImpl) {
    const WS_URL = switchProtocols(pointer, {
      https: 'wss',
      http: 'ws',
    });
    const subscriptionClient = new SubscriptionClient(WS_URL, {}, webSocketImpl);
    return async ({ document, variables }) => {
      return observableToAsyncIterable(
        subscriptionClient.request({
          query: document,
          variables,
        })
      );
    };
  }

  async getFetch(options, defaultMethod) {
    let headers = {};
    let fetch = crossFetch;
    let webSocketImpl = w3cwebsocket;

    if (options) {
      if (Array.isArray(options.headers)) {
        headers = options.headers.reduce((prev, v) => ({ ...prev, ...v }), {});
      } else if (typeof options.headers === 'object') {
        headers = options.headers;
      }

      if (options.customFetch) {
        if (typeof options.customFetch === 'string') {
          const [moduleName, fetchFnName] = options.customFetch.split('#');
          fetch = await import(moduleName).then(module => (fetchFnName ? module[fetchFnName] : module));
        } else {
          fetch = options.customFetch;
        }
      }

      if (options.webSocketImpl) {
        if (typeof options.webSocketImpl === 'string') {
          const [moduleName, webSocketImplName] = options.webSocketImpl.split('#');
          webSocketImpl = await import(moduleName).then(module =>
            webSocketImplName ? module[webSocketImplName] : module
          );
        } else {
          webSocketImpl = options.webSocketImpl;
        }
      }

      if (options.method) {
        defaultMethod = options.method;
      }
    }
    return { headers, defaultMethod, fetch, webSocketImpl };
  }

  async getExecutorAndSubscriber(
    pointer,
    options
  ) {
    const { headers, defaultMethod, fetch, webSocketImpl } = await this.getFetch(options, 'POST');

    const extraHeaders = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...headers,
    };

    const executor = this.buildAsyncExecutor({
      pointer,
      fetch,
      extraHeaders,
      defaultMethod,
      useGETForQueries: options.useGETForQueries,
    });

    let subscriber;

    if (options.enableSubscriptions) {
      subscriber = this.buildSubscriber(pointer, webSocketImpl);
    }

    return {
      executor,
      subscriber,
    };
  }

  async getSubschemaConfig(pointer, options) {
    const { executor, subscriber } = await this.getExecutorAndSubscriber(pointer, options);
    return {
      schema: await introspectSchema(executor, undefined, options),
      executor,
      subscriber,
    };
  }

  async handleSDL(pointer, options) {
    const { fetch, defaultMethod, headers } = await this.getFetch(options, 'GET');
    const response = await fetch(pointer, {
      method: defaultMethod,
      headers,
    });
    const schemaString = await response.text();
    const document = parse(schemaString, options);
    const schema = buildASTSchema(document, options);
    return {
      document,
      schema,
    };
  }

  async load(pointer, options) {
    if (pointer.endsWith('.graphql')) {
      const { document, schema } = await this.handleSDL(pointer, options);
      return {
        location: pointer,
        document,
        schema,
      };
    }
    const subschemaConfig = await this.getSubschemaConfig(pointer, options);

    const remoteExecutableSchema = wrapSchema(subschemaConfig);

    return {
      location: pointer,
      schema: remoteExecutableSchema,
    };
  }

  loadSync() {
    throw new Error('Loader Url has no sync mode');
  }
}

function switchProtocols(pointer, protocolMap) {
  const protocols = Object.keys(protocolMap).map(source => [source, protocolMap[source]]);
  return protocols.reduce(
    (prev, [source, target]) => prev.replace(`${source}://`, `${target}://`).replace(`${source}:\\`, `${target}:\\`),
    pointer
  );
}
