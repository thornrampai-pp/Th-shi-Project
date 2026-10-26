import SchemaBuilder from '@pothos/core';
import { GraphQLContext } from '../common/middlewares/auth.middleware';

// Single shared builder instance — every module's *.schema.ts file registers its
// types/fields onto this by importing it, then src/modules/index.ts calls
// builder.toSchema() once everything has registered itself.
export const builder = new SchemaBuilder<{ Context: GraphQLContext }>({});

builder.queryType({});
builder.mutationType({});
