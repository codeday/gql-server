import { wrapSchema, introspectSchema } from "@graphql-tools/wrap";
import { RenameObjectFields } from '@graphql-tools/wrap';
import { delegateToSchema } from '@graphql-tools/delegate';
import makeRemoteTransport from "../remoteTransport"

function getConnectionTypes(prefix) {
  return `
    extend type ${prefix}Asset {
      url(transform: ${prefix}ImageTransformOptions): String
    }
    extend type ${prefix}HiringCompany {
      alumniReferralAccounts: [AccountUser]
    }
    extend type ${prefix}Publication {
      contributors: [AccountUser]
    }
    extend type ${prefix}Region {
      pastPhotos(where: ShowcasePhotosWhere, orderBy: ShowcasePhotoOrderByArg, take: Float, skip: Float): [ShowcasePhoto!]!
      clearEvents: [ClearEvent!]!
    }
  `;
}

function getConnectionResolvers(prefix, schemas) {
  return {
    [`${prefix}HiringCompany`]: {
      alumniReferralAccounts: {
        selectionSet: '{ alumniReferrals }',
        async resolve(parent, _, context, info) {
          if (!parent.alumniReferrals || parent.alumniReferrals.length === 0) return [];

          const results = await Promise.all(parent.alumniReferrals.map((a) => delegateToSchema({
            schema: schemas.account,
            operation: 'query',
            fieldName: 'searchUsers',
            args: {
              where: {
                username: a,
              },
            },
            context,
            info,
          })));
          return results.reduce((accum, a) => [...accum, ...a], []);
        },
      },
    },

    [`${prefix}Publication`]: {
      contributors: {
        selectionSet: '{ contributorUsernames }',
        async resolve(parent, _, context, info) {
          if (!parent.contributorUsernames || parent.contributorUsernames.length === 0) return [];

          const results = await Promise.all(parent.contributorUsernames.map((a) => delegateToSchema({
            schema: schemas.account,
            operation: 'query',
            fieldName: 'searchUsers',
            args: {
              where: {
                username: a,
              },
            },
            context,
            info,
          })));
          return results.reduce((accum, a) => [...accum, ...a], []);
        },
      },
    },

    [`${prefix}Region`]: {
      pastPhotos: {
        selectionSet: '{ webname }',
        async resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.showcase,
            operation: 'query',
            fieldName: 'photos',
            args: {
              ...args,
              where: {
                ...args.where,
                region: parent.webname,
              },
            },
            context,
            info,
          });
        },
      },

      clearEvents: {
        selectionSet: '{ webname }',
        async resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.clear,
            operation: 'query',
            fieldName: 'events',
            args: {
              where: {
                contentfulWebname: { equals: parent.webname },
              },
              orderBy: [{ startDate: 'desc' }],
            },
            context,
            info,
          });
        },
      },
    },

    [`${prefix}Asset`]: {
      url: {
        selectionSet: '{ __selectionSetContentfulBaseUrl: contentfulBaseUrl, __selectionSetUrl: url }',
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
          const baseUrl = (parent.__selectionSetContentfulBaseUrl || parent.__selectionSetUrl)
            ?.replace('images.ctfassets.net', 'f2.codeday.org');

          return `${baseUrl}${qs.length > 0 ? '?' : ''}${qs}`;
        },
      },
    },
  };
}

export const transforms = [
  new RenameObjectFields((_, fieldName) => {
    const cleanedName = fieldName
      .replace(/sCollection/g, 's')
      .replace(/yCollection/g, 'ies')
      .replace(/Collection/g, 's')
      .replace(/contentType(.+)/g, '$1');
    const finalName = cleanedName[0].toLowerCase() + cleanedName.slice(1);
    return finalName;
  }),
  new RenameObjectFields((typeName, fieldName) => (
    typeName === 'Asset' && fieldName === 'url' ? 'contentfulBaseUrl' : fieldName
  )),
];

export default async function createContentfulSchema(space, token) {
  console.log(` * contentful(${space})`);
  const { executor, subscriber } = makeRemoteTransport(
    `https://graphql.contentful.com/content/v1/spaces/${space}`,
    undefined,
    { executor: { headers: { Authorization: `Bearer ${token}` } }, debug: true },
  );
  const schema = wrapSchema({
    schema: await introspectSchema(executor),
    executor,
    subscriber,
  });
  return {
    schema,
    transforms,
    getConnectionTypes,
    getConnectionResolvers,
  };
}
export const inverseRenameTransform = new RenameObjectFields((_, fieldName) => {
    console.log(transformedFieldNames);
    if (transformedFieldNames.includes(fieldName)) return transformedFieldNames[fieldName];
    return fieldName;
  });