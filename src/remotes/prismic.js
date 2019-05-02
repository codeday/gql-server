import { transformSchema, FilterRootFields, makeRemoteExecutableSchema, introspectSchema} from 'graphql-tools';
import { PrismicLink } from "apollo-link-prismic"

export const createPrismicSchema = async (uri) => {
    const link = new PrismicLink({ uri });
    const schema = await introspectSchema(link);
    return transformSchema(
        makeRemoteExecutableSchema({ schema, link }),
        [
            new FilterRootFields((operation, name) => name != '_allDocuments'),
        ]
    );
}