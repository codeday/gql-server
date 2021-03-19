import { RenameObjectFields, TransformQuery } from '@graphql-tools/wrap';
import { delegateToSchema } from '@graphql-tools/delegate';
import { loadSchema } from '@graphql-tools/load';
import { UrlLoader } from '@graphql-tools/url-loader';

// TODO(@tylermenezes) This should be merged into the main Contentful remote, and that should have some way to manually
// define connections depending on the Contentful space. Right now connections are hard-coded into it.

function getConnectionTypes(prefix) {
  return `
    extend type ${prefix}Asset {
      url(transform: ${prefix}ImageTransformOptions): String
    }

    extend type ${prefix}Track {
      previewProjects: [ShowcaseProject!]!
    }
  `;
}

function getConnectionResolvers(prefix, schemas) {
  return {
    [`${prefix}Asset`]: {
      url: {
        selectionSet: '{ __selectionSetContentfulBaseUrl: contentfulBaseUrl }',
        resolve(parent, args) {
          const transformQueryFormats = {
            width: (v) => ({ w: v }),
            height: (v) => ({ h: v }),
            quality: (v) => ({ q: v }),
            cornerRadius: (v) => ({ r: v }),
            format: (v) => {
              if (v === 'JPG_PROGRESSIVE') return { fm: 'jpg', fl: 'progressive' };
              return { fm: v.toLowerCase() };
            },
            resizeStrategy: (v) => ({ fit: v.toLowerCase() }),
            resizeFocus: (v) => ({ f: v.toLowerCase() }),
            backgroundColor: (v) => ({ bg: v }),
          };

          const queryArgs = Object.keys(args.transform || {})
            .map((k) => transformQueryFormats[k](args.transform[k]))
            .reduce((accum, qs) => ({ ...accum, ...qs }), {});

          const qs = Object.keys(queryArgs)
            .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(queryArgs[key])}`)
            .filter((str) => !['fit=fit'].includes(str))
            .join('&');

          // eslint-disable-next-line no-underscore-dangle
          const baseUrl = parent.__selectionSetContentfulBaseUrl
            .replace('images.ctfassets.net', 'f2.codeday.org');

          return `${baseUrl}${qs.length > 0 ? '?' : ''}${qs}`;
        },
      },
    },
    [`${prefix}Track`]: {
      previewProjects: {
        selectionSet: '{ previewProjectIds }',
        async resolve(parent, _, context, info) {
          if (!parent.previewProjectIds || parent.previewProjectIds.length === 0) return [];

          const res = await Promise.all(parent.previewProjectIds.map((id) => delegateToSchema({
            schema: schemas.showcase,
            operation: 'query',
            fieldName: 'project',
            args: { id },
            context,
            info,
            transforms: [
              new TransformQuery({
                path: ['project'],
                queryTransformer: (q) => q,
                resultTransformer: (r) => [r],
              }),
            ],
          })));
          return res.reduce((accum, r) => [...accum, ...r], []);
        },
      },
    },
  };
}

export default async function createLearnSchema(space, token) {
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
          .replace(/yCollection/g, 'ies')
          .replace(/Collection/g, 's')
          .replace(/contentType(.+)/g, '$1');
        return cleanedName[0].toLowerCase() + cleanedName.slice(1);
      }),
      new RenameObjectFields((typeName, fieldName) => (
        typeName === 'Asset' && fieldName === 'url' ? 'contentfulBaseUrl' : fieldName
      )),
    ],
    getConnectionTypes,
    getConnectionResolvers,
  };
}
