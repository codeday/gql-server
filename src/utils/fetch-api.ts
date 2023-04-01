import fetch from 'node-fetch';

export function api<T>(url: URL | RequestInfo, init: RequestInit = {}): Promise<T> {
  // @ts-ignore
  return fetch(url, init)
    .then((response) => {
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      return response.json() as Promise<{ data: T }>;
    })
    .then((data) => {
      return data.data;
    });
}
