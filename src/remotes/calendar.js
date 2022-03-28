import { loadSchema } from '@graphql-tools/load';
import { UrlLoader } from '@graphql-tools/url-loader';

export default async function createCalendarSchema(uri) {
  console.log(` * calendar(${uri})`);
  const schema = await loadSchema(uri, { loaders: [new UrlLoader()] });
  return {
    schema,
    transforms: [],
  };
}
