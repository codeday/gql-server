export const snakeToCamel = (str) => str.replace(
  /([-_][a-z])/g,
  (group) => group.toUpperCase()
    .replace('-', '')
    .replace('_', '')
);

export const camelToSnake = (str) => str.replace(
  /[A-Z]/g,
  (letter) => `_${letter.toLowerCase()}`
);

export function chunk(arr, len) {
  const chunks = [];
  let i = 0;
  const n = arr.length;

  while (i < n) {
    chunks.push(arr.slice(i, i += len));
  }
  return chunks;
}

export const eachKey = (obj, fn) => Object.keys(obj)
  .reduce((accum, k) => ({ ...accum, [fn(k)]: obj[k] }), {});

export const objectSnakeToCamel = (obj) => eachKey(obj, snakeToCamel);
export const objectCamelToSnake = (obj) => eachKey(obj, camelToSnake);

export const filterNullOrUndefinedKeys = (obj) => Object.keys(obj)
  .filter((k) => k in obj && typeof obj[k] !== 'undefined' && obj[k] !== null)
  .reduce((accum, k) => ({ ...accum, [k]: obj[k] }), {});

export const filterKeysKeep = (obj, keys) => Object.keys(obj)
  .filter((k) => keys.includes(k))
  .reduce((accum, k) => ({ ...accum, [k]: obj[k] }), {});

export const filterKeysRemove = (obj, keys) => Object.keys(obj)
  .filter((k) => !keys.includes(k))
  .reduce((accum, k) => ({ ...accum, [k]: obj[k] }), {});
