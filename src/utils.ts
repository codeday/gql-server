/* eslint-disable no-param-reassign */
export const groupBy = <T>(array: Array<T>, property: (x: T) => string): { [key: string]: Array<T> } =>
  array.reduce((memo: { [key: string]: Array<T> }, x: T) => {
    if (!memo[property(x)]) {
      memo[property(x)] = [];
    }
    memo[property(x)].push(x);
    return memo;
  }, {});
