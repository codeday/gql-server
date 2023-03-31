import { SubschemaConfig } from '@graphql-tools/delegate';
import { RenameObjectFields } from '@graphql-tools/wrap';
import { createRemoteSubschema } from '../remoteSubschema.js';

export async function createContentfulSubschema(space: string, token: string): Promise<SubschemaConfig> {
  const transforms = [
    new RenameObjectFields((_, fieldName) => {
      const cleanedName = fieldName
        .replace(/sCollection/g, 's')
        .replace(/yCollection/g, 'ies')
        .replace(/Collection/g, 's')
        .replace(/contentType(.+)/g, '$1');
      return cleanedName[0].toLowerCase() + cleanedName.slice(1);
    }),
    new RenameObjectFields((typeName, fieldName) =>
      typeName === 'Asset' && fieldName === 'url' ? 'contentfulBaseUrl' : fieldName,
    ),
  ];
  return createRemoteSubschema(`https://graphql.contentful.com/content/v1/spaces/${space}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    transforms,
  });
}
