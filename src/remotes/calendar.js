import { loadSchema } from '@graphql-tools/load';
import { UrlLoader } from '@graphql-tools/url-loader';

export default async function createDiscordPostsSchema(uri) {
  const schema = await loadSchema(uri, { loaders: [new UrlLoader()] });
  return {
    schema,
    transforms: [],
  };
}
