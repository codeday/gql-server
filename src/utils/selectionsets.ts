import { parseSelectionSet } from '@graphql-tools/utils';
import { Kind, SelectionSetNode } from 'graphql';

const getFieldNodeNameValue = (node) => {
  return (node.alias || node.name).value;
};

export function mergeSelectionSets(selectionSet1: SelectionSetNode, selectionSet2: SelectionSetNode): SelectionSetNode {
  const newSelections = [...selectionSet1.selections];
  for (let selection2 of selectionSet2.selections) {
    if (selection2.kind === 'FragmentSpread' || selection2.kind === 'InlineFragment') {
      newSelections.push(selection2);
      continue;
    }
    if (selection2.kind !== 'Field') {
      throw new TypeError('Invalid state.');
    }
    const match = newSelections.find(
      (selection1) =>
        selection1.kind === 'Field' && getFieldNodeNameValue(selection1) === getFieldNodeNameValue(selection2),
    );
    if (
      match &&
      // recursively merge all selection sets
      match.kind === 'Field' &&
      match.selectionSet &&
      selection2.selectionSet
    ) {
      selection2 = {
        ...selection2,
        selectionSet: mergeSelectionSets(match.selectionSet, selection2.selectionSet),
      };
    }
    newSelections.push(selection2);
  }
  return {
    kind: Kind.SELECTION_SET,
    selections: newSelections,
  };
}

export function addToSelectionSet(selectionSet: SelectionSetNode, selection: string) {
  return mergeSelectionSets(parseSelectionSet(selection), selectionSet);
}
