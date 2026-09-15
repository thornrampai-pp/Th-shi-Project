import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import * as userService from './user.service';

export const userResolvers = {
  Query: {
    me: (_: unknown, __: unknown, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return userService.getUserById(userId);
    },
  },
  Mutation: {
    updateProfile: (
      _: unknown,
      args: { firstName?: string; lastName?: string; imageUrl?: string; taxResidency?: string },
      context: GraphQLContext,
    ) => {
      const userId = requireAuth(context);
      return userService.updateProfile(userId, args);
    },
    deactivateAccount: (_: unknown, __: unknown, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return userService.deactivateAccount(userId);
    },
  },
};
