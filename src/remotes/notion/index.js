/* eslint-disable camelcase */
import fs from 'fs';
import path from 'path';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { NotionToMarkdown } from "notion-to-md";
import fetch from 'node-fetch';

const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();

const PARENT_PAGES = (process.env.NOTION_PARENT_PAGES?.split(',') || [])
  .map(page => page.trim().split(':'))
  .map(([slug, id]) => ({ slug, id }));

const parentCache = {};

function toSlug(str) {
  if (!str) return null;
  return str.toLowerCase().replace(/\W/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '');
}

async function fetchChildPages(notionClient, pageId) {
  const blocks = [];
  let cursor = null;
  do {
    const result = await notionClient.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
    });
    cursor = result.next_cursor;
    blocks.push(...result.results);
  } while (cursor);

  const childPages = blocks
    .filter(block => block.type === 'child_page')
    .map(block => ({
      id: block.id,
      title: block.child_page.title,
      slug: toSlug(block.child_page.title),
    }));

  const withChildren = blocks
    .filter(block => block.has_children === true);

  for (const page of withChildren) {
    childPages.push(...await fetchChildPages(notionClient, page.id));
  }

  if (childPages.length > 0) {
    console.log(`Fetched ${childPages.length} child pages for ${pageId}.`);
  }
  return childPages;
}

async function cacheParentPages(notionClient) {
  console.log('Updating parent page cache...');
  for (const { slug, id } of PARENT_PAGES) {
    parentCache[slug] = await fetchChildPages(notionClient, id);
  }
  console.log('Parent page cache updated.');
}


export default async function createNotionSchema(token) {
  // The real Notion API client is not used here because it is not compatible with Node 16
  const notionClient = {
    pages: {
      retrieve: async ({ page_id }) => {
        const url = `https://api.notion.com/v1/pages/${page_id}`;
        const result = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
          },
        })
        .then(r => r.json());
        return result;
      }
    },
    blocks: {
      children: {
        list: async ({ block_id, start_cursor, page_size }) => {
          const url = `https://api.notion.com/v1/blocks/${block_id}/children?${start_cursor ? `start_cursor=${start_cursor}&` : ''}page_size=${page_size || 100}`;
          const result = await fetch(url, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Notion-Version': '2022-06-28',
            },
          })
          .then(r => r.json());
          return result;
        }
      }
    }
  };

  const n2m = new NotionToMarkdown({
    notionClient,
    config: {
      parseChildPages: true,
    },
  });
  n2m.setCustomTransformer('column_list', async (block) => {
    const children = await notionClient.blocks.children.list({ block_id: block.id });
    return `<div style="display: grid; grid-template-columns: repeat(${children.results.length}, 1fr); gap: 1rem;">${n2m.toMarkdownString(await n2m.blocksToMarkdown(children.results)).parent}</div>\n`;
  });
  n2m.setCustomTransformer('column', async (block) => {
    const children = await notionClient.blocks.children.list({ block_id: block.id });
    return `<div>${n2m.toMarkdownString(await n2m.blocksToMarkdown(children.results)).parent}</div>\n`;
  });
  n2m.setCustomTransformer('child_page', async (block) => {
    return `[${block.child_page.title}](${toSlug(block.child_page.title)})`;
  });

  cacheParentPages(notionClient);
  setInterval(() => cacheParentPages(notionClient), 1000 * 60 * 15);

  const resolvers = {};
  resolvers.Query = {
    parentSlugs: () => Object.keys(parentCache),
    pages: (_, { parentSlug }) => parentCache[parentSlug] || [],
    async page(_, { id, parentSlug, slug }) {
      if ((!id && !(parentSlug && slug)) || id && (parentSlug || slug)) {
        throw new Error('Must specify either id or both parentSlug and slug');
      }

      const fetchId = id || parentCache[parentSlug].find(p => p.slug === slug)?.id;
      if (!fetchId) return null;

      const allowedPages = Object.values(parentCache).flat().map(p => p.id.replace(/-/g, ''));
      if (!allowedPages.includes(fetchId)) {
        return null;
      }

      const title = (await notionClient.pages.retrieve({ page_id: fetchId }))
        .properties?.Title?.title?.[0]?.plain_text;
      const content = n2m.toMarkdownString(await n2m.pageToMarkdown(fetchId)).parent;
      return {
        title,
        slug: toSlug(title),
        content,
      };
    },
  };

  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  return {
    schema,
  };
}
