import { parse, print, Kind } from 'graphql';

// Works around a bug in the old @graphql-tools/wrap (v7) WrapFields transform used by
// namespace() in schema.js: when a query selects the same field (e.g. `account`, or a
// field within it like `roleUsers` aliased identically) from two different named
// fragments with different sub-selections, WrapFields' field-hoisting delegates each
// occurrence to the remote subschema as a SEPARATE request and then merges the two
// partial responses incorrectly, silently dropping fields (including non-nullable ones
// like `id`) that weren't present in one of the two partial responses.
//
// GraphQL normally merges same-response-key field selections automatically (that's what
// lets independent components colocate fragments requesting different fields from the
// same query), but this old stitching layer doesn't do that merge correctly across
// fragment boundaries. So we do the merge ourselves, ahead of time, by inlining named
// fragment spreads and combining duplicate field selections before the query ever
// reaches the stitched schema.
//
// Scope: only FRAGMENT_SPREAD nodes are inlined/merged. INLINE_FRAGMENT nodes (which may
// carry type conditions for interfaces/unions) are left untouched, since blindly merging
// across those could produce incorrect results for polymorphic types. This covers the
// fragment-colocation pattern that triggers the bug without touching more delicate cases.

function buildFragmentMap(document) {
  const map = Object.create(null);
  document.definitions.forEach((def) => {
    if (def.kind === Kind.FRAGMENT_DEFINITION) {
      map[def.name.value] = def;
    }
  });
  return map;
}

function responseKey(fieldNode) {
  return fieldNode.alias ? fieldNode.alias.value : fieldNode.name.value;
}

// Expands FRAGMENT_SPREADs (recursively) into their constituent FIELD/INLINE_FRAGMENT
// selections, leaving FIELD and INLINE_FRAGMENT nodes as-is.
function expandFragmentSpreads(selections, fragmentMap, seen) {
  const expanded = [];
  selections.forEach((selection) => {
    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const fragmentName = selection.name.value;
      if (seen.has(fragmentName)) return; // avoid infinite recursion on cyclic fragments
      const fragment = fragmentMap[fragmentName];
      if (!fragment) {
        // Unknown fragment - let normal validation surface this error untouched.
        expanded.push(selection);
        return;
      }
      const nextSeen = new Set(seen);
      nextSeen.add(fragmentName);
      expanded.push(...expandFragmentSpreads(fragment.selectionSet.selections, fragmentMap, nextSeen));
    } else {
      expanded.push(selection);
    }
  });
  return expanded;
}

function flattenSelectionSet(selectionSet, fragmentMap) {
  if (!selectionSet) return selectionSet;

  const expanded = expandFragmentSpreads(selectionSet.selections, fragmentMap, new Set());

  const order = [];
  const groups = new Map();
  expanded.forEach((selection) => {
    // Group only FIELD nodes by response key; INLINE_FRAGMENT nodes pass through
    // untouched and unmerged (see file header for why).
    const key = selection.kind === Kind.FIELD ? responseKey(selection) : selection;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key).push(selection);
  });

  const newSelections = order.map((key) => {
    const group = groups.get(key);
    const first = group[0];
    if (first.kind !== Kind.FIELD) {
      return first; // INLINE_FRAGMENT, unmerged
    }

    const mergedSubSelections = [];
    group.forEach((field) => {
      if (field.selectionSet) {
        mergedSubSelections.push(...field.selectionSet.selections);
      }
    });

    return {
      ...first,
      selectionSet: mergedSubSelections.length > 0
        ? flattenSelectionSet({ kind: Kind.SELECTION_SET, selections: mergedSubSelections }, fragmentMap)
        : first.selectionSet,
    };
  });

  return { kind: Kind.SELECTION_SET, selections: newSelections };
}

export function flattenDuplicateFieldSelections(query) {
  if (typeof query !== 'string' || !query.includes('fragment ')) {
    // Fast path: skip parsing entirely for the common case of queries with no named
    // fragments, since there's nothing for this transform to do.
    return query;
  }

  try {
    const document = parse(query);
    const fragmentMap = buildFragmentMap(document);
    if (Object.keys(fragmentMap).length === 0) return query;

    const newDefinitions = document.definitions
      .filter((def) => def.kind === Kind.OPERATION_DEFINITION)
      .map((def) => ({
        ...def,
        selectionSet: flattenSelectionSet(def.selectionSet, fragmentMap),
      }));

    return print({ ...document, definitions: newDefinitions });
  } catch (e) {
    // If anything about this query is malformed or unexpected, don't block the request -
    // let it through untouched and let normal parsing/validation report the real error.
    console.error('[queryFlatten] failed to flatten query, passing through untouched:', e);
    return query;
  }
}
