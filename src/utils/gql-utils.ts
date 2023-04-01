import { visit, Kind, visitWithTypeInfo, TypeInfo, FieldNode, FragmentSpreadNode } from 'graphql';

export class AddFieldToRequestTransform {
  private schema: any;

  private typeName: any;

  private fieldName: any;

  private typeInfo: any;

  constructor(schema, typeName, fieldName) {
    this.schema = schema;
    this.typeName = typeName;
    this.fieldName = fieldName;
    this.typeInfo = new TypeInfo(schema);
  }

  transformRequest(originalRequest) {
    const doc = visit(
      originalRequest.document,
      visitWithTypeInfo(this.typeInfo, {
        [Kind.SELECTION_SET]: (node) => {
          const parentType = this.typeInfo.getParentType();
          if (parentType && parentType.name === this.typeName) {
            const selections = [...node.selections];
            if (!selections.find((s: FieldNode | FragmentSpreadNode) => s.name.value === this.fieldName)) {
              selections.push({
                kind: Kind.FIELD,
                name: { kind: Kind.NAME, value: this.fieldName },
              });
            }
            return { ...node, selections };
          }
          return node;
        },
      }),
    );
    return { ...originalRequest, document: doc };
  }
}
