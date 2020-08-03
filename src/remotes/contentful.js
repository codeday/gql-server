import { RenameObjectFields } from '@graphql-tools/wrap';
import { loadSchema } from '@graphql-tools/load';
import { UrlLoader } from '@graphql-tools/url-loader';

export default async function createContentfulSchema(space, token) {
  const schema = await loadSchema(
    `https://graphql.contentful.com/content/v1/spaces/${space}`,
    {
      loaders: [new UrlLoader()],
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return {
    schema,
    transforms: [
      new RenameObjectFields((_, fieldName) => {
        const cleanedName = fieldName
          .replace(/sCollection/g, 's')
          .replace(/Collection/g, 's')
          .replace(/contentType(.+)/g, '$1');
        return cleanedName[0].toLowerCase() + cleanedName.slice(1);
      }),
    ],
  };
}
