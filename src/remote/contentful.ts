import { RenameObjectFields } from '@graphql-tools/wrap';
import { delegateToSchema, SubschemaConfig } from '@graphql-tools/delegate';
import { OperationTypeNode } from 'graphql';
import { ResolversWithPrefix, SubschemaInfo } from '../schema.js';
import { createRemoteSubschema } from '../remoteSubschema.js';
import { Resolvers } from '../generated/graphql.js';

const createTypeDefs = (prefix) => `
extend type ${prefix}Asset {
  url(transform: ${prefix}ImageTransformOptions): String
}
extend type ${prefix}HiringCompany {
  alumniReferralAccounts: [AccountUser]
}
extend type ${prefix}Region {
  pastPhotos(where: ShowcasePhotosWhere, orderBy: ShowcasePhotoOrderByArg, take: Float, skip: Float): [ShowcasePhoto!]!
  clearEvents: [ClearEvent!]!
}
  `;

function createResolvers(schemas): ResolversWithPrefix<'Cms'> {
  return {
    [`CmsHiringCompany`]: {
      alumniReferralAccounts: {
        selectionSet: '{ alumniReferrals }',
        async resolve(parent, _, context, info) {
          if (!parent.alumniReferrals || parent.alumniReferrals.length === 0) return [];

          const results = await Promise.all(
            parent.alumniReferrals.map((a) =>
              delegateToSchema({
                schema: schemas.account,
                operation: OperationTypeNode.QUERY,
                fieldName: 'searchUsers',
                args: {
                  where: {
                    username: a,
                  },
                },
                context,
                info,
              }),
            ),
          );
          return results.reduce((accum, a) => [...accum, ...a], []);
        },
      },
    },

    [`CmsRegion`]: {
      pastPhotos: {
        selectionSet: '{ webname }',
        async resolve(parent, args, context, info) {
          return delegateToSchema({
            schema: schemas.showcase,
            operation: OperationTypeNode.QUERY,
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
            operation: OperationTypeNode.QUERY,
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

    [`CmsAsset`]: {
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
          // @ts-ignore
          const baseUrl = (parent.__selectionSetContentfulBaseUrl || parent.__selectionSetUrl)?.replace(
            'images.ctfassets.net',
            'f2.codeday.org',
          );

          return `${baseUrl}${qs.length > 0 ? '?' : ''}${qs}`;
        },
      },
    },
  };
}

export async function createContentfulSubschema(space: string, token: string): Promise<SubschemaInfo> {
  console.log(` * contentful(${space})`);
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
    createTypeDefs,
    createResolvers,
    prefix: 'cms',
  });
}
