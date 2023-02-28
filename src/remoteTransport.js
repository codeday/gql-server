import { fetch } from 'cross-fetch';
import { print } from 'graphql';
import FormData from 'form-data';
import { observableToAsyncIterable } from '@graphql-tools/utils';
import { createClient } from 'graphql-ws';
import extractFiles from 'extract-files/public/extractFiles';

//
// HTTP requests
//

function makeExecutor(httpEndpoint, options) {
  return async function executor({ document, variables, context }) {
    const allowedHeaders = Object.keys(context?.headers || {})
      .filter((name) => name.toLowerCase().substr(0, 2) === 'x-')
      .reduce((accum, name) => ({ ...accum, [name]: context?.headers[name] }), {});
      // .filter((name) => name.toLowerCase().startsWith(prefix))

    const query = print(document);
    let clone = variables;
    let headers = {
      ...allowedHeaders,
      ...options?.headers,
    };
    let files = [];
    let body = null;

    // Handles detecting if file uploads are part of the request, and extracting them
    if (variables) {
      const awaitedVariables = (await Promise.all(
          Object.keys(variables)
            .map(async (key) => [key, await variables[key]])
        )).reduce((accum, [k, v]) => ({ ...accum, [k]: v }), {});

      ({ clone, files } = extractFiles(awaitedVariables, 'variables', (v) => !!v?.createReadStream));
    }

    // Handles generating a multi-part request
    if ([...files.values()].length > 0) {
      const indexToVar = [...files.values()].reduce((accum, k, i) => ({ ...accum, [i]: k }), {});
      const filesArr = [...files.keys()];

      const form = new FormData();
      form.append('operations', JSON.stringify({ query, variables: clone }));
      form.append('map', JSON.stringify(indexToVar));

      // TODO(@tylermenezes): In theory, form-data and fetch support appending f.createReadStream() directly, but
      // in practice it doesn't seem to work. Processing uploads this way will work, but takes up a lot more memory
      // than necessary
      await Promise.all(filesArr.map(async (f, i) => {
        const chunks = []
        for await (let chunk of f.createReadStream()) {
          chunks.push(chunk);
        }
        form.append(i, Buffer.concat(chunks), f.filename);
      }));

      headers = {
        ...form.getHeaders(),
        ...headers,
      };
      body = form;

    // Handles simple requests
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ query, variables: clone })
    }

    // Do the thing!
    const fetchResult = await fetch(httpEndpoint, {
      method: 'POST',
      headers,
      body,
    });
    const result = fetchResult.json();
    if (options?.debug) console.log(JSON.stringify({ body, result }));
    return result;
  }
}

//
// GraphQL Subscriptions
//

function makeSubscriber(wsEndpoint, options) {
  const subscriptionClient = createClient({
    url: wsEndpoint,
  });

  return async function subscriber({ document, variables }) {
    return observableToAsyncIterable({
      subscribe: (observer) => {
        const subscriber = subscriptionClient.subscribe(
          {
            query: print(document),
            variables,
          },
          {
            next: (data) => observer.next && observer.next(data),
            error: (err) => {
              console.error(err);
              if (!observer.error) return;
              if (err instanceof Error) {
                observer.error(err);
              } else if (err.type === 'close') {
                observer.error(new Error(`Connection closed with event ${err.code}`));
              } else {
                // GraphQLError[]
                observer.error(new Error(err.map(({ message }) => message).join(', ')));
              }
            },
            complete: () => observer.complete && observer.complete(),
          }
        );

        return {
          unsubscribe: subscriber,
        };
      },
    });
  };
}

export default function makeRemoteTransport(httpEndpoint, wsEndpoint, options) {

  return {
    executor: makeExecutor(httpEndpoint, options?.executor),
    subscriber: wsEndpoint ? makeSubscriber(wsEndpoint, options?.subscriber) : undefined,
  };
}
