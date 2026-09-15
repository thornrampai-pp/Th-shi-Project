import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';

import { rootTypeDefs } from './root.typeDef';
import { rootResolvers } from './root.resolver';

import { userTypeDefs } from './user/user.typeDef';
import { userResolvers } from './user/user.resolver';

import { authTypeDefs } from './auth/auth.typeDef';
import { authResolvers } from './auth/auth.resolver';

import type { IResolvers } from '@graphql-tools/utils';

// Add each new module's typeDefs/resolvers here as phases land —
// this file is the single place that wires everything into one schema.
export const typeDefs = mergeTypeDefs([rootTypeDefs, userTypeDefs, authTypeDefs]);
export const resolvers: IResolvers = mergeResolvers([rootResolvers, userResolvers, authResolvers]);
